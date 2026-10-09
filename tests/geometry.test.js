import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, center, smooth, entryScale, flipPose, projection, rippleDelay, motionDistance } from '../geometry.js';

const near = (actual, expected, tolerance = .00001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('18 tile centers preserve the 4px seams and the specified bounding box', () => {
  const first = center(0), last = center(17);
  assert.deepEqual(first, { x: 582.5, y: 502 });
  assert.deepEqual(last, { x: 1337.5, y: 902 });
  assert.equal(first.x - SPEC.tileWidth / 2, 509);
  assert.equal(first.y - SPEC.tileHeight / 2, 404);
  assert.equal(last.x + SPEC.tileWidth / 2, 1411);
  assert.equal(last.y + SPEC.tileHeight / 2, 1000);
  assert.equal(center(1).x - first.x - SPEC.tileWidth, 4);
  assert.equal(center(6).y - first.y - SPEC.tileHeight, 4);
});

test('the 600ms flip shows only the long side at 300ms and upright content at the end', () => {
  const initial = flipPose(0, 1.015);
  near(initial.q, 1.015); near(initial.theta, 0);
  const sidePose = flipPose(300);
  near(sidePose.theta, Math.PI / 2); near(sidePose.q, 1.04);
  const side = projection(sidePose.theta, sidePose.q);
  near(side.faceWidth, 0); near(side.sideWidth, 120.12); near(side.height, 203.84);
  const final = projection(flipPose(600).theta, flipPose(600).q);
  near(final.width, 147); near(final.sideWidth, 0); assert.equal(final.front, true);
  near(projection(0, 1.04).width, 152.88);
  const peakAngle = Math.atan(115.5 / 147);
  near(projection(peakAngle, 1.04).width, 194.4250725, .001);
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

test('reset flips from the upright front to the blue back with the same 600ms timing', () => {
  const initial = flipPose(0, 1.025, true);
  near(initial.theta, Math.PI); near(initial.q, 1.025);
  const side = flipPose(300, 1.025, true);
  near(side.theta, Math.PI / 2); near(side.q, 1.04);
  near(projection(side.theta, side.q).sideWidth, 120.12);
  const final = flipPose(600, 1.025, true);
  near(final.theta, 0); near(final.q, 1);
  assert.equal(projection(final.theta, final.q).front, false);
  for (const time of [-1, 0, 70, 120, 210, 300, 390, 480, 550, 600, 650]) {
    const forward = flipPose(time, 1.025), reverse = flipPose(time, 1.025, true);
    near(forward.theta + reverse.theta, Math.PI);
    near(forward.q, reverse.q);
  }
});

test('entry finishes at 906ms and all interpolation holds at its endpoints', () => {
  near(entryScale(17, 180 + 18 * 17), 1.06);
  near(entryScale(17, 906), 1);
  near(smooth(-1), 0); near(smooth(2), 1); near(smooth(.5), .5);
  const stationary = { theta: Math.PI, q: 1 };
  near(motionDistance(stationary, stationary), 0);
  assert.ok(motionDistance({ theta: 0, q: 1 }, { theta: .05, q: 1.04 }) > 0);
});
