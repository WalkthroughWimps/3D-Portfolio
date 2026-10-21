import assert from 'node:assert/strict';
import test from 'node:test';
import {createAudioEngine} from '../_1-about/faces/odd/audio-engine.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const settle = engine => engine.tick(performance.now()+7000);
function setup(t, now) {
  const param = () => ({value: 0, setTargetAtTime(value) {this.value=value;}});
  const node = () => ({gain: param(), frequency: param(), Q: param(), delayTime: param(), threshold: param(), ratio: param(), connect(next) {return next;}, disconnect() {}});
  let context;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  globalThis.AudioContext = class {
    constructor() {context = this; this.currentTime = 10; this.state = 'running'; this.destination = node(); this.sources = [];this.gains=[];}
    createGain() {const gain=node();this.gains.push(gain);return gain;}
    createDynamicsCompressor() {return node();}
    createAnalyser() {return node();}
    createBiquadFilter() {return node();}
    createDelay() {return node();}
    createBuffer(channels,length,rate) {const data=new Float32Array(length);return {length,sampleRate:rate,duration:length/rate,getChannelData:()=>data};}
    createBufferSource() {
      const source = {...node(), playbackRate: param(), start(...args) {this.started = args;}, stop() {this.stopped = true;}};
      this.sources.push(source); return source;
    }
    async resume() {}
    async suspend() {}
    async close() {}
  };
  const engine = createAudioEngine(()=>{},now?{now}:undefined);
  engine.clips.push({id: 'a', lane: 0, start: 0, in: 0, out: 10, rate: 1, buffer: {duration: 10}});
  t.after(() => {engine.dispose(); if (original) Object.defineProperty(globalThis, 'AudioContext', original); else delete globalThis.AudioContext;});
  return {engine, get ctx() {return context;}};
}

test('positive site sync delays audio relative to the visible tape', async t => {
  const s = setup(t); s.engine.setSyncOffsetMs(300); await s.engine.play();
  near(s.ctx.sources[0].started[0], 10.34);
  s.ctx.currentTime = 10.14; near(s.engine.tick().position, .1);
});
test('negative sync retains the sound onset and delays visual tape, including after seeking', async t => {
  const s = setup(t); s.engine.setSyncOffsetMs(-270); s.engine.seek(4); settle(s.engine); await s.engine.play();
  near(s.ctx.sources[0].started[0], 10.04); near(s.ctx.sources[0].started[1], 4);
  s.ctx.currentTime = 10.2; near(s.engine.tick().position, 4);
  s.ctx.currentTime = 10.41; near(s.engine.tick().position, 4.1);
});
test('live changes reschedule both offset signs without moving the tape or changing audition scope', async t => {
  const s = setup(t); s.engine.clips.push({...s.engine.clips[0], id: 'b', lane: 1});
  await s.engine.play(s.engine.clips[0]); s.ctx.currentTime = 11.04;
  const before = s.engine.tick().position;
  s.engine.setSyncOffsetMs(500); near(s.engine.tick().position, before);
  assert.equal(s.ctx.sources[0].stopped, true); assert.equal(s.ctx.sources.length, 2);
  near(s.ctx.sources[1].started[1], .5);
  s.engine.setSyncOffsetMs(-500); near(s.engine.tick().position, before);
  near(s.ctx.sources[2].started[1], 1.5);
  assert.equal(s.engine.playing, true);
});
test('trim and rate remain in source seconds while sync uses timeline seconds', async t => {
  const s = setup(t); Object.assign(s.engine.clips[0], {start: 2, in: 1, out: 9, rate: 2});
  s.engine.setSyncOffsetMs(500); s.engine.seek(3); settle(s.engine); await s.engine.play();
  const source = s.ctx.sources[0]; near(source.started[0], 10.54); near(source.started[1], 3); near(source.started[2], 6);
  assert.equal(source.playbackRate.value, 2);
});
test('clip reversal composes with transport direction and sync rescheduling',async t=>{
  const s=setup(t),data=Float32Array.from([0,.1,.2,.3,.4,.5,.6,.7]),buffer={length:8,sampleRate:2,duration:4,getChannelData:()=>data};
  Object.assign(s.engine.clips[0],{start:2,in:1,out:3,rate:1,reversed:true,buffer});
  const forward=s.engine.play(s.engine.clips[0]);settle(s.engine);await forward;
  assert.deepEqual([...s.ctx.sources.at(-1).buffer.getChannelData(0)],[...data].reverse());
  near(s.ctx.sources.at(-1).started[1],1);
  s.engine.setSyncOffsetMs(500);
  assert.deepEqual([...s.ctx.sources.at(-1).buffer.getChannelData(0)],[...data].reverse());
  s.engine.pause();const backward=s.engine.playReverse(s.engine.clips[0]);settle(s.engine);await backward;
  assert.equal(s.ctx.sources.at(-1).buffer,buffer);
  near(s.ctx.sources.at(-1).started[1],1);
});
test('delayed audio can finish before the reel stops, and stop cancels queued sound', async t => {
  const s = setup(t); s.engine.setSyncOffsetMs(3000); await s.engine.play();
  s.ctx.currentTime = 21; s.engine.tick(); assert.equal(s.engine.playing, true);
  s.ctx.currentTime = 24; s.engine.tick(); assert.equal(s.engine.playing, false);
  s.engine.seek(0); settle(s.engine); await s.engine.play(); const queued = s.ctx.sources.at(-1);
  s.engine.stop(); assert.equal(queued.stopped, true);
});
test('zero, clamping, repeated settings and suspension keep scheduling bounded', async t => {
  const s = setup(t); s.engine.setSyncOffsetMs(0); await s.engine.play(); near(s.ctx.sources[0].started[0], 10.04);
  s.engine.setSyncOffsetMs(-9000); assert.equal(s.engine.syncOffsetMs, -3000);
  const count = s.ctx.sources.length; s.engine.setSyncOffsetMs(-3000); s.engine.setSyncOffsetMs(NaN);
  assert.equal(s.ctx.sources.length, count);
  s.engine.suspend(); assert.equal(s.engine.playing, false);
  s.engine.setSyncOffsetMs(0); assert.equal(s.ctx.sources.length, count);
});

