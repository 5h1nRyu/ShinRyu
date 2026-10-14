import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUDIO_CONFIG, AUDIO_FILES, SoundEffects, tileSoundEvents, stickSoundEvents } from '../sound-effects.js';
import { createStickDrop, STICK_PICKUP_DURATION } from '../score-stick.js';

function fixture({ state = 'running', fetcher, storage, hidden = () => false } = {}) {
  const starts = [], stops = [], resumes = [];
  const node = () => ({ connect() {}, disconnect() {}, gain: {}, pan: {} });
  const context = {
    state, currentTime: 12, destination: {}, createGain: node, createStereoPanner: node,
    createDynamicsCompressor: () => ({ ...node(), threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }),
    decodeAudioData: async () => ({ duration: .1 }),
    resume() { resumes.push(true); this.state = 'running'; return Promise.resolve(); },
    createBufferSource() {
      return { ...node(), playbackRate: {}, start(time) { starts.push({ time, source: this }); }, stop() { stops.push(this); } };
    },
  };
  const sounds = new SoundEffects({
    contextFactory: () => context,
    fetcher: fetcher ?? (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })),
    now: () => 1000, storage: storage ?? { getItem() { return null; }, setItem() {} }, hidden,
  });
  return { sounds, context, starts, stops, resumes };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('tile contacts follow each flip and combine concurrent river landings with bounded volume', () => {
  const tiles = [
    { index: 0, x: 300, flips: [{ start: 1000 }] },
    { index: 1, x: 330, flips: [{ start: 1010 }] },
    { index: 2, x: 1600, flips: [{ start: 1200 }] },
    { index: 3, x: 960, flips: [] },
  ];
  const events = tileSoundEvents(tiles);
  assert.deepEqual(events.map(event => event.time), [1600, 1800]);
  assert.ok(events[0].pan < 0 && events[1].pan > 0);
  assert.ok(events.every(event => event.gain <= .32));
  assert.equal(tileSoundEvents(Array.from({ length: 54 }, (_, index) => ({ index, x: 960, flips: [{ start: 0, fromFront: true }] }))).length, 1);
});

test('stick contacts include pickup time and preserve the actual accelerated trajectory', () => {
  const drop = createStickDrop(() => .5);
  const events = stickSoundEvents(drop, 2000);
  assert.equal(events.length, drop.impacts.length);
  assert.equal(events[0].sample, 'stick');
  for (let index = 0; index < events.length; index++) {
    assert.equal(events[index].time, 2000 + STICK_PICKUP_DURATION + drop.impacts[index].time * 1000);
    assert.ok(events[index].time < 2000 + drop.duration);
    if (index) {
      assert.equal(events[index].sample, 'rebound');
      assert.ok(events[index].gain < events[0].gain);
    }
  }
});

test('preloading stays silent and unlock resumes the audio context synchronously', async () => {
  const { sounds, resumes, starts } = fixture({ state: 'suspended' });
  const pending = sounds.unlock();
  assert.equal(resumes.length, 1);
  await pending;
  assert.equal(sounds.buffers.size, 5);
  assert.equal(starts.length, 0);
});

test('performance clock maps to the audio clock, with stale events discarded', async () => {
  const { sounds, starts } = fixture();
  await sounds.preload();
  sounds.schedule([
    { sample: 'tile', time: 1500, gain: .2, pan: -.3 },
    { sample: 'tile', time: 800 },
    { sample: 'tile', time: 950 },
  ]);
  await flush();
  assert.deepEqual(starts.map(event => event.time), [12.5, 12]);
});

test('muting stops queued and active sounds, persists preference, and unmuting does not replay', async () => {
  const writes = [];
  const { sounds, starts, stops } = fixture({ storage: { getItem() { return null; }, setItem(...args) { writes.push(args); } } });
  await sounds.preload();
  sounds.schedule([{ sample: 'tile', time: 2000 }]);
  await flush();
  sounds.setEnabled(false);
  assert.equal(stops.length, 1);
  sounds.button();
  sounds.setEnabled(true);
  await flush();
  assert.equal(starts.length, 1);
  assert.deepEqual(writes, [[AUDIO_CONFIG.storageKey, 'false'], [AUDIO_CONFIG.storageKey, 'true']]);
});

test('cancellation during decoding prevents delayed sound after leaving the page', async () => {
  let release;
  const response = new Promise(resolve => { release = resolve; });
  const { sounds, starts } = fixture({ fetcher: () => response });
  sounds.schedule([{ sample: 'tile', time: 1500 }]);
  sounds.cancel();
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await sounds.preload(); await flush();
  assert.equal(starts.length, 0);
});

test('hidden pages and saved mute preferences produce no sounds', async () => {
  for (const options of [{ hidden: () => true }, { storage: { getItem() { return 'false'; } } }]) {
    const { sounds, starts } = fixture(options);
    await sounds.preload(); sounds.button(); await flush();
    assert.equal(starts.length, 0);
  }
});

test('missing audio, blocked storage and unavailable contexts fail quietly', async () => {
  const { sounds, starts } = fixture({ fetcher: async () => { throw new Error('offline'); }, storage: { getItem() { throw new Error('blocked'); } } });
  await sounds.preload(); sounds.button(); await flush();
  assert.equal(starts.length, 0);
  const unsupported = new SoundEffects({ contextFactory: () => { throw new Error('unavailable'); } });
  await unsupported.preload(); await unsupported.unlock(); unsupported.button();
  assert.equal(unsupported.supported, false);
});

test('all shipped samples are short mono PCM WAV files without full-scale clipping', async () => {
  for (const path of Object.values(AUDIO_FILES)) {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    let format, data;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const name = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
      if (name === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + length);
      if (name === 'data') data = bytes.subarray(offset + 8, offset + 8 + length);
      offset += 8 + length + (length % 2);
    }
    assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(2), 1);
    assert.equal(format.readUInt32LE(4), 44100); assert.equal(format.readUInt16LE(14), 16);
    assert.ok(data.length > 0 && data.length / (44100 * 2) < .25);
    for (let index = 0; index < data.length; index += 2) assert.ok(Math.abs(data.readInt16LE(index)) < 20000);
  }
});
