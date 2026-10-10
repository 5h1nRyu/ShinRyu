import { CONTROL, controlPoint } from './physical-layout.js';

// Traced from the left (white) table in the user's 730x486 overhead photograph.
// These are photograph pixels, not guessed millimeters or viewport placements.
export const TABLE_REFERENCE = Object.freeze({
  image: { width: 730, height: 486 },
  control: { x: 158, y: 211, width: 51, height: 51 },
  cover: [[138, 188], [228, 188], [232, 192], [232, 280], [228, 284], [138, 284], [134, 280], [134, 192]],
  dividers: [
    [[136, 190], [158, 211]], [[230, 190], [209, 211]],
    [[230, 282], [209, 262]], [[136, 282], [158, 262]],
  ],
  openings: [
    { id: 'lift-top', x: 139, y: 154, width: 137, height: 13 },
    { id: 'lift-right', x: 252, y: 191, width: 12, height: 138 },
    { id: 'lift-bottom', x: 90, y: 305, width: 137, height: 13 },
    { id: 'lift-left', x: 102, y: 143, width: 12, height: 137 },
    { id: 'deal-top', x: 139, y: 114, width: 99, height: 12 },
    { id: 'deal-right', x: 293, y: 193, width: 12, height: 98 },
    { id: 'deal-bottom', x: 127, y: 346, width: 100, height: 12 },
    { id: 'deal-left', x: 61, y: 181, width: 12, height: 100 },
  ],
});
export const SEAM_WIDTH = 3;
const referenceScale = CONTROL.width / TABLE_REFERENCE.control.width;
const anchor = controlPoint(7, 249);

// Align the photo's control-box lower-left corner to the existing 2D housing.
// One uniform scale preserves every length ratio and relative offset.
export function referencePoint(x, y) {
  const control = TABLE_REFERENCE.control;
  return {
    x: anchor.x + (x - control.x) * referenceScale,
    y: anchor.y + (y - control.y - control.height) * referenceScale,
  };
}

export const TABLE_SEAMS = Object.freeze({
  cover: TABLE_REFERENCE.cover.map(([x, y]) => referencePoint(x, y)),
  dividers: TABLE_REFERENCE.dividers.map(line => line.map(([x, y]) => referencePoint(x, y))),
  openings: TABLE_REFERENCE.openings.map(({ id, x, y, width, height }) => ({
    id, ...referencePoint(x, y), width: width * referenceScale, height: height * referenceScale,
  })),
});
const lowerOpenings = TABLE_SEAMS.openings.filter(({ y, height }) => y + height >= 0);

// Keep the original composition's fit and position. Only its tabletop grows;
// the 3D camera, hit targets and cropped control box retain their coordinates.
export function tableLayout(width, height) {
  const scale = Math.min(width / 1920, height / 1080);
  const sceneLeft = (width - 1920 * scale) / 2;
  const sceneTop = (height - 1080 * scale) / 2;
  const padding = SEAM_WIDTH;
  const left = Math.floor(Math.min(-sceneLeft / scale, ...lowerOpenings.map(({ x }) => x - padding)));
  const right = Math.ceil(Math.max((width - sceneLeft) / scale, ...lowerOpenings.map(({ x, width }) => x + width + padding)));
  const bottom = Math.ceil(Math.max((height - sceneTop) / scale, ...lowerOpenings.map(({ y, height }) => y + height + padding)));
  return { scale, sceneLeft, sceneTop, left, width: right - left, height: bottom };
}

export function drawTableSeams(context) {
  context.save();
  context.strokeStyle = '#052f24'; context.lineWidth = SEAM_WIDTH; context.lineJoin = 'miter';
  context.beginPath();
  const [start, ...corners] = TABLE_SEAMS.cover;
  context.moveTo(start.x, start.y);
  for (const point of corners) context.lineTo(point.x, point.y);
  context.closePath();
  for (const [from, to] of TABLE_SEAMS.dividers) {
    context.moveTo(from.x, from.y); context.lineTo(to.x, to.y);
  }
  for (const { x, y, width, height } of TABLE_SEAMS.openings) context.rect(x, y, width, height);
  context.stroke(); context.restore();
}
