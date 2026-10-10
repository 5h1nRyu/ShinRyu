// All positions are in the document's 1920 × 1080 design coordinates.
import { CONTROL, REAL_SIZE, mm } from './physical-layout.js';

const tileWidth = mm(REAL_SIZE.tile.width), tileHeight = mm(REAL_SIZE.tile.height);
const columnPitch = tileWidth + 4, rowPitch = tileHeight + 4;
const oldRiverTop = 1000 - 3 * tileHeight - 2 * 4;
export const RIVER_GAP = (oldRiverTop - CONTROL.visibleHeight) / 3;
export const RIVER_TOP = CONTROL.visibleHeight + RIVER_GAP;
export const SPEC = Object.freeze({
  width: 1920, height: 1080, tileWidth, tileHeight, thickness: mm(REAL_SIZE.tile.thickness),
  columns: 6, rows: 3, columnPitch, rowPitch, liftHeight: mm(4),
  hoverScale: 1.04, flipDuration: 600, maxDistance: Math.hypot(5 * columnPitch, 2 * rowPitch),
});

export function smooth(u) {
  const n = Math.max(0, Math.min(1, u));
  return n * n * (3 - 2 * n);
}

export function center(index) {
  return { x: 960 - 2.5 * columnPitch + (index % 6) * columnPitch, y: RIVER_TOP + tileHeight / 2 + Math.floor(index / 6) * rowPitch };
}

export function rippleDelay(origin, index) {
  const a = center(origin), b = center(index);
  return Math.round(600 * Math.hypot(a.x - b.x, a.y - b.y) / SPEC.maxDistance);
}

export function entryScale(index, time) {
  return 1.06 - .06 * smooth((time - 180 - 18 * index) / 420);
}

export function flipPose(time, initialScale = 1, fromFront = false, initialHeight = 0) {
  if (fromFront) {
    const pose = flipPose(time, initialScale, false, initialHeight);
    return { ...pose, theta: Math.PI - pose.theta };
  }
  if (time < 0) return { theta: 0, q: initialScale, height: initialHeight };
  if (time < 120) {
    const lift = smooth(time / 120);
    return { theta: 0, q: initialScale + (1.04 - initialScale) * lift, height: initialHeight + (1 - initialHeight) * lift };
  }
  if (time < 480) return { theta: Math.PI * smooth((time - 120) / 360), q: 1.04, height: 1 };
  const settle = smooth((time - 480) / 120);
  return { theta: Math.PI, q: 1.04 - .04 * settle, height: 1 - settle };
}

export function projection(theta, q = 1) {
  const cos = Math.cos(theta), sin = Math.max(0, Math.sin(theta));
  const faceWidth = q * SPEC.tileWidth * Math.abs(cos);
  const sideWidth = q * SPEC.thickness * sin;
  return {
    width: faceWidth + sideWidth, height: q * SPEC.tileHeight,
    faceWidth, sideWidth,
    faceOffset: q * SPEC.thickness / 2 * sin * (cos >= 0 ? 1 : -1),
    sideOffset: -q * SPEC.tileWidth / 2 * cos,
    front: theta > Math.PI / 2,
  };
}

// Vertices of the projected rectangular solid, used only to measure real motion.
export function vertices(theta, q) {
  const points = [];
  for (const x of [-SPEC.tileWidth / 2, SPEC.tileWidth / 2]) for (const z of [-SPEC.thickness / 2, SPEC.thickness / 2]) for (const y of [-SPEC.tileHeight / 2, SPEC.tileHeight / 2]) {
    points.push({ x: q * (x * Math.cos(theta) + z * Math.sin(theta)), y: q * y });
  }
  return points;
}

export function motionDistance(a, b) {
  const va = vertices(a.theta, a.q), vb = vertices(b.theta, b.q);
  return Math.max(...va.map((p, i) => Math.hypot(p.x - vb[i].x, p.y - vb[i].y)));
}
