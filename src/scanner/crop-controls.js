import { validQuad } from './core.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Move a side as a single line; dragging along it does not skew its endpoints.
export function moveCropHandle(corners, kind, index, dx, dy, width, height) {
  const indices = kind === 'side' ? [index, (index + 1) % 4] : [index];
  if (kind === 'side') {
    const a = corners[indices[0]], b = corners[indices[1]];
    const ex = (b.x - a.x) * width, ey = (b.y - a.y) * height;
    const length = Math.hypot(ex, ey);
    const nx = -ey / length, ny = ex / length;
    const normalDelta = dx * width * nx + dy * height * ny;
    dx = normalDelta * nx / width;
    dy = normalDelta * ny / height;
  }
  let amount = 1;
  for (const i of indices) {
    const p = corners[i];
    if (dx > 0) amount = Math.min(amount, ((width - 1) / width - p.x) / dx);
    if (dx < 0) amount = Math.min(amount, -p.x / dx);
    if (dy > 0) amount = Math.min(amount, ((height - 1) / height - p.y) / dy);
    if (dy < 0) amount = Math.min(amount, -p.y / dy);
  }
  const candidate = corners.map((p, i) => indices.includes(i)
    ? { x: p.x + dx * Math.max(0, amount), y: p.y + dy * Math.max(0, amount) }
    : { ...p });
  return validQuad(candidate.map(p => ({ x: p.x * width, y: p.y * height })), width, height, .015)
    ? candidate : corners;
}

// Offset inward along the finger-to-canvas-center line, then constrain the
// entire magnifier (including its border) to the visible canvas.
export function loupePosition(finger, width, height) {
  const size = Math.min(112, Math.max(40, Math.min(width, height) - 16));
  const inset = size / 2 + 8;
  let dx = width / 2 - finger.x, dy = height / 2 - finger.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) { dx = width > height ? -1 : 0; dy = width > height ? 0 : -1; } else { dx /= length; dy /= length; }
  const offset = size / 2 + 52;
  const position = (x,y) => ({x:clamp(x,inset,Math.max(inset,width-inset)),y:clamp(y,inset,Math.max(inset,height-inset)),size});
  let result=position(finger.x+dx*offset,finger.y+dy*offset);
  const separation=p=>Math.hypot(p.x-finger.x,p.y-finger.y);
  if(separation(result)<size/2+40){
    // In a short landscape canvas, move along its roomy axis instead of
    // clamping the magnifier back under the finger.
    for(const [x,y] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const candidate=position(finger.x+x*offset,finger.y+y*offset);
      if(separation(candidate)>separation(result))result=candidate;
    }
  }
  return result;
}
