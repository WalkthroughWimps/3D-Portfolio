import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { getMidiStateAtElapsed } from '../_5-music/midi-seek-state.mjs';

const events = [
  { timeMs: 0, type: 'on', note: 60, chan: 0, velocity: 90 },
  { timeMs: 10, type: 'cc64', chan: 0, value: 127 },
  { timeMs: 20, type: 'on', note: 60, chan: 1, velocity: 70 },
  { timeMs: 30, type: 'off', note: 60, chan: 0 },
  { timeMs: 40, type: 'cc64', chan: 0, value: 0 },
  { timeMs: 50, type: 'cc64', chan: 1, value: 127 },
  { timeMs: 60, type: 'off', note: 60, chan: 1 },
  { timeMs: 70, type: 'cc64', chan: 1, value: 0 }
];

test('forward and backward seeks reconstruct note and pedal state at event boundaries', () => {
  const at = ms => getMidiStateAtElapsed(events, ms, time => time);
  assert.deepEqual([at(25).nextIndex, at(25).heldNotes.map(e => e.chan), at(25).sustainDown], [3, [0, 1], true]);
  assert.deepEqual([at(45).nextIndex, at(45).heldNotes.map(e => e.chan), at(45).sustainDown], [5, [1], false]);
  assert.deepEqual([at(55).nextIndex, at(55).heldNotes.map(e => e.chan), at(55).sustainDown], [6, [1], true]);
  assert.deepEqual([at(75).nextIndex, at(75).heldNotes.length, at(75).sustainDown], [8, 0, false]);
  assert.deepEqual([at(10).nextIndex, at(10).heldNotes.map(e => e.chan), at(10).sustainDown], [2, [0], true]);
});

test('adjusted playback clock determines the next event after seeking', () => {
  const state = getMidiStateAtElapsed(events, 105, time => time * 2);
  assert.equal(state.nextIndex, 6);
  assert.equal(state.sustainDown, true);
  assert.deepEqual(state.heldNotes.map(e => e.chan), [1]);
});

test('track seek preserves the video instance and playback state while rebasing the MIDI cursor', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function seekTrackToRatio(ratio){');
  const end = source.indexOf('function getTrackVideoElements(key){', start);
  assert.ok(start >= 0 && end > start);
  for (const playing of [true, false]) {
    const calls = [];
    const oldVideo = { identity: 'selected track' };
    const oldSource = { onended: () => calls.push('stale end') };
    const context = {
      audioCtx: { currentTime: 10 }, audioReady: true, midiLoaded: true,
      getTrackDurationSec: () => 100, audioPlaying: playing, playingMIDI: playing,
      audioSource: oldSource, ignoreAudioEndedOnce: true,
      disposeAudioSource: () => { assert.equal(oldSource.onended, null); calls.push('dispose'); },
      stopAllNotesAndPedal: () => calls.push('panic'),
      suppressedNoteOffEvents: new Set([3]), suppressNoteEventsUntilMs: 200,
      savedAudioPosSec: 0, getMidiElapsedMsForAudioPos: sec => sec * 1000,
      midiStartCtxTime: 0, transportStartAudioTime: 0,
      rebuildNoteStateAtElapsed: () => 42,
      midiIndex: 0, midiFirstNoteMs: 0,
      rebuildFallingNotesAtElapsed: () => calls.push('falling notes'),
      playbackPaused: !playing, pausedTransportSec: 0, pausedMidiElapsedMs: 0,
      startAudio: () => calls.push('start audio'), audioStartCtxTime: 0,
      trackVideo: { active: true, key: 'baby', hqVideo: oldVideo }, currentTrackKey: 'baby',
      syncTrackVideoToPlayback: autoplay => calls.push(`video ${autoplay}`),
      startTrackVideoPlayback: () => calls.push('reload video'),
      getVisualNowSec: () => 40, setBackboardViewMode: () => {},
      updatePlayButton: () => {}, updateDisabledKeysForConfig: () => {}, renderTopPadGrid: () => {}
    };
    runInNewContext(`${source.slice(start, end)}\nseekTrackToRatio(0.4);`, context);
    assert.equal(context.savedAudioPosSec, 40);
    assert.equal(context.midiIndex, 42);
    assert.equal(context.playbackPaused, !playing);
    assert.equal(context.trackVideo.hqVideo, oldVideo);
    assert.equal(context.suppressedNoteOffEvents.size, 0);
    assert.ok(!calls.includes('reload video'));
    assert.deepEqual(calls.filter(call => call.startsWith('video ')), [`video ${playing}`]);
    assert.equal(calls.includes('start audio'), playing);
  }
});

