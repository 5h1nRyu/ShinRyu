import * as THREE from './vendor/three.module.js';
import { SPEC } from './geometry.js';
import { mm } from './physical-layout.js';
import { STICK, REST_STICK } from './score-stick.js?v=20261010-riichi';

// Includes every lifted/rotated silhouette and the light's maximum projected shadow.
export const VIEW = Object.freeze({ left: 420, top: 0, width: 1116, height: 1040 });

// X/Y are table coordinates; Z is physical height. The camera never tilts.
export function tileTransform(pose) {
  const halfHeight = pose.q * (SPEC.thickness * Math.abs(Math.cos(pose.theta)) + SPEC.tileWidth * Math.sin(pose.theta)) / 2;
  return { rotationY: pose.theta, scale: pose.q, z: halfHeight + SPEC.liftHeight * pose.height };
}

export const TILE_LAYERS = Object.freeze({
  back: Object.freeze({ depth: SPEC.thickness * 32 / 132, offset: SPEC.thickness / 2 - SPEC.thickness * 32 / 132 }),
  core: Object.freeze({ depth: SPEC.thickness * 92 / 132, offset: -SPEC.thickness / 2 + SPEC.thickness * 8 / 132 }),
  front: Object.freeze({ depth: SPEC.thickness * 8 / 132, offset: -SPEC.thickness / 2 }),
});

export function createTileGeometries() {
  const shape = new THREE.Shape();
  const w = SPEC.tileWidth, h = SPEC.tileHeight, x = -w / 2, y = -h / 2, r = mm(1);
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = (depth, flipU = false) => new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 6, steps: 1,
    UVGenerator: {
      generateTopUV(_geometry, vertices, a, b, c) {
        return [a, b, c].map((i) => new THREE.Vector2(
          (flipU ? w / 2 - vertices[i * 3] : vertices[i * 3] + w / 2) / w,
          (vertices[i * 3 + 1] + h / 2) / h,
        ));
      },
      generateSideWallUV() { return [new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)]; },
    },
  });
  // The front cap is corrected in UV space so text is upright after a Y-axis flip.
  return { back: geometry(TILE_LAYERS.back.depth), core: geometry(TILE_LAYERS.core.depth), front: geometry(TILE_LAYERS.front.depth, true) };
}

export function createStickGeometries() {
  const bevel = mm(.25), x = -STICK.length / 2 + bevel, y = -STICK.width / 2 + bevel;
  const w = STICK.length - bevel * 2, h = STICK.width - bevel * 2, r = mm(.8);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const pipRadius = mm(6.5 / 7);
  const pip = new THREE.Path(); pip.absarc(0, 0, pipRadius, 0, Math.PI * 2, true); shape.holes.push(pip);
  const depth = STICK.thickness - 2 * bevel;
  const body = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 12, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
  body.translate(0, 0, -depth / 2);
  // The single red pip sits inside the molded recess, on both broad faces.
  const dot = new THREE.CylinderGeometry(pipRadius, pipRadius, depth, 32); dot.rotateX(Math.PI / 2);
  return { stickBody: body, stickDot: dot };
}

const QUAD_VERTEX = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ACCUMULATE_FRAGMENT = `
  uniform sampler2D source;
  uniform float weight;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(source, vUv) * weight; }
`;

const COMPOSE_FRAGMENT = `
  uniform sampler2D tiles;
  uniform sampler2D shadows;
  varying vec2 vUv;
  void main() {
    // Render targets contain premultiplied linear RGBA, including MSAA edge coverage.
    vec4 tile = texture2D(tiles, vUv);
    vec4 shadow = texture2D(shadows, vUv);
    vec4 result = tile + shadow * (1.0 - tile.a);
    gl_FragColor = vec4(result.rgb / max(result.a, 0.00001), result.a);
    #include <colorspace_fragment>
  }
`;

