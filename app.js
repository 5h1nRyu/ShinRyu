import { smooth, center, entryScale, flipPose, motionDistance } from './geometry.js?v=20261011-start-button';
import { Mahjong3D, VIEW } from './mahjong-3d.js?v=20261011-start-button';
import { REST_STICK, STICK_PICKUP_DURATION, createStickDrop, stickMotionDistance } from './score-stick.js?v=20261011-start-button';
import { flipAt, settleFlips, revealTiles, resetTiles, topLeftTile, yellowAction } from './tile-interactions.js?v=20261011-start-button';
import { RIICHI_FACES, nextRiichiFace, sideRiverFaces } from './riichi-faces.js?v=20261011-start-button';
import { sideRiverCenters } from './river-layout.js?v=20261011-start-button';
import { drawTableSeams, tableLayout } from './table-surface.js?v=20261011-start-button';
import { CONTROL } from './physical-layout.js';

const $ = (id) => document.getElementById(id);
const scene = $('scene'), board = $('board'), canvas = $('table');
scene.style.setProperty('--console-scale', String(CONTROL.scale));
scene.style.setProperty('--console-left', `${CONTROL.left}px`);
const ctx = canvas.getContext('2d', { alpha: false });
const FONT = '"Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const COLORS = { table: '#0B503D', back: '#2457B8', front: '#F4F0E6' };
const UNIT_IDS = ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'A', 'A', 'C', 'C', 'D', 'E', 'E', 'F', 'F', 'G', 'G'];
const UNIT_NAMES = { A: '主图：观察与秩序', B: '简介：牌河视觉档案', C: '项目：网格实验', D: '关于：整理与创作', E: '文字：近处的秩序', F: '图片：图像研究', G: '联系：一起做点什么' };
let phase = 'loading', epoch = 0, loadingEpoch = 0, resetCycle = null;
const LOADING_FADE_DURATION = 200, SCENERY_FADE_DURATION = 200;
let hovered = null, pressed = null;
let raf = 0, pixelScale = 1, orderCounter = 0;
let mahjong, consoleImage;
const riichiImages = new Map();
const CONTROL_HINTS = { dealer: 'github', streak: 'bilibili', reset: '重置', 'blue-light': '探索' };
let hoveredControl = null, focusedControl = null;
let stickDrop = null, stickEpoch = 0, restingStick = REST_STICK;
const mainTiles = Array.from({ length: 18 }, (_, index) => ({
  index, riverIndex: index, side: 'main', rotation: 0, ...center(index), unit: UNIT_IDS[index], fragment: null, tween: null, front: false, flips: [], order: index,
}));
const sideTiles = [...sideRiverCenters('kamicha'), ...sideRiverCenters('shimocha')].map((position, index) => ({
  ...position, index: 18 + index, riverIndex: position.index, fragment: null, tween: null, front: false, flips: [], order: 18 + index,
}));
const tiles = [...mainTiles, ...sideTiles];
let tabletop;

function roundRect(context, x, y, width, height, radius, fill, stroke) {
  if (width <= 0 || height <= 0) return;
  context.beginPath(); context.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  if (fill) { context.fillStyle = fill; context.fill(); }
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
}

function makeTexture(width, height) {
  const element = document.createElement('canvas');
  // Two pixels per design pixel keep cropped text clear at 4K.
  element.width = width * 2; element.height = height * 2;
  const context = element.getContext('2d'); context.scale(2, 2);
  return { element, context };
}

function label(context, text, x, y, size = 16, color = '#748576') {
  context.font = `${size}px ${FONT}`; context.fillStyle = color; context.textBaseline = 'alphabetic';
  context.fillText(text, x, y);
}

function textCard(context, x, caption, title, subtitle = '', line = true) {
  label(context, caption, x + 14, 34);
  const titleLines = Array.isArray(title) ? title : [title];
  titleLines.forEach((text, index) => label(context, text, x + 14, 92 + index * 32, 24, '#254638'));
  if (subtitle) label(context, subtitle, x + 14, 125, 18, '#254638');
  if (line) { context.fillStyle = '#c5cebc'; context.fillRect(x + 14, 176, 136, 1); }
}

