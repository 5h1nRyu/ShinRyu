import { SPEC, rippleDelay } from './geometry.js?v=20261010-loading-entry';
export const RESET_PAUSE = 500;

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

export function revealTile(tile, time, pose) {
  settleFlips(tile, time);
  if (tile.front || tile.flips.length) return false;
  tile.flips = [flipFrom(time, false, pose)]; tile.tween = null;
  return true;
}

export function resetTiles(tiles, time, poses) {
  const delays = tiles.map((tile) => rippleDelay(0, tile.index));
  const lastCheck = Math.max(...delays);
  const reverseStart = time + lastCheck + RESET_PAUSE;
  tiles.forEach((tile, index) => {
    settleFlips(tile, time);
    const current = flipAt(tile, time), pose = poses[index];
    // Keep a click-triggered reveal in progress, rather than restarting its rotation.
    const reveals = current && !current.fromFront ? [{ ...current }]
      : tile.front ? [] : [flipFrom(time + delays[index], false, pose)];
    tile.flips = [...reveals, flipFrom(reverseStart + delays[index], true,
      reveals.length ? { q: 1, height: 0 } : pose)];
    tile.tween = null;
  });
  return { checkEnd: time + lastCheck, reverseStart, end: reverseStart + lastCheck + SPEC.flipDuration };
}
