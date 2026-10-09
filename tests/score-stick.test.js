import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from '../vendor/three.module.js';
import { STICK, REST_STICK, createStickDrop, stickClearance } from '../score-stick.js';
import { createStickGeometries } from '../mahjong-3d.js';

function random(seed) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

test('white tenbou preserves the reference 65:7:3 proportion and has one recessed circular pip', () => {
  const geometries = createStickGeometries();
  geometries.stickBody.computeBoundingBox();
  const size = geometries.stickBody.boundingBox.getSize(new Vector3());
  assert.ok(Math.abs(size.x / size.y - 65 / 7) < .00001);
  assert.ok(Math.abs(size.z / size.y - 3 / 7) < .00001);
  assert.equal(geometries.stickDot.type, 'CylinderGeometry');
  geometries.stickDot.computeBoundingBox();
  assert.ok(geometries.stickDot.boundingBox.max.z < STICK.thickness / 2);
  Object.values(geometries).forEach((geometry) => geometry.dispose());
});

test('tilted drops hit both ends, rebound, stay above the support and come to rest', () => {
  for (let seed = 1; seed <= 32; seed++) {
    const drop = createStickDrop(random(seed * 87483));
    assert.deepEqual(drop.at(0), REST_STICK);
    const raised = drop.at(360);
    assert.ok(raised.z > 120);
    assert.ok(Math.abs(raised.quaternion[0]) > .04 && Math.abs(raised.quaternion[1]) > .04);
    assert.ok(drop.impacts.some((impact) => impact.end === -1));
    assert.ok(drop.impacts.some((impact) => impact.end === 1));
    const firstImpact = 360 + drop.impacts[0].time * 1000;
    let lowest = Infinity, rebound = 0;
    for (let time = firstImpact; time < drop.duration; time += 4) {
      const height = drop.at(time).z;
      lowest = Math.min(lowest, height); rebound = Math.max(rebound, height - lowest);
    }
    assert.ok(rebound > 1, 'No rebound after the second end strikes');
    for (let time = 0; time <= drop.duration; time += 4) assert.ok(stickClearance(drop.at(time)) >= -.01, 'Stick penetrated support');
    assert.ok(drop.duration < 2500);
    assert.equal(drop.settled.z, STICK.thickness / 2);
    assert.deepEqual(drop.at(drop.duration + 1000), drop.settled);
  }
});

test('repeated pickup connects to the previous resting pose; sampling order is immaterial', () => {
  const first = createStickDrop(random(2)), second = createStickDrop(random(42), first.settled);
  assert.deepEqual(second.at(0), first.settled);
  const saved = second.at(600);
  second.at(1500); second.at(-8); second.at(350);
  assert.deepEqual(second.at(600), saved);
  assert.notDeepEqual(first.at(360), second.at(360));
});
