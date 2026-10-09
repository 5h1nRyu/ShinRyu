// All positions are in the document's 1920 × 1080 design coordinates.
export const SPEC = Object.freeze({
  width: 1920, height: 1080, tileWidth: 164, tileHeight: 224, thickness: 132,
  columns: 6, rows: 3, columnPitch: 168, rowPitch: 228,
  shadowWidth: 24, hoverScale: 1.04, flipDuration: 600, maxDistance: 955.791,
});

export function smooth(u) {
  const n = Math.max(0, Math.min(1, u));
  return n * n * (3 - 2 * n);
}

export function center(index) {
  return { x: 540 + (index % 6) * 168, y: 432 + Math.floor(index / 6) * 228 };
}

export function rippleDelay(origin, index) {
  const a = center(origin), b = center(index);
  return Math.round(600 * Math.hypot(a.x - b.x, a.y - b.y) / SPEC.maxDistance);
}

export function entryScale(index, time) {
  return 1.06 - .06 * smooth((time - 180 - 18 * index) / 420);
}

export function flipPose(time, initialScale = 1) {
  if (time < 0) return { theta: 0, q: initialScale, height: 0 };
  if (time < 120) {
    const lift = smooth(time / 120);
    return { theta: 0, q: initialScale + (1.04 - initialScale) * lift, height: lift };
  }
  if (time < 480) return { theta: Math.PI * smooth((time - 120) / 360), q: 1.04, height: 1 };
  const settle = smooth((time - 480) / 120);
  return { theta: Math.PI, q: 1.04 - .04 * settle, height: 1 - settle };
}

export function projection(theta, q = 1) {
  const cos = Math.cos(theta), sin = Math.max(0, Math.sin(theta));
  const faceWidth = q * 164 * Math.abs(cos);
  const sideWidth = q * 132 * sin;
  return {
    width: faceWidth + sideWidth, height: q * 224,
    faceWidth, sideWidth,
    faceOffset: q * 66 * sin * (cos >= 0 ? 1 : -1),
    sideOffset: -q * 82 * cos,
    front: theta > Math.PI / 2,
  };
}

export function shadowRect(index, theta, q) {
  if (index % 6 !== 5) return null;
  const c = center(index), p = projection(theta, q);
  return { x: c.x + p.width / 2, y: c.y - 112 * q, width: 24 * q, height: 224 * q };
}

// Vertices of the projected rectangular solid, used only to measure real motion.
export function vertices(theta, q) {
  const points = [];
  for (const x of [-82, 82]) for (const z of [-66, 66]) for (const y of [-112, 112]) {
    points.push({ x: q * (x * Math.cos(theta) + z * Math.sin(theta)), y: q * y });
  }
  return points;
}

export function motionDistance(a, b) {
  const va = vertices(a.theta, a.q), vb = vertices(b.theta, b.q);
  return Math.max(...va.map((p, i) => Math.hypot(p.x - vb[i].x, p.y - vb[i].y)));
}