export class Mahjong3D {
  constructor(canvas, tiles) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.world = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-VIEW.width / 2, VIEW.width / 2, VIEW.height / 2, -VIEW.height / 2, 1, 4000);
    this.camera.position.set(VIEW.left + VIEW.width / 2, -VIEW.top - VIEW.height / 2, 2000);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);
    this.camera.updateMatrixWorld();

    // Cancel the toon shader's Lambert 1/PI factor, retaining the source palette.
    this.light = new THREE.DirectionalLight(0xffffff, Math.PI);
    this.light.target.position.set(960, -540, 0);
    this.light.position.set(720, -460, 1320);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(4096, 4096);
    Object.assign(this.light.shadow.camera, { left: -640, right: 640, top: 640, bottom: -640, near: 1, far: 2500 });
    this.light.shadow.bias = -0.00005;
    this.world.add(this.light, this.light.target);

    // One white toon band keeps original face/side colors independent of normal angle.
    // The light still supplies real depth-map shadows on the table.
    this.gradient = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.generateMipmaps = false; this.gradient.needsUpdate = true;
    const toon = (options) => new THREE.MeshToonMaterial({ gradientMap: this.gradient, toneMapped: false, ...options });
    const blue = toon({ color: '#2457B8' }), core = toon({ color: '#CFCABB' }), white = toon({ color: '#F4F0E6' });
    this.geometries = { ...createTileGeometries(), ...createStickGeometries() };
    this.materials = new Set([blue, core, white]);
    this.textures = new Map();
    const texture = (source) => {
      if (!this.textures.has(source)) {
        const map = new THREE.CanvasTexture(source); map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        this.textures.set(source, map);
      }
      return this.textures.get(source);
    };
    this.groups = tiles.map((tile) => {
      const group = new THREE.Group(); group.name = `tile-${tile.index}`;
      const backCap = toon({ map: texture(tile.back) }), frontCap = toon({ map: texture(tile.fragment) });
      this.materials.add(backCap); this.materials.add(frontCap);
      for (const [geometry, offset, cap, side] of [
        [this.geometries.back, TILE_LAYERS.back.offset, backCap, blue],
        [this.geometries.core, TILE_LAYERS.core.offset, core, core],
        [this.geometries.front, TILE_LAYERS.front.offset, frontCap, white],
      ]) {
        const mesh = new THREE.Mesh(geometry, [cap, side]);
        mesh.position.z = offset; mesh.castShadow = true; mesh.receiveShadow = false;
        group.add(mesh);
      }
      group.position.set(tile.x, -tile.y, SPEC.thickness / 2);
      this.world.add(group); return group;
    });

    this.stick = new THREE.Group(); this.stick.name = 'white-tenbou-1000';
    const red = toon({ color: '#BB4337' }); this.materials.add(red);
    const body = new THREE.Mesh(this.geometries.stickBody, [white, core]); body.castShadow = true;
    this.stickDot = new THREE.Mesh(this.geometries.stickDot, red); this.stickDot.castShadow = true;
    // Cover the recessed pip with ivory while the hint replaces its red marking.
    this.geometries.stickHintCover = new THREE.CircleGeometry(mm(6.5 / 7) + .1, 32);
    this.stickHintCover = new THREE.Mesh(this.geometries.stickHintCover, white);
    this.stickHintCover.position.z = STICK.thickness / 2 + .02;
    this.stickHintCover.visible = false;
    this.stickHintCanvas = document.createElement('canvas');
    this.stickHintCanvas.width = 1024;
    this.stickHintCanvas.height = Math.round(1024 * STICK.width / STICK.length);
    this.stickHintTexture = texture(this.stickHintCanvas);
    this.stickHintTexture.minFilter = THREE.LinearFilter;
    this.stickHintTexture.generateMipmaps = false;
    const hintMaterial = new THREE.MeshBasicMaterial({ map: this.stickHintTexture, transparent: true, depthWrite: false, toneMapped: false });
    this.materials.add(hintMaterial);
    this.geometries.stickHint = new THREE.PlaneGeometry(STICK.length, STICK.width);
    this.stickHint = new THREE.Mesh(this.geometries.stickHint, hintMaterial);
    this.stickHint.position.z = STICK.thickness / 2 + .04;
    this.stickHint.visible = false;
    this.stickHintText = '';
    this.stick.add(body, this.stickDot, this.stickHintCover, this.stickHint); this.world.add(this.stick);
    this.applyStickPose(REST_STICK);

    // Only the actual light's shadow is drawn onto the unchanged 2D table canvas.
    this.receiver = new THREE.Mesh(new THREE.PlaneGeometry(1920, 1080), new THREE.ShadowMaterial({ color: '#05251B', opacity: 1, toneMapped: false }));
    this.receiver.position.set(960, -540, 0); this.receiver.receiveShadow = true;
    this.world.add(this.receiver);

    this.samples = Math.min(2, this.renderer.getContext().getParameter(this.renderer.getContext().MAX_SAMPLES));
    const type = this.renderer.getContext().getExtension('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const target = (depth, antialias, type = THREE.UnsignedByteType) => {
      const result = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: depth, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type });
      result.texture.colorSpace = THREE.LinearSRGBColorSpace;
      result.samples = antialias ? this.samples : 0;
      return result;
    };
    this.currentTarget = target(true, true, type);
    this.sampleTarget = target(true, true, type);
    this.shadowTarget = target(true, false, type);
    this.averageTarget = target(false, false, type);
    this.targets = [this.currentTarget, this.sampleTarget, this.shadowTarget, this.averageTarget];
    this.accumulateMaterial = new THREE.ShaderMaterial({
      uniforms: { source: { value: null }, weight: { value: 1 } },
      vertexShader: QUAD_VERTEX, fragmentShader: ACCUMULATE_FRAGMENT,
      depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.composeMaterial = new THREE.ShaderMaterial({
      uniforms: { tiles: { value: null }, shadows: { value: this.shadowTarget.texture } },
      vertexShader: QUAD_VERTEX, fragmentShader: COMPOSE_FRAGMENT,
      depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad);
    this.quadCamera = new THREE.Camera();
    this.bounds = new THREE.Box3();
  }

  resize(pixelScale) {
    const width = Math.round(VIEW.width * pixelScale), height = Math.round(VIEW.height * pixelScale);
    this.renderer.setSize(width, height, false);
    for (const target of this.targets) target.setSize(width, height);
    const resolution = Math.min(this.renderer.capabilities.maxTextureSize, 2 ** Math.ceil(Math.log2(1280 * pixelScale)));
    if (this.light.shadow.mapSize.x !== resolution) {
      this.light.shadow.mapSize.set(resolution, resolution);
      this.light.shadow.map?.dispose(); this.light.shadow.map = null;
    }
  }

  updateTileFront(index) {
    this.groups[index].children[2].material[0].map.needsUpdate = true;
  }

  setStickHint(text) {
    if (text === this.stickHintText) return;
    this.stickHintText = text;
    this.stickDot.visible = !text;
    this.stickHintCover.visible = this.stickHint.visible = Boolean(text);
    if (!text) return;
    const canvas = this.stickHintCanvas, context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `600 ${24 * canvas.width / STICK.length}px "Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.fillStyle = '#000000'; context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    const metrics = context.measureText(text);
    // Center the visible ink, including glyph overhangs and ascenders/descenders.
    const x = (canvas.width + metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
    const y = (canvas.height + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    context.fillText(text, x, y);
    // Font rasterization can shift the ink by a pixel; center its actual footprint.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
    for (let row = 0; row < canvas.height; row++) for (let column = 0; column < canvas.width; column++) {
      if (pixels[(row * canvas.width + column) * 4 + 3] <= 128) continue;
      left = Math.min(left, column); right = Math.max(right, column);
      top = Math.min(top, row); bottom = Math.max(bottom, row);
    }
    if (right >= left) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillText(text, x + (canvas.width - left - right - 1) / 2, y + (canvas.height - top - bottom - 1) / 2);
    }
    this.stickHintTexture.needsUpdate = true;
  }

  applyStickPose(pose) {
    this.stick.position.set(pose.x, pose.y, pose.z);
    this.stick.quaternion.fromArray(pose.quaternion);
  }

  applyPoses(poses, stickPose = REST_STICK) {
    poses.forEach((pose, index) => {
      const transform = tileTransform(pose), group = this.groups[index];
      group.rotation.y = transform.rotationY;
      group.scale.setScalar(transform.scale);
      group.position.z = transform.z;
    });
    this.applyStickPose(stickPose);
    this.world.updateMatrixWorld(true);
  }

  clearTarget(target) {
    this.renderer.setRenderTarget(target);
    this.renderer.clear(true, true, false);
  }

  renderTileTarget(target) {
    this.clearTarget(target); this.renderer.render(this.world, this.camera);
  }

  addSample(texture, weight) {
    this.renderer.setRenderTarget(this.averageTarget);
    this.accumulateMaterial.uniforms.source.value = texture;
    this.accumulateMaterial.uniforms.weight.value = weight;
    this.quad.material = this.accumulateMaterial;
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(currentPoses, sampledPoses, amount, stickPose = REST_STICK, stickSamples = []) {
    this.applyPoses(currentPoses, stickPose);
    this.receiver.visible = true;
    // Casters contribute depth and real shadows, but no color in this pass.
    for (const material of this.materials) material.colorWrite = false;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderTileTarget(this.shadowTarget);
    this.renderer.shadowMap.autoUpdate = false;
    for (const material of this.materials) material.colorWrite = true;
    this.receiver.visible = false;
    this.renderTileTarget(this.currentTarget);

    let output = this.currentTarget.texture;
    if (amount > .002 && sampledPoses.length) {
      this.clearTarget(this.averageTarget);
      this.addSample(this.currentTarget.texture, 1 - amount);
      for (const [index, poses] of sampledPoses.entries()) {
        this.applyPoses(poses, stickSamples[index] ?? stickPose);
        this.renderTileTarget(this.sampleTarget);
        this.addSample(this.sampleTarget.texture, amount / sampledPoses.length);
      }
      output = this.averageTarget.texture;
      this.applyPoses(currentPoses, stickPose);
    }
    this.composeMaterial.uniforms.tiles.value = output;
    this.quad.material = this.composeMaterial;
    this.clearTarget(null); this.renderer.render(this.quadScene, this.quadCamera);
  }

  getTileBounds(index) {
    this.bounds.setFromObject(this.groups[index]);
    return { x: this.bounds.min.x, y: -this.bounds.max.y, width: this.bounds.max.x - this.bounds.min.x, height: this.bounds.max.y - this.bounds.min.y };
  }

  getStickBounds() {
    this.bounds.setFromObject(this.stick);
    return { x: this.bounds.min.x, y: -this.bounds.max.y, width: this.bounds.max.x - this.bounds.min.x, height: this.bounds.max.y - this.bounds.min.y };
  }

  dispose() {
    this.targets.forEach((target) => target.dispose());
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    Object.values(this.geometries).forEach((geometry) => geometry.dispose());
    this.gradient.dispose(); this.receiver.geometry.dispose(); this.receiver.material.dispose();
    this.quad.geometry.dispose(); this.accumulateMaterial.dispose(); this.composeMaterial.dispose();
    this.renderer.dispose();
  }
}
