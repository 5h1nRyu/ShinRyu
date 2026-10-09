import { SPEC, smooth, center, rippleDelay, entryScale, flipPose, projection, shadowRect, motionDistance } from './geometry.js';

const $ = (id) => document.getElementById(id);
const scene = $('scene'), board = $('board'), canvas = $('table');
const ctx = canvas.getContext('2d', { alpha: false });
const FONT = '"Source Han Sans SC", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const COLORS = { table: '#0B503D', back: '#2457B8', front: '#F4F0E6', core: '#CFCABB', shadow: '#05251B' };
const UNIT_IDS = ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'A', 'A', 'C', 'C', 'D', 'E', 'E', 'F', 'F', 'G', 'G'];
const UNIT_NAMES = { A: '主图：观察与秩序', B: '简介：牌河视觉档案', C: '项目：网格实验', D: '关于：整理与创作', E: '文字：近处的秩序', F: '图片：图像研究', G: '联系：一起做点什么' };
let phase = 'loading', epoch = 0, revealEnd = 0, pendingDetail = null;
let hovered = null, pressed = null, lastTrigger = null, dialogClosing = false;
let dialogTimer = 0, raf = 0, pixelScale = 1, orderCounter = 0;
const tiles = Array.from({ length: 18 }, (_, index) => ({
  index, ...center(index), unit: UNIT_IDS[index], fragment: null, tween: null, flip: null, order: index,
}));
const layers = ['background', 'current', 'sample', 'average'].map(() => {
  const element = document.createElement('canvas');
  return { element, context: element.getContext('2d') };
});
const [background, current, sample, average] = layers;

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
  textCard(units.F.context, 168, '图像', '查看图集');
  textCard(units.G.context, 0, '06 / 联系', ['一起做', '点什么']);
  textCard(units.G.context, 168, '联系', '查看详情');
  const origins = {
    A: [0, 0], B: [0, 3], C: [1, 3], D: [1, 5], E: [2, 0], F: [2, 2], G: [2, 4],
  };
  for (const tile of tiles) {
    const [row, col] = origins[tile.unit];
    const cropX = (tile.index % 6 - col) * 168, cropY = (Math.floor(tile.index / 6) - row) * 228;
    const texture = makeTexture(164, 224);
    texture.context.drawImage(units[tile.unit].element, cropX * 2, cropY * 2, 328, 448, 0, 0, 164, 224);
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
  roundRect(context, 624, 177, 672, 57, 27, '#979f94');
  roundRect(context, 634, 179, 652, 48, 23, '#bcc2b5');
  roundRect(context, 658, 184, 604, 37, 14, '#647266');
  roundRect(context, 668, 188, 584, 28, 10, '#f4f0e6', '#e2e2d4');
  context.fillStyle = '#bb4337';
  for (const x of [698, 1222]) { context.beginPath(); context.arc(x, 202, 5, 0, Math.PI * 2); context.fill(); }
}

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  const scale = Math.min(width / 1920, height / 1080);
  scene.style.left = `${(width - 1920 * scale) / 2}px`;
  scene.style.top = `${(height - 1080 * scale) / 2}px`;
  scene.style.transform = `scale(${scale})`;
  pixelScale = Math.min(2, Math.max(.5, scale * (window.devicePixelRatio || 1)));
  for (const element of [canvas, ...layers.map((layer) => layer.element)]) {
    element.width = Math.round(1920 * pixelScale); element.height = Math.round(1080 * pixelScale);
  }
  for (const context of [ctx, ...layers.map((layer) => layer.context)]) {
    context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
  }
  drawConsole(); requestRender();
}

function poseAt(tile, time) {
  if (tile.flip) return flipPose(time - tile.flip.start, tile.flip.from);
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
  if (phase === 'revealing' || phase === 'entry' || phase === 'loading') return;
  const time = performance.now();
  const from = poseAt(tile, time).q;
  tile.tween = { from, to: target, duration, start: time };
  tile.order = ++orderCounter;
  requestRender();
}

