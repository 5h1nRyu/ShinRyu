import { SPEC } from './geometry.js?v=20261011-all-rivers';

export function topLeftTile(tiles) {
  return tiles.reduce((first, tile) => !first || tile.y < first.y || (tile.y === first.y && tile.x < first.x) ? tile : first, null);
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
  const origin = topLeftTile(tiles), delays = rippleDelays(tiles, origin);
  tiles.forEach((tile, index) => {
    settleFlips(tile, time);
    const current = flipAt(tile, time), pose = poses[index];
    // Cancel unopened, queued reveals. A reveal already rotating finishes
    // continuously, then closes when the reset wave has reached that position.
    const activeReveal = current && !current.fromFront && current.start <= time;
    if (activeReveal) {
      tile.flips = [{ ...current }, flipFrom(Math.max(time + delays[index], current.start + SPEC.flipDuration), true, { q: 1, height: 0 })];
    } else if (tile.front) {
      tile.flips = [flipFrom(time + delays[index], true, pose)];
    } else {
      tile.flips = [];
    }
    tile.tween = null;
    if (!tile.front && !activeReveal && pose.q !== 1) tile.tween = { from: pose.q, to: 1, duration: 200, start: time };
  });
  return { origin: origin.index, end: Math.max(time, ...tiles.flatMap(tile => tile.flips.map(flip => flip.start + SPEC.flipDuration))) };
}
