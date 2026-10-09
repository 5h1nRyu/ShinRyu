// One shared conversion for all three objects. These are design pixels, not CSS
// screen pixels: resizing the viewport scales the entire composition together.
export const PIXELS_PER_MM = 7;
export const REAL_SIZE = Object.freeze({
  // AMOS SMART published dimensions (height x width x thickness: 28 x 21 x 16.5).
  tile: Object.freeze({ width: 21, height: 28, thickness: 16.5 }),
  // Traditional white 1,000-point stick, published by the mahjong equipment shop.
  stick: Object.freeze({ length: 65, width: 7, thickness: 3 }),
  // Estimate from ALBAN's AMOS REXX III photograph, not a published specification:
  // the square center unit is about 6–6.5 tile widths, approximately 125–135 mm.
  control: Object.freeze({ width: 130 }),
});
export const mm = (value) => value * PIXELS_PER_MM;
// Coordinates follow the user's 698 x 262 reference crop. The housing spans
// x=7..689; keeping that width preserves the previously established mm scale.
const controlScale = mm(REAL_SIZE.control.width) / 682;
export const CONTROL = Object.freeze({
  width: mm(REAL_SIZE.control.width), scale: controlScale,
  left: 960 - 348 * controlScale, top: 0,
  referenceWidth: 698, referenceHeight: 262,
  visibleHeight: 262 * controlScale, bottom: 249 * controlScale,
});
export const controlPoint = (x, y) => ({ x: CONTROL.left + x * CONTROL.scale, y: y * CONTROL.scale });
export const STICK_CENTER = Object.freeze(controlPoint(345, 195));
