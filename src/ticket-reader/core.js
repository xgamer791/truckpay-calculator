// Fresh ticket reader: PaddleOCR v4 neural models, our own pixel preparation,
// text-region detection, CTC decoding, and plant/field validation. No legacy OCR.
import { MARIETTA_TEMPLATE } from './templates.js';
export const READER_VERSION = 1;
export const TICKET_REGION = MARIETTA_TEMPLATE.ticketRegion;

export function preparePixels(image, { turns = 0, region, maxWidth = 1600 } = {}) {
  const sw = turns % 2 ? image.height : image.width;
  const sh = turns % 2 ? image.width : image.height;
  const x0 = Math.round((region?.x || 0) * sw), y0 = Math.round((region?.y || 0) * sh);
  const rw = Math.max(1, Math.round((region?.width || 1) * sw));
  const rh = Math.max(1, Math.round((region?.height || 1) * sh));
  const width = Math.min(rw, maxWidth), height = Math.max(1, Math.round(rh * width / rw));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const rx = Math.min(sw - 1, x0 + Math.floor(x * rw / width));
    const ry = Math.min(sh - 1, y0 + Math.floor(y * rh / height));
    let sx = rx, sy = ry;
    if (turns === 1) { sx = ry; sy = image.height - 1 - rx; }
    if (turns === 2) { sx = image.width - 1 - rx; sy = image.height - 1 - ry; }
    if (turns === 3) { sx = image.width - 1 - ry; sy = rx; }
    const s = (sy * image.width + sx) * 4, d = (y * width + x) * 4;
    // Remove red pen annotations without removing black printed characters.
    const r = image.data[s], g = image.data[s + 1], b = image.data[s + 2];
    const red = r > 110 && r > g * 1.45 && r > b * 1.45;
    data[d] = red ? 255 : r; data[d + 1] = red ? 255 : g;
    data[d + 2] = red ? 255 : b; data[d + 3] = 255;
  }
  return { data, width, height };
}

function tensorFor(ort, image, width, height, box) {
  const data = new Float32Array(3 * width * height);
  const area = width * height;
  const rect = box || { x: 0, y: 0, width: image.width, height: image.height };
  // Models distributed in @gutenye/ocr-models use BGR channels in [0, 1].
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const fx = Math.max(0, Math.min(image.width - 1, rect.x + (x + .5) * rect.width / width - .5));
    const fy = Math.max(0, Math.min(image.height - 1, rect.y + (y + .5) * rect.height / height - .5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), dx = fx - x0, dy = fy - y0;
    const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
    for (let c = 0; c < 3; c++) {
      const channel = 2 - c;
      const a = image.data[(y0 * image.width + x0) * 4 + channel];
      const b = image.data[(y0 * image.width + x1) * 4 + channel];
      const d = image.data[(y1 * image.width + x0) * 4 + channel];
      const e = image.data[(y1 * image.width + x1) * 4 + channel];
      data[c * area + y * width + x] = ((a * (1 - dx) + b * dx) * (1 - dy) + (d * (1 - dx) + e * dx) * dy) / 255;
    }
  }
  return new ort.Tensor('float32', data, [1, 3, height, width]);
}

// Connected components on DBNet's probability mask, then expand the shrunken
// text regions before recognition. Buffers are bounded by the resized image.
function textBoxes(probabilities, width, height, original) {
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height), boxes = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || probabilities[start] < .12) continue;
    let head = 0, tail = 1, minX = width, minY = height, maxX = 0, maxY = 0, sum = 0;
    queue[0] = start; seen[start] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); sum += probabilities[p];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, n = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[n] || probabilities[n] < .12) continue;
        seen[n] = 1; queue[tail++] = n;
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (tail < 8 || bw < 4 || bh < 3 || bw / bh < .7 || sum / tail < .35) continue;
    const padding = Math.max(2, bw * bh * 1.5 / (2 * (bw + bh)));
    const x = Math.max(0, minX - padding), y = Math.max(0, minY - padding);
    boxes.push({ x: x * original.width / width, y: y * original.height / height,
      width: (Math.min(width, maxX + padding + 1) - x) * original.width / width,
      height: (Math.min(height, maxY + padding + 1) - y) * original.height / height });
  }
  return boxes.sort((a, b) => a.y - b.y).slice(0, 140);
}

function decode(output, dictionary) {
  const classes = output.dims.at(-1), steps = output.data.length / classes;
  let text = '', total = 0, minimum = 1, count = 0, previous = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0, probability = -Infinity;
    for (let c = 0; c < classes; c++) {
      const p = output.data[t * classes + c];
      if (p > probability) { probability = p; best = c; }
    }
    if (best && best !== previous) {
      text += dictionary[best - 1] || ''; total += probability; count++; minimum = Math.min(minimum, probability);
    }
    previous = best;
  }
  return { text, confidence: count ? total / count : 0, minimum: count ? minimum : 0 };
}

