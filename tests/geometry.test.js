import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, center, smooth, entryScale, flipPose, projection, rippleDelay, shadowRect, motionDistance } from '../geometry.js';

const near = (actual, expected, tolerance = .00001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('18 tile centers preserve the 4px seams and the specified bounding box', () => {
  const first = center(0), last = center(17);
  assert.deepEqual(first, { x: 540, y: 432 });
  assert.deepEqual(last, { x: 1380, y: 888 });
  assert.equal(first.x - SPEC.tileWidth / 2, 458);
  assert.equal(first.y - SPEC.tileHeight / 2, 320);
  assert.equal(last.x + SPEC.tileWidth / 2, 1462);
  assert.equal(last.y + SPEC.tileHeight / 2, 1000);
  assert.equal(center(1).x - first.x - SPEC.tileWidth, 4);
  assert.equal(center(6).y - first.y - SPEC.tileHeight, 4);
});

test('only the sixth column ever owns a hard shadow, anchored to its projected right edge', () => {
  for (const theta of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
    for (let i = 0; i < 18; i++) {
      const shadow = shadowRect(i, theta, 1.04);
      if (i % 6 !== 5) assert.equal(shadow, null);
      else {
        near(shadow.x, center(i).x + projection(theta, 1.04).width / 2);
        near(shadow.width, 24.96); near(shadow.height, 232.96);
      }
    }
  }
  const staticShadow = shadowRect(17, Math.PI, 1);
  assert.deepEqual(staticShadow, { x: 1462, y: 776, width: 24, height: 224 });
});

test('the 600ms flip shows only the long side at 300ms and upright content at the end', () => {
  const initial = flipPose(0, 1.015);
  near(initial.q, 1.015); near(initial.theta, 0);
  const sidePose = flipPose(300);
  near(sidePose.theta, Math.PI / 2); near(sidePose.q, 1.04);
  const side = projection(sidePose.theta, sidePose.q);
  near(side.faceWidth, 0); near(side.sideWidth, 137.28); near(side.height, 232.96);
  const final = projection(flipPose(600).theta, flipPose(600).q);
  near(final.width, 164); near(final.sideWidth, 0); assert.equal(final.front, true);
  near(projection(0, 1.04).width, 170.56);
  const peakAngle = Math.atan(132 / 164);
  near(projection(peakAngle, 1.04).width, 218.9444354, .001);
});

test('the distance wave starts at the clicked center and finishes in at most 1200ms', () => {
  for (let origin = 0; origin < 18; origin++) {
    assert.equal(rippleDelay(origin, origin), 0);
    for (let i = 0; i < 18; i++) {
      assert.equal(rippleDelay(origin, i), rippleDelay(i, origin));
      assert.ok(rippleDelay(origin, i) <= 600);
    }
  }
  assert.equal(rippleDelay(0, 17), 600);
});

test('entry finishes at 906ms and all interpolation holds at its endpoints', () => {
  near(entryScale(17, 180 + 18 * 17), 1.06);
  near(entryScale(17, 906), 1);
  near(smooth(-1), 0); near(smooth(2), 1); near(smooth(.5), .5);
  const stationary = { theta: Math.PI, q: 1 };
  near(motionDistance(stationary, stationary), 0);
  assert.ok(motionDistance({ theta: 0, q: 1 }, { theta: .05, q: 1.04 }) > 0);
});
