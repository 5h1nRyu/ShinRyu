import { SPEC, center } from './geometry.js?v=20261011-ripple-origin';
import { CONTROL } from './physical-layout.js';

// Rotate the main river around the full square control box, including the part
// above the fixed crop. Kamicha sits on the left and shimocha on the right.
export function sideRiverCenters(side) {
  if (side !== 'kamicha' && side !== 'shimocha') throw new RangeError('Unknown river side');
  const controlY = CONTROL.bottom - CONTROL.width / 2;
  const turn = side === 'kamicha' ? 1 : -1;
  return Array.from({ length: SPEC.columns * SPEC.rows }, (_, index) => {
    const tile = center(index);
    return {
      side, index, x: 960 - turn * (tile.y - controlY),
      y: controlY + turn * (tile.x - 960), rotation: turn * Math.PI / 2,
    };
  });
}
