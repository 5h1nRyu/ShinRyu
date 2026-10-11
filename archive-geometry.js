export const THEMES = [
  { title: ['牌河', '档案'], caption: ['一手牌，', '一张图。'], compact: ['一手', '一图'] },
  { title: ['行列', '之间'], caption: ['有秩序，', '更清晰。'], compact: ['有序', '清晰'] },
  { title: ['一手', '留白'], caption: ['留片段，', '留余地。'], compact: ['片段', '余地'] },
];

export function archiveLayout(width, height) {
  const W = Math.max(320, width), H = Math.max(560, height);
  let u = Math.min(180, W / 9.6, H / 6, (W - 96) / 6, (H - 96) / 4);
  const compact = u < 112.5 || W < 768 || H > W;
  if (compact) u = Math.min(112.5, (W - 32) / 6, (H - 260) / 4);
  const v = 4 * u / 3, k = u / 150, x = W / 2 - 3 * u, y = H / 2 - 2 * u;
  return { W, H, u, v, k, x, y, compact, radius: .04 * u, stroke: Math.max(1, 2 * k),
    titleSize: 200 * k, captionSize: compact ? 20 : 36 * k,
    leading: compact ? 26 : 46 * k, buttonSize: compact ? 22 : 32 * k,
    buttonHeight: compact ? 48 : Math.max(44, 64 * k) };
}

export function routeValues(search) {
  const params = new URLSearchParams(search);
  const tile = /^\d+$/.test(params.get('tile') ?? '') ? Number(params.get('tile')) : 1;
  const scene = /^[0-2]$/.test(params.get('scene') ?? '') ? Number(params.get('scene')) : 0;
  return { index: tile >= 1 && tile <= 18 ? tile - 1 : 0, scene };
}

export const clamp = value => Math.max(0, Math.min(1, value));
// Solve the actual cubic-bezier time axis, rather than treating t as its parameter.
export function bezier(t, x1 = .22, y1 = 1, x2 = .36, y2 = 1) {
  const curve = (s, a, b) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
  const time = clamp(t);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(mid, x1, x2) < time) lo = mid; else hi = mid;
  }
  return time === 0 || time === 1 ? time : curve((lo + hi) / 2, y1, y2);
}

export const progress = (time, start, end) => clamp((time - start) / (end - start));
export const mix = (a, b, t) => a + (b - a) * t;
export function mixRect(a, b, t) {
  return Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, mix(a[key], b[key], t)]));
}

export function sampleArchive(kind, time, layout, reduced = false) {
  const { k, compact } = layout;
  const shift = distance => compact ? Math.max(4, distance * k) : distance * k;
  if (reduced) {
    const q = progress(time, 0, 100), exiting = kind === 'return' || kind === 'home';
    const alpha = exiting ? 1 - q : q;
    if (kind === 'switch') {
      const text = time < 50 ? 1 - progress(time, 0, 50) : progress(time, 50, 100);
      return { grid: 1, photo: 1, buttons: 1, title: text, caption: text,
        titleY: 0, captionY: 0, buttonY: 0, duration: 100, swap: time >= 50 };
    }
    return { grid: alpha, title: alpha, photo: alpha, caption: alpha, buttons: alpha,
      titleY: 0, captionY: 0, buttonY: 0, duration: 100, swap: kind === 'switch' && time >= 50 };
  }
  const track = (a, b) => bezier(progress(time, a, b));
  if (kind === 'enter') return {
    grid: track(240, 520), title: track(400, 720), photo: track(480, 720),
    caption: track(520, 740), buttons: track(560, 760),
    titleY: shift(24) * (1 - track(400, 720)), captionY: shift(12) * (1 - track(520, 740)),
    buttonY: shift(8) * (1 - track(560, 760)), duration: 760,
  };
  if (kind === 'switch') {
    const swap = time >= 100;
    const q = swap ? track(100, 320) : bezier(progress(time, 0, 100), .4, 0, 1, 1);
    return { grid: 1, photo: 1, buttons: 1, title: swap ? q : 1 - q, caption: swap ? q : 1 - q,
      titleY: swap ? 14 * k * (1 - q) : -10 * k * q,
      captionY: swap ? 14 * k * (1 - q) : -10 * k * q, buttonY: 0, duration: 320, swap };
  }
  if (kind === 'return' || kind === 'home') {
    const q = track(0, kind === 'home' ? 220 : 100);
    return { grid: 1 - track(0, kind === 'home' ? 220 : 160), title: 1 - q, photo: 1 - q,
      caption: 1 - q, buttons: 1 - q, titleY: 8 * k * q, captionY: 8 * k * q,
      buttonY: 8 * k * q, duration: kind === 'home' ? 220 : 400 };
  }
  const q = track(120, 480);
  return { grid: track(0, 220), title: q, photo: q, caption: q, buttons: q,
    titleY: shift(8) * (1 - q), captionY: shift(8) * (1 - q),
    buttonY: shift(8) * (1 - q), duration: 480 };
}
