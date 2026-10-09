import { smooth, center, rippleDelay, entryScale, flipPose, motionDistance } from './geometry.js';
import { Mahjong3D } from './mahjong-3d.js';
import { REST_STICK, createStickDrop, stickMotionDistance } from './score-stick.js';
import { CONTROL } from './physical-layout.js';

const $ = (id) => document.getElementById(id);
const scene = $('scene'), board = $('board'), canvas = $('table');
scene.style.setProperty('--console-scale', String(CONTROL.scale));
scene.style.setProperty('--console-shift', `${CONTROL.bottom - 250}px`);
const ctx = canvas.getContext('2d', { alpha: false });
const FONT = '"Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const COLORS = { table: '#0B503D', back: '#2457B8', front: '#F4F0E6' };
const UNIT_IDS = ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'A', 'A', 'C', 'C', 'D', 'E', 'E', 'F', 'F', 'G', 'G'];
const UNIT_NAMES = { A: '主图：观察与秩序', B: '简介：牌河视觉档案', C: '项目：网格实验', D: '关于：整理与创作', E: '文字：近处的秩序', F: '图片：图像研究', G: '联系：一起做点什么' };
let phase = 'loading', epoch = 0, waveEnd = 0, waveTarget = 'front';
let hovered = null, pressed = null;
let raf = 0, pixelScale = 1, orderCounter = 0;
let mahjong;
let stickDrop = null, stickEpoch = 0, restingStick = REST_STICK;
const tiles = Array.from({ length: 18 }, (_, index) => ({
  index, ...center(index), unit: UNIT_IDS[index], fragment: null, tween: null, flip: null, order: index,
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
  context.save();
  context.translate(960, CONTROL.bottom); context.scale(CONTROL.scale, CONTROL.scale); context.translate(-960, -250);
  context.fillStyle = '#073d2e';
  context.beginPath(); context.moveTo(444, 0); context.lineTo(490, 44); context.lineTo(490, 0); context.fill();
  context.beginPath(); context.moveTo(1430, 0); context.lineTo(1430, 44); context.lineTo(1476, 0); context.fill();
  roundRect(context, 490, -690, 940, 940, 28, '#666e68', '#223b31');
  const metal = context.createLinearGradient(490, 0, 1430, 250);
  metal.addColorStop(0, '#b2b6af'); metal.addColorStop(.24, '#c5c8bf');
  metal.addColorStop(.63, '#b9bbb6'); metal.addColorStop(1, '#9fa79e');
  roundRect(context, 495, -685, 930, 930, 25, metal, '#d3d6cb');
  roundRect(context, 510, -674, 900, 906, 20, null, '#a5ada2');
  roundRect(context, 558, -620, 804, 802, 22, '#151c20', '#69716d');
  roundRect(context, 563, -616, 794, 793, 18, null, '#080e12');
  context.fillStyle = '#394347';
  for (let y = 9; y < 163; y += 18) for (let x = 579; x < 1351; x += 18) {
    context.fillRect(x, y, .9, .9);
  }
  // Only the lower rim of the central dice window enters the composition.
  context.beginPath(); context.ellipse(960, -50, 155, 100, 0, 0, Math.PI * 2);
  context.fillStyle = '#737c74'; context.fill();
  context.beginPath(); context.ellipse(960, -53, 147, 94, 0, 0, Math.PI * 2);
  context.fillStyle = '#bdc1b5'; context.fill();
  context.beginPath(); context.ellipse(960, -57, 132, 78, 0, 0, Math.PI * 2);
  context.fillStyle = '#939d91'; context.fill();
  // Widen the slot for the correctly scaled 7 mm white stick, keeping its center.
  roundRect(context, 624, 164, 672, 76, 27, '#979f94');
  roundRect(context, 634, 168, 652, 68, 23, '#bcc2b5');
  roundRect(context, 658, 171, 604, 62, 14, '#647266');
  context.restore();
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
  if (tile.flip) return flipPose(time - tile.flip.start, tile.flip.from, tile.flip.fromFront, tile.flip.fromHeight);
  const theta = phase === 'front' ? Math.PI : 0;
  if (tile.tween) {
    const tween = tile.tween;
    const q = tween.from + (tween.to - tween.from) * smooth((time - tween.start) / tween.duration);
    return { theta, q, height: Math.max(0, (q - 1) / .04) };
  }
  const q = phase === 'entry' ? entryScale(tile.index, time - epoch) : 1;
  return { theta, q, height: phase === 'entry' ? (q - 1) / .06 : 0 };
}

function tweenTo(tile, target, duration) {
  if (phase === 'flipping' || phase === 'entry' || phase === 'loading') return;
  const time = performance.now();
  const from = poseAt(tile, time).q;
  tile.tween = { from, to: target, duration, start: time };
  tile.order = ++orderCounter;
  requestRender();
}

function sortedTiles(time) {
  return [...tiles].sort((a, b) => {
    const pa = poseAt(a, time), pb = poseAt(b, time);
    const activeA = (a.flip && time >= a.flip.start && time < a.flip.start + 600) || Math.abs(pa.q - 1) > .00001;
    const activeB = (b.flip && time >= b.flip.start && time < b.flip.start + 600) || Math.abs(pb.q - 1) > .00001;
    return Number(activeA) - Number(activeB) || pa.height - pb.height ||
      (a.flip?.start ?? a.order) - (b.flip?.start ?? b.order) || a.index - b.index;
  });
}

function blurParameters(time) {
  let amount = 0, shutter = 8.333;
  for (const tile of tiles) {
    const pose = poseAt(tile, time), previous = poseAt(tile, time - 1);
    const speed = motionDistance(pose, previous); // Maximum projected vertex speed in design px/ms.
    amount = Math.max(amount, Math.min(1, speed / .30));
    const turning = tile.flip && time >= tile.flip.start + 120 && time <= tile.flip.start + 480;
    const limit = turning ? 12 : phase === 'entry' || (tile.flip && time >= tile.flip.start + 480) ? 2 : 1;
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
    phase = 'back'; board.setAttribute('aria-busy', 'false');
    $('score-stick').disabled = false;
    $('status').textContent = '十八张牌已落定。点击任意一张蓝背牌，揭示档案。';
  }
  if (stickDrop && time >= stickEpoch + stickDrop.duration) {
    restingStick = stickDrop.settled; stickDrop = null;
    $('score-stick').setAttribute('aria-busy', 'false');
    $('stick-status').textContent = '点棒已落定，可再次点击拿起。';
  }
  $('score-stick').dataset.motion = stickDrop ? time - stickEpoch < 360 ? 'lifting' : 'falling' : 'idle';
  if (phase === 'flipping' && time >= waveEnd) finishFlip();
  for (const tile of tiles) {
    if (tile.tween && time >= tile.tween.start + tile.tween.duration && tile.tween.to === 1) tile.tween = null;
  }
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
  const moving = stickDrop || phase === 'entry' || phase === 'flipping' || tiles.some((tile) => tile.tween && time < tile.tween.start + tile.tween.duration);
  if (moving) requestRender();
}

function requestRender() { if (!raf) raf = requestAnimationFrame(render); }

function startFlip(origin, target) {
  if (!interactive() || phase === target) return;
  const time = performance.now();
  const starts = tiles.map((tile) => {
    const pose = poseAt(tile, time);
    return { from: pose.q, fromHeight: pose.height, fromFront: phase === 'front', start: time + rippleDelay(origin, tile.index) };
  });
  hovered = null; pressed = null;
  for (const tile of tiles) { tile.flip = starts[tile.index]; tile.tween = null; }
  phase = 'flipping'; waveTarget = target;
  waveEnd = Math.max(...starts.map((flip) => flip.start)) + 600;
  $('reset').disabled = true;
  board.setAttribute('aria-busy', 'true');
  $('status').textContent = target === 'front' ? '正在揭示牌河。' : '正在从左上角波纹重置牌河。';
  requestRender();
}

function finishFlip() {
  phase = waveTarget;
  for (const tile of tiles) {
    tile.flip = null; tile.tween = null;
    const label = phase === 'front' ? UNIT_NAMES[tile.unit] : '揭示档案';
    tile.button.setAttribute('aria-label', `${label}，第${Math.floor(tile.index / 6) + 1}行第${tile.index % 6 + 1}列`);
  }
  $('reset').disabled = phase !== 'front';
  $('tiles').setAttribute('aria-label', phase === 'front'
    ? '十八张牌，七个内容单元。悬停可抬起单牌，点击重置翻回蓝背。'
    : '十八张蓝背牌，六列三行。点击任意一张揭示全部内容。');
  board.setAttribute('aria-busy', 'false');
  $('status').textContent = phase === 'front'
    ? '档案已展开。点击上方重置，从左上角翻回蓝背。'
    : '牌河已重置。点击任意一张蓝背牌，可以再次揭示。';
}

function interactive() { return phase === 'back' || phase === 'front'; }

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
      if (!interactive() || (event.button !== undefined && event.button !== 0)) return;
      pressed = tile.index; tweenTo(tile, 1.015, 70);
    });
    button.addEventListener('pointercancel', () => { pressed = null; tweenTo(tile, hovered === tile.index ? 1.04 : 1, 200); });
    button.addEventListener('click', () => {
      if (!interactive()) return;
      pressed = null;
      if (phase === 'back') startFlip(tile.index, 'front');
      else tweenTo(tile, hovered === tile.index ? 1.04 : 1, 180);
    });
    button.addEventListener('keydown', (event) => {
      if (!interactive()) return;
      if (event.key === 'Enter' || event.key === ' ') tweenTo(tile, 1.015, 70);
      const direction = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 }[event.key];
      if (direction !== undefined) {
        event.preventDefault(); tiles[(tile.index + direction + 18) % 18].button.focus();
      }
    });
    button.addEventListener('blur', () => { if (hovered !== tile.index) tweenTo(tile, 1, 200); });
    tile.button = button; $('tiles').append(button);
  }
}

$('reset').addEventListener('click', () => {
  if (phase === 'front') startFlip(0, 'back');
});
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
  await buildTextures();
  mahjong = new Mahjong3D($('mahjong'), tiles);
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
