import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RIICHI_FACES, nextRiichiFace, sideRiverFaces } from '../riichi-faces.js';

test('all 37 local face designs cover 0–9m/p/s and the seven honors', () => {
  const expected = ['m', 'p', 's'].flatMap((suit) => Array.from({ length: 10 }, (_, n) => `${n}${suit}`));
  expected.push(...Array.from({ length: 7 }, (_, n) => `${n + 1}z`));
  assert.equal(RIICHI_FACES.length, 37);
  assert.deepEqual(RIICHI_FACES.map((face) => face.code).sort(), expected.sort());
  assert.equal(new Set(RIICHI_FACES.map((face) => face.image)).size, 37);
  for (const face of RIICHI_FACES) {
    const svg = readFileSync(new URL(`../${face.image}`, import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 300 400"/);
    assert.doesNotMatch(svg, /(?:href|src)="https?:/);
  }
  assert.deepEqual(RIICHI_FACES.slice(-7).map((face) => face.label), ['東', '南', '西', '北', '白', '發', '中']);
});

test('both side rivers share a non-red pool with at most two of each face', () => {
  let seed = 1528;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const draws = new Set();
  for (let i = 0; i < 500; i++) {
    const faces = sideRiverFaces(36, random), counts = new Map();
    assert.equal(faces.length, 36);
    for (const face of faces) {
      assert.ok(RIICHI_FACES.includes(face));
      assert.ok(!face.code.startsWith('0'));
      counts.set(face.code, (counts.get(face.code) ?? 0) + 1);
    }
    assert.ok([...counts.values()].every(count => count <= 2));
    draws.add(faces.map(face => face.code).join(','));
  }
  assert.equal(draws.size, 500);
  for (const endpoint of [0, 1]) {
    const full = sideRiverFaces(68, () => endpoint);
    assert.equal(new Set(full.map(face => face.code)).size, 34);
    for (const face of full) assert.equal(full.filter(other => other === face).length, 2);
  }
  assert.deepEqual(sideRiverFaces(0), []);
  for (const count of [-1, 69, 1.5]) assert.throws(() => sideRiverFaces(count), RangeError);
});

test('the M.LEAGUE sampling pool has 136 tiles, including exactly one red five per suit', () => {
  assert.equal(RIICHI_FACES.reduce((n, face) => n + face.copies, 0), 136);
  for (const suit of ['m', 'p', 's']) {
    assert.equal(RIICHI_FACES.find((face) => face.code === `0${suit}`).copies, 1);
    assert.equal(RIICHI_FACES.find((face) => face.code === `5${suit}`).copies, 3);
  }
  const selected = new Map();
  for (let ticket = 0; ticket < 136; ticket++) {
    const face = nextRiichiFace(null, () => (ticket + .5) / 136);
    selected.set(face.code, (selected.get(face.code) ?? 0) + 1);
  }
  assert.equal(selected.size, 37);
  for (const face of RIICHI_FACES) assert.equal(selected.get(face.code), face.copies);
});

test('each reset chooses a different face, including random endpoints and many consecutive resets', () => {
  for (const previous of RIICHI_FACES) for (const random of [0, .25, .5, .75, 1]) {
    assert.notEqual(nextRiichiFace(previous.code, () => random).code, previous.code);
  }
  let seed = 91257, previous = null;
  for (let i = 0; i < 1000; i++) {
    const face = nextRiichiFace(previous, () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; });
    assert.notEqual(face.code, previous);
    assert.ok(RIICHI_FACES.includes(face)); previous = face.code;
  }
});
