import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'espree';
import { midiElapsedForAudioPosition, videoTimeForAudioPosition } from '../_5-music/music-track-timing.mjs';

const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
const ast = parse(source, {ecmaVersion:'latest',sourceType:'module',range:true});
const functions = (...names) => names.map(name => {
  const node = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert(node, name);
  return source.slice(...node.range);
}).join('\n');
const tracksNode = ast.body.flatMap(node => node.declarations || []).find(node => node.id?.name === 'TRACKS');
const TRACKS = vm.runInNewContext(`(${source.slice(...tracksNode.init.range)})`, {assetUrl:value=>value});
const settingsSources = ['preferences.js','settings-schema.js','settings.js'].map(file =>
  readFileSync(new URL(`../_7-shared-scripts/core/${file}`,import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,''));
const createSettingsStore = vm.runInNewContext(`${settingsSources.join('\n')}\ncreateSettingsStore`, {TRANSFORM_RESET_EASINGS:[]});

test('per-song calibration persists through the shared settings store and leaves global video sync alone', () => {
  const persisted = new Map();
  const preferences = {getItem:key=>persisted.get(key)??null,setItem:(key,value)=>persisted.set(key,value),removeItem:key=>persisted.delete(key)};
  let store = createSettingsStore({preferences});
  store.patch({audio:{syncMs:-275}});
  const context = vm.createContext({getSharedSettings:()=>store,currentTrackKey:'woods',
    SYNC_OFFSET_STEP:5,SYNC_OFFSET_MIN:-3000,SYNC_OFFSET_MAX:3000});
  vm.runInContext(functions('clampSyncOffset','normalizeSyncOffset','getTrackMidiSyncOffsetMs','setTrackMidiSyncOffsetMs'),context);
  vm.runInContext('setTrackMidiSyncOffsetMs(123);',context);
  assert.equal(vm.runInContext('getTrackMidiSyncOffsetMs()',context),125);
  context.currentTrackKey='raisins';
  assert.equal(vm.runInContext('getTrackMidiSyncOffsetMs()',context),0);
  vm.runInContext('setTrackMidiSyncOffsetMs(-80);',context);
  store.dispose();
  store=createSettingsStore({preferences});
  assert.equal(vm.runInContext('getTrackMidiSyncOffsetMs()',context),-80);
  context.currentTrackKey='woods';
  assert.equal(vm.runInContext('getTrackMidiSyncOffsetMs()',context),125);
  assert.equal(store.get().audio.syncMs,-275);
  assert.equal(store.patch({music:{midiSyncOffsets:'{"woods":99999}'}}).ok,false);
  assert.equal(store.patch({music:{midiSyncOffsets:'{"__proto__":15}'}}).ok,false);
  store.dispose();
});

test('positive and negative MIDI corrections have the same source-time effect at all playback speeds', () => {
  for(const rate of [.75,.85,1,1.2,1.6,2]){
    for(const syncMs of [-3000,-125,0,80,3000]){
      const first=5,onset=54,rawNote=140000;
      const audioPosition=(rawNote-first+onset-syncMs)/1000;
      const expected=first+(rawNote-first)/rate;
      assert.ok(Math.abs(midiElapsedForAudioPosition(audioPosition,first,onset,rate,syncMs)-expected)<1e-8);
    }
  }
  assert.equal(videoTimeForAudioPosition(20,0,-275),19.725);
});

test('all four tracks use prepared MIDI and retain their intended musical timing', () => {
  const presets={baby:{first:234.4265625,onset:236,offset:0},forests:{first:0,onset:20,offset:0},
    raisins:{first:0,onset:60,offset:960},woods:{first:4.6875,onset:54,offset:54-4.6875}};
  for(const [song,preset] of Object.entries(presets)){
    const files=Array.isArray(TRACKS[song].midi)?TRACKS[song].midi:[TRACKS[song].midi];
    assert.ok(files.every(file=>file.includes(`/midi/prepared/${song}/`)));
    assert.equal(TRACKS[song].preserveMidiTempo,true);
    for(const rate of [.75,1,2]){
      const context={TRACKS,currentTrackKey:song,midiFirstNoteMs:preset.first,audioOnsetMs:preset.onset,
        audioTrimMs:0,currentPlaybackRate:rate,getTrackMidiSyncOffsetMs:()=>0,midiElapsedForAudioPosition};
      for(const rawNote of [1000,30000,90000]){
        const result=vm.runInNewContext(`${functions('getTrackMidiOnsetMs','getMidiElapsedMsForAudioPos')}\ngetMidiElapsedMsForAudioPos(${(rawNote+preset.offset)/1000})`,context);
        assert.ok(Math.abs(result-(preset.first+(rawNote-preset.first)/rate))<1e-8,`${song} at ${rate}`);
      }
    }
  }
});

test('live sync rebuilds the MIDI state without restarting audio or seeking video, including paused and scheduled starts', () => {
  for(const mode of ['playing','paused','scheduled']){
    const sourceIdentity={identity:'same decoded source'},video={currentTime:12};
    const calls=[];
    const context={audioCtx:{currentTime:20},audioReady:true,midiLoaded:true,audioPlaying:mode!=='paused',
      playingMIDI:mode!=='paused',playbackPaused:mode==='paused',audioStartCtxTime:mode==='scheduled'?20.2:10,
      currentPlaybackRate:1.6,savedAudioPosSec:mode==='paused'?16:0,audioSource:sourceIdentity,trackVideo:{hqVideo:video},
      midiFirstNoteMs:5,suppressedNoteOffEvents:new Set([1]),suppressNoteEventsUntilMs:99999,
      getMidiElapsedMsForAudioPos:position=>midiElapsedForAudioPosition(position,5,54,1.6,250),
      rebuildNoteStateAtElapsed:elapsed=>{calls.push(['notes',elapsed]);return 42;},
      rebuildFallingNotesAtElapsed:elapsed=>calls.push(['falling',elapsed]),
      getVisualNowSec:()=>0,renderTopPadGrid:()=>calls.push(['redraw'])};
    vm.runInNewContext(functions('getPlaybackPositionSec','applyTrackMidiSync')+'\napplyTrackMidiSync();',context);
    const position=mode==='scheduled'?0:16;
    const elapsed=midiElapsedForAudioPosition(position,5,54,1.6,250);
    assert.equal(context.midiIndex,42);
    assert.equal(context.audioSource,sourceIdentity);
    assert.equal(context.audioStartCtxTime,mode==='scheduled'?20.2:10);
    assert.equal(context.savedAudioPosSec,mode==='paused'?16:0);
    assert.equal(video.currentTime,12);
    assert.equal(context.suppressedNoteOffEvents.size,0);
    assert.equal(context.suppressNoteEventsUntilMs,0);
    assert.ok(Math.abs(context.midiStartCtxTime-((mode==='scheduled'?20.2:20)-elapsed/1000))<1e-9);
    if(mode==='paused') assert.equal(context.pausedMidiElapsedMs,elapsed);
    assert.equal(calls[0][1],elapsed);
  }
});

test('fresh starts and resume/seek clocks apply identical calibration at every speed', () => {
  for(const rate of [.75,1,2]) for(const sync of [-125,0,200]){
    const context={midiLoaded:true,playingMIDI:false,audioCtx:{currentTime:10,state:'running'},playbackPaused:false,
      suppressedNoteOffEvents:new Set(),clearAllKeyGlow(){},resetPlaybackVisuals(){},setBackboardViewMode(){},
      disposeAudioSource(){},resetKeys(){},midiFirstNoteMs:5,SONG_LEAD_IN_SEC:0,currentPlaybackRate:rate,
      getTrackMidiOnsetMs:()=>54,getTrackMidiSyncOffsetMs:()=>sync,audioTrimMs:0,audioOnsetMs:54,
      buildPendingNotes(){},startAudio(){},startTrackVideoPlayback(){},currentTrackKey:'woods',console:{log(){}}};
    vm.runInNewContext(functions('startMIDIPlayback')+'\nstartMIDIPlayback();',context);
    const elapsedAtStart=(context.audioStartCtxTime-context.midiStartCtxTime)*1000;
    assert.ok(Math.abs(elapsedAtStart-midiElapsedForAudioPosition(0,5,54,rate,sync))<1e-8);
  }
});
