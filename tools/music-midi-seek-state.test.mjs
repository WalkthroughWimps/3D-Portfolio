import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { getMidiStateAtElapsed } from '../_5-music/midi-seek-state.mjs';
import { firstAudibleOffsetMs, midiElapsedForAudioPosition, videoTimeForAudioPosition } from '../_5-music/music-track-timing.mjs';

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
  for (const mode of ['playing', 'paused', 'pending']) {
    const playing = mode !== 'paused';
    const calls = [];
    const oldVideo = { identity: 'selected track' };
    const oldSource = { onended: () => calls.push('stale end') };
    const context = {
      audioCtx: { currentTime: 10 }, audioReady: true, midiLoaded: true,
      getTrackDurationSec: () => 100, audioPlaying: mode === 'playing', playingMIDI: mode === 'playing',
      audioSource: oldSource, ignoreAudioEndedOnce: true,
      disposeAudioSource: () => { assert.equal(oldSource.onended, null); calls.push('dispose'); },
      stopAllNotesAndPedal: () => calls.push('panic'),
      suppressedNoteOffEvents: new Set([3]), suppressNoteEventsUntilMs: 200,
      savedAudioPosSec: 0, getMidiElapsedMsForAudioPos: sec => sec * 1000,
      trackSeekGeneration: 0, cancelPendingTrackSeek: mode === 'pending' ? () => calls.push('cancel old seek') : null,
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
    syncSunilBackControl: () => {},
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
    audioOnsetMs: 60, audioTrimMs: 0, currentPlaybackRate: 1,
    getTrackMidiOnsetMs: () => 60, getTrackMidiSyncOffsetMs: () => 0,
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
  assert.ok(Math.abs(context.midiStartCtxTime - context.audioStartCtxTime - .06) < 1e-9);
});

test('seeking shared channels and pitches retains the correct instrument part', () => {
  const parts = [
    {timeMs:0,type:'on',chan:0,note:60,part:'flute'},
    {timeMs:10,type:'on',chan:0,note:60,part:'horn'},
    {timeMs:20,type:'off',chan:0,note:60,part:'horn'},
    {timeMs:40,type:'off',chan:0,note:60,part:'flute'}
  ];
  assert.deepEqual(getMidiStateAtElapsed(parts,25,t=>t).heldNotes.map(e=>e.part),['flute']);
  assert.equal(getMidiStateAtElapsed(parts,45,t=>t).heldNotes.length,0);
});

test('first audible signal uses either channel and preserves first-note alignment at each rate', () => {
  const silent = new Float32Array(1000), audible = new Float32Array(1000);
  audible.fill(.1,80);
  const onset = firstAudibleOffsetMs({sampleRate:1000,length:1000,numberOfChannels:2,getChannelData:i=>i?audible:silent});
  assert.equal(onset,80);
  for(const rate of [.5,1,1.5,2]) assert.equal(midiElapsedForAudioPosition(.08,4.6875,onset,rate),4.6875);
  assert.equal(videoTimeForAudioPosition(10,0,250),10.25);
  assert.equal(videoTimeForAudioPosition(10,120,-250),9.87);
});

test('video seeks hold audio until decoded and never resume a stale selection', async () => {
  const source=readFileSync(new URL('../_5-music/music-piano-controls.v2.js',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('function prepareTrackVideoSeek('),source.indexOf('function seekTrackToRatio('));
  for(const stale of [false,true]) {
    const video=new EventTarget();
    Object.assign(video,{duration:100,currentTime:0,seeking:true,readyState:1,paused:false,
      pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}});
    const calls=[];
    const context={trackVideo:{active:true,hqVideo:video},getTrackVideoTargetTime:pos=>pos,
      trackSeekGeneration:0,trackLoadGeneration:1,cancelPendingTrackSeek:null,musicPageSignal:null,
      musicPageDisposed:false,savedAudioPosSec:40,setTimeout,clearTimeout,queueMicrotask,calls};
    runInNewContext(block+'\nprepareTrackVideoSeek(40,()=>calls.push("resume"));',context);
    assert.equal(video.currentTime,40);
    assert.equal(video.paused,false,'keep the muted decoder running until the sought frame is ready');
    assert.equal(calls.length,0);
    if(stale) context.trackLoadGeneration++;
    video.seeking=false;video.readyState=2;
    video.dispatchEvent(new Event('seeked'));
    video.dispatchEvent(new Event('canplay'));
    await Promise.resolve();
    assert.equal(video.paused,true,'freeze the decoded picture before rebasing the audio clock');
    assert.equal(calls.length,stale?0:1);
    assert.equal(context.cancelPendingTrackSeek,null);
  }
});

test('default piano starts only after module state is initialized', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function loadDefaultInstrument(){');
  const end = source.indexOf('function ensureAudio(){', start);
  const bootstrap = source.lastIndexOf("if(document.readyState === 'complete') loadDefaultInstrument();");
  assert.ok(start >= 0 && end > start && bootstrap > source.indexOf('const NoteEngine = {'));
  assert.ok(bootstrap > source.indexOf('const instrumentPlayersBySide = {'));
  const loaded = [];
  const finished = [];
  const context = {
    document: { readyState: 'complete' }, window: { addEventListener: () => {} },
    musicPageDisposed: false, musicPageSignal: null, instrumentPlayer: null, currentInstrumentName: null,
    SINGLE_INSTRUMENT_SIDE: 'left',
    beginInstrumentLoad: (side, id, label) => { loaded.push(`${side}:${id}:${label}`); return 1; },
    finishInstrumentLoad: (side, generation, player) => finished.push([side, generation, !!player]),
    loadInstrument: id => { loaded.push(id); return Promise.resolve({}); },
    console: { warn: () => {} }
  };
  runInNewContext(`${source.slice(start, end)}\n${source.slice(bootstrap)}`, context);
  assert.deepEqual(loaded, ['left:keys_acoustic_piano:Grand Piano', 'keys_acoustic_piano']);
  return Promise.resolve().then(() => assert.deepEqual(finished, [['left', 1, true]]));
});

