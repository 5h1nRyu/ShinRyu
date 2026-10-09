import { CONTROL, controlPoint, mm } from './physical-layout.js';

// Reference: the overhead AMOS REXX III CSJ replacement mat. Closed lift doors
// have thin rectangular joints; diagonal cuts connect the center lid to its box.
// The four wall doors are fitted to this cropped composition, not factory dimensions.
export function drawTableSeams(context) {
  const lowerLeft = controlPoint(7, 249), lowerRight = controlPoint(689, 249);
  const margin = mm(60), side = CONTROL.width + margin * 2;
  const left = lowerLeft.x - margin, bottom = lowerLeft.y + margin;
  const doorLength = mm(348), doorWidth = mm(21);
  context.save();
  context.strokeStyle = '#052f24'; context.lineWidth = 2; context.lineJoin = 'miter';
  context.beginPath();
  context.rect(left, bottom - side, side, side);
  context.moveTo(left, bottom); context.lineTo(lowerLeft.x, lowerLeft.y);
  context.moveTo(left + side, bottom); context.lineTo(lowerRight.x, lowerRight.y);
  // The upper door lies above the crop; the left/right/bottom doors are partly visible.
  context.rect(1040, -1160, doorLength, doorWidth);
  context.rect(-95, 700 - doorLength, doorWidth, doorLength);
  context.rect(1850, 350, doorWidth, doorLength);
  context.rect(-670, 1028, doorLength, doorWidth);
  context.stroke(); context.restore();
}
