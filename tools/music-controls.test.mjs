import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const controlsSource = readFileSync(new URL('../_7-shared-scripts/media/controls-input.js', import.meta.url), 'utf8');
const musicSource = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');

function sourceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let depth = 0;
  const brace = source.indexOf('{', start);
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

test('Music seek accepts a larger target while default shared controls retain their hit size', () => {
  const createControlsInput = runInNewContext(`${controlsSource.replace('export function', 'function')}\ncreateControlsInput`);
  const layout = () => ({
    back: { x: 0, y: 0, w: 10, h: 10 }, play: { x: 12, y: 0, w: 10, h: 10 },
    mute: { x: 24, y: 0, w: 10, h: 10 }, help: { x: 90, y: 0, w: 10, h: 10 },
    tablet: { x: 110, y: 0, w: 10, h: 10 }, fullscreen: { x: 120, y: 0, w: 10, h: 10 },
    speed: { x: 130, y: 0, w: 10, h: 10 }, pitch: { x: 140, y: 0, w: 10, h: 10 },
    syncDecrease: { x: 150, y: 0, w: 10, h: 10 }, syncIncrease: { x: 160, y: 0, w: 10, h: 10 },
    syncSlider: { x: 170, y: 0, w: 10, h: 5 }, barH: 20,
    progress: { x: 20, y: 90, w: 160, h: 4 },
    volumeSlider: { x: 40, y: 65, w: 80, h: 4 }, speedStops: []
  });
  const base = {
    getState: () => ({ canSeek: true, syncMs: 0 }), getLayout: layout,
    getControlAvailability: () => ({ seek: true }), getViewportRect: () => null,
    isSpeedExpanded: () => false, snapSyncMs: value => value
  };
  const standard = createControlsInput(base);
  const music = createControlsInput({ ...base, seekHitPadding: 18, showVolumeSlider: true });
  const hit = (input, x, y) => input.inspectPointerEvent({ canvasX: x, canvasY: y }, { canvasWidth: 200, canvasHeight: 100 });
  assert.equal(hit(standard, 100, 76).hit, false);
  assert.equal(hit(music, 100, 76).control, 'seek');
  assert.equal(hit(standard, 100, 67).control, 'volume');
  assert.equal(hit(music, 100, 67).control, 'volume');
});

test('Music inline audio controls use the same site volume and sync paths as the side controls', () => {
  const calls = [];
  const trackVideo = { active: true };
  let options;
  const state = {
    trackVideo,
    MUSIC_SCREEN_THEME: {},
    createVideoControlsUI: value => { options = value; return {}; },
    requestMusicSiteAudio: (volume, muted, active) => calls.push(['volume', volume, muted, active()]),
    normalizeSyncOffset: value => Math.max(-3000, Math.min(3000, value)),
    setSyncOffsetMs: value => calls.push(['sync', value])
  };
  runInNewContext(`${sourceFunction(musicSource, 'ensureTrackVideoUi')}\nensureTrackVideoUi();`, state);
  assert.equal(options.showVolumeSlider, true);
  trackVideo.ui.onAction({ type: 'setVolume', volume: .42 });
  trackVideo.ui.onAction({ type: 'setSyncMs', value: 375 });
  trackVideo.ui.onAction({ type: 'setSyncMs', value: NaN });
  assert.deepEqual(calls, [['volume', .42, false, true], ['sync', 375]]);
  assert.equal((musicSource.match(/sync: true/g) || []).length, 2);
  assert.equal(musicSource.includes('showVolumeSlider: false'), false);
});