async function loadImage(url) {
  const img = new Image(); img.src = url; await img.decode(); return img;
}

async function buildTextures() {
  const [art] = await Promise.all([
    loadImage('./assets/artwork.svg'),
    Promise.all(RIICHI_FACES.map(async (face) => riichiImages.set(face.code, await loadImage(face.image)))),
  ]);
  const units = {};
  for (const [id, width, height] of [['A', 500, 452], ['B', 500, 224], ['C', 332, 224], ['D', 164, 224], ['E', 332, 224], ['F', 332, 224], ['G', 332, 224]]) {
    units[id] = makeTexture(width, height);
    units[id].context.fillStyle = COLORS.front;
    units[id].context.fillRect(0, 0, width, height);
  }
  units.A.context.drawImage(art, 0, 0, 500, 452);
  textCard(units.B.context, 0, '牌河', '视觉档案', '', false);
  textCard(units.B.context, 168, '18 张牌', '7 个单元', '', false);
  textCard(units.B.context, 336, '01 / 简介', '观察与秩序', '', false);
  textCard(units.C.context, 0, '02 / 项目', '网格实验');
  textCard(units.C.context, 168, '2026', '设计与交互');
  textCard(units.D.context, 0, '03 / 关于', '整理与创作');
  textCard(units.E.context, 0, '04 / 文字', '近处的秩序');
  textCard(units.E.context, 168, '随笔', '阅读片段');
  textCard(units.F.context, 0, '05 / 图片', '图像占位');
  textCard(units.F.context, 168, '图像', '图像研究');
  textCard(units.G.context, 0, '06 / 联系', ['一起做', '点什么']);
  textCard(units.G.context, 168, '联系', '保持联系');
  const origins = {
    A: [0, 0], B: [0, 3], C: [1, 3], D: [1, 5], E: [2, 0], F: [2, 2], G: [2, 4],
  };
  for (const tile of mainTiles) {
    const [row, col] = origins[tile.unit];
    const cropX = (tile.index % 6 - col) * 168, cropY = (Math.floor(tile.index / 6) - row) * 228;
    const texture = makeTexture(164, 224);
    texture.context.drawImage(units[tile.unit].element, cropX * 2, cropY * 2, 328, 448, 0, 0, 164, 224);
    roundRect(texture.context, 1, 1, 162, 222, 7, null, '#fbf7ed');
    tile.fragment = texture.element;
    tile.crop = { x: cropX, y: cropY, width: 164, height: 224 };
  }
  const back = makeTexture(164, 224);
  roundRect(back.context, 0, 0, 164, 224, 8, COLORS.back);
  // A shallow, entirely face-internal bevel; no static side strip or tile shadow.
  roundRect(back.context, 1, 1, 162, 222, 7, null, '#7694cc');
  roundRect(back.context, 8, 8, 148, 208, 4, null, '#416fc1');
  back.context.strokeStyle = '#3767bf'; back.context.lineWidth = .7;
  for (let y = 16; y < 211; y += 8) {
    back.context.beginPath(); back.context.moveTo(15, y); back.context.lineTo(149, y); back.context.stroke();
  }
  for (const tile of tiles) tile.back = back.element;
  changeRiichiFace();
  const faces = sideRiverFaces(), fragments = new Map();
  sideTiles.forEach((tile, index) => {
    const face = faces[index];
    if (!fragments.has(face.code)) {
      const texture = makeTexture(164, 224);
      paintRiichiFace(texture.element, face); fragments.set(face.code, texture.element);
    }
    Object.assign(tile, { face, riichiFace: face, fragment: fragments.get(face.code) });
    tile.button.dataset.riichiFace = face.code; updateTileLabel(tile);
  });
}

function changeRiichiFace() {
  const tile = tiles[17];
  tile.riichiFace = nextRiichiFace(tile.riichiFace?.code);
  paintRiichiFace(tile.fragment, tile.riichiFace);
  mahjong?.updateTileFront(17);
  tile.button.dataset.riichiFace = tile.riichiFace.code;
  updateTileLabel(tile);
}

