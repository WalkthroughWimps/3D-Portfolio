import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../_5-music/instruments/dog-bark-player.js', import.meta.url), 'utf8');
const { DOG_BARK_SAMPLES, getDogBarkVoiceForMidi, loadDogBarkPlayer } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('Dog bank decodes eight distinct local WAVs and plays adjacent keys at note rates', async () => {
  const originalFetch = globalThis.fetch;
  const fetched = [];
  const started = [];
  const stopped = [];
  const filters = [];
  const levels = [];
  globalThis.fetch = async url => {
    fetched.push(url);
    const file = url.split('/').at(-1);
    const bytes = readFileSync(new URL(`../assets/audio/${file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  const audioCtx = {
    currentTime: 3,
    destination: {},
    decodeAudioData: async bytes => ({ duration: bytes.byteLength / 44100, bytes }),
    createBiquadFilter: () => {
      const filter = { frequency: {}, gain: {}, Q: {}, connect: () => {}, disconnect: () => {} };
      filters.push(filter);
      return filter;
    },
    createGain: () => {
      const calls = [];
      const level = { gain: { calls, setValueAtTime: (...args) => calls.push(['set', ...args]), linearRampToValueAtTime: (...args) => calls.push(['ramp', ...args]) }, connect: () => {}, disconnect: () => {} };
      levels.push(level);
      return level;
    },
    createBufferSource: () => {
      const source = {
        playbackRate: { value: 1 },
        connect: () => {},
        disconnect: () => {},
        start(when){ started.push({ source, when }); },
        stop(when){ stopped.push(when); }
      };
      return source;
    }
  };
  try{
    const player = await loadDogBarkPlayer(audioCtx, '/assets/audio');
    assert.equal(player.sampleCount, 8);
    assert.equal(fetched.length, 8);
    assert.equal(new Set(fetched).size, 8);
    for(let midi = 36; midi < 44; midi++) player.play(midi, 4, { gainNode: {} });
    assert.ok(new Set(started.map(item => item.source.buffer)).size >= 4, 'nearby keys retain real bark variation');
    assert.ok(started.every(item => item.when === 4 && item.source.playbackRate.value > 0));
    assert.ok(started.every(item => item.source.playbackRate.value >= .5 && item.source.playbackRate.value <= 2));
    assert.equal(filters.length, 16);
    assert.ok(filters.some(filter => filter.type === 'lowpass' && filter.frequency.value === 3800));
    assert.ok(filters.some(filter => filter.type === 'highshelf' && filter.gain.value === -4));
    assert.ok(levels.every(level => level.gain.calls.some(call => call[0] === 'ramp' && call[1] === .72)));
    assert.deepEqual(stopped, [], 'a quick key press does not schedule an early bark cutoff');
    const note = 60;
    const voice = getDogBarkVoiceForMidi(note);
    assert.equal(voice.playbackRate, Math.pow(2, (voice.soundingMidi - DOG_BARK_SAMPLES[voice.index].rootMidi) / 12));
    assert.equal(getDogBarkVoiceForMidi(85).octaveShift, 0, 'a nearby sample preserves the requested octave when possible');
    assert.equal(getDogBarkVoiceForMidi(96).octaveShift, -1, 'extreme top keys fold one octave to keep a bark timbre');
  }finally{
    globalThis.fetch = originalFetch;
  }
});

test('Dog bank rejects incomplete sample loads', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try{
    await assert.rejects(loadDogBarkPlayer({ decodeAudioData: async () => ({ duration: 1 }) }, '/missing'), /sample failed: 404/);
  }finally{
    globalThis.fetch = originalFetch;
  }
});
