import test from 'node:test';
import assert from 'node:assert/strict';
import { tableLayout, SEAM_WIDTH } from '../table-surface.js';

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
    assert.ok(table.left <= -670 - SEAM_WIDTH);
    assert.ok(table.left + table.width >= 1997 + SEAM_WIDTH);
    assert.ok(table.height >= 2786 + SEAM_WIDTH);
  }
  assert.equal(SEAM_WIDTH / 2, 1.5);
});