function paintRiichiFace(canvas, face) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 164, 224);
  roundRect(context, 0, 0, 164, 224, 8, COLORS.front);
  // Give each edge a 10% ivory gutter. The 164x224 texture is UV-mapped onto
  // the 147x196 cap, preserving the artwork's 3:4 ratio on the physical tile.
  const image = riichiImages.get(face.code);
  const inset = .1;
  context.drawImage(image, 164 * inset, 224 * inset, 164 * (1 - inset * 2), 224 * (1 - inset * 2));
  roundRect(context, 1, 1, 162, 222, 7, null, '#fbf7ed');
}

function drawConsole() {
  const context = ctx;
  context.fillStyle = COLORS.table; context.fillRect(tabletop.left, 0, tabletop.width, tabletop.height);
  if (!consoleImage) return;
  drawTableSeams(context);
  // The asset's viewBox is the exact visible reference crop; no upper half of
  // the housing exists outside it. Native buttons use the same coordinates.
  context.drawImage(consoleImage, CONTROL.left, CONTROL.top,
    CONTROL.referenceWidth * CONTROL.scale, CONTROL.visibleHeight);
}

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  tabletop = tableLayout(width, height);
  const { scale, sceneLeft, sceneTop } = tabletop;
  scene.style.left = `${sceneLeft}px`;
  scene.style.top = `${sceneTop}px`;
  scene.style.transform = `scale(${scale})`;
  pixelScale = Math.min(2, Math.max(.5, scale * (window.devicePixelRatio || 1)));
  Object.assign(canvas.style, { left: `${tabletop.left}px`, top: '0px', width: `${tabletop.width}px`, height: `${tabletop.height}px` });
  canvas.width = Math.ceil(tabletop.width * pixelScale);
  canvas.height = Math.ceil(tabletop.height * pixelScale);
  ctx.setTransform(pixelScale, 0, 0, pixelScale, -tabletop.left * pixelScale, 0);
  drawConsole();
  mahjong?.resize(pixelScale); requestRender();
}

function poseAt(tile, time) {
  const flip = flipAt(tile, time);
  if (flip) return flipPose(time - flip.start, flip.from, flip.fromFront, flip.fromHeight);
  const theta = tile.front ? Math.PI : 0;
  if (tile.tween) {
    const tween = tile.tween;
    const q = tween.from + (tween.to - tween.from) * smooth((time - tween.start) / tween.duration);
    return { theta, q, height: Math.max(0, (q - 1) / .04) };
  }
  const q = phase === 'entry' ? entryScale(tile.riverIndex, time - epoch) : 1;
  return { theta, q, height: phase === 'entry' ? (q - 1) / .06 : 0 };
}

function tweenTo(tile, target, duration) {
  if (!interactive() || tile.flips.length) return;
  const time = performance.now();
  const from = poseAt(tile, time).q;
  tile.tween = { from, to: target, duration, start: time };
  tile.order = ++orderCounter;
  requestRender();
}

function sortedTiles(time) {
  return [...tiles].sort((a, b) => {
    const pa = poseAt(a, time), pb = poseAt(b, time);
    const fa = flipAt(a, time), fb = flipAt(b, time);
    const activeA = (fa && time >= fa.start) || Math.abs(pa.q - 1) > .00001;
    const activeB = (fb && time >= fb.start) || Math.abs(pb.q - 1) > .00001;
    return Number(activeA) - Number(activeB) || pa.height - pb.height ||
      (fa?.start ?? a.order) - (fb?.start ?? b.order) || a.index - b.index;
  });
}

function blurParameters(time) {
  let amount = 0, shutter = 8.333;
  for (const tile of tiles) {
    const pose = poseAt(tile, time), previous = poseAt(tile, time - 1);
    const speed = motionDistance(pose, previous); // Maximum projected vertex speed in design px/ms.
    amount = Math.max(amount, Math.min(1, speed / .30));
    const flip = flipAt(tile, time);
    const turning = flip && time >= flip.start + 120 && time <= flip.start + 480;
    const limit = turning ? 12 : phase === 'entry' || (flip && time >= flip.start + 480) ? 2 : 1;
    if (speed > .00001) shutter = Math.min(shutter, limit / speed);
  }
  const stickSpeed = stickMotionDistance(stickPoseAt(time), stickPoseAt(time - 1));
  amount = Math.max(amount, Math.min(1, stickSpeed / .30));
  if (stickSpeed > .00001) shutter = Math.min(shutter, 2 / stickSpeed);
  return { amount, window: shutter };
}

