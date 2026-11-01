import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'espree';
import {sampleScreenTransition} from '../_5-music/music-screen-layout.mjs';
import {layoutSelectedMusicTrackIcons} from '../_5-music/music-track-icon-layout.mjs';
import {videoSourceTimeForAudioPosition} from '../_5-music/music-track-timing.mjs';
import {followRecordedVideo} from '../_5-music/music-video-follow.mjs';

const source=readFileSync(new URL('../_5-music/music-piano-controls.v2.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',range:true});
const functions=(...names)=>names.map(name=>source.slice(...ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name).range)).join('\n');
const metadata=ast.body.flatMap(n=>n.declarations||[]).find(n=>n.id?.name==='TRACKS');
const TRACKS=vm.runInNewContext(`(${source.slice(...metadata.init.range)})`,{assetUrl:x=>x});

test('chooser paints its final interactive state even if the next frame misses the animation deadline',()=>{
  const transition={from:1,to:0,start:100,duration:420};
  const circles=Array.from({length:6},(_,i)=>({x:50+(i%2)*150,y:100+Math.floor(i/2)*130,r:40}));
  assert(sampleScreenTransition(transition,500)>0);
  assert.equal(transition.duration,420,'another frame is still needed');
  const progress=sampleScreenTransition(transition,575);
  assert.equal(progress,0);
  assert.equal(transition.duration,0,'only the painted final frame clears redraw demand');
  const result=layoutSelectedMusicTrackIcons(circles,{selectedIndex:2,progress,leftW:400,height:614});
  assert(result.every(c=>c.interactive&&c.r>0));
});

test('actual chooser frame gate keeps animation dirty until sampling settles it',()=>{
  const animate=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='animate');
  const frame=animate.body.body.find(n=>n.type==='IfStatement'&&n.test.name==='root');
  const drawGate=frame.consequent.body.find(n=>n.type==='IfStatement'&&source.slice(...n.test.range).includes('musicTrackIconTransition'));
  const expression=source.slice(...drawGate.test.range);
  const state={topPadVideo:{mode:'idle'},trackVideo:{active:false},musicWelcome:true,audioPlaying:false,playingMIDI:false,
    musicVideoLayoutTransition:{duration:0},musicTrackIconTransition:{from:1,to:0,start:0,duration:420},performance:{now:()=>1000}};
  assert.equal(vm.runInNewContext(expression,state),true);
  sampleScreenTransition(state.musicTrackIconTransition,1000);
  assert.equal(vm.runInNewContext(expression,state),false);
});

test('Baby WAV video mapping follows matching musical landmarks rather than file-length ratios',()=>{
  const context={TRACKS,currentTrackKey:'baby',loadedTrackAudioUrl:'/music/Baby.wav',audioTrimMs:0,getSyncOffsetMs:()=>0,videoSourceTimeForAudioPosition};
  const code=functions('getTrackVideoTiming','getTrackVideoTargetTime');
  // Independent spectral matches to the video's companion audio, start to ending.
  for(const [audio,video] of [[2,3.309],[30.778,34.708],[59.556,66.099],[88.335,97.5],[107.52,118.418]]){
    const target=vm.runInNewContext(code+`\ngetTrackVideoTargetTime(${audio});`,context);
    assert(Math.abs(target-video)<.025,`${audio}s -> ${target}s matches ${video}s`);
  }
  context.loadedTrackAudioUrl='/music/Baby.mp3';
  assert(Math.abs(vm.runInNewContext(code+'\ngetTrackVideoTargetTime(60);',context)-59.982)<1e-9);
  context.currentTrackKey='forests';
  assert.equal(vm.runInNewContext(code+'\ngetTrackVideoTargetTime(120);',context),120.08);
  context.currentTrackKey='raisins';
  assert.equal(vm.runInNewContext(code+'\ngetTrackVideoTargetTime(60);',context),60.034);
});

function videoFixture(){
  const seeks=[],rates=[];
  let time=0,rate=1;
  const video={duration:200,readyState:2,seeking:false,paused:true,ended:false,
    get currentTime(){return time;},set currentTime(value){time=value;seeks.push(value);},
    get playbackRate(){return rate;},set playbackRate(value){rate=value;rates.push(value);},
    pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}};
  return {video,seeks,rates};
}

