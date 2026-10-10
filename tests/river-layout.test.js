import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, center } from '../geometry.js';
import { CONTROL } from '../physical-layout.js';
import { sideRiverCenters } from '../river-layout.js';
import { VIEW } from '../mahjong-3d.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} != ${b}`);

test('side rivers preserve physical spacing and turn around the full control box', () => {
  const left = sideRiverCenters('kamicha'), right = sideRiverCenters('shimocha');
  const controlY = CONTROL.bottom - CONTROL.width / 2;
  assert.equal(left.length, 18); assert.equal(right.length, 18);
  for (let i = 0; i < 18; i++) {
    near(left[i].x + right[i].x, 1920);
    near(left[i].y + right[i].y, 2 * controlY);
    near(left[i].rotation, Math.PI / 2); near(right[i].rotation, -Math.PI / 2);
    const original = center(i);
    near(Math.hypot(left[i].x - 960, left[i].y - controlY), Math.hypot(original.x - 960, original.y - controlY));
  }
  near(left[1].y - left[0].y - SPEC.tileWidth, 4);
  near(left[0].x - left[6].x - SPEC.tileHeight, 4);
  near(CONTROL.left + 7 * CONTROL.scale - left[0].x - SPEC.tileHeight / 2, center(0).y - SPEC.tileHeight / 2 - CONTROL.bottom);
  assert.throws(() => sideRiverCenters('opposite'), RangeError);
});

test('the expanded 3D canvas includes the cropped side rivers and their shadow margins', () => {
  for (const tile of [...sideRiverCenters('kamicha'), ...sideRiverCenters('shimocha')]) {
    assert.ok(tile.x - SPEC.tileHeight / 2 > VIEW.left);
    assert.ok(tile.x + SPEC.tileHeight / 2 + 30 < VIEW.left + VIEW.width);
  }
  const visible = sideRiverCenters('kamicha').filter(tile => tile.y + SPEC.tileWidth / 2 > 0);
  assert.equal(visible.length, 9);
  assert.ok(visible.some(tile => tile.x - SPEC.tileHeight / 2 < 0));
});
