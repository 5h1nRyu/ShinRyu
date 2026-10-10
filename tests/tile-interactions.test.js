import test from 'node:test';
import assert from 'node:assert/strict';
import { center, flipPose } from '../geometry.js';
import { sideRiverCenters } from '../river-layout.js';
import { topLeftTile, rippleDelays, flipAt, settleFlips, revealTiles, resetTiles } from '../tile-interactions.js';

const makeTiles = () => [...Array.from({ length: 18 }, (_, index) => center(index)), ...sideRiverCenters('kamicha'), ...sideRiverCenters('shimocha')]
  .map((position, index) => ({ ...position, index, front: false, flips: [], tween: null }));
const rest = { theta: 0, q: 1, height: 0 };
const poses = (tiles, time) => tiles.map(tile => {
  const flip = flipAt(tile, time);
  return flip ? flipPose(time - flip.start, flip.from, flip.fromFront, flip.fromHeight)
    : { theta: tile.front ? Math.PI : 0, q: 1, height: 0 };
});

test('every tile across all three rivers can originate a spatial reveal wave', () => {
  for (let origin = 0; origin < 54; origin++) {
    const tiles = makeTiles(), cycle = revealTiles(tiles, origin, 100, tiles.map(() => rest));
    assert.equal(cycle.origin, origin); assert.equal(cycle.end, 1300);
    assert.equal(tiles[origin].flips[0].start, 100);
    assert.equal(Math.max(...tiles.map(tile => tile.flips[0].start)), 700);
    const ordered = tiles.map(tile => ({ distance: Math.hypot(tile.x - tiles[origin].x, tile.y - tiles[origin].y), start: tile.flips[0].start }))
      .sort((a, b) => a.distance - b.distance);
    for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i].start >= ordered[i - 1].start);
    for (const tile of tiles) settleFlips(tile, cycle.end);
    assert.ok(tiles.every(tile => tile.front && !tile.flips.length));
    const before = structuredClone(tiles);
    assert.equal(revealTiles(tiles, origin, 1500, poses(tiles, 1500)), null);
    assert.deepEqual(tiles, before);
  }
});

test('repeated clicks do not restart a reveal, and a mixed wave skips already front-up tiles', () => {
  const tiles = makeTiles(); tiles[0].front = true; tiles[20].front = true;
  revealTiles(tiles, 45, 0, poses(tiles, 0));
  assert.equal(tiles[0].flips.length, 0); assert.equal(tiles[20].flips.length, 0);
  const before = structuredClone(tiles);
  assert.equal(revealTiles(tiles, 45, 100, poses(tiles, 100)), null);
  assert.equal(revealTiles(tiles, 1, 100, poses(tiles, 100)), null);
  assert.deepEqual(tiles, before);
  for (const tile of tiles) settleFlips(tile, 1200);
  assert.ok(tiles.every(tile => tile.front));
});

test('reset begins at the spatial top-left of all 54 tiles and directly closes every front', () => {
  const tiles = makeTiles(); tiles.forEach(tile => tile.front = true);
  const first = topLeftTile(tiles);
  assert.equal(first.index, 30); assert.ok(first.x < tiles[0].x && first.y < tiles[0].y);
  assert.equal(topLeftTile([...tiles].reverse()).index, first.index);
  const cycle = resetTiles(tiles, 1000, poses(tiles, 1000));
  assert.deepEqual(cycle, { origin: first.index, end: 2200 });
  assert.equal(first.flips[0].start, 1000);
  const delays = rippleDelays(tiles, first);
  for (const [index, tile] of tiles.entries()) {
    assert.equal(tile.flips.length, 1); assert.equal(tile.flips[0].fromFront, true);
    assert.equal(tile.flips[0].start, 1000 + delays[index]);
  }
  for (const tile of tiles) settleFlips(tile, cycle.end + 500);
  assert.ok(tiles.every(tile => !tile.front && !tile.flips.length));
});

test('reset leaves unopened tiles on their backs and never reveals them first', () => {
  for (const open of [[], [0, 9, 18, 30, 44, 53]]) {
    const tiles = makeTiles(); open.forEach(index => tiles[index].front = true);
    const cycle = resetTiles(tiles, 200, poses(tiles, 200));
    for (const tile of tiles) {
      assert.equal(tile.flips.length, open.includes(tile.index) ? 1 : 0);
      assert.ok(tile.flips.every(flip => flip.fromFront));
      settleFlips(tile, cycle.end);
      assert.equal(tile.front, false);
    }
    if (!open.length) assert.equal(cycle.end, 200);
  }
});

test('reset interrupts a reveal continuously, cancels queued unopened reveals and finishes closed', () => {
  for (const origin of [0, 23, 48]) {
    const tiles = makeTiles(); revealTiles(tiles, origin, 0, tiles.map(() => ({ ...rest, q: 1.04, height: 1 })));
    const at = 180, before = poses(tiles, at);
    const active = tiles.filter(tile => tile.flips[0].start <= at), queued = tiles.filter(tile => tile.flips[0].start > at);
    const activeFlips = new Map(active.map(tile => [tile.index, structuredClone(tile.flips[0])]));
    const cycle = resetTiles(tiles, at, before);
    for (const tile of active) {
      assert.deepEqual(tile.flips[0], activeFlips.get(tile.index));
      assert.deepEqual(poses(tiles, at)[tile.index], before[tile.index]);
      assert.ok(tile.flips[1].start >= tile.flips[0].start + 600);
      assert.equal(tile.flips[1].fromFront, true);
    }
    for (const tile of queued) { assert.equal(tile.flips.length, 0); assert.equal(tile.front, false); }
    assert.ok(cycle.end <= at + 1200);
    for (const tile of tiles) settleFlips(tile, cycle.end);
    assert.ok(tiles.every(tile => !tile.front && !tile.flips.length));
    assert.ok(revealTiles(tiles, origin, cycle.end + 1, poses(tiles, cycle.end + 1)));
  }
});