test('Music presentation follows camera focus, not ordinary track playback', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('let musicVideoPresentationActive = false;');
  const end = source.indexOf('const TOPPAD_ZOOM_MS', start);
  assert.ok(start >= 0 && end > start);
  const events = [];
  const context = {
    topPadVideo: { mode: 'idle', focused: false },
    trackVideo: { active: true },
    window: { dispatchEvent: event => events.push(event.detail) },
    CustomEvent: class { constructor(_type, options) { this.detail = options.detail; } }
  };
  createContext(context);
  runInContext(`${source.slice(start, end)}\nupdateMusicVideoPresentation();`, context);
  assert.equal(events.length, 0);
  context.topPadVideo.mode = 'zooming';
  context.topPadVideo.focused = true;
  runInContext('updateMusicVideoPresentation();', context);
  assert.equal(events.at(-1).source, 'music');
  assert.equal(events.at(-1).active, true);
  context.topPadVideo.mode = 'playing';
  runInContext('updateMusicVideoPresentation();', context);
  assert.equal(events.length, 1);
  context.topPadVideo.focused = false;
  runInContext('updateMusicVideoPresentation();', context);
  assert.equal(events.at(-1).active, false);
  assert.equal(events.length, 2);
});

test('recorded track starts without a sampled keyboard instrument', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function startMIDIPlayback(){');
  const end = source.indexOf('function advanceMIDI(elapsedMs){', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const context = {
    instrumentPlayer: null, midiLoaded: true, playingMIDI: false, audioCtx: { state: 'suspended', currentTime: 4, resume: () => calls.push('resume') },
    safeRun: fn => fn(), playbackPaused: true, pausedTransportSec: 1, pausedMidiElapsedMs: 1000,
    suppressedNoteOffEvents: new Set([60]), clearAllKeyGlow: () => {}, resetPlaybackVisuals: () => {},
    setBackboardViewMode: () => {}, disposeAudioSource: () => {}, savedAudioPosSec: 3, midiIndex: 8,
    resetKeys: () => {}, getSyncOffsetMs: () => 0, midiFirstNoteMs: 0, SONG_LEAD_IN_SEC: 0,
    buildPendingNotes: () => calls.push('notes'), startAudio: () => calls.push('audio'),
    startTrackVideoPlayback: () => calls.push('video'), currentTrackKey: 'baby',
    console: { log: () => {} }
  };
  runInNewContext(`${source.slice(start, end)}\nstartMIDIPlayback();`, context);
  assert.deepEqual(calls, ['resume', 'notes', 'audio', 'video']);
  assert.equal(context.playingMIDI, true);
  assert.equal(context.playbackPaused, false);
  assert.equal(context.savedAudioPosSec, 0);
  assert.equal(context.suppressedNoteOffEvents.size, 0);
});

test('default piano starts only after module state is initialized', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function loadDefaultInstrument(){');
  const end = source.indexOf('function ensureAudio(){', start);
  const bootstrap = source.lastIndexOf("if(document.readyState === 'complete') loadDefaultInstrument();");
  assert.ok(start >= 0 && end > start && bootstrap > source.indexOf('const NoteEngine = {'));
  assert.ok(bootstrap > source.indexOf('const instrumentPlayersBySide = {'));
  const loaded = [];
  const context = {
    document: { readyState: 'complete' }, window: { addEventListener: () => {} },
    musicPageDisposed: false, musicPageSignal: null, instrumentPlayer: null, currentInstrumentName: null,
    loadInstrument: id => { loaded.push(id); return Promise.resolve({}); },
    console: { warn: () => {} }
  };
  runInNewContext(`${source.slice(start, end)}\n${source.slice(bootstrap)}`, context);
  assert.deepEqual(loaded, ['keys_acoustic_piano']);
});
