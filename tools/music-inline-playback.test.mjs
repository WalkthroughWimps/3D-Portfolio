import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {getMidiStateAtElapsed} from '../_5-music/midi-seek-state.mjs';

const source=readFileSync(new URL('../_5-music/music-piano-controls.v2.js',import.meta.url),'utf8');
function extract(name){
  const start=source.indexOf(`function ${name}(`);
  const prefix=source.slice(start-6,start)==='async '?'async ':'';
  let parens=0,brace;
  for(let i=source.indexOf('(',start);i<source.length;i++){
    if(source[i]==='(') parens++;
    if(source[i]===')'&&--parens===0){brace=source.indexOf('{',i+1);break;}
  }
  let depth=0;
  for(let i=brace;i<source.length;i++){
    if(source[i]==='{') depth++;
    if(source[i]==='}'&&--depth===0) return prefix+source.slice(start,i+1);
  }
  throw Error(name);
}
const noop=()=>{};

test('audio-only tracks redraw usable controls after stopping, including their Back button',()=>{
  let redraws=0;
  const state={musicAudioRequestGeneration:0,trackVideo:{active:false,ui:{dispose:noop},keyboardFocused:true},
    disposeMusicVideoControls(owner){owner.ui=null;},renderTopPadGrid(){redraws++;}};
  runInNewContext(extract('stopTrackVideoPlayback')+'\nstopTrackVideoPlayback();',state);
  assert.equal(redraws,1);
  assert.equal(state.trackVideo.keyboardFocused,false);
  assert.equal(state.trackVideo.ui,null);
});

test('selection waits for both assets, autoplays inline, and rejects stale or cancelled requests',async()=>{
  for(const scenario of ['play','welcome','change','back','suspend','error']){
    const pending=[],started=[];
    const context={TRACKS:{baby:{audio:'baby.wav',midi:'baby.mid'},woods:{audio:'woods.wav',midi:'woods.mid'}},
      trackLoadGeneration:0,trackSeekGeneration:0,pendingTrackAutoplay:null,cancelPendingTrackSeek:null,
      topPadVideo:{mode:'idle'},musicPageDisposed:false,musicPageSuspended:false,
      suppressedNoteOffEvents:new Set(),console:{log:noop,warn:noop},
      ensureAudioContextRunning:noop,disposeAudioSource:noop,markMidiNoteSpansDirty:noop,
      stopAllNotesAndPedal:noop,updatePlayButton:noop,stopTrackVideoPlayback:noop,
      startTrackVideoPlayback:noop,updateTrackButtons:noop,renderTopPadGrid:noop,
      startMIDIPlayback(){started.push(context.currentTrackKey);},
      loadTrackAudio(){return new Promise(resolve=>pending.push(()=>{context.audioReady=true;resolve();}));},
      loadMIDI(){return new Promise(resolve=>pending.push(()=>{context.midiLoaded=true;resolve();}));}
    };
    runInNewContext(extract('selectTrack')+`\nrequest=selectTrack('baby',{welcome:${scenario==='welcome'}});`,context);
    pending.shift()(); await Promise.resolve();
    assert.deepEqual(started,[]);
    if(scenario==='change') context.trackLoadGeneration++;
    if(scenario==='back') context.pendingTrackAutoplay=null;
    if(scenario==='suspend') context.musicPageSuspended=true;
    if(scenario==='error') context.audioError=true;
    pending.shift()(); await context.request;
    assert.deepEqual(started,scenario==='play'?['baby']:[]);
    assert.equal(context.topPadVideo.mode,'idle');
  }
});

