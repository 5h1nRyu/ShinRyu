import { smooth, center, entryScale, flipPose, motionDistance } from './geometry.js';
import { Mahjong3D } from './mahjong-3d.js?v=20261010-interactions';
import { REST_STICK, STICK_PICKUP_DURATION, createStickDrop, stickMotionDistance } from './score-stick.js?v=20261010-interactions';
import { flipAt, settleFlips, revealTile, resetTiles } from './tile-interactions.js?v=20261010-interactions';
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
let phase = 'loading', epoch = 0, resetCycle = null;
let hovered = null, pressed = null;
let raf = 0, pixelScale = 1, orderCounter = 0;
let mahjong, consoleImage;
const CONTROL_HINTS = { dealer: 'github', streak: 'bilibili', reset: '重置', 'blue-light': '探索' };
let hoveredControl = null, focusedControl = null;
let stickDrop = null, stickEpoch = 0, restingStick = REST_STICK;
const tiles = Array.from({ length: 18 }, (_, index) => ({
  index, ...center(index), unit: UNIT_IDS[index], fragment: null, tween: null, front: false, flips: [], order: index,
}));
const background = { element: document.createElement('canvas') };
background.context = background.element.getContext('2d');

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
  const art = await loadImage('./assets/artwork.svg');
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
  for (const tile of tiles) {
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
}

function drawConsole() {
  const context = background.context;
  context.clearRect(0, 0, 1920, 1080);
  context.fillStyle = COLORS.table; context.fillRect(0, 0, 1920, 1080);
  // The asset's viewBox is the exact visible reference crop; no upper half of
  // the housing exists outside it. Native buttons use the same coordinates.
  context.drawImage(consoleImage, CONTROL.left, CONTROL.top,
    CONTROL.referenceWidth * CONTROL.scale, CONTROL.visibleHeight);
}

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  const scale = Math.min(width / 1920, height / 1080);
  scene.style.left = `${(width - 1920 * scale) / 2}px`;
  scene.style.top = `${(height - 1080 * scale) / 2}px`;
  scene.style.transform = `scale(${scale})`;
  pixelScale = Math.min(2, Math.max(.5, scale * (window.devicePixelRatio || 1)));
  for (const element of [canvas, background.element]) {
    element.width = Math.round(1920 * pixelScale); element.height = Math.round(1080 * pixelScale);
  }
  for (const context of [ctx, background.context]) {
    context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  }
  drawConsole(); ctx.drawImage(background.element, 0, 0, 1920, 1080);
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
  const q = phase === 'entry' ? entryScale(tile.index, time - epoch) : 1;
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
  if (phase === 'entry' && time - epoch >= 1100) {
    phase = 'idle';
    $('score-stick').disabled = false;
    $('reset').disabled = false;
    $('status').textContent = '十八张牌已落定。点击蓝背牌，逐张揭示内容。';
  }
  if (stickDrop && time >= stickEpoch + stickDrop.duration) {
    restingStick = stickDrop.settled; stickDrop = null;
    $('score-stick').setAttribute('aria-busy', 'false');
    $('stick-status').textContent = '点棒已落定，可再次点击拿起。';
  }
  $('score-stick').dataset.motion = stickDrop ? time - stickEpoch < STICK_PICKUP_DURATION ? 'lifting' : 'falling' : 'idle';
  if (resetCycle && phase === 'reset-reveal' && time >= resetCycle.reverseStart) {
    phase = 'reset-conceal';
    $('status').textContent = '第一轮波纹已到达右下角，正在从左上角波纹翻回蓝背。';
  }
  for (const tile of tiles) {
    if (settleFlips(tile, time)) {
      updateTileLabel(tile);
      if (interactive() && tile.front) {
        $('status').textContent = `第${Math.floor(tile.index / 6) + 1}行第${tile.index % 6 + 1}列已揭示。点击其他蓝背牌继续揭示。`;
      }
    }
    if (tile.tween && time >= tile.tween.start + tile.tween.duration && tile.tween.to === 1) tile.tween = null;
  }
  if (resetCycle && time >= resetCycle.end) {
    resetCycle = null; phase = 'idle'; $('reset').disabled = false;
    $('status').textContent = '牌河已重置。点击蓝背牌，可以再次逐张揭示。';
  }
  board.setAttribute('aria-busy', String(phase === 'entry' || Boolean(resetCycle) || tiles.some((tile) => tile.flips.length)));
  scene.style.opacity = String(smooth((time - epoch) / 200));
  const currentPoses = tiles.map((tile) => poseAt(tile, time));
  const blur = blurParameters(time);
  const sampledPoses = blur.amount > .002
    ? Array.from({ length: 7 }, (_, index) => tiles.map((tile) => poseAt(tile, time - blur.window * index / 6)))
    : [];
  const stickSamples = sampledPoses.map((_, index) => stickPoseAt(time - blur.window * index / 6));
  mahjong.render(currentPoses, sampledPoses, blur.amount, stickPoseAt(time), stickSamples);
  const stickBounds = mahjong.getStickBounds(), hitHeight = Math.max(44, stickBounds.height);
  Object.assign($('score-stick').style, {
    left: `${stickBounds.x}px`, top: `${stickBounds.y - (hitHeight - stickBounds.height) / 2}px`,
    width: `${stickBounds.width}px`, height: `${hitHeight}px`,
  });
  const sorted = sortedTiles(time);
  for (let order = 0; order < sorted.length; order++) {
    const tile = sorted[order], bounds = mahjong.getTileBounds(tile.index);
    Object.assign(tile.button.style, { left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, zIndex: order + 1 });
  }
  const moving = stickDrop || phase === 'entry' || resetCycle || tiles.some((tile) => tile.flips.length || (tile.tween && time < tile.tween.start + tile.tween.duration));
  if (moving) requestRender();
}