function stickPoseAt(time) {
  return stickDrop ? stickDrop.at(time - stickEpoch) : restingStick;
}

function render(time) {
  raf = 0;
  if (phase === 'loading') return;
  if (phase === 'loading-fade') {
    $('loading-text').style.opacity = String(1 - smooth((time - loadingEpoch) / LOADING_FADE_DURATION));
    if (time - loadingEpoch < LOADING_FADE_DURATION) { requestRender(); return; }
    $('loading').hidden = true;
    scene.style.visibility = 'visible';
    epoch = time; phase = 'entry';
  }
  if (phase === 'entry' && time - epoch >= 1100) {
    phase = 'idle';
    scene.inert = false;
    $('score-stick').disabled = false;
    $('reset').disabled = false;
    $('status').textContent = '三处牌河已落定。点击黄色灯开始，或点击任意蓝背牌，以它为中心波纹翻开全部牌。';
  }
  if (stickDrop && time >= stickEpoch + stickDrop.duration) {
    restingStick = stickDrop.settled; stickDrop = null;
    $('score-stick').setAttribute('aria-busy', 'false');
    $('stick-status').textContent = '点棒已落定，可再次点击拿起。';
  }
  $('score-stick').dataset.motion = stickDrop ? time - stickEpoch < STICK_PICKUP_DURATION ? 'lifting' : 'falling' : 'idle';
  for (const tile of tiles) {
    if (settleFlips(tile, time)) {
      updateTileLabel(tile);
    }
    if (tile.tween && time >= tile.tween.start + tile.tween.duration && tile.tween.to === 1) tile.tween = null;
  }
  if (resetCycle && time >= resetCycle.end) {
    resetCycle = null; phase = 'idle'; $('reset').disabled = false;
    changeRiichiFace();
    $('status').textContent = '三处牌河已恢复蓝背。点击黄色灯开始，或点击任意蓝背牌再次展开。';
  }
  if (interactive() && tiles.every(tile => tile.front && !tile.flips.length)) $('status').textContent = '三处牌河全部翻开。点击黄色灯，从所有牌中左上方的一张开始波纹合牌。';
  board.setAttribute('aria-busy', String(phase === 'entry' || Boolean(resetCycle) || tiles.some((tile) => tile.flips.length)));
  const sceneryOpacity = smooth((time - epoch) / SCENERY_FADE_DURATION);
  canvas.style.opacity = String(sceneryOpacity);
  document.querySelector('.console').style.opacity = String(sceneryOpacity);
  const currentPoses = tiles.map((tile) => poseAt(tile, time));
  const blur = blurParameters(time);
  const sampledPoses = blur.amount > .002
    ? Array.from({ length: 7 }, (_, index) => tiles.map((tile) => poseAt(tile, time - blur.window * index / 6)))
    : [];
  const stickSamples = sampledPoses.map((_, index) => stickPoseAt(time - blur.window * index / 6));
  syncControlState();
  mahjong.render(currentPoses, sampledPoses, blur.amount, stickPoseAt(time), stickSamples, { opacity: sceneryOpacity });
  const stickBounds = mahjong.getStickBounds(), hitHeight = Math.max(44, stickBounds.height);
  Object.assign($('score-stick').style, {
    left: `${stickBounds.x}px`, top: `${stickBounds.y - (hitHeight - stickBounds.height) / 2}px`,
    width: `${stickBounds.width}px`, height: `${hitHeight}px`,
  });
  const sorted = sortedTiles(time);
  const visibleLeft = Math.max(VIEW.left, -tabletop.sceneLeft / tabletop.scale);
  const visibleTop = Math.max(VIEW.top, -tabletop.sceneTop / tabletop.scale);
  const visibleRight = Math.min(VIEW.left + VIEW.width, (innerWidth - tabletop.sceneLeft) / tabletop.scale);
  const visibleBottom = Math.min(VIEW.top + VIEW.height, (innerHeight - tabletop.sceneTop) / tabletop.scale);
  for (let order = 0; order < sorted.length; order++) {
    const tile = sorted[order], bounds = mahjong.getTileBounds(tile.index);
    const left = Math.max(bounds.x, visibleLeft), top = Math.max(bounds.y, visibleTop);
    const width = Math.max(0, Math.min(bounds.x + bounds.width, visibleRight) - left);
    const height = Math.max(0, Math.min(bounds.y + bounds.height, visibleBottom) - top);
    tile.button.hidden = width === 0 || height === 0;
    tile.button.tabIndex = tile.button.hidden ? -1 : 0;
    Object.assign(tile.button.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, zIndex: order + 1 });
  }
  const moving = stickDrop || phase === 'entry' || resetCycle || tiles.some((tile) => tile.flips.length || (tile.tween && time < tile.tween.start + tile.tween.duration));
  if (moving) requestRender();
}