function drawTile(context, tile, pose) {
  const p = projection(pose.theta, pose.q);
  context.save(); context.translate(tile.x, tile.y);
  if (p.sideWidth > .0001) {
    const left = p.sideOffset - p.sideWidth / 2;
    roundRect(context, left, -p.height / 2, p.sideWidth, p.height, 2 * pose.q, COLORS.core);
    context.save(); context.beginPath(); context.roundRect(left, -p.height / 2, p.sideWidth, p.height, Math.min(2 * pose.q, p.sideWidth / 2)); context.clip();
    const bands = p.front ? [[8, COLORS.front], [92, COLORS.core], [32, COLORS.back]] : [[32, COLORS.back], [92, COLORS.core], [8, COLORS.front]];
    let x = left;
    for (const [width, color] of bands) { const w = p.sideWidth * width / 132; context.fillStyle = color; context.fillRect(x, -p.height / 2, w, p.height); x += w; }
    context.restore();
  }
  if (p.faceWidth > .0001) {
    // Texture direction is corrected on the new face; nothing is mirrored at 180°.
    context.translate(p.faceOffset, 0);
    context.scale(p.faceWidth / 164, pose.q);
    context.beginPath(); context.roundRect(-82, -112, 164, 224, 8); context.clip();
    context.drawImage(p.front ? tile.fragment : tile.back, -82, -112, 164, 224);
    roundRect(context, -81, -111, 162, 222, 7, null, p.front ? '#fbf7ed' : '#7897ce');
  }
  context.restore();
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

function drawTileLayer(layer, time) {
  layer.context.clearRect(0, 0, 1920, 1080);
  for (const tile of sortedTiles(time)) drawTile(layer.context, tile, poseAt(tile, time));
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
  return { amount, window: shutter };
}

function render(time) {
  raf = 0;
  if (phase === 'loading') return;
  if (phase === 'entry' && time - epoch >= 1100) {
    phase = 'back'; board.setAttribute('aria-busy', 'false');
    $('status').textContent = '十八张牌已落定。点击任意一张牌或作品按钮，揭示档案。';
  }
  if (phase === 'revealing' && time >= revealEnd) finishReveal();
  for (const tile of tiles) {
    if (tile.tween && time >= tile.tween.start + tile.tween.duration && tile.tween.to === 1) tile.tween = null;
  }
  scene.style.opacity = String(smooth((time - epoch) / 200));
  ctx.drawImage(background.element, 0, 0, 1920, 1080);
  // These three rectangles are rendered once at the current time, outside all sampling layers.
  ctx.fillStyle = COLORS.shadow;
  for (const tile of tiles) {
    const pose = poseAt(tile, time), shadow = shadowRect(tile.index, pose.theta, pose.q);
    if (shadow) ctx.fillRect(shadow.x, shadow.y, shadow.width, shadow.height);
  }
  drawTileLayer(current, time);
  const blur = blurParameters(time);
  if (blur.amount > .002) {
    // Add premultiplied RGBA samples, preserving solved occlusion for each time sample.
    const mix = average.context; mix.clearRect(0, 0, 1920, 1080);
    mix.globalCompositeOperation = 'lighter';
    mix.globalAlpha = 1 - blur.amount;
    mix.drawImage(current.element, 0, 0, 1920, 1080);
    mix.globalAlpha = blur.amount / 7;
    for (let i = 0; i < 7; i++) {
      drawTileLayer(sample, time - blur.window * i / 6);
      mix.drawImage(sample.element, 0, 0, 1920, 1080);
    }
    mix.globalAlpha = 1; mix.globalCompositeOperation = 'source-over';
    ctx.drawImage(average.element, 0, 0, 1920, 1080);
  } else ctx.drawImage(current.element, 0, 0, 1920, 1080);
  const sorted = sortedTiles(time);
  for (let order = 0; order < sorted.length; order++) {
    const tile = sorted[order], pose = poseAt(tile, time), p = projection(pose.theta, pose.q);
    Object.assign(tile.button.style, { left: `${tile.x - p.width / 2}px`, top: `${tile.y - p.height / 2}px`, width: `${p.width}px`, height: `${p.height}px`, zIndex: order + 1 });
  }
  const moving = phase === 'entry' || phase === 'revealing' || tiles.some((tile) => tile.tween && time < tile.tween.start + tile.tween.duration);
  if (moving) requestRender();
}

function requestRender() { if (!raf) raf = requestAnimationFrame(render); }

function startReveal(origin, detail = null, trigger = null) {
  if (phase === 'loading' || phase === 'entry') return;
  if (phase === 'revealing') {
    if (detail === 'D' || detail === 'G') pendingDetail = { unit: detail, trigger };
    return;
  }
  if (phase === 'front') { if (detail) openDetail(detail, trigger); return; }
  const time = performance.now();
  const starts = tiles.map((tile) => ({ from: poseAt(tile, time).q, start: time + rippleDelay(origin, tile.index) }));
  hovered = null; pressed = null;
  for (const tile of tiles) { tile.flip = starts[tile.index]; tile.tween = null; }
  phase = 'revealing'; revealEnd = Math.max(...starts.map((flip) => flip.start)) + 600;
  pendingDetail = detail ? { unit: detail, trigger } : null;
  board.setAttribute('aria-busy', 'true'); $('status').textContent = '正在揭示牌河。';
  requestRender();
}

function finishReveal() {
  phase = 'front';
  for (const tile of tiles) { tile.flip = null; tile.tween = null; tile.button.setAttribute('aria-label', `${UNIT_NAMES[tile.unit]}，第${Math.floor(tile.index / 6) + 1}行第${tile.index % 6 + 1}列`); }
  $('tiles').setAttribute('aria-label', '十八张牌，七个内容单元。点击任意片段查看对应详情。');
  board.setAttribute('aria-busy', 'false');
  $('status').textContent = '档案已展开。可以查看图像、文字、项目、关于与联系。';
  if (pendingDetail) { const target = pendingDetail; pendingDetail = null; openDetail(target.unit, target.trigger); }
}

function interactive() { return (phase === 'back' || phase === 'front') && $('detail-overlay').hidden; }

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
      if (phase === 'back') startReveal(tile.index);
      else { tweenTo(tile, 1, 200); openDetail(tile.unit, button); }
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

const DETAILS = {
  A: {
    label: '00 / 主图 · ORIGINAL STUDY', title: '观察与秩序',
    intro: '一个圆、一片绿、几条斜线。完整的画面被分成六张牌，也在细小的间隙里保持联系。',
    body: '<figure><img class="hero-image" src="./assets/artwork.svg" alt="鼠尾草绿色圆角矩形上覆盖着金色圆形，浅色斜线穿过画面，底部是一片深绿。"><figcaption>原创二维图像 / 500 × 452 / 主图占位</figcaption></figure><p>这幅图像是档案的第一张练习：用克制的形状、色彩和留白，观察整体与局部之间的关系。它也为之后替换成真实作品留下空间。</p>',
  },
  B: {
    label: '01 / 简介', title: '牌河视觉档案',
    intro: '将图像、文字与项目放在一张麻将桌上。十八张牌，七个单元，一次展开。',
    body: '<p>熟悉的物件，可以成为另一种阅读入口。每张牌收藏一个片段，片段又共同组成更大的画面。</p><p>从任意一张牌开始，沿着细缝继续看。你可以打开主图、浏览项目、阅读随笔，或了解这个档案。</p><dl class="facts"><div><dt>载体</dt><dd>18 张独立牌片</dd></div><div><dt>内容</dt><dd>7 个档案单元</dd></div><div><dt>主题</dt><dd>观察与秩序</dd></div></dl>',
  },
  C: {
    label: '02 / 项目 · 2026', title: '网格实验',
    intro: '将连续的内容放进离散的网格，让局部拥有自己的节奏。',
    body: '<figure><img class="hero-image" src="./assets/study-lines.svg" alt="深绿底色、斜向浅绿条纹和中央金色圆形。"><figcaption>图形与网格 / 项目占位</figcaption></figure><h3>从物件到界面</h3><p>牌面是内容的载体，按钮是浏览的起点。翻身只发生一次；展开之后，每一个片段都可以独立打开对应的内容。</p><dl class="facts"><div><dt>方向</dt><dd>视觉与交互</dd></div><div><dt>形式</dt><dd>静态网页</dd></div><div><dt>状态</dt><dd>概念实验</dd></div></dl>',
  },
  D: {
    label: '03 / 关于', title: '整理与创作',
    intro: '在熟悉的日常里寻找构图，在小小的秩序里保存想法。',
    body: '<p>牌河视觉档案是 ShinRyu 的一个视觉实验。它用十八张牌收纳图像、文字与项目，把观看变成一段轻缓的探索。</p><h3>留给未来的内容</h3><p>这里目前使用原创图像和示例文字，作为作品集的内容占位。真实作品、个人介绍与新的记录，可以逐一放进这副牌里。</p>',
  },
  E: {
    label: '04 / 文字 · 随笔', title: '近处的秩序',
    intro: '有时，观察并不需要去很远的地方。',
    body: '<p>桌上的物件总会留下某种排列。杯子靠近窗，纸页叠在一旁，一枚小小的标记停在边缘。它们并没有约定，却让一片空间有了节奏。</p><p>把目光放近一些，秩序就会从间隙里出现。重复并不意味着相同；每一次轻微的偏移，都让形状显得更具体。</p><p>这副牌也是这样。完整的画面经过切分，暂时离开它熟悉的位置，再在安静下来时重新相遇。留白不是缺失，而是让每个片段得以被看见的距离。</p><p>先收藏一个片段，再慢慢拼成自己的档案。</p><p class="eyebrow">示例随笔 / 可替换为正式文章</p>',
  },
  F: {
    label: '05 / 图片 · 图像研究', title: '形状的三种练习',
    intro: '用同一组色彩，试着找到不同的平衡。',
    body: '<div class="detail-grid"><figure><img src="./assets/artwork.svg" alt="金色圆形与浅色斜线构成的绿色图像。"><figcaption>01 / 分割</figcaption></figure><figure><img src="./assets/study-circle.svg" alt="浅绿方形内的金色圆形，白色十字线经过圆心。"><figcaption>02 / 中心</figcaption></figure><figure><img src="./assets/study-lines.svg" alt="深绿底色上排列浅绿斜线，金色圆形位于中央。"><figcaption>03 / 重复</figcaption></figure></div><p>这些原创二维图像是图集的占位内容，也是一组关于形状、尺度与色彩的简单练习。</p>',
  },
  G: {
    label: '06 / 联系', title: '一起做点什么',
    intro: '如果你对图像、文字或界面实验感兴趣，可以从这个项目开始交流。',
    body: '<p>正式联系方式尚未填写。目前可以访问 ShinRyu 的 GitHub 仓库，查看项目与公开更新。</p><p><a class="external-link" href="https://github.com/5h1nRyu/ShinRyu" target="_blank" rel="noopener noreferrer">访问 GitHub 仓库 ↗</a></p><p class="eyebrow">联系说明占位 / 后续可补充邮箱或其他渠道</p>',
  },
};

function openDetail(unit, trigger) {
  if (phase !== 'front' || !$('detail-overlay').hidden) return;
  const detail = DETAILS[unit]; if (!detail) return;
  lastTrigger = trigger || document.activeElement;
  hovered = null; pressed = null;
  for (const tile of tiles) if (tile.tween) tweenTo(tile, 1, 200);
  $('detail-label').textContent = detail.label; $('detail-title').textContent = detail.title;
  $('detail-intro').textContent = detail.intro; $('detail-body').innerHTML = detail.body;
  const overlay = $('detail-overlay'); overlay.hidden = false; overlay.className = 'entering';
  dialogClosing = false; board.inert = true;
  $('detail').querySelector('.detail-scroll').scrollTop = 0;
  $('close-detail').focus();
  clearTimeout(dialogTimer);
  dialogTimer = setTimeout(() => { if (!dialogClosing) overlay.className = ''; }, 240);
  requestRender();
}

function closeDetail() {
  const overlay = $('detail-overlay'); if (overlay.hidden || dialogClosing) return;
  dialogClosing = true; clearTimeout(dialogTimer); overlay.className = 'leaving';
  dialogTimer = setTimeout(() => {
    overlay.hidden = true; overlay.className = ''; board.inert = false; dialogClosing = false;
    if (lastTrigger?.isConnected) lastTrigger.focus({ preventScroll: true });
    requestRender();
  }, 180);
}

$('close-detail').addEventListener('click', closeDetail);
$('detail-overlay').addEventListener('click', (event) => { if (event.target === $('detail-overlay')) closeDetail(); });
document.addEventListener('keydown', (event) => {
  if ($('detail-overlay').hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
  if (event.key === 'Tab') {
    const focusable = [...$('detail').querySelectorAll('button, a[href], [tabindex="0"]')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('detail'))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
for (const [id, unit] of [['works', 'A'], ['about', 'D'], ['contact', 'G']]) {
  $(id).addEventListener('click', () => {
    if (phase === 'front') openDetail(unit, $(id));
    else startReveal(8, id === 'works' ? null : unit, $(id));
  });
}
window.addEventListener('pointerup', () => {
  if (pressed !== null) { const tile = tiles[pressed]; pressed = null; tweenTo(tile, hovered === tile.index ? 1.04 : 1, 180); }
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestRender(); });

async function initialize() {
  createHitTargets();
  await document.fonts.ready;
  await buildTextures();
  epoch = performance.now();
  phase = 'entry';
  resize();
}

initialize().catch((error) => {
  console.error('牌河资源加载失败', error);
  $('status').textContent = '页面资源加载失败，请刷新后重试。';
  scene.style.opacity = '1';
  const fallback = document.createElement('div'); fallback.className = 'no-script';
  fallback.textContent = '牌河资源暂时未能加载，请刷新页面重试。'; scene.append(fallback);
});