function requestRender() { if (!raf) raf = requestAnimationFrame(render); }

function startSingleFlip(tile) {
  if (!interactive()) return;
  const time = performance.now();
  if (settleFlips(tile, time)) updateTileLabel(tile);
  if (!revealTile(tile, time, poseAt(tile, time))) return;
  updateTileLabel(tile);
  board.setAttribute('aria-busy', 'true');
  $('status').textContent = `正在揭示第${Math.floor(tile.index / 6) + 1}行第${tile.index % 6 + 1}列的牌。`;
  requestRender();
}

function startReset() {
  if (!interactive()) return;
  const time = performance.now();
  for (const tile of tiles) settleFlips(tile, time);
  resetCycle = resetTiles(tiles, time, tiles.map((tile) => poseAt(tile, time)));
  hovered = null; pressed = null; phase = 'reset-reveal';
  for (const tile of tiles) updateTileLabel(tile);
  $('reset').disabled = true; board.setAttribute('aria-busy', 'true');
  $('status').textContent = '正在从左上角波纹检查，补齐所有未翻开的牌。';
  requestRender();
}

function updateTileLabel(tile) {
  const label = tile.front ? UNIT_NAMES[tile.unit] : '揭示档案';
  tile.button.setAttribute('aria-label', `${label}，第${Math.floor(tile.index / 6) + 1}行第${tile.index % 6 + 1}列`);
  tile.button.setAttribute('aria-busy', String(Boolean(tile.flips.length)));
  tile.button.dataset.face = tile.front ? 'front' : 'back';
}

function interactive() { return phase === 'idle'; }

function createHitTargets() {
  for (const tile of tiles) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'tile-hit';
    button.dataset.index = tile.index;
    button.setAttribute('aria-label', `揭示档案，第${Math.floor(tile.index / 6) + 1}行第${tile.index % 6 + 1}列`);
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
      startSingleFlip(tile);
    });
    button.addEventListener('keydown', (event) => {
      if (!interactive()) return;
      if (!tile.front && (event.key === 'Enter' || event.key === ' ')) tweenTo(tile, 1.015, 70);
      const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 }[event.key];
      if (direction !== undefined) {
        event.preventDefault(); tiles[(tile.index + direction + 18) % 18].button.focus();
      }
    });
    button.addEventListener('blur', () => { if (hovered !== tile.index) tweenTo(tile, 1, 200); });
    tile.button = button; updateTileLabel(tile); $('tiles').append(button);
  }
}

function updateControlHint() {
  if (!mahjong) return;
  mahjong.setStickHint(CONTROL_HINTS[hoveredControl ?? focusedControl] ?? '');
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
  if (!mahjong || phase === 'loading' || phase === 'entry' || stickDrop) return;
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
  await document.fonts.ready;
  await Promise.all([buildTextures(), loadImage('./assets/control-box.svg?v=20261010-interactions').then((image) => { consoleImage = image; })]);
  mahjong = new Mahjong3D($('mahjong'), tiles);
  updateControlHint();
  epoch = performance.now();
  phase = 'entry';
  resize();
}

initialize().catch((error) => {
  console.error('牌河资源加载失败', error);
  $('status').textContent = '页面资源加载失败，请刷新后重试。';
  scene.style.opacity = '1';
  const fallback = document.createElement('div'); fallback.className = 'no-script';
  fallback.textContent = '3D 牌河暂时未能启动，请使用支持 WebGL 2 的浏览器并刷新重试。'; scene.append(fallback);
});
