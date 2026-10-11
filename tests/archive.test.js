import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveLayout, routeValues, sampleArchive, THEMES } from '../archive-geometry.js';

test('six acceptance viewports preserve specified grid origins and typography', () => {
  for (const [W, H, u, x, y, compact] of [
    [1440, 900, 150, 270, 150, false], [1920, 1080, 180, 420, 180, false],
    [1280, 720, 120, 280, 120, false], [1024, 768, 112.5, 174.5, 159, true],
    [390, 844, 59.6666666667, 16, 302.6666666667, true], [320, 568, 48, 16, 188, true],
  ]) {
    const g = archiveLayout(W, H);
    for (const [actual, expected] of [[g.u, u], [g.x, x], [g.y, y]]) assert.ok(Math.abs(actual - expected) < 1e-6);
    assert.equal(g.compact, compact); assert.equal(g.titleSize, g.v);
    assert.ok(g.x >= 0 && g.x + 6 * g.u <= W);
    assert.ok(g.buttonHeight >= 44);
  }
  const tiny = archiveLayout(280, 400);
  assert.equal(tiny.W, 320); assert.equal(tiny.H, 560);
});

test('route values reject malformed, fractional and out-of-range inputs', () => {
  assert.deepEqual(routeValues('?tile=07&scene=2'), { index: 6, scene: 2 });
  for (const value of ['?tile=19&scene=3', '?tile=0&scene=-1', '?tile=2.5&scene=1.5', '?tile=x&scene=x', '']) {
    assert.deepEqual(routeValues(value), { index: 0, scene: 0 });
  }
  assert.equal(THEMES.length, 3);
});

test('absolute entry tracks align at completion and keep the photo still', () => {
  const g = archiveLayout(1440, 900);
  for (const t of [0, 80, 240, 280, 400, 520, 720, 740, 760]) {
    const state = sampleArchive('enter', t, g);
    assert.equal(state.duration, 760);
    assert.ok(state.photo >= 0 && state.photo <= 1);
    assert.equal(state.photoY, undefined);
  }
  const end = sampleArchive('enter', 760, g);
  for (const key of ['grid', 'title', 'photo', 'caption', 'buttons']) assert.equal(end[key], 1);
  for (const key of ['titleY', 'captionY', 'buttonY']) assert.equal(end[key], 0);
  assert.equal(sampleArchive('enter', 400, g).title, 0);
  assert.equal(sampleArchive('enter', 480, g).photo, 0);
});

test('switching preserves photo/grid, swaps at 100ms and ends on the axes', () => {
  const g = archiveLayout(390, 844);
  for (const t of [0, 100, 200, 320]) {
    const state = sampleArchive('switch', t, g);
    assert.equal(state.photo, 1); assert.equal(state.grid, 1);
    assert.equal(state.swap, t >= 100);
  }
  assert.equal(sampleArchive('switch', 100, g).title, 0);
  assert.equal(sampleArchive('switch', 320, g).titleY, 0);
  for (const kind of ['enter', 'direct', 'switch', 'return', 'home']) {
    const state = sampleArchive(kind, 100, g, true);
    assert.equal(state.duration, 100);
    assert.equal(state.titleY, 0); assert.equal(state.captionY, 0); assert.equal(state.buttonY, 0);
  }
});