test('instrument feedback stays quiet on transitions and reports only attempted unavailable notes', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('const instrumentLoadFeedback = {');
  const end = source.indexOf('const sf2SynthState = {', start);
  assert.ok(start >= 0 && end > start);
  const announcements = [];
  const notice = {
    textContent: '', dataset: {},
    classList: { add: () => {}, remove: () => {} }
  };
  const context = {
    window: {}, document: { getElementById: () => notice },
    musicPageDisposed: false, dualInstrumentMode: true, SINGLE_INSTRUMENT_SIDE: 'left',
    instrumentPlayersBySide: { left: { player: {} }, right: { player: null } },
    instrumentPlayer: null, performance: { now: () => 2000 },
    setTimeout: () => 1, clearTimeout: () => {},
    updateDisabledKeysForConfig: () => {},
    announcements
  };
  runInNewContext(`${source.slice(start, end)}
    announcements.push('idle:' + getInstrumentAvailability('right').state);
    const generation = beginInstrumentLoad('right', 'fx_dog', 'Dog');
    announcements.push(getInstrumentAvailability('right').state);
    announcements.push(document.getElementById('musicInstrumentNotice').textContent);
    notifyUnavailableInstrument('right');
    announcements.push(document.getElementById('musicInstrumentNotice').textContent);
    finishInstrumentLoad('right', generation, null);
    announcements.push(getInstrumentAvailability('right').state);
    announcements.push(document.getElementById('musicInstrumentNotice').textContent);
    announcements.push(getInstrumentAvailability('left').state);
    notifyUnavailableInstrument('right');
    announcements.push(document.getElementById('musicInstrumentNotice').textContent);
    const retry = beginInstrumentLoad('right', 'fx_dog', 'Dog');
    document.getElementById('musicInstrumentNotice').textContent = '';
    document.getElementById('musicInstrumentNotice').dataset.kind = '';
    instrumentPlayersBySide.right.player = {};
    finishInstrumentLoad('right', retry, instrumentPlayersBySide.right.player);
    announcements.push(getInstrumentAvailability('right').state);
    announcements.push(document.getElementById('musicInstrumentNotice').textContent);`, context);
  assert.deepEqual(announcements, [
    'idle:loading', 'loading', '', 'Right: Dog is loading. Try a key again shortly.',
    'failed', 'Right: Dog is loading. Try a key again shortly.', 'loading',
    'Right: Dog could not load. Choose another instrument.', 'ready', ''
  ]);
  assert.ok(announcements.every(message => !message.includes('loaded. Ready to play')),
    'ready transitions never announce that the instrument loaded');
  assert.equal(announcements[3], announcements[5], 'load failure adds no automatic announcement');
  assert.match(announcements[7], /could not load/, 'failure is announced after an attempted note');
});

test('loading instrument state shades keys while track playback keeps its glow path', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function updateDisabledKeysForConfig(){');
  assert.ok(start >= 0);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = bodyStart;
  for(; end < source.length; end++){
    if(source[end] === '{') depth++;
    else if(source[end] === '}' && --depth === 0){ end++; break; }
  }
  assert.ok(end > bodyStart);
  const disabledKeySet = new Set();
  let trackPlayback = false;
  const context = {
    isTrackPlaybackActive: () => trackPlayback,
    disabledKeySet,
    clearDisabledKeyMaterials: () => {},
    window: {}, requestBackboardRedraw: () => {},
    getPlayableNoteRangeForSide: () => ({ minNote: 60, maxNote: 60, id: 'piano' }),
    SINGLE_INSTRUMENT_SIDE: 'left', dualInstrumentMode: false,
    getPlayableKeyIndices: () => null, getQwertyBoundsForGroup: () => null,
    getSplitKeyIndex: () => 0, midiKeyMap: new Map([[60, {}]]),
    getInstrumentAvailability: () => ({ state: 'loading' }),
    updateKeyGlowMaterial: () => {}, getKeyIndexForMidi: () => 0,
    getOwnerSideForKeyIndex: () => 'left',
    qwertyRebuildInProgress: true,
    QWERTY_LOWER_WHITE_CODES: [], QWERTY_UPPER_WHITE_CODES: [],
    qwertyLeftEndIndex: null, qwertyRightStartIndex: null,
    syncQwertyRangesToPlayable: () => {}, lastRangeLogSignature: '',
    console: { log: () => {} }
  };
  runInNewContext(source.slice(start, end) + '\nupdateDisabledKeysForConfig();', context);
  assert.ok(disabledKeySet.has(60), 'a key is disabled while its instrument is loading');
  context.getInstrumentAvailability = () => ({ state: 'ready' });
  runInNewContext(source.slice(start, end) + '\nupdateDisabledKeysForConfig();', context);
  assert.ok(!disabledKeySet.has(60), 'a key is restored when its instrument is ready');
  trackPlayback = true;
  disabledKeySet.add(60);
  runInNewContext(source.slice(start, end) + '\nupdateDisabledKeysForConfig();', context);
  assert.ok(!disabledKeySet.has(60), 'track playback retains the early path that clears disabled-key shading');
});