test('seeks move through intermediate tape positions and retarget without jumping', t => {
  let time=0;const s=setup(t,()=>time),engine=s.engine;
  engine.seek(60); assert.equal(engine.winding,true);assert.equal(engine.targetPosition,60);near(engine.tick().position,0);
  time=3000;const midway=engine.tick().position;assert.ok(midway>0&&midway<60);
  engine.seek(10);assert.ok(Math.abs(engine.tick().position-midway)<.01);assert.equal(engine.targetPosition,10);
  time+=7000;engine.tick();near(engine.tick().position,10);assert.equal(engine.winding,false);
});

test('play waits for rewind and stop cancels waiting audio', async t => {
  const s=setup(t),engine=s.engine;engine.seek(20);settle(engine);
  const start=engine.play();await Promise.resolve();assert.equal(engine.playbackPending,true);assert.equal(engine.playing,false);assert.equal(s.ctx.sources.length,0);
  const midway=engine.tick(performance.now()+1200).position;assert.ok(midway>0&&midway<20);
  engine.stop();await start;assert.equal(engine.playing,false);assert.equal(s.ctx.sources.length,0);
  engine.seek(20);settle(engine);const replay=engine.play();settle(engine);await replay;
  assert.equal(engine.direction,1);assert.equal(engine.playing,true);assert.equal(s.ctx.sources.length,1);
});

test('play uses a queued seek destination when choosing its return path',async t=>{
  const s=setup(t),engine=s.engine;engine.seek(20);settle(engine);engine.seek(60);const replay=engine.play();
  assert.equal(engine.targetPosition,0);assert.equal(engine.playbackPending,true);
  settle(engine);await replay;assert.equal(engine.playing,true);near(engine.tick().position,0);
});

test('frame-rate retargets keep transport moving during a held control',t=>{
  let time=0;const s=setup(t,()=>time),engine=s.engine;
  engine.seek(5);
  let previous=0;
  for(let frame=1;frame<=60;frame++){
    time=frame*16;const current=engine.tick().position;
    assert.ok(current>=previous-1e-8);previous=current;
    engine.seek(5+frame*.2);near(engine.tick().position,current);
  }
  assert.ok(engine.tick().position>3,'the tape advances materially while the target changes every frame');
  assert.equal(engine.targetPosition,17);time+=7000;engine.tick();near(engine.tick().position,17);
});