function requestRender() { if (!raf) raf = requestAnimationFrame(render); }

function startReveal(tile) {
  if (!interactive()) return;
  const time = performance.now();
  for (const candidate of tiles) settleFlips(candidate, time);
  if (!revealTiles(tiles, tile.index, time, tiles.map(candidate => poseAt(candidate, time)))) return;
  for (const candidate of tiles) updateTileLabel(candidate);
  board.setAttribute('aria-busy', 'true');
  $('status').textContent = `正在以${tilePositionLabel(tile)}为中心波纹翻开三处牌河。`;
  syncControlState();
  requestRender();
}

function startReset() {
  if (!interactive()) return;
  const time = performance.now();
  for (const tile of tiles) settleFlips(tile, time);
  if (yellowAction(tiles) === 'start') { startReveal(topLeftTile(tiles)); return; }
  resetCycle = resetTiles(tiles, time, tiles.map((tile) => poseAt(tile, time)));
  hovered = null; pressed = null; phase = 'reset-conceal';
  for (const tile of tiles) updateTileLabel(tile);
  $('reset').disabled = true; board.setAttribute('aria-busy', 'true');
  $('status').textContent = '正在从三处牌河中左上方的一张开始波纹合牌。';
  syncControlState();
  requestRender();
}

function updateTileLabel(tile) {
  const label = tile.front ? tile.riichiFace?.label ?? UNIT_NAMES[tile.unit] : '揭示档案';
  tile.button.setAttribute('aria-label', `${label}，${tilePositionLabel(tile)}`);
  tile.button.setAttribute('aria-busy', String(Boolean(tile.flips.length)));
  tile.button.dataset.face = tile.front ? 'front' : 'back';
}

function tilePositionLabel(tile) {
  const river = { main: '下方牌河', kamicha: '上家牌河', shimocha: '下家牌河' }[tile.side];
  return `${river}第${Math.floor(tile.riverIndex / 6) + 1}行第${tile.riverIndex % 6 + 1}列`;
}

function interactive() { return phase === 'idle'; }

function createHitTargets() {
  for (const tile of tiles) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'tile-hit';
    button.dataset.index = tile.index;
    button.dataset.side = tile.side;
    button.addEventListener('pointerenter', (event) => {
      if (!interactive() || event.pointerType === 'touch') return;
      hovered = tile.index; tweenTo(tile, 1.04, 180);
    });
    button.addEventListener('pointerleave', () => {
      if (hovered === tile.index) hovered = null;
      if (pressed === tile.index) pressed = null;
      tweenTo(tile, 1, 200);
    });
    button.addEventListener('pointerdown', (event) => {
      if (!interactive() || tile.front || tile.flips.length || (event.button !== undefined && event.button !== 0)) return;
      pressed = tile.index; tweenTo(tile, 1.015, 70);
    });
    button.addEventListener('pointercancel', () => { pressed = null; tweenTo(tile, hovered === tile.index ? 1.04 : 1, 200); });
    button.addEventListener('click', () => {
      if (!interactive()) return;
      pressed = null;
      startReveal(tile);
    });
    button.addEventListener('keydown', (event) => {
      if (!interactive()) return;
      if (!tile.front && (event.key === 'Enter' || event.key === ' ')) tweenTo(tile, 1.015, 70);
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (direction !== undefined) {
        event.preventDefault();
        const candidates = tiles.filter(other => !other.button.hidden && other !== tile)
          .map(other => ({ other, forward: (other.x - tile.x) * direction[0] + (other.y - tile.y) * direction[1], lateral: Math.abs((other.x - tile.x) * direction[1] - (other.y - tile.y) * direction[0]) }))
          .filter(candidate => candidate.forward > .01)
          .sort((a, b) => a.forward + 3 * a.lateral - b.forward - 3 * b.lateral);
        candidates[0]?.other.button.focus({ preventScroll: true });
      }
    });
    button.addEventListener('blur', () => { if (hovered !== tile.index) tweenTo(tile, 1, 200); });
    tile.button = button; updateTileLabel(tile); $('tiles').append(button);
  }
}

