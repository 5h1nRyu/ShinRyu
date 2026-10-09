import test from 'node:test';
import assert from 'node:assert/strict';
import { PIXELS_PER_MM, CONTROL, controlPoint } from '../physical-layout.js';
import { SPEC } from '../geometry.js';
import { STICK } from '../score-stick.js';

test('tiles, tenbou and control box share one millimeter scale', () => {
  for (const [pixels, millimeters] of [
    [SPEC.tileWidth, 21], [SPEC.tileHeight, 28], [SPEC.thickness, 16.5],
    [STICK.length, 65], [STICK.width, 7], [STICK.thickness, 3], [CONTROL.width, 130],
  ]) assert.equal(pixels / millimeters, PIXELS_PER_MM);
  assert.ok(Math.abs(STICK.length / SPEC.tileWidth - 65 / 21) < .00001);
  assert.ok(Math.abs(CONTROL.width / SPEC.tileWidth - 130 / 21) < .00001);
});

test('the physical stick aligns with the transformed 2D slot and clears both side buttons', () => {
  assert.equal(-STICK.y, controlPoint(960, 202).y);
  assert.equal(controlPoint(1430, 250).x - controlPoint(490, 250).x, CONTROL.width);
  assert.equal(controlPoint(960, 250).y, CONTROL.bottom);
  assert.ok(STICK.x + STICK.length / 2 < controlPoint(1213, 202).x);
  assert.ok(STICK.x - STICK.length / 2 > controlPoint(702, 202).x);
});
