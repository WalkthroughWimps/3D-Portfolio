import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioEngine,LIMITS} from '../_1-about/faces/odd/audio-engine.mjs';
import {audioDeadline,prepareAudioFile} from '../_1-about/faces/odd/audio-import.mjs';

function fixtures(t){
  const prior=Object.fromEntries(['AudioContext','OfflineAudioContext'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  let mode='ok',contexts=0,live=0,late;
  const make=(length=2400,rate=24000)=>{const data=new Float32Array(length);return {length,duration:length/rate,sampleRate:rate,numberOfChannels:1,getChannelData:()=>data};};
  globalThis.AudioContext=class{constructor(){live++;throw Error('Playback device is blocked');}};
  globalThis.OfflineAudioContext=class{
    constructor(channels,length,rate){contexts++;this.length=length;this.sampleRate=rate;this.destination={};}
    createBuffer(channels,length,rate){return make(length,rate);}
    async decodeAudioData(){if(mode==='bad')throw new DOMException('Unreadable','EncodingError');if(mode==='long')return make(31*24000);if(mode==='hung')return new Promise(resolve=>{late=()=>resolve(make());});return make();}
    createBufferSource(){return {connect(){},start(){}};}
    async startRendering(){return make(this.length,this.sampleRate);}
  };
  t.after(()=>{for(const [key,value]of Object.entries(prior)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  return {file:{name:'A little sound.wav',size:2400,arrayBuffer:async()=>new ArrayBuffer(10)},mode(value){mode=value;},get live(){return live;},get contexts(){return contexts;},finish(){late?.();}};
}

test('bell creation and file import do not construct or resume a playback context',async t=>{
  const f=fixtures(t),stages=[];let e;e=createAudioEngine(()=>{if(e.loading)stages.push(e.loading.stage);});t.after(()=>e.dispose());
  const bell=await e.bell(),clip=await e.importFile(f.file);
  assert.equal(f.live,0);assert.equal(e.clips.length,2);assert.equal(bell.buffer.sampleRate,24000);assert.equal(clip.name,'A little sound');assert.equal(clip.buffer.numberOfChannels,1);
  assert.ok(stages.includes('Reading file')&&stages.includes('Decoding audio')&&stages.includes('Preparing mono tape'));
  assert.equal(e.loading,null);assert.equal(e.busy,false);
});

test('canceling a hung decoder unlocks the rack, ignores late results and permits retry',async t=>{
  const f=fixtures(t),e=createAudioEngine();t.after(()=>e.dispose());await e.bell();f.mode('hung');
  const task=e.importFile(f.file);await new Promise(resolve=>setImmediate(resolve));assert.equal(e.busy,true);assert.equal(e.loading.stage,'Decoding audio');
  e.cancelLoad();await assert.rejects(task,{name:'AbortError'});assert.equal(e.busy,false);assert.equal(e.loading,null);assert.equal(e.clips.length,1);
  f.mode('ok');await e.importFile(f.file);f.finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(e.clips.length,2);assert.equal(f.live,0);
});

test('invalid and overlong files show errors and leave existing clips editable',async t=>{
  const f=fixtures(t),e=createAudioEngine();t.after(()=>e.dispose());const bell=await e.bell();
  for(const [mode,pattern]of [['bad',/format could not be read/],['long',/31.0 seconds.*30 seconds/]]){
    f.mode(mode);await assert.rejects(e.importFile(f.file),pattern);assert.equal(e.busy,false);assert.equal(e.clips.length,1);assert.equal(e.clips[0],bell);
  }
  const before=f.contexts;await assert.rejects(e.importFile({...f.file,size:LIMITS.fileBytes+1}),/20 MB/);await assert.rejects(e.importFile({...f.file,size:0}),/empty/);assert.equal(f.contexts,before);
  e.edit(bell.id,{name:'Still editable'});assert.equal(e.clips[0].name,'Still editable');
});

test('rack capacity rejects before decoding, and disposal cancels an in-flight import',async t=>{
  const f=fixtures(t),e=createAudioEngine();t.after(()=>e.dispose());const bell=await e.bell();
  e.clips.push(...Array.from({length:47},(_,i)=>({...bell,id:'copy'+i})));const before=f.contexts;await assert.rejects(e.importFile(f.file),/48-strip rack/);assert.equal(f.contexts,before);
  e.clips.splice(1);f.mode('hung');const task=e.importFile(f.file);await new Promise(resolve=>setImmediate(resolve));e.dispose();await assert.rejects(task,{name:'AbortError'});f.finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(e.clips.length,0);
});

test('a decoder timeout rejects rather than waiting indefinitely, including a late completion',async t=>{
  const f=fixtures(t);f.mode('hung');
  await assert.rejects(prepareAudioFile(f.file,{limits:LIMITS,timeoutMs:8}),/Timed out while decoding/);f.finish();
  await assert.rejects(audioDeadline(()=>new Promise(()=>{}),{timeoutMs:8,label:'starting audio output'}),/starting audio output/);
});
