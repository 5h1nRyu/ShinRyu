import { SPEC } from './geometry.js';
import { STICK_PICKUP_DURATION } from './score-stick.js';

export const AUDIO_CONFIG = Object.freeze({
  masterVolume: .65,
  tileVolume: .18,
  stickVolume: .65,
  buttonVolume: .45,
  lateTolerance: 120,
  storageKey: 'shinryu-sound-enabled',
});
export const AUDIO_FILES = Object.freeze({
  tile: './assets/audio/tile-land.wav',
  stick: './assets/audio/stick-impact.wav',
  rebound: './assets/audio/stick-rebound.wav',
  click: './assets/audio/button-click.wav',
  switch: './assets/audio/button-switch.wav',
});

// Merge near-simultaneous landings so the 54-tile wave stays quiet and clear.
// Sound follows contact (600 ms), not the initial click or start of rotation.
export function tileSoundEvents(tiles) {
  const landings = tiles.flatMap(tile => tile.flips.map(flip => ({
    time: flip.start + SPEC.flipDuration, x: tile.x, index: tile.index,
  }))).sort((a, b) => a.time - b.time);
  const groups = [];
  for (const landing of landings) {
    const last = groups.at(-1);
    if (last && landing.time - last[0].time < 20) last.push(landing);
    else groups.push([landing]);
  }
  return groups.map(group => ({
    sample: 'tile', time: group[0].time,
    gain: Math.min(.32, AUDIO_CONFIG.tileVolume * Math.sqrt(group.length)),
    pan: Math.max(-.7, Math.min(.7, (group.reduce((sum, hit) => sum + hit.x, 0) / group.length - 960) / 960)),
    rate: .97 + (group[0].index % 7) * .01,
  }));
}

export function stickSoundEvents(drop, epoch) {
  const strongest = Math.max(1, ...drop.impacts.map(hit => hit.speed));
  return drop.impacts.map((hit, index) => ({
    sample: index === 0 ? 'stick' : 'rebound',
    time: epoch + STICK_PICKUP_DURATION + hit.time * 1000,
    gain: AUDIO_CONFIG.stickVolume * Math.sqrt(hit.speed / strongest) * (index === 0 ? 1 : .5),
    pan: hit.end * .08, rate: index === 0 ? 1 : 1.04,
  }));
}

// Audio is optional: unavailable files, blocked storage, and suspended contexts
// never interrupt the existing page. Queued sounds expire instead of catching up.
export class SoundEffects {
  constructor({ contextFactory, fetcher, now, storage, hidden } = {}) {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    this.contextFactory = contextFactory ?? (AudioContext ? () => new AudioContext() : null);
    this.fetcher = fetcher ?? globalThis.fetch?.bind(globalThis);
    this.now = now ?? (() => performance.now());
    this.hidden = hidden ?? (() => globalThis.document?.hidden ?? false);
    this.supported = Boolean(this.contextFactory && this.fetcher);
    this.enabled = true;
    try {
      this.storage = storage ?? globalThis.localStorage;
      this.enabled = this.storage?.getItem(AUDIO_CONFIG.storageKey) !== 'false';
    } catch { /* Storage may be blocked; keep the session preference. */ }
    this.buffers = new Map();
    this.sources = new Set();
    this.generation = 0;
  }

  preload() {
    if (this.loading) return this.loading;
    if (!this.supported) return Promise.resolve();
    try {
      this.context = this.contextFactory();
      this.master = this.context.createGain();
      this.master.gain.value = AUDIO_CONFIG.masterVolume;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = .003;
      compressor.release.value = .12;
      this.master.connect(compressor);
      compressor.connect(this.context.destination);
      this.loading = Promise.all(Object.entries(AUDIO_FILES).map(async ([name, path]) => {
        try {
          const response = await this.fetcher(new URL(path, import.meta.url));
          if (!response.ok) return;
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(name, buffer);
        } catch { /* Missing audio must not block the visual archive. */ }
      }));
    } catch {
      this.supported = false;
      this.loading = Promise.resolve();
    }
    return this.loading;
  }

  unlock() {
    if (!this.enabled || !this.supported) return Promise.resolve();
    const loaded = this.preload();
    try {
      // Call resume synchronously in the pointer/keyboard handler, before awaits.
      const resumed = this.context.state === 'running' ? Promise.resolve() : this.context.resume();
      return Promise.all([loaded, resumed]).catch(() => {});
    } catch { return Promise.resolve(); }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.cancel();
    try { this.storage?.setItem(AUDIO_CONFIG.storageKey, String(this.enabled)); } catch { /* Session-only preference. */ }
    if (this.enabled) void this.unlock();
  }

  cancel() {
    this.generation++;
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Already ended. */ }
    }
    this.sources.clear();
  }

  schedule(events) {
    if (!this.enabled || this.hidden() || !this.supported || !events.length) return;
    const generation = this.generation;
    void this.unlock().then(() => {
      if (generation !== this.generation || !this.enabled || this.hidden() || this.context?.state !== 'running') return;
      const now = this.now(), audioNow = this.context.currentTime;
      for (const event of events) {
        const buffer = this.buffers.get(event.sample);
        if (!buffer || event.time < now - AUDIO_CONFIG.lateTolerance) continue;
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const panner = this.context.createStereoPanner();
        source.buffer = buffer;
        source.playbackRate.value = event.rate ?? 1;
        gain.gain.value = event.gain ?? 1;
        panner.pan.value = event.pan ?? 0;
        source.connect(gain); gain.connect(panner); panner.connect(this.master);
        source.onended = () => {
          this.sources.delete(source);
          source.disconnect(); gain.disconnect(); panner.disconnect();
        };
        this.sources.add(source);
        source.start(audioNow + Math.max(0, event.time - now) / 1000);
      }
    }).catch(() => {});
  }

  button(mechanical = false) {
    this.schedule([{ sample: mechanical ? 'switch' : 'click', time: this.now(), gain: AUDIO_CONFIG.buttonVolume }]);
  }
}
