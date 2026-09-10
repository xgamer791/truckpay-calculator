import { cornerMotion, validQuad } from './core.js';

export const QUALITY_MAX_AGE = 1200;

// Measure capture-resolution pixels before document cleanup or sharpening.
// A paper boundary alone is never evidence that its printed text is in focus.
export function measureCaptureQuality(rgba, width, height, corners) {
  if (!validQuad(corners, width, height)) return { ready: false, close: false, focused: false };
  const xs = corners.map(p => p.x / width), ys = corners.map(p => p.y / height);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const sides = corners.map((p, i) => Math.hypot(p.x - corners[(i + 1) % 4].x, p.y - corners[(i + 1) % 4].y));
  // Use the limiting frame dimension: wide tickets can fill a portrait camera
  // without occupying most of its height. Keep a small margin around all edges.
  const close = span >= .88 && Math.max(...sides) >= 1000 && Math.min(...sides) >= 260 &&
    [...xs, ...ys].every(v => v >= .018 && v <= .982);
  const gray = new Uint8Array(width * height);
  for (let p = 0; p < gray.length; p++) gray[p] = (rgba[p * 4] * 77 + rgba[p * 4 + 1] * 150 + rgba[p * 4 + 2] * 29) >> 8;
  const map = (u, v) => ({
    x: (1 - v) * ((1 - u) * corners[0].x + u * corners[1].x) + v * ((1 - u) * corners[3].x + u * corners[2].x),
    y: (1 - v) * ((1 - u) * corners[0].y + u * corners[1].y) + v * ((1 - u) * corners[3].y + u * corners[2].y),
  });
  const detail = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
    let gradients = 0, laplacians = 0, broadEdges = 0, samples = 0;
    let gx = 0, gy = 0, lx = 0, ly = 0, nx = 0, ny = 0;
    const a = map(.06 + col * .22, .06 + row * .293), b = map(.06 + (col + 1) * .22, .06 + (row + 1) * .293);
    const stepsU = Math.max(16, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let j = 0; j < 48; j++) for (let i = 0; i < stepsU; i++) {
      const p = map(.06 + (col + (i + .5) / stepsU) * .22, .06 + (row + (j + .5) / 48) * .293);
      const x = Math.round(p.x), y = Math.round(p.y);
      if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) continue;
      const at = y * width + x, c = gray[at], l = gray[at - 1], r = gray[at + 1], t = gray[at - width], b = gray[at + width];
      const gradient = (r - l) ** 2 + (b - t) ** 2;
      samples++;
      if ((gray[at+3]-gray[at-3])**2+(gray[at+width*3]-gray[at-width*3])**2>=1600) broadEdges++;
      // Check both directions independently. Horizontal camera motion can
      // leave horizontal rules sharp while smearing every printed digit.
      if ((r-l)**2 >= 625) { gx+=(r-l)**2; lx+=(2*c-l-r)**2; nx++; }
      if ((b-t)**2 >= 625) { gy+=(b-t)**2; ly+=(2*c-t-b)**2; ny++; }
      // Ignore weak sensor noise. Normalize curvature by edge contrast, so
      // bright lighting or dark ink cannot turn a blurred ticket green.
      if (gradient < 1600) continue;
      gradients += gradient; laplacians += (4 * c - l - r - t - b) ** 2;
    }
    // Broad transitions identify blurred printing too. Otherwise a blurred
    // number region could be mistaken for blank paper and skipped entirely.
    if (broadEdges >= 24 && broadEdges / samples >= .015) detail.push(Math.min(gradients?laplacians/gradients:0, nx>=24?lx/gx:Infinity, ny>=24?ly/gy:Infinity));
  }
  detail.sort((a, b) => a - b);
  const sharpness = detail[0] || 0;
  const focused = detail.length >= 4 && sharpness >= .16;
  return { ready: close && focused, close, focused, sharpness, detailTiles: detail.length, span };
}

// Green requires several recent, steady observations. Red returns immediately
// on a bad observation, motion, a frozen stream, or an expired measurement.
export class CaptureQualityGate {
  reset() { this.since = null; this.last = null; this.corners = null; this.count = 0; this.ready = false; }
  constructor() { this.reset(); }
  update(quality, corners, time) {
    if (!quality?.ready || !corners) { this.reset(); return false; }
    if (this.last === null || time - this.last > QUALITY_MAX_AGE || cornerMotion(corners, this.corners) > .012) {
      this.since = time; this.count = 0;
    }
    this.last = time; this.corners = corners; this.count++;
    this.ready = this.count >= 3 && time - this.since >= 300;
    return this.ready;
  }
  isReady(now) { return this.ready && this.last !== null && now - this.last < QUALITY_MAX_AGE; }
}
