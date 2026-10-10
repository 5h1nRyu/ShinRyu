import test from 'node:test';
import assert from 'node:assert/strict';
import { tableLayout, referencePoint, TABLE_REFERENCE, TABLE_SEAMS, SEAM_WIDTH } from '../table-surface.js';
import { CONTROL, controlPoint } from '../physical-layout.js';

test('all eight openings and the center cover keep the supplied photograph proportions', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  assert.deepEqual(referencePoint(158, 262), controlPoint(7, 249));
  assert.deepEqual(referencePoint(209, 262), controlPoint(689, 249));
  near(referencePoint(209, 211).y, CONTROL.bottom - CONTROL.width);
  assert.equal(TABLE_SEAMS.openings.length, 8);
  for (const [index, opening] of TABLE_SEAMS.openings.entries()) {
    const photo = TABLE_REFERENCE.openings[index];
    near(opening.width / CONTROL.width, photo.width / 51);
    near(opening.height / CONTROL.width, photo.height / 51);
    near((opening.x - 960) / CONTROL.width, (photo.x - 183.5) / 51);
    near((opening.y - CONTROL.bottom) / CONTROL.width, (photo.y - 262) / 51);
  }
  const bottom = TABLE_SEAMS.openings.find(({ id }) => id === 'lift-bottom');
  near(bottom.width / CONTROL.width, 137 / 51);
  const xs = TABLE_SEAMS.cover.map(p => p.x), ys = TABLE_SEAMS.cover.map(p => p.y);
  near((Math.max(...xs) - Math.min(...xs)) / CONTROL.width, 98 / 51);
  near((Math.max(...ys) - Math.min(...ys)) / CONTROL.width, 96 / 51);
  assert.equal(TABLE_SEAMS.cover.length, 8);
  assert.equal(TABLE_SEAMS.dividers.length, 4);
});

test('the extended table preserves the existing composition on portrait, landscape and ultrawide screens', () => {
  for (const [width, height] of [[1920, 1080], [2560, 1080], [768, 1024], [390, 844], [390, 1200], [3840, 2160]]) {
    const table = tableLayout(width, height), oldScale = Math.min(width / 1920, height / 1080);
    assert.equal(table.scale, oldScale);
    assert.equal(table.sceneLeft, (width - 1920 * oldScale) / 2);
    assert.equal(table.sceneTop, (height - 1080 * oldScale) / 2);
    assert.ok(table.sceneLeft + table.left * table.scale <= 0);
    assert.ok(table.sceneLeft + (table.left + table.width) * table.scale >= width);
    assert.ok(table.sceneTop + table.height * table.scale >= height);
    // Door ends beyond the original surface remain part of the drawing area.
    for (const opening of TABLE_SEAMS.openings.filter(({ y, height }) => y + height >= 0)) {
      assert.ok(table.left <= opening.x - SEAM_WIDTH);
      assert.ok(table.left + table.width >= opening.x + opening.width + SEAM_WIDTH);
      assert.ok(table.height >= opening.y + opening.height + SEAM_WIDTH);
    }
  }
  assert.equal(SEAM_WIDTH / 2, 1.5);
});
