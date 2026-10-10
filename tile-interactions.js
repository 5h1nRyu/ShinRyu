import { SPEC } from './geometry.js?v=20261011-side-reset';

export function topLeftTile(tiles) {
  return tiles.reduce((first, tile) => !first || tile.y < first.y || (tile.y === first.y && tile.x < first.x) ? tile : first, null);
}

export function yellowAction(tiles) {
  return tiles.every(tile => !tile.front && !tile.flips.length) ? 'start' : 'reset';
}

export function waveInProgress(tiles) {
  return tiles.some(tile => tile.flips.length);
}

export function tileAction(tiles, tile) {
  if (waveInProgress(tiles)) return null;
  return tile.front ? (tile.side === 'main' ? null : 'reset') : 'reveal';
}

export function rippleDelays(tiles, origin) {
  const distances = tiles.map(tile => Math.hypot(tile.x - origin.x, tile.y - origin.y));
  const maximum = Math.max(0, ...distances);
  return distances.map(distance => maximum ? Math.round(600 * distance / maximum) : 0);
}

export function flipAt(tile, time) {
  return tile.flips.find((flip) => time < flip.start + SPEC.flipDuration) ?? null;
}

export function settleFlips(tile, time) {
  const before = tile.front, count = tile.flips.length;
  for (const flip of tile.flips) {
    if (time >= flip.start + SPEC.flipDuration) tile.front = !flip.fromFront;
  }
  if (count && time >= tile.flips.at(-1).start + SPEC.flipDuration) tile.flips = [];
  return before !== tile.front || count !== tile.flips.length;
}

const flipFrom = (start, fromFront, pose) => ({ start, fromFront, from: pose.q, fromHeight: pose.height });

export function revealTiles(tiles, originIndex, time, poses) {
  for (const tile of tiles) settleFlips(tile, time);
  const origin = tiles.find(tile => tile.index === originIndex);
  if (!origin || origin.front || origin.flips.length) return null;
  const delays = rippleDelays(tiles, origin);
  tiles.forEach((tile, index) => {
    if (tile.front || tile.flips.length) return;
    tile.flips = [flipFrom(time + delays[index], false, poses[index])]; tile.tween = null;
  });
  return { origin: origin.index, end: Math.max(time, ...tiles.flatMap(tile => tile.flips.map(flip => flip.start + SPEC.flipDuration))) };
}

export function resetTiles(tiles, time, poses) {
  for (const tile of tiles) settleFlips(tile, time);
  // A reset can begin only after the entire reveal wave has finished.
  if (waveInProgress(tiles)) return null;
  const origin = topLeftTile(tiles), delays = rippleDelays(tiles, origin);
  tiles.forEach((tile, index) => {
    const pose = poses[index];
    tile.flips = tile.front ? [flipFrom(time + delays[index], true, pose)] : [];
    tile.tween = null;
    if (!tile.front && pose.q !== 1) tile.tween = { from: pose.q, to: 1, duration: 200, start: time };
  });
  return { origin: origin.index, end: Math.max(time, ...tiles.flatMap(tile => tile.flips.map(flip => flip.start + SPEC.flipDuration))) };
}
