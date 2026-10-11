import { THEMES, archiveLayout, routeValues, sampleArchive, bezier, progress, mixRect, mix } from './archive-geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const BASE = new URL('.', import.meta.url).pathname;
const FONT = '"Archive Noto Sans SC"';
const WHITE = '#f4f0e6';
const GREEN = '#0b503d';
const svgNode = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
};
const setRect = (node, rect, radius = 0) => Object.assign(node.style, {
  left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${radius}px`,
});

export class Archive {
  constructor({ capture, restore, suspend }) {
    Object.assign(this, { capture, restore, suspend });
    this.active = false; this.pending = false; this.source = null; this.animation = null; this.raf = 0;
    this.scene = 0; this.index = 0; this.detached = false; this.hoverTracks = new Map();
    this.table = document.getElementById('viewport');
    this.tableParent = this.table.parentNode; this.tableSibling = this.table.nextSibling;
    this.measure = document.createElement('canvas').getContext('2d');
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.build();
    this.ready = Promise.all([
      document.fonts.load(`900 200px ${FONT}`, '牌河档案行列之间一手留白'),
      document.fonts.load(`800 36px ${FONT}`, '一手牌，一张图。有秩序，更清晰。留片段，留余地。换面 →返回'),
      this.image.decode().catch(error => console.warn('麻将图片加载失败，保留图片区及替代文字。', error)),
    ]);
    this.ready.catch(error => console.error('海报字体加载失败', error));
    window.addEventListener('resize', () => {
      if (!this.active) return;
      this.layout();
      if (this.animation) this.sample(this.animation.duration, true);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.active) this.request(); });
    window.addEventListener('popstate', () => this.onHistory());
    this.reduced.addEventListener('change', () => {
      if (this.animation) this.sample(this.animation.duration, true);
    });
  }

  isRoute() { return location.pathname.replace(/\/$/, '') === `${BASE}archive`; }

  build() {
    this.root = document.createElement('main'); this.root.id = 'archive';
    this.root.setAttribute('aria-label', '牌河海报'); this.root.inert = true;
    this.grid = svgNode('svg', { class: 'archive-grid', 'aria-hidden': 'true' });
    this.title = document.createElement('h1'); this.title.className = 'archive-title';
    this.caption = document.createElement('p'); this.caption.className = 'archive-caption';
    this.photo = document.createElement('div'); this.photo.className = 'archive-photo';
    this.image = new Image(); this.image.alt = '绿色网点印刷的两张叠放麻将牌，正面为發字';
    this.image.src = `${BASE}assets/mahjong-print.png`; this.photo.append(this.image);
    for (const parent of [this.title, this.caption]) {
      const svg = svgNode('svg', { class: 'archive-type', 'aria-hidden': 'true' });
      svg.append(svgNode('text'), svgNode('text')); parent.append(svg);
    }
    this.next = this.button('换面', 'next'); this.back = this.button('返回', 'back');
    this.live = document.createElement('p'); this.live.className = 'sr-only';
    this.live.setAttribute('role', 'status'); this.live.setAttribute('aria-live', 'polite');
    this.root.append(this.grid, this.title, this.caption, this.photo, this.next, this.back, this.live);
    this.next.addEventListener('click', () => {
      if (this.animation || this.press) return;
      this.press = { start: performance.now(), from: 4 * this.geometry.k * (this.hoverTracks.get(this.next)?.value ?? 0) };
      this.next.disabled = true;
      if (!this.hoverTracks.has(this.next)) this.hover(this.next, false);
      this.request();
    });
    this.back.addEventListener('click', () => this.leave(false));
  }

  button(label, action) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = 'archive-button'; button.dataset.action = action;
    button.setAttribute('aria-label', label);
    const svg = svgNode('svg', { class: 'archive-type', 'aria-hidden': 'true' });
    svg.append(svgNode('text')); button.append(svg);
    button.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch' && !button.disabled) this.hover(button, true);
    });
    button.addEventListener('pointerleave', () => this.hover(button, false));
    button.addEventListener('blur', () => this.hover(button, false));
    return button;
  }

  hover(button, active) {
    const previous = this.hoverTracks.get(button), now = performance.now();
    this.hoverTracks.set(button, { start: now, from: previous?.value ?? 0, to: active ? 1 : 0,
      duration: active ? 120 : 100, value: previous?.value ?? 0 });
    this.request();
  }

  ink(node, text, x, y, size, weight, edge = 'top') {
    this.measure.font = `${weight} ${size}px ${FONT}`;
    const metrics = this.measure.measureText(text);
    node.textContent = text;
    node.setAttribute('x', x + metrics.actualBoundingBoxLeft);
    node.setAttribute('y', edge === 'top' ? y + metrics.actualBoundingBoxAscent : y - metrics.actualBoundingBoxDescent);
    node.setAttribute('font-size', size); node.setAttribute('font-weight', weight);
    return metrics;
  }

  layout() {
    this.geometry = archiveLayout(innerWidth, innerHeight);
    const g = this.geometry, { x, y, u, v, W, H, radius, stroke } = g;
    this.root.style.width = `${W}px`; this.root.style.height = `${H}px`;
    this.grid.setAttribute('width', W); this.grid.setAttribute('height', H);
    const group = svgNode('g', { fill: 'none', stroke: GREEN, 'stroke-width': stroke });
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      group.append(svgNode('rect', { x: x + col * u, y: y + row * v, width: u, height: v, rx: radius }));
    }
    // Extend the existing boundary axes only outside the eighteen rounded cells.
    for (let col = 0; col <= 6; col++) {
      const X = x + col * u;
      group.append(svgNode('path', { d: `M${X},0 V${y} M${X},${y + 3 * v} V${H}` }));
    }
    for (let row = 0; row <= 3; row++) {
      const Y = y + row * v;
      group.append(svgNode('path', { d: `M0,${Y} H${x} M${x + 6 * u},${Y} H${W}` }));
    }
    this.grid.replaceChildren(group);
    setRect(this.photo, { x: x + 4 * u, y: y + v, width: 2 * u, height: v });
    setRect(this.next, { x: x + 4 * u, y: y + 3 * v - g.buttonHeight, width: u, height: g.buttonHeight });
    setRect(this.back, { x: x + 5 * u, y: y - g.buttonHeight, width: u, height: g.buttonHeight });
    this.ink(this.next.querySelector('text'), g.compact ? '换面' : '换面 →', 0, g.buttonHeight, g.buttonSize, 800, 'bottom');
    this.ink(this.back.querySelector('text'), '返回', 0, g.buttonHeight, g.buttonSize, 800, 'bottom');
    this.text();
  }

  text() {
    const g = this.geometry, theme = THEMES[this.scene], lines = g.compact ? theme.compact : theme.caption;
    this.title.setAttribute('aria-label', theme.title.join(''));
    this.caption.setAttribute('aria-label', lines.join(''));
    const titles = this.title.querySelectorAll('text'), captions = this.caption.querySelectorAll('text');
    titles.forEach((node, i) => this.ink(node, theme.title[i], g.x + i * g.u, g.y + i * g.v, g.titleSize, 900));
    this.measure.font = `800 ${g.captionSize}px ${FONT}`;
    const metrics = lines.map(line => this.measure.measureText(line));
    const bottom = Math.max(metrics[0].actualBoundingBoxDescent, g.leading + metrics[1].actualBoundingBoxDescent);
    captions.forEach((node, i) => {
      this.ink(node, lines[i], g.x, 0, g.captionSize, 800);
      node.setAttribute('y', g.y + 3 * g.v - bottom + i * g.leading);
    });
  }

  attach() {
    this.active = true; document.body.classList.add('archive-open');
    this.root.inert = true; document.body.append(this.root); this.layout();
    document.querySelector('meta[name="theme-color"]').content = WHITE;
    document.title = `${THEMES[this.scene].title.join('')} · ShinRyu`;
  }

  detachTable() {
    if (this.detached) return;
    this.table.remove(); this.detached = true;
  }

  attachTable() {
    if (this.detached) this.tableParent.insertBefore(this.table, this.tableSibling);
    this.detached = false; this.table.style.visibility = ''; this.table.inert = false;
  }

  async open(index, keyboard = false) {
    if (this.active || this.pending) return;
    this.pending = true;
    try { await this.ready; } catch {
      this.pending = false; document.getElementById('status').textContent = '海报字体暂未能加载，请稍后重试。'; return;
    }
    // Read the real projected silhouette after all resources are ready.
    const visual = this.capture(index);
    if (!visual) { this.pending = false; return; }
    this.source = { ...visual, keyboard, route: location.pathname + location.search + location.hash,
      scroll: { x: scrollX, y: scrollY }, focus: document.activeElement };
    this.index = index; this.scene = 0; this.pending = false;
    history.pushState({ ...history.state, archive: true, sourceRoute: this.source.route, index,
      sourceScroll: this.source.scroll, sourceRect: visual.rect, sourceRadius: visual.radius }, '', this.url());
    this.suspend(); this.table.inert = true;
    this.attach(); this.overlay(visual);
    if (!this.reduced.matches) this.table.style.visibility = 'hidden';
    this.start('enter');
  }

  async direct() {
    this.pending = true;
    const values = routeValues(location.search); this.index = values.index; this.scene = values.scene;
    try { await this.ready; } catch {
      this.pending = false; document.getElementById('loading-text').textContent = '海报字体加载失败，请刷新后重试。'; return;
    }
    this.pending = false; document.getElementById('loading').hidden = true;
    this.attach(); this.detachTable(); history.replaceState(history.state, '', this.url()); this.start('direct');
  }

  url() { return `${BASE}archive?tile=${String(this.index + 1).padStart(2, '0')}&scene=${this.scene}`; }

  overlay(visual) {
    this.clearOverlay();
    this.cover = document.createElement('div'); this.cover.className = 'archive-cover';
    this.clone = document.createElement('div'); this.clone.className = 'archive-clone';
    this.clone.append(visual.canvas); document.body.append(this.cover, this.clone);
    setRect(this.cover, visual.rect, visual.radius); setRect(this.clone, visual.rect, visual.radius);
  }

  clearOverlay() { this.cover?.remove(); this.clone?.remove(); this.cover = this.clone = null; }

  start(kind, fromHistory = false) {
    this.animation = { kind, fromHistory, start: performance.now(), swapped: false, fromScene: this.scene,
      duration: sampleArchive(kind, 0, this.geometry, this.reduced.matches).duration };
    this.root.inert = kind !== 'switch'; this.next.disabled = true; this.back.disabled = kind !== 'switch';
    this.sample(0); this.request();
  }

  request() { if (!this.raf) this.raf = requestAnimationFrame(now => this.frame(now)); }

  frame(now) {
    this.raf = 0;
    if (!this.active) return;
    if (this.press) {
      if (now - this.press.start >= 70 || this.reduced.matches) {
        this.press = null;
        this.pressRestore = this.reduced.matches ? null : { start: now };
        this.hover(this.next, false); this.start('switch');
      }
    }
    if (this.animation) this.sample(now - this.animation.start, true);
    if (!this.active) return;
    const state = this.animation ? sampleArchive(this.animation.kind, now - this.animation.start, this.geometry, this.reduced.matches) : null;
    let moving = false;
    for (const button of [this.next, this.back]) {
      const track = this.hoverTracks.get(button);
      if (!track) continue;
      const q = progress(now, track.start, track.start + track.duration);
      track.value = mix(track.from, track.to, bezier(q)); moving ||= q < 1;
      const displacement = button === this.next ? 4 : -4;
      let press = null;
      if (button === this.next && this.press) press = mix(this.press.from, 2 * this.geometry.k, progress(now, this.press.start, this.press.start + 70));
      if (button === this.next && this.pressRestore) {
        const q = bezier(progress(now, this.pressRestore.start, this.pressRestore.start + 100));
        press = 2 * this.geometry.k * (1 - q);
        if (q === 1) this.pressRestore = null;
      }
      button.style.transform = `translate(${press ?? displacement * this.geometry.k * track.value}px, ${state?.buttonY ?? 0}px)`;
      const a = [0, 0, 0], b = [11, 80, 61];
      button.style.color = `rgb(${a.map((channel, i) => Math.round(mix(channel, b[i], track.value))).join(',')})`;
    }
    if (this.animation || this.press || this.pressRestore || moving) this.request();
  }

  sample(time, finish = false) {
    const animation = this.animation;
    if (!animation) return;
    const g = this.geometry, state = sampleArchive(animation.kind, time, g, this.reduced.matches);
    if (animation.kind === 'switch' && Boolean(state.swap) !== animation.swapped) {
      this.scene = state.swap ? (animation.fromScene + 1) % 3 : animation.fromScene;
      this.text(); animation.swapped = Boolean(state.swap);
    }
    for (const [node, alpha, offset] of [[this.grid, state.grid, 0], [this.title, state.title, state.titleY],
      [this.photo, state.photo, 0], [this.caption, state.caption, state.captionY],
      [this.next, state.buttons, state.buttonY], [this.back, state.buttons, state.buttonY]]) {
      node.style.opacity = alpha; node.style.transform = offset ? `translateY(${offset}px)` : 'none';
    }
    if (animation.kind === 'enter' && this.cover) {
      if (this.reduced.matches) {
        this.root.style.opacity = String(progress(time, 0, 100));
        this.cover.style.opacity = '0'; this.clone.style.opacity = '0';
      } else {
        const S = this.source.rect, q = bezier(progress(time, 0, 80));
        const L = { x: S.x - .02 * S.width, y: S.y - .02 * S.height - 4 * g.k, width: S.width * 1.04, height: S.height * 1.04 };
        const D = { x: g.x + this.index % 6 * g.u, y: g.y + Math.floor(this.index / 6) * g.v, width: g.u, height: g.v };
        const expand = bezier(progress(time, 80, 400));
        setRect(this.cover, time < 80 ? mixRect(S, L, q) : mixRect(L, { x: 0, y: 0, width: innerWidth, height: innerHeight }, expand), mix(this.source.radius, 0, expand));
        setRect(this.clone, time < 80 ? mixRect(S, L, q) : mixRect(L, D, expand), mix(this.source.radius, g.radius, expand));
        this.clone.style.opacity = String(1 - progress(time, 280, 400));
      }
      if (time >= (this.reduced.matches ? 100 : 400)) { this.clearOverlay(); this.detachTable(); }
    }
    if (animation.kind === 'return' && this.cover) {
      if (this.reduced.matches) {
        this.cover.style.opacity = String(1 - progress(time, 0, 100)); this.clone.style.opacity = '0';
      } else {
        const q = bezier(progress(time, 80, 400));
        this.cover.style.opacity = time < 80 ? '0' : '1';
        setRect(this.cover, mixRect({ x: 0, y: 0, width: innerWidth, height: innerHeight }, this.returnVisual.rect, q), mix(0, this.returnVisual.radius, q));
        setRect(this.clone, this.returnVisual.rect, this.returnVisual.radius);
        this.clone.style.opacity = String(progress(time, 280, 400));
      }
      this.root.style.background = time >= (this.reduced.matches ? 0 : 80) ? 'transparent' : WHITE;
    }
    if (finish && time >= state.duration) this.finish();
  }

  finish() {
    const { kind, fromHistory } = this.animation; this.animation = null;
    this.clearOverlay(); this.press = null; this.pressRestore = null; this.root.style.opacity = '1';
    if (kind === 'return' || kind === 'home') {
      this.root.remove(); this.root.style.background = WHITE;
      document.body.classList.remove('archive-open'); this.active = false;
      this.attachTable(); this.restore();
      document.querySelector('meta[name="theme-color"]').content = GREEN;
      document.title = '牌河视觉档案 · ShinRyu';
      if (this.source) {
        window.scrollTo(this.source.scroll.x, this.source.scroll.y);
        this.source.focus?.focus({ preventScroll: true });
        if (!fromHistory) history.back();
      } else if (!fromHistory) history.replaceState(null, '', BASE);
      return;
    }
    this.root.inert = false; this.next.disabled = false; this.back.disabled = false;
    for (const node of [this.grid, this.title, this.photo, this.caption, this.next, this.back]) {
      node.style.opacity = '1'; node.style.transform = 'none';
    }
    if (kind === 'enter') {
      this.detachTable();
      if (this.source.keyboard) this.next.focus({ preventScroll: true });
    }
    if (kind === 'switch') {
      history.replaceState(history.state, '', this.url());
      document.title = `${THEMES[this.scene].title.join('')} · ShinRyu`;
      this.live.textContent = THEMES[this.scene].title.join('');
    }
    this.restoreHover();
  }

  restoreHover() {
    for (const [button, track] of this.hoverTracks) {
      button.style.transform = track.value ? `translateX(${(button === this.next ? 4 : -4) * this.geometry.k * track.value}px)` : 'none';
    }
  }

  async leave(fromHistory) {
    if (!this.active || this.leaving) return;
    this.leaving = true;
    cancelAnimationFrame(this.raf); this.raf = 0; this.animation = null; this.press = null; this.pressRestore = null;
    this.clearOverlay(); this.root.inert = true;
    if (this.source) {
      this.attachTable(); window.scrollTo(this.source.scroll.x, this.source.scroll.y);
      this.restore(); this.returnVisual = this.capture(this.index);
      if (this.returnVisual) { this.overlay(this.returnVisual); this.clone.style.opacity = '0'; }
    }
    this.start(this.returnVisual ? 'return' : 'home', fromHistory);
    this.leaving = false;
  }

  onHistory() {
    if (this.isRoute()) {
      if (this.active) {
        if (this.animation) this.sample(this.animation.duration, true);
        Object.assign(this, routeValues(location.search)); this.layout(); return;
      }
      if (this.source) {
        Object.assign(this, routeValues(location.search));
        this.suspend(); this.table.inert = true; this.attach(); this.detachTable(); this.start('direct');
      } else this.direct();
    } else if (this.active) this.leave(true);
  }

  // Deterministic absolute-time sampling for design keyframe inspection.
  seek(ms) { cancelAnimationFrame(this.raf); this.raf = 0; this.sample(ms, ms >= (this.animation?.duration ?? Infinity)); }
  resume(ms = 0) { if (this.animation) { this.animation.start = performance.now() - ms; this.request(); } }
}