test('sync changes rebase playing and paused MIDI without replacing the audio source', () => {
  const fn = sourceFunction(musicSource, 'onMusicSyncOffsetChanged');
  for (const paused of [false, true]) {
    const calls = [];
    const audioSource = { id: 'same source' };
    const state = {
      musicPageDisposed: false, audioCtx: { currentTime: 12 }, midiLoaded: true,
      audioPlaying: !paused, playingMIDI: !paused, playbackPaused: paused,
      audioSource, getPlaybackPositionSec: () => 3,
      getMidiElapsedMsForAudioPos: () => 4600,
      midiStartCtxTime: 0, transportStartAudioTime: 0,
      pausedMidiElapsedMs: 0, pausedTransportSec: 0,
      suppressedNoteOffEvents: new Set([1]),
      rebuildNoteStateAtElapsed: ms => { calls.push(['notes', ms]); return 17; },
      midiIndex: 0, midiFirstNoteMs: 600,
      rebuildFallingNotesAtElapsed: sec => calls.push(['falling', sec]),
      syncTrackVideoToPlayback: value => calls.push(['videoPaused', value]),
      updateTrackVideoSync: () => calls.push(['videoPlaying']),
      renderTopPadGrid: () => calls.push(['redraw'])
    };
    runInNewContext(`${fn}\nonMusicSyncOffsetChanged();`, state);
    assert.equal(state.audioSource, audioSource);
    assert.equal(state.midiStartCtxTime, 7.4);
    assert.equal(state.transportStartAudioTime, 7.4);
    assert.equal(state.pausedMidiElapsedMs, 4600);
    assert.equal(state.midiIndex, 17);
    assert.equal(state.suppressedNoteOffEvents.size, 0);
    assert.deepEqual(calls[0], ['notes', 4600]);
    assert.equal(calls[1][0], 'falling');
    assert.ok(Math.abs(calls[1][1] - 4) < 1e-9);
    assert.deepEqual(calls[2], paused ? ['videoPaused', false] : ['videoPlaying']);
  }
});

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  addScaledVector(v, n) { return this.add(v.clone().multiplyScalar(n)); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(v) { return new Vec3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
  distanceTo(v) { return this.clone().sub(v).length(); }
  distanceToSquared(v) { const d = this.clone().sub(v); return d.dot(d); }
  applyMatrix4() { return this; }
  applyQuaternion() { return this; }
}

test('video aperture maps through UVs and fits in both landscape and portrait cameras', () => {
  const attributes = values => ({ count: values.length, getX: i => values[i][0], getY: i => values[i][1], getZ: i => values[i][2] || 0 });
  const geometry = {
    attributes: {
      uv: attributes([[0, 0], [1, 0], [1, 1], [0, 1]]),
      position: attributes([[-2, -1, 0], [2, -1, 0], [2, 1, 0], [-2, 1, 0]])
    },
    index: { count: 6, getX: i => [0, 1, 2, 0, 2, 3][i] },
    boundingBox: {
      min: new Vec3(-2, -1, 0), max: new Vec3(2, 1, 0),
      getCenter: () => new Vec3(), getSize: () => new Vec3(4, 2, 0)
    }
  };
  const mesh = { geometry, matrixWorld: { decompose: (_p, _q, s) => { s.x = s.y = s.z = 1; } }, updateWorldMatrix: () => {} };
  const THREE = {
    Vector3: Vec3, Quaternion: class {},
    Box3: class { setFromObject() { return this; } getCenter() { return new Vec3(); } getSize() { return new Vec3(4, 2, 0); } },
    MathUtils: { degToRad: degrees => degrees * Math.PI / 180 }
  };
  const context = {
    topPadMesh: mesh, topPadCanvas: { width: 1000, height: 1000 },
    topPadUvRemap: { repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0, swap: false, mirrorU: false, mirrorV: false },
    topPadVideo: { videoRect: { x: 250, y: 250, w: 500, h: 500 } },
    TOPPAD_GRID_COLS: 12, TOPPAD_GRID_ROWS: 12,
    cam: { position: new Vec3(0, 0, 8), up: new Vec3(0, 1, 0), fov: 60, aspect: 2 },
    setTabletStandVideoFocusAngle: () => {}, THREE
  };
  const functions = `${sourceFunction(musicSource, 'topPadWorldPointAtCanvasPixel')}\n${sourceFunction(musicSource, 'getTopPadPlayerRect')}\n${sourceFunction(musicSource, 'computeTopPadZoomTarget')}`;
  const target = runInNewContext(`${functions}\ncomputeTopPadZoomTarget()`, context);
  assert.ok(Math.abs(target.target.x) < 1e-9 && Math.abs(target.target.y) < 1e-9);
  assert.ok(target.position.z > .5 && target.position.z < 1.2);
  context.cam.aspect = 0.5;
  const portrait = runInNewContext(`${functions}\ncomputeTopPadZoomTarget()`, context);
  assert.ok(portrait.position.z > target.position.z * 3);
  context.topPadUvRemap = { repeatU: 2, repeatV: 2, offsetU: -0.5, offsetV: -0.5, swap: false, mirrorU: true, mirrorV: false };
  const mapped = runInNewContext(`${functions}\ntopPadWorldPointAtCanvasPixel(250, 750)`, context);
  assert.ok(Math.abs(mapped.x - 0.5) < 1e-9);
  assert.ok(Math.abs(mapped.y - 0.25) < 1e-9);
});