test('large startup lag recovers directly and never repeatedly seeks while decoding',()=>{
  const {video,seeks}=videoFixture(),state={};
  followRecordedVideo(video,{targetTime:20,rate:1.0908,playing:true,nowMs:100},state);
  assert.deepEqual(seeks,[20]);assert.equal(video.playbackRate,1.0908);assert.equal(video.paused,false);
  video.seeking=true;
  for(let now=110;now<2000;now+=16)followRecordedVideo(video,{targetTime:20+(now-100)/1000,rate:1.0908,playing:true,nowMs:now},state);
  assert.deepEqual(seeks,[20]);
  video.seeking=false;
  followRecordedVideo(video,{targetTime:22,rate:1.0908,playing:true,nowMs:2100},state);
  assert.deepEqual(seeks,[20,22]);
});

test('ordinary drift uses gentle mapped-rate correction; pause, pre-roll and tail hold still',()=>{
  const {video,seeks}=videoFixture(),state={};
  followRecordedVideo(video,{targetTime:.08,rate:2.1816,playing:true,nowMs:0},state);
  assert.equal(seeks.length,0);
  assert(video.playbackRate>2.1816&&video.playbackRate<2.1816*1.061);
  followRecordedVideo(video,{targetTime:40,rate:2.1816,playing:false,seek:true,nowMs:20},state);
  assert.equal(video.currentTime,40);assert.equal(video.paused,true);
  followRecordedVideo(video,{targetTime:-.1,rate:1,playing:true,nowMs:100},state);
  assert.equal(video.paused,true);
  followRecordedVideo(video,{targetTime:210,rate:1,playing:true,nowMs:200},state);
  assert.equal(video.paused,true);assert.equal(video.currentTime,200);
});

test('runtime follows source mapping on starts and updates without changing audio or MIDI',()=>{
  const {video}=videoFixture();
  const context={TRACKS,currentTrackKey:'baby',loadedTrackAudioUrl:'baby.wav',audioTrimMs:0,
    trackVideo:{active:true,hqVideo:video},audioCtx:{currentTime:10},audioStartCtxTime:1,
    audioPlaying:true,playingMIDI:true,playbackPaused:false,currentPlaybackRate:1.6,
    getPlaybackPositionSec:()=>60,getSyncOffsetMs:()=>-270,videoSourceTimeForAudioPosition,
    followRecordedVideo,setPreservePitchFlag:()=>{},performance:{now:()=>100},
    midiIndex:100,midiStartCtxTime:4,audioSource:{id:'unchanged'}};
  const code=functions('getTrackVideoTiming','getTrackVideoTargetTime','syncTrackVideoToPlayback','updateTrackVideoSync');
  vm.runInNewContext(code+'\nsyncTrackVideoToPlayback(true);updateTrackVideoSync();',context);
  assert(Math.abs(video.currentTime-(60*1.0908+1.135-.27))<1e-9);
  assert(Math.abs(video.playbackRate-1.6*1.0908)<1e-9);
  assert.equal(context.midiIndex,100);assert.equal(context.midiStartCtxTime,4);assert.equal(context.audioSource.id,'unchanged');
});

test('a stalled explicit seek resets the decoder once and waits for its fixed target frame',()=>{
  const timers=new Map();let timerId=0,loads=0,resumes=0;
  const video=new EventTarget();
  Object.assign(video,{duration:100,currentTime:0,seeking:true,readyState:1,paused:false,
    pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},
    load(){loads++;this.dispatchEvent(new Event('loadedmetadata'));}});
  const state={trackVideo:{active:true,hqVideo:video},getTrackVideoTargetTime:()=>20,
    trackSeekGeneration:0,trackLoadGeneration:1,cancelPendingTrackSeek:null,musicPageSignal:null,
    musicPageDisposed:false,savedAudioPosSec:20,
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),queueMicrotask:()=>{},resume:()=>resumes++};
  vm.runInNewContext(functions('prepareTrackVideoSeek')+'\nprepareTrackVideoSeek(20,resume);',state);
  const recovery=[...timers.values()].find(t=>t.ms===300);
  assert(recovery);recovery.fn();
  assert.equal(loads,1);assert.equal(video.currentTime,20);assert.equal(resumes,0);
  video.seeking=false;video.readyState=4;video.dispatchEvent(new Event('seeked'));
  assert.equal(resumes,1);assert.equal(video.paused,true);assert.equal(timers.size,0);
  video.dispatchEvent(new Event('canplay'));assert.equal(resumes,1);
});