function syncControlState() {
  const action = yellowAction(tiles), label = action === 'start' ? '开始' : '重置';
  const control = $('reset');
  control.dataset.action = action;
  control.setAttribute('aria-label', `黄色灯${label}：从所有牌中左上方的一张开始波纹${action === 'start' ? '展开' : '合牌'}`);
  const current = hoveredControl ?? focusedControl;
  mahjong?.setStickHint(current === 'reset' ? label : CONTROL_HINTS[current] ?? '');
}

function updateControlHint() {
  syncControlState();
  requestRender();
}

for (const id of Object.keys(CONTROL_HINTS)) {
  const control = $(id);
  control.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    hoveredControl = id; updateControlHint();
  });
  const leave = () => { if (hoveredControl === id) hoveredControl = null; updateControlHint(); };
  control.addEventListener('pointerleave', leave);
  control.addEventListener('pointercancel', leave);
  control.addEventListener('focus', () => {
    focusedControl = control.matches(':focus-visible') ? id : null;
    updateControlHint();
  });
  control.addEventListener('blur', () => {
    if (focusedControl === id) focusedControl = null;
    updateControlHint();
  });
}

$('reset').addEventListener('click', startReset);
$('score-stick').addEventListener('click', () => {
  if (!mahjong || phase === 'loading' || phase === 'loading-fade' || phase === 'entry' || stickDrop) return;
  stickDrop = createStickDrop(Math.random, restingStick); stickEpoch = performance.now();
  $('score-stick').setAttribute('aria-busy', 'true');
  $('score-stick').dataset.motion = 'lifting';
  $('stick-status').textContent = '拿起点棒，倾斜松手后掉落。';
  requestRender();
});
window.addEventListener('pointerup', () => {
  if (pressed !== null) { const tile = tiles[pressed]; pressed = null; tweenTo(tile, hovered === tile.index ? 1.04 : 1, 180); }
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });

async function initialize() {
  createHitTargets();
  const style = $('page-style');
  if (!style.sheet || style.media !== 'all') await new Promise((resolve, reject) => {
    style.addEventListener('load', resolve, { once: true });
    style.addEventListener('error', () => reject(new Error('Stylesheet failed to load')), { once: true });
  });
  await document.fonts.ready;
  await Promise.all([buildTextures(), loadImage('./assets/control-box.svg?v=20261011-start-button').then((image) => { consoleImage = image; })]);
  mahjong = new Mahjong3D($('mahjong'), mainTiles, sideTiles);
  updateControlHint();
  resize();
  // Render all passes behind the loader to upload textures and compile shaders
  // before the shared entry clock starts. No partial scene can become visible.
  const entryPoses = tiles.map(() => ({ theta: 0, q: 1.06, height: 1 }));
  mahjong.render(entryPoses, [entryPoses], 1, REST_STICK, [REST_STICK], { opacity: 0 });
  mahjong.renderer.getContext().finish();
  loadingEpoch = performance.now(); phase = 'loading-fade'; requestRender();
}

initialize().catch((error) => {
  console.error('牌河资源加载失败', error);
  $('status').textContent = '页面资源加载失败，请刷新后重试。';
  $('loading-text').style.opacity = '1';
  $('loading-text').textContent = '加载失败，请刷新重试。';
});
