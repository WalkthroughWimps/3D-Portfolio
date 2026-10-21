import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioEngine} from '../_1-about/faces/odd/audio-engine.mjs';
import {FABRIC_TIMING,FABRIC_TIMING_LEVELS,classifyFabricTime} from '../_1-about/faces/odd/fabric-timing.mjs';

function harness({deferredResume=false}={}) {
  let milliseconds=0, context;
  const starts=[];
  const node=()=>({gain:{value:0},frequency:{value:0},Q:{value:0},threshold:{value:0},ratio:{value:0},delayTime:{value:0},connect(){return this;},disconnect(){}});
  class FakeContext {
    constructor(){context=this;this.currentTime=0;this.destination=node();this.resumeCalls=[];}
    createGain(){return node();}
    createDynamicsCompressor(){return node();}
    createAnalyser(){return node();}
    createBiquadFilter(){return node();}
    createDelay(){return node();}
    createBufferSource(){return {...node(),playbackRate:{value:1},start(...args){starts.push({source:this,args});},stop(){}};}
    createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return {length,sampleRate,duration:length/sampleRate,getChannelData(){return data;}};}
    resume(){if(!deferredResume)return Promise.resolve();return new Promise(resolve=>this.resumeCalls.push(resolve));}
    close(){return Promise.resolve();}
    suspend(){return Promise.resolve();}
  }
  const prior=globalThis.AudioContext;
  globalThis.AudioContext=FakeContext;
  const engine=createAudioEngine(()=>{}, {now:()=>milliseconds});
  const buffer={length:240000,sampleRate:24000,duration:10,getChannelData(){return new Float32Array(240000);}};
  engine.clips.push({id:'clip',name:'Clip',buffer,lane:0,start:0,in:0,out:10,rate:1,gain:1,reversed:false,links:[]});
  function advance(seconds){milliseconds+=seconds*1000;if(context)context.currentTime+=seconds;engine.tick(milliseconds);}
  async function wind(promise){for(let i=0;i<100&&engine.winding;i++)advance(.1);return promise;}
  return {engine,starts,advance,wind,get context(){return context;},restore(){engine.dispose();globalThis.AudioContext=prior;}};
}

test('opposite transport keys reverse from the current position; same key pauses and resumes',async()=>{
  const h=harness();try{
    assert.equal(await h.engine.play(),true);h.advance(3);
    const at=h.engine.tick().position;
    assert.equal(await h.engine.playReverse(),true);
    assert.equal(h.engine.direction,-1);assert.ok(Math.abs(h.engine.tick().position-at)<.001);
    assert.equal(h.starts.at(-1).source.buffer.length,240000);
    h.advance(.5);assert.ok(h.engine.tick().position<at);
    const reversedAt=h.engine.tick().position;
    assert.equal(await h.engine.play(),true);assert.equal(h.engine.direction,1);
    assert.ok(Math.abs(h.engine.tick().position-reversedAt)<.001);
    assert.equal(await h.engine.play(),false);assert.equal(h.engine.playing,false);
    const pausedAt=h.engine.tick().position;
    h.advance(1);assert.equal(h.engine.tick().position,pausedAt);
    assert.equal(await h.engine.play(),true);assert.equal(h.engine.direction,1);
    assert.ok(Math.abs(h.engine.tick().position-pausedAt)<.001);
  }finally{h.restore();}
});

test('first STOP returns to session origin across pauses and reversals; next STOP winds to zero',async()=>{
  const h=harness();try{
    await h.wind(h.engine.seek(4));
    await h.engine.play();h.advance(1);assert.equal(await h.engine.play(),false);
    await h.engine.playReverse();h.advance(.5);
    await h.engine.play();h.advance(.5);
    const first=h.engine.stop();assert.equal(h.engine.targetPosition,4);
    await h.wind(first);assert.ok(Math.abs(h.engine.tick().position-4)<.001);
    const second=h.engine.stop();assert.equal(h.engine.targetPosition,0);
    await h.wind(second);assert.equal(h.engine.tick().position,0);
  }finally{h.restore();}
});

test('idle STOP and repeated STOP during return winding aim at zero; seek resets origin',async()=>{
  const h=harness();try{
    await h.wind(h.engine.seek(6));
    await h.wind(h.engine.stop());assert.equal(h.engine.tick().position,0);
    await h.wind(h.engine.seek(5));await h.engine.play();h.advance(1);
    const first=h.engine.stop();assert.equal(h.engine.targetPosition,5);
    const second=h.engine.stop();assert.equal(h.engine.targetPosition,0);
    assert.equal(await first,false);await h.wind(second);assert.equal(h.engine.tick().position,0);
    await h.wind(h.engine.seek(3));await h.engine.play();h.advance(.5);
    await h.wind(h.engine.seek(7));await h.engine.play();h.advance(.5);
    await h.wind(h.engine.stop());assert.ok(Math.abs(h.engine.tick().position-7)<.001);
  }finally{h.restore();}
});

test('seeking during active or paused playback changes the first STOP return point',async()=>{
  const h=harness();try{
    await h.engine.play();h.advance(1);
    await h.wind(h.engine.seek(6));
    assert.equal(h.engine.playing,false);
    await h.wind(h.engine.stop());assert.equal(h.engine.tick().position,6);

    await h.engine.play();h.advance(.5);
    assert.equal(await h.engine.play(),false);
    await h.wind(h.engine.seek(8));
    await h.wind(h.engine.stop());assert.equal(h.engine.tick().position,8);

    await h.wind(h.engine.seek(3));
    await h.wind(h.engine.stop());assert.equal(h.engine.tick().position,0);
  }finally{h.restore();}
});

test('opposite direction supersedes a pending start without stale playback',async()=>{
  const h=harness({deferredResume:true});try{
    await h.wind(h.engine.seek(4));
    const first=h.engine.play();assert.equal(h.engine.playbackPending,true);
    const second=h.engine.playReverse();assert.equal(h.engine.direction,-1);
    await Promise.resolve();
    h.context.resumeCalls.shift()();assert.equal(await first,false);
    h.context.resumeCalls.shift()();assert.equal(await second,true);
    assert.equal(h.engine.playing,true);assert.equal(h.engine.direction,-1);
    assert.equal(h.starts.length,1);
  }finally{h.restore();}
});

test('fabric timing has 200 ms fine ticks and unchanged major tiers and glow',()=>{
  assert.equal(FABRIC_TIMING.subdivision,.2);
  assert.deepEqual(FABRIC_TIMING_LEVELS.map(level=>level.seconds),[30,10,5,1,.2]);
  assert.deepEqual(FABRIC_TIMING_LEVELS.map(level=>level.glow),[.3,.3,.3,.3,.15]);
  assert.equal(classifyFabricTime(.2).seconds,.2);
  assert.equal(classifyFabricTime(.25),null);
  assert.equal(classifyFabricTime(1).seconds,1);
  assert.equal(classifyFabricTime(10).seconds,10);
});
