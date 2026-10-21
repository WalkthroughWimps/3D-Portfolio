import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioEngine} from '../_1-about/faces/odd/audio-engine.mjs';
import {cloneClip,validClip} from '../_1-about/faces/odd/clip-layout.mjs';
import {sessionObject,unpackSession} from '../_1-about/faces/odd/session-io.mjs';

const buffer=(values,rate=24000)=>{const data=Float32Array.from(values);return {length:data.length,duration:data.length/rate,sampleRate:rate,getChannelData:()=>data};};
const clip=(id,start=0,gain=1,source=buffer(new Array(24000).fill(.4)))=>({id,name:id,start,lane:0,in:0,out:source.duration,rate:1,reversed:false,gain,links:[],buffer:source});
function fakeAudio(t){
  const prior=Object.getOwnPropertyDescriptor(globalThis,'AudioContext'),offlinePrior=Object.getOwnPropertyDescriptor(globalThis,'OfflineAudioContext');
  const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
  const node=()=>({gain:param(),frequency:param(),Q:param(),delayTime:param(),threshold:param(),ratio:param(),connections:[],connect(n){this.connections.push(n);return n;},disconnect(){this.connections=[];}});
  const contexts=[];
  class Context{constructor(){this.currentTime=1;this.state='running';this.destination=node();this.sources=[];contexts.push(this);}createGain(){return node();}createDynamicsCompressor(){return node();}createAnalyser(){return node();}createBiquadFilter(){return node();}createDelay(){return node();}createBuffer(n,length,rate){return buffer(new Array(length).fill(0),rate);}createBufferSource(){const source={...node(),playbackRate:param(),start(...args){this.started=args;},stop(){this.stopped=true;}};this.sources.push(source);return source;}async resume(){}async close(){}async startRendering(){return buffer([0,0]);}}
  globalThis.AudioContext=Context;globalThis.OfflineAudioContext=Context;
  t.after(()=>{if(prior)Object.defineProperty(globalThis,'AudioContext',prior);else delete globalThis.AudioContext;if(offlinePrior)Object.defineProperty(globalThis,'OfflineAudioContext',offlinePrior);else delete globalThis.OfflineAudioContext;});
  return contexts;
}

test('clip gain affects only its own live source and remains independent from track volume',async t=>{
  const contexts=fakeAudio(t),engine=createAudioEngine();t.after(()=>engine.dispose());engine.clips.push(clip('a',0,.5),clip('b',2,.9));await engine.play();const ctx=contexts[0],a=ctx.sources[0],b=ctx.sources[1],gainA=a.connections[0],gainB=b.connections[0],track=gainA.connections[0];
  assert.equal(gainA.gain.value,.5);assert.equal(gainB.gain.value,.9);assert.equal(track.gain.value,.7);
  engine.edit('a',{gain:.2});assert.equal(engine.playing,true);assert.notEqual(a.stopped,true);assert.equal(gainA.gain.value,.2);assert.equal(gainB.gain.value,.9);assert.equal(engine.lanes[0].gain,.7);
  engine.setLane(0,{gain:.35});assert.equal(track.gain.value,.35);assert.equal(gainA.gain.value,.2);assert.equal(engine.clips[1].gain,.9);
  engine.undo();assert.equal(engine.clips.find(c=>c.id==='a').gain,.5);assert.equal(engine.lanes[0].gain,.35);
});

test('dry and effected exports retain per-clip gain before their separate track circuit',async t=>{
  const contexts=fakeAudio(t),engine=createAudioEngine();t.after(()=>engine.dispose());engine.clips.push(clip('a',0,.25));engine.setLane(0,{gain:.4});
  for(const effects of [false,true]){await engine.exportWav({effects,tails:false,applyVolume:false});const source=contexts.at(-1).sources[0],gain=source.connections[0];assert.equal(gain.gain.value,.25);if(effects)assert.equal(gain.connections[0].gain.value,.4);}
});

test('split and copy retain clip gain; joining different gains bakes each segment once',async t=>{
  fakeAudio(t);const engine=createAudioEngine();t.after(()=>engine.dispose());const source=buffer(new Array(48000).fill(.4));engine.clips.push(clip('a',0,.5,source));const right=engine.split('a',1);assert.equal(right.gain,.5);const copy=engine.duplicate(right.id);assert.equal(copy.gain,.5);engine.remove(copy.id);engine.edit(right.id,{gain:.25});const joined=await engine.join('a');assert.equal(joined.gain,1);assert.ok(Math.abs(joined.buffer.getChannelData(0)[0]-.2)<1e-6);assert.ok(Math.abs(joined.buffer.getChannelData(0)[24000]-.1)<1e-6);assert.equal(source.getChannelData(0)[0],Math.fround(.4));
});

test('v4 sessions preserve both clip gains and track levels; older sessions default clips to unity',()=>{
  const lanes=[{gain:.35}],raw=sessionObject({clips:[clip('a',0,.4)],lanes,position:0,loop:false,volume:1,muted:false});assert.equal(raw.version,4);const restored=unpackSession(raw);assert.equal(restored.clips[0].gain,.4);assert.equal(restored.lanes[0].gain,.35);
  const old={...raw,version:3,clips:raw.clips.map(c=>{const copy={...c};delete copy.gain;return copy;})};assert.equal(unpackSession(old).clips[0].gain,1);assert.equal(unpackSession(old).lanes[0].gain,.35);
  for(const gain of [-1,2,NaN,'0.4',undefined])assert.throws(()=>unpackSession({...raw,clips:[{...raw.clips[0],gain}]}));
  assert.equal(cloneClip({...clip('b'),gain:undefined}).gain,1);assert.equal(validClip({...clip('b'),gain:-.1}),false);
});
