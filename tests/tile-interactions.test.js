import test from 'node:test';
import assert from 'node:assert/strict';
import { flipPose, rippleDelay } from '../geometry.js';
import { flipAt, settleFlips, revealTile, resetTiles } from '../tile-interactions.js';

const makeTiles = () => Array.from({ length: 18 }, (_, index) => ({ index, front: false, flips: [], tween: null }));
const rest = { q: 1, height: 0 };
function pose(tile, time) {
  const flip = flipAt(tile, time);
  return flip ? flipPose(time - flip.start, flip.from, flip.fromFront, flip.fromHeight)
    : { theta: tile.front ? Math.PI : 0, q: 1, height: 0 };
}

test('a click reveals just its tile; other backs can be revealed concurrently and fronts ignore clicks', () => {
  const tiles = makeTiles();
  assert.equal(revealTile(tiles[8], 0, rest), true);
  assert.equal(revealTile(tiles[8], 100, rest), false);
  assert.equal(revealTile(tiles[17], 100, rest), true);
  assert.ok(pose(tiles[8], 300).theta > 0);
  assert.equal(pose(tiles[7], 300).theta, 0);
  for (const tile of tiles) settleFlips(tile, 700);
  assert.deepEqual(tiles.filter((tile) => tile.front).map((tile) => tile.index), [8, 17]);
  const before = structuredClone(tiles[8]);
  assert.equal(revealTile(tiles[8], 900, rest), false);
  assert.deepEqual(tiles[8], before);
});

test('the second wave starts immediately when the first check reaches the bottom right', () => {
  const tiles = makeTiles();
  const cycle = resetTiles(tiles, 1000, tiles.map(() => rest));
  assert.deepEqual(cycle, { reverseStart: 1600, end: 2800 });
  assert.equal(tiles[17].flips[0].start, 1600);
  assert.equal(tiles[0].flips[1].start, 1600);
  // Both waves can be moving, but a tile never reverses before its reveal finishes.
  for (const tile of tiles) {
    const [reveal, conceal] = tile.flips;
    assert.equal(reveal.fromFront, false); assert.equal(conceal.fromFront, true);
    assert.equal(conceal.start - reveal.start, 600);
    assert.deepEqual(pose(tile, conceal.start), { theta: Math.PI, q: 1, height: 0 });
    assert.ok(Math.abs(pose(tile, conceal.start - .001).theta - Math.PI) < .00001);
  }
  assert.ok(pose(tiles[0], 1900).theta > 0 && pose(tiles[0], 1900).theta < Math.PI);
  assert.ok(pose(tiles[17], 1900).theta > 0 && pose(tiles[17], 1900).theta < Math.PI);
  for (const tile of tiles) settleFlips(tile, cycle.end);
  assert.ok(tiles.every((tile) => !tile.front && tile.flips.length === 0));
});

test('reset skips already open tiles in its first pass and handles all-back, mixed and all-front boards', () => {
  for (const open of [[], [0, 3, 8, 17], Array.from({ length: 18 }, (_, i) => i)]) {
    const tiles = makeTiles();
    for (const index of open) tiles[index].front = true;
    const cycle = resetTiles(tiles, 200, tiles.map(() => rest));
    for (const tile of tiles) {
      assert.equal(tile.flips.length, open.includes(tile.index) ? 1 : 2);
      assert.equal(tile.flips.at(-1).start, cycle.reverseStart + rippleDelay(0, tile.index));
      if (open.includes(tile.index)) assert.equal(pose(tile, 500).theta, Math.PI);
    }
    // A delayed browser frame still completes both passes correctly.
    for (const tile of tiles) settleFlips(tile, cycle.end + 500);
    assert.ok(tiles.every((tile) => !tile.front && tile.flips.length === 0));
  }
});

test('reset during a clicked reveal preserves its pose and finishes it before the return wave', () => {
  const tiles = makeTiles();
  const lifted = { q: 1.04, height: 1 };
  revealTile(tiles[0], 0, lifted);
  const current = structuredClone(tiles[0].flips[0]), before = pose(tiles[0], 180);
  const cycle = resetTiles(tiles, 180, tiles.map((tile) => pose(tile, 180)));
  assert.deepEqual(tiles[0].flips[0], current);
  assert.deepEqual(pose(tiles[0], 180), before);
  assert.equal(tiles[0].flips[1].start, 780);
  assert.equal(pose(tiles[0], 700).theta, Math.PI);
  for (const tile of tiles) settleFlips(tile, cycle.end);
  assert.ok(tiles.every((tile) => !tile.front));
  assert.equal(revealTile(tiles[0], cycle.end + 1, rest), true);
});