test('standalone video autoplays without moving camera and stale canplay cannot restart it',()=>{
  for(const cancelled of [false,true]){
    const plays=[],listeners={};
    const media=name=>({currentTime:3,readyState:1,pause:noop,load:noop,
      play(){plays.push(name);return Promise.resolve();},addEventListener(type,fn){listeners[type]=fn;}});
    const context={topPadVideo:{mode:'idle',hqVideo:media('video'),audio:media('audio')},
      document:{activeElement:null},renderer:{domElement:{}},stopTopPadPreview:noop,
      musicPageDisposed:false,musicPageSuspended:false,performance:{now:()=>100},
      updateMusicVideoPresentation:noop,renderTopPadGrid:noop,applyStoredAudioSettings:noop,
      applyStoredPitchModeToMusicVideoSurfaces:noop,getSyncOffsetMs:()=>-270,
      computeTopPadZoomTarget(){throw Error('implicit camera focus');},startTopPadZoom(){throw Error('implicit camera motion');}
    };
    runInNewContext(extract('startTopPadVideoPlayback')+'\nstartTopPadVideoPlayback();',context);
    assert.equal(context.topPadVideo.focused,false);
    assert.equal(context.topPadVideo.mode,'playing');
    if(cancelled) context.topPadVideo.playbackGeneration++;
    listeners.canplay();
    assert.deepEqual(plays,cancelled?[]:['video','audio']);
    if(!cancelled) assert.equal(context.topPadVideo.audio.currentTime,.27);
  }
});

test('speed changes retain the next note-off and pedal-up even within the old suppression window',()=>{
  const mesh={rotation:{x:0}},pedal={rotation:{x:0}},counts=new Map();
  const context={
    topPadVideo:{mode:'idle'},trackVideo:{active:false},audioPlaying:true,playingMIDI:true,
    audioCtx:{currentTime:10},currentPlaybackRate:1,midiFirstNoteMs:0,midiStretch:1,
    getPlaybackPositionSec:()=>1,getMidiElapsedMsForAudioPos:pos=>pos*1000/context.currentPlaybackRate,
    midiEvents:[{timeMs:0,type:'on',note:60,chan:0,velocity:90},
      {timeMs:0,type:'cc64',chan:0,value:127},{timeMs:1010,type:'off',note:60,chan:0},
      {timeMs:1020,type:'cc64',chan:0,value:0}],midiIndex:0,
    keyAnimState:new Map([[60,{mesh}]]),activeNotes:new Map(),activeNoteSet:new Set(),disabledKeySet:new Set(),
    clearAllKeyGlow(){counts.clear();},getMidiStateAtElapsed,
    adjustMidiTimeMs:ms=>ms/context.currentPlaybackRate,
    isBlackKey:()=>false,WHITE_MAX:1,BLACK_MAX:1,KEY_PRESS_SIGN:1,VELOCITY_MIN:0,VELOCITY_MAX:127,
    applyKeyGlow(_mesh,note,on){counts.set(note,Math.max(0,(counts.get(note)||0)+(on?1:-1)));},
    getTrackGlowLevel:()=>0,keyActiveCount:counts,
    sustainAnim:{},sustainPedalMesh:pedal,PEDAL_MAX_ANGLE:.3,sustainEventTimes:[0],
    applySustainPedalGlow(on){context.pedalGlow=on;},applySustainState:noop,PEDAL_LOOKAHEAD_MS:50,
    suppressedNoteOffEvents:new Set([2]),suppressNoteEventsUntilMs:9999,performance:{now:()=>100},
    disposeAudioSource:noop,buildPendingNotes:noop,rebuildFallingNotesAtElapsed:noop,startAudio:noop,
    renderTopPadGrid:noop,clampKeyRotation:noop,clearDisabledKeyMaterials:noop,requestBackboardRedraw:noop,
    getInstrumentSideForNote:()=> 'left',isNotePlayable:()=>true,trackDebugUntil:0
  };
  const code=['setPlaybackRate','rebuildNoteStateAtElapsed','advanceMIDI'].map(extract).join('\n');
  runInNewContext(code+'\nsetPlaybackRate(1.6);',context);
  assert.equal(counts.get(60),1);
  assert.equal(context.pedalGlow,true);
  assert.equal(context.suppressNoteEventsUntilMs,0);
  runInNewContext(code+'\nadvanceMIDI(1030/1.6);',context);
  assert.equal(counts.get(60),0);
  assert.equal(context.pedalGlow,false);
  assert.equal(context.sustainKeyDown,false);
});
