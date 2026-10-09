import test from 'node:test';
import assert from 'node:assert/strict';
import { PIXELS_PER_MM, CONTROL, controlPoint, STICK_CENTER } from '../physical-layout.js';
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

test('the reference crop aligns the physical stick with the 2D slot and exposes only the supplied portion', () => {
  assert.equal(STICK.x, STICK_CENTER.x); assert.equal(-STICK.y, STICK_CENTER.y);
  assert.equal(-STICK.y, controlPoint(345, 195).y);
  assert.equal(controlPoint(689, 249).x - controlPoint(7, 249).x, CONTROL.width);
  assert.equal(controlPoint(348, 249).y, CONTROL.bottom);
  assert.equal(CONTROL.visibleHeight / CONTROL.scale, 262);
  assert.ok(STICK.x - STICK.length / 2 > controlPoint(148, 195).x);
  assert.ok(STICK.x + STICK.length / 2 < controlPoint(543, 195).x);
});
