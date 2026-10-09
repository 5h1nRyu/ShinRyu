import { CONTROL, controlPoint, mm } from './physical-layout.js';

// Reference: the overhead AMOS REXX III CSJ replacement mat. Closed lift doors
// have thin rectangular joints; diagonal cuts connect the center lid to its box.
// The four wall doors are fitted to this cropped composition, not factory dimensions.
const doorLength = mm(348), doorWidth = mm(21);
const doors = [
  [1040, -1160, doorLength, doorWidth],
  [-95, 700 - doorLength, doorWidth, doorLength],
  [1850, 350, doorWidth, doorLength],
  [-670, 1028, doorLength, doorWidth],
];
// The upper door stays above y=0 in this fixed crop and needs no canvas padding.
const lowerDoors = doors.filter(([, y, , height]) => y + height >= 0);
export const SEAM_WIDTH = 3;

// Keep the original composition's fit and position. Only its tabletop grows;
// the 3D camera, hit targets and cropped control box retain their coordinates.
export function tableLayout(width, height) {
  const scale = Math.min(width / 1920, height / 1080);
  const sceneLeft = (width - 1920 * scale) / 2;
  const sceneTop = (height - 1080 * scale) / 2;
  const padding = SEAM_WIDTH;
  const left = Math.floor(Math.min(-sceneLeft / scale, ...lowerDoors.map(([x]) => x - padding)));
  const right = Math.ceil(Math.max((width - sceneLeft) / scale, ...lowerDoors.map(([x, , w]) => x + w + padding)));
  const bottom = Math.ceil(Math.max((height - sceneTop) / scale, ...lowerDoors.map(([, y, , h]) => y + h + padding)));
  return { scale, sceneLeft, sceneTop, left, width: right - left, height: bottom };
}

export function drawTableSeams(context) {
  const lowerLeft = controlPoint(7, 249), lowerRight = controlPoint(689, 249);
  const margin = mm(60), side = CONTROL.width + margin * 2;
  const left = lowerLeft.x - margin, bottom = lowerLeft.y + margin;
  context.save();
  context.strokeStyle = '#052f24'; context.lineWidth = SEAM_WIDTH; context.lineJoin = 'miter';
  context.beginPath();
  context.rect(left, bottom - side, side, side);
  context.moveTo(left, bottom); context.lineTo(lowerLeft.x, lowerLeft.y);
  context.moveTo(left + side, bottom); context.lineTo(lowerRight.x, lowerRight.y);
  // Draw the complete geometry. The viewport crops it, rather than a 1920x1080 surface.
  for (const door of doors) context.rect(...door);
  context.stroke(); context.restore();
}