test('idle stop samples motion and winds to the leader',t=>{
  let time=0;const s=setup(t,()=>time),engine=s.engine;engine.seek(30);
  time=500;const sampled=engine.tick().position;time=508;engine.stop();
  assert.ok(engine.tick().position>sampled);assert.equal(engine.targetPosition,0);assert.equal(engine.winding,true);
  time+=7000;engine.tick();near(engine.tick().position,0);
});
test('pause retains the first playback start through direction changes, while seek resets STOP',async t=>{
  const s=setup(t),engine=s.engine,data=new Float32Array(10);engine.clips[0].buffer={duration:10,length:10,sampleRate:1,getChannelData:()=>data};engine.seek(5);settle(engine);await engine.play();
  s.ctx.currentTime=11.04;engine.pause();near(engine.tick().position,6);
  assert.equal(engine.winding,false);await engine.playReverse();
  s.ctx.currentTime=11.54;engine.pause();assert.equal(engine.direction,-1);
  engine.stop();assert.equal(engine.targetPosition,5);settle(engine);near(engine.tick().position,5);
  engine.seek(8);settle(engine);await engine.playReverse();engine.pause();engine.stop();assert.equal(engine.targetPosition,8);
});
test('opposite direction reverses active transport and supersedes a pending start',async t=>{
  const s=setup(t),engine=s.engine;engine.clips[0].buffer={duration:10,length:10,sampleRate:1,getChannelData:()=>new Float32Array(10)};await engine.play();s.ctx.currentTime=12.04;
  assert.equal(await engine.playReverse(),true);assert.equal(engine.playing,true);assert.equal(engine.direction,-1);near(engine.tick().position,2);
  assert.equal(await engine.playReverse(),false);assert.equal(engine.playing,false);
  engine.seek(0);const start=engine.playReverse();assert.equal(engine.playbackPending,true);
  const forward=engine.play();assert.equal(await start,false);assert.equal(await forward,true);
  assert.equal(engine.playing,true);assert.equal(engine.direction,1);assert.equal(engine.playbackPending,false);
});
test('audition opens only its muted voice temporarily and restores saved mutes',async t=>{
  const s=setup(t),engine=s.engine;engine.clips.push({...engine.clips[0],id:'b',lane:1});engine.setLane(0,{muted:true});
  await engine.play(engine.clips[0]);assert.equal(engine.auditionClipId,'a');assert.equal(s.ctx.sources.length,1);assert.equal(engine.lanes[0].muted,true);
  assert.equal(s.ctx.gains[1].gain.value,engine.lanes[0].gain);
  engine.pause();assert.equal(engine.auditionClipId,null);assert.equal(s.ctx.gains[1].gain.value,0);assert.equal(engine.lanes[0].muted,true);
  engine.loop=true;await engine.play(engine.clips[0]);s.ctx.currentTime=20.04;engine.tick();assert.equal(engine.auditionClipId,null);assert.equal(s.ctx.gains[1].gain.value,0);assert.equal(engine.playing,false);assert.equal(s.ctx.sources.length,2);
  engine.loop=false;
  const normal=engine.play();settle(engine);await normal;assert.equal(s.ctx.sources.length,4);assert.equal(s.ctx.gains[1].gain.value,0);
});
test('natural completion retains the STOP origin until another play starts',async t=>{
  const s=setup(t),engine=s.engine;engine.seek(3);settle(engine);await engine.play();
  s.ctx.currentTime=20;engine.tick();assert.equal(engine.playing,false);
  engine.stop();assert.equal(engine.targetPosition,3);settle(engine);near(engine.tick().position,3);
});

test('navigation uses the live audio position while playback runs',async t=>{
  const s=setup(t),engine=s.engine;await engine.play();s.ctx.currentTime=12.04;
  near(engine.targetPosition,2);engine.seek(engine.targetPosition+5);
  assert.equal(engine.targetPosition,7);assert.equal(engine.playing,false);
});
