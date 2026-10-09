import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createTileGeometries, tileTransform, VIEW, TILE_LAYERS } from '../mahjong-3d.js';
import { SPEC, center, flipPose, projection } from '../geometry.js';

const near = (actual, expected, tolerance = .0001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('the real solid has 28/80.5/7 layers, a 147x196 footprint and 115.5 total thickness', () => {
  const geometries = createTileGeometries();
  for (const [name, depth] of [['back', 28], ['core', 80.5], ['front', 7]]) {
    const geometry = geometries[name]; geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    near(size.x, 147); near(size.y, 196); near(size.z, depth);
    assert.ok(geometry.getAttribute('position').count > 100);
    geometry.dispose();
  }
});

test('physical rotation preserves the projected keyframes and clears the table in both directions', () => {
  const geometries = createTileGeometries();
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  for (const [name, { offset }] of Object.entries(TILE_LAYERS)) {
    const mesh = new THREE.Mesh(geometries[name], material); mesh.position.z = offset; group.add(mesh);
  }
  for (const fromFront of [false, true]) for (const time of [-1, 0, 60, 120, 210, 300, 390, 480, 540, 600]) {
    const pose = flipPose(time, 1, fromFront), transform = tileTransform(pose);
    group.rotation.y = transform.rotationY; group.scale.setScalar(transform.scale); group.position.z = transform.z;
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3()), expected = projection(pose.theta, pose.q);
    near(size.x, expected.width); near(size.y, expected.height);
    assert.ok(bounds.min.z > -.0001, 'The solid penetrated the table');
    assert.ok(center(0).x + bounds.min.x >= VIEW.left, 'The left tile silhouette was cropped');
    assert.ok(center(0).y - bounds.max.y >= VIEW.top, 'The upper silhouette was cropped');
    assert.ok(center(17).x + bounds.max.x + bounds.max.z * 240 / 1320 <= VIEW.left + VIEW.width, 'The real shadow exceeded the right render border');
    assert.ok(center(17).y - bounds.min.y + bounds.max.z * 80 / 1320 <= VIEW.top + VIEW.height, 'The real shadow exceeded the bottom render border');
    if (time === 300) { near(size.x, 120.12); near(size.y, 203.84); }
  }
  Object.values(geometries).forEach((geometry) => geometry.dispose()); material.dispose();
});

test('front cap UVs produce upright, unmirrored text after rotating 180 degrees', () => {
  const geometries = createTileGeometries(), geometry = geometries.front;
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  let count = 0;
  for (let i = 0; i < position.count; i++) {
    if (normal.getZ(i) > -.99) continue;
    const worldXAfterFlip = -position.getX(i);
    near(uv.getX(i), (worldXAfterFlip + SPEC.tileWidth / 2) / SPEC.tileWidth);
    near(uv.getY(i), (position.getY(i) + SPEC.tileHeight / 2) / SPEC.tileHeight);
    count++;
  }
  assert.ok(count > 3);
  Object.values(geometries).forEach((geometry) => geometry.dispose());
});

test('the overhead orthographic camera keeps XY fixed when a tile is physically raised', () => {
  const camera = new THREE.OrthographicCamera(-960, 960, 540, -540, 1, 4000);
  camera.position.set(960, -540, 2000); camera.lookAt(960, -540, 0); camera.updateMatrixWorld();
  const rest = new THREE.Vector3(540, -432, 132).project(camera);
  const lifted = new THREE.Vector3(540, -432, 500).project(camera);
  near(rest.x, lifted.x); near(rest.y, lifted.y);
});

test('a wave connects continuously to the physical height of an already hovered tile', () => {
  for (const fromFront of [false, true]) {
    const initial = flipPose(0, 1.04, fromFront, 1), waiting = flipPose(-30, 1.04, fromFront, 1);
    near(initial.q, 1.04); near(initial.height, 1); near(waiting.height, 1);
    near(tileTransform(initial).z, tileTransform(waiting).z);
    near(flipPose(600, 1.04, fromFront, 1).height, 0);
  }
});