export async function createEngine(ort, models, dictionaryText, options = {}) {
  const detection = await ort.InferenceSession.create(models.detection, options);
  const recognition = await ort.InferenceSession.create(models.recognition, options);
  const dictionary = [...dictionaryText.split('\n'), ' '];
  async function recognize(image, box) {
    const width = Math.max(16, Math.min(1600, Math.round(48 * box.width / box.height)));
    const tensor = tensorFor(ort, image, width, 48, box);
    const result = await recognition.run({ [recognition.inputNames[0]]: tensor });
    return { ...decode(result[recognition.outputNames[0]], dictionary), box };
  }
  return {
    async lines(image) {
      const width = Math.ceil(image.width / 32) * 32, height = Math.ceil(image.height / 32) * 32;
      const tensor = tensorFor(ort, image, width, height);
      const results = await detection.run({ [detection.inputNames[0]]: tensor });
      const output = results[detection.outputNames[0]];
      const boxes = textBoxes(output.data, output.dims[3], output.dims[2], image);
      const lines = [];
      for (const box of boxes) {
        const line = await recognize(image, box);
        if (line.confidence >= .6 && line.text.trim()) lines.push(line);
      }
      return lines;
    },
    recognize,
    async close() { await detection.release(); await recognition.release(); },
  };
}

const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function isMarietta(lines, image) {
  const region = MARIETTA_TEMPLATE.identityRegion;
  const text = compact(lines.filter(line => line.confidence >= .80 && (!image ||
    (line.box.x < image.width * region.width && line.box.y < image.height * region.height))).map(line => line.text).join(' '));
  if (text.includes(MARIETTA_TEMPLATE.companyHeading)) return true;
  // The small Marietta logo can be worn away; use independent Hunter anchors.
  const hunter = MARIETTA_TEMPLATE.hunter;
  return text.includes(hunter.logoWord) && text.includes(hunter.name) && (text.includes(hunter.street) || text.includes(hunter.plantCode));
}

export function ticketCandidate(lines) {
  const candidates = [];
  for (const line of lines) {
    if (line.confidence < .88 || !/^ticket\s*(?:no\.?|number|#|:)?\s*\d*$/i.test(line.text.trim())) continue;
    const inline = line.text.match(/\b(\d{6,12})\b/);
    if (inline && line.confidence >= .93 && line.minimum >= .75) candidates.push({ number: inline[1], line });
    if (inline) continue;
    const b = line.box;
    for (const value of lines) {
      if (!/^\d{6,12}$/.test(value.text.trim()) || value.confidence < .93 || value.minimum < .75) continue;
      const v = value.box;
      if (v.x < b.x + b.width * .65 || v.x - b.x - b.width > Math.max(b.height * 12, b.width * 3)) continue;
      if (Math.abs(v.y + v.height / 2 - b.y - b.height / 2) > Math.max(b.height, v.height) * .6) continue;
      candidates.push({ number: value.text.trim(), line: value });
    }
  }
  const numbers = new Set(candidates.map(c => c.number));
  return numbers.size === 1 ? candidates.sort((a, b) => b.line.confidence - a.line.confidence)[0] : null;
}

export async function readMarietta(image, engine) {
  let recognizedPlant = false;
  // Read upright first; independently handle older sideways/upside-down files.
  for (const turns of [0, 2, 1, 3]) {
    const page = preparePixels(image, { turns });
    const lines = await engine.lines(page);
    if (!isMarietta(lines, page)) continue;
    recognizedPlant = true;
    const header = preparePixels(image, { turns, region: TICKET_REGION, maxWidth: 1400 });
    const headerLines = await engine.lines(header);
    const candidate = ticketCandidate(headerLines);
    if (!candidate) continue;
    // A second read at a different crop/scale must agree digit-for-digit.
    const box = candidate.line.box;
    const confirmed = await engine.recognize(header, {
      x: Math.max(0, box.x - 2), y: Math.max(0, box.y - 2),
      width: Math.min(header.width - Math.max(0, box.x - 2), box.width + 4),
      height: Math.min(header.height - Math.max(0, box.y - 2), box.height + 4),
    });
    const number = confirmed.text.match(/(?:^|\b)(\d{6,12})(?:$|\b)/)?.[1];
    if (number !== candidate.number || confirmed.confidence < .93 || confirmed.minimum < .75) continue;
    const full = ticketCandidate(lines);
    if (full && full.number !== number) continue;
    return { version: READER_VERSION, template: MARIETTA_TEMPLATE.id, status: 'matched', plant: 'martin-marietta', ticketNumber: number,
      confidence: Math.min(candidate.line.confidence, confirmed.confidence) };
  }
  return { version: READER_VERSION, status: recognizedPlant ? 'unreadable' : 'ignored' };
}

export function applyTicketRead(document, result) {
  document.ticketRead = result;
  if (result.status === 'matched') document.ocr = { ...document.ocr, plant: 'Martin Marietta / Hunter', ticketNumber: result.ticketNumber };
  return document;
}
