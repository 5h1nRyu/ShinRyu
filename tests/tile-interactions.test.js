import test from 'node:test';
import assert from 'node:assert/strict';
import { center, flipPose } from '../geometry.js';
import { sideRiverCenters } from '../river-layout.js';
import { topLeftTile, yellowAction, waveInProgress, tileAction, rippleDelays, flipAt, settleFlips, revealTiles, resetTiles } from '../tile-interactions.js';

const makeTiles = () => [...Array.from({ length: 18 }, (_, index) => center(index)), ...sideRiverCenters('kamicha'), ...sideRiverCenters('shimocha')]
  .map((position, index) => ({ side: 'main', ...position, index, front: false, flips: [], tween: null }));
const rest = { theta: 0, q: 1, height: 0 };
const poses = (tiles, time) => tiles.map(tile => {
  const flip = flipAt(tile, time);
  return flip ? flipPose(time - flip.start, flip.from, flip.fromFront, flip.fromHeight)
    : { theta: tile.front ? Math.PI : 0, q: 1, height: 0 };
});

test('yellow control labels a closed board start and an open or moving board reset', () => {
  const tiles = makeTiles();
  assert.equal(yellowAction(tiles), 'start');
  const cycle = revealTiles(tiles, topLeftTile(tiles).index, 100, poses(tiles, 100));
  assert.equal(cycle.origin, 30); assert.equal(tiles[30].flips[0].start, 100);
  assert.equal(yellowAction(tiles), 'reset');
  for (const tile of tiles) settleFlips(tile, cycle.end);
  assert.equal(yellowAction(tiles), 'reset');
  const closing = resetTiles(tiles, 1500, poses(tiles, 1500));
  assert.equal(yellowAction(tiles), 'reset');
  for (const tile of tiles) settleFlips(tile, closing.end);
  assert.equal(yellowAction(tiles), 'start');
  tiles[0].front = true;
  assert.equal(yellowAction(tiles), 'reset');
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

test('reset and every tile click are ignored until the complete reveal wave ends', () => {
  for (const origin of [0, 23, 48]) {
    const tiles = makeTiles(); revealTiles(tiles, origin, 0, tiles.map(() => ({ ...rest, q: 1.04, height: 1 })));
    for (const at of [0, 180, 650, 1199]) {
      for (const tile of tiles) settleFlips(tile, at);
      const before = structuredClone(tiles), beforePoses = poses(tiles, at);
      assert.equal(waveInProgress(tiles), true);
      assert.ok(tiles.every(tile => tileAction(tiles, tile) === null));
      assert.equal(resetTiles(tiles, at, beforePoses), null);
      assert.deepEqual(tiles, before);
      assert.deepEqual(poses(tiles, at), beforePoses);
    }
    for (const tile of tiles) settleFlips(tile, 1200);
    assert.equal(waveInProgress(tiles), false);
    assert.ok(tiles.every(tile => tile.front));
    const cycle = resetTiles(tiles, 1200, poses(tiles, 1200));
    assert.equal(cycle.end, 2400);
    for (const tile of tiles) settleFlips(tile, cycle.end);
    assert.ok(tiles.every(tile => !tile.front && !tile.flips.length));
    assert.ok(revealTiles(tiles, origin, cycle.end + 1, poses(tiles, cycle.end + 1)));
  }
});

test('open side rivers reset the board while the open main river remains inactive', () => {
  const tiles = makeTiles();
  assert.ok(tiles.every(tile => tileAction(tiles, tile) === 'reveal'));
  tiles.forEach(tile => tile.front = true);
  assert.ok(tiles.slice(0, 18).every(tile => tileAction(tiles, tile) === null));
  assert.ok(tiles.slice(18).every(tile => tileAction(tiles, tile) === 'reset'));
  const cycle = resetTiles(tiles, 0, poses(tiles, 0));
  assert.ok(tiles.every(tile => tileAction(tiles, tile) === null));
  for (const tile of tiles) settleFlips(tile, cycle.end);
  assert.ok(tiles.every(tile => tileAction(tiles, tile) === 'reveal'));
});
