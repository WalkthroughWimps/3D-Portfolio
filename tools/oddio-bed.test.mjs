import test from 'node:test';
import assert from 'node:assert/strict';
import {muteArc,muteOffset,TRACK_MUTE} from '../_1-about/faces/odd/track-mute.mjs';
import {RIBBON,ribbonPoint,reelPoint,reelAngle,laneDepth} from '../_1-about/faces/odd/ribbon-path.mjs';
import {snapClipStart} from '../_1-about/faces/odd/clip-gesture.mjs';
import {TAPE_BED,clampTapePosition,snapTapePosition,heldWindDistance} from '../_1-about/faces/odd/tape-bed.mjs';
import {createAudioEngine} from '../_1-about/faces/odd/audio-engine.mjs';
import {unpackSession} from '../_1-about/faces/odd/session-io.mjs';
const clip=(id,start,length=2,lane=0)=>({id,start,in:0,out:length,rate:1,lane,buffer:{duration:length},links:[]});
const settle=engine=>engine.tick(performance.now()+7000);

test('mute slopes draw material from both ends while the reader coordinate stays pinned',()=>{
  assert.equal(muteArc(0),0);
  let prior=0;for(let n=0;n<=10;n++){
    const amount=n/10,extra=muteArc(.72,amount)-.72;assert.ok(extra>=prior-1e-10);prior=extra;
    assert.equal(muteArc(-.72,amount),-muteArc(.72,amount));
    assert.ok(Math.abs(muteArc(.72,0)-.72)<1e-10);
  }
  assert.ok(prior>.004&&prior<.02);assert.equal(muteOffset(.3),0);assert.equal(muteOffset(0),-TRACK_MUTE.depth);
});
test('manual tape range ends exactly when the opposite boundary reaches the bed edge',()=>{
  const x=(time,position)=>(time-position)*2*RIBBON.halfSpan/RIBBON.secondsInView;
  assert.equal(clampTapePosition(-100),TAPE_BED.min);assert.equal(clampTapePosition(100),TAPE_BED.max);
  assert.equal(x(0,TAPE_BED.min),RIBBON.halfSpan);assert.equal(x(60,TAPE_BED.max),-RIBBON.halfSpan);
  for(const value of[-.15,.15])assert.equal(snapTapePosition(value),0);
  for(const value of[59.85,60.15])assert.equal(snapTapePosition(value),60);
  assert.equal(snapTapePosition(-.3),-.3);
});
test('held winding integrates elapsed time even when rendering skips frames',()=>{
  assert.equal(heldWindDistance(.1,-1),0);assert.ok(Math.abs(heldWindDistance(.7,-1)+1.44)<1e-10);
  const times=[.23,.4,.51,.7];let total=0,prior=0;for(const time of times){const distance=heldWindDistance(time,5);total+=distance-prior;prior=distance;}
  assert.equal(total,heldWindDistance(.7,5));
});
test('clip edges and centers snap across voices, to the reader and both stitched boundaries',()=>{
  const c=clip('moving',8,2),peer=clip('other',20,6,3);
  assert.equal(snapClipStart([c,peer],c,20.1,40).start,20);
  assert.equal(snapClipStart([c,peer],c,24.1,40).start,24);
  assert.equal(snapClipStart([c,peer],c,22.1,40).start,22);
  assert.equal(snapClipStart([c],c,.1,40).start,0);
  assert.equal(snapClipStart([c],c,58.1,40).start,58);
  assert.equal(snapClipStart([c],c,38.1,40).start,38);
  // When all three source anchors are close to targets, the left anchor wins.
  const tiny=clip('tiny',10,.12),a=clip('a',10.03,.04,2);
  assert.equal(snapClipStart([tiny,a],tiny,10,50).anchor,'left');
  const before=JSON.stringify([c,peer]);snapClipStart([c,peer],c,22.1,40);assert.equal(JSON.stringify([c,peer]),before);
});
test('extended tape positions survive sessions and do not alter source capacity',async t=>{
  const e=createAudioEngine();t.after(()=>e.dispose());
  for(const position of[-7.5,-.3,60.3,67.5]){e.seek(position);settle(e);assert.equal(e.tick().position,position);const data=JSON.parse(await e.saveSession().text());assert.equal(unpackSession(data).position,position);}
});
test('tilted winding paths preserve lane stack spacing and join their transit sections',()=>{
  assert.ok(RIBBON.takeup[0]<0&&RIBBON.supply[0]>0);assert.ok(Math.abs(RIBBON.takeup[1])-RIBBON.flangeRadius>RIBBON.width*2);assert.ok(Math.abs(RIBBON.supply[1])-RIBBON.flangeRadius>RIBBON.width*2);
  for(const side of[false,true]){const a=reelPoint(0,0,laneDepth(0,side),side),b=reelPoint(0,0,laneDepth(1,side),side);assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)-.037)<1e-9);}
  for(const position of[-7.5,0,30,60,67.5])for(let lane=0;lane<4;lane++)for(const t of[.18,.30,.70,.82]){const a=ribbonPoint(t-.000001,position,0,lane),b=ribbonPoint(t+.000001,position,0,lane);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.0001);}
  assert.notEqual(reelAngle(-7.5),reelAngle(0));assert.notEqual(reelAngle(67.5,true),reelAngle(60,true));
});

test('pre/post-roll playback schedules only the in-range audio, with silent leader time',async t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'AudioContext'),param=()=>({value:0,setTargetAtTime(){}}),node=()=>({gain:param(),frequency:param(),Q:param(),delayTime:param(),threshold:param(),ratio:param(),connect(n){return n;},disconnect(){}});let ctx;
  globalThis.AudioContext=class{
    constructor(){ctx=this;this.currentTime=10;this.destination=node();this.sources=[];}
    createGain(){return node();}createDynamicsCompressor(){return node();}createAnalyser(){return node();}createBiquadFilter(){return node();}createDelay(){return node();}
    createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,duration:length/rate,getChannelData:()=>data};}
    createBufferSource(){const source={...node(),playbackRate:param(),start(...args){this.started=args;},stop(){}};this.sources.push(source);return source;}
    async resume(){}async close(){}
  };
  const e=createAudioEngine(),data=new Float32Array(32),buffer={length:32,sampleRate:8,duration:4,getChannelData:()=>data};
  t.after(()=>{e.dispose();if(original)Object.defineProperty(globalThis,'AudioContext',original);else delete globalThis.AudioContext;});
  e.clips.push({...clip('pre',-2,4),buffer},{...clip('post',58,4,1),buffer});
  e.seek(-7.5);settle(e);await e.play();assert.ok(Math.abs(ctx.sources[0].started[0]-17.54)<1e-8);assert.equal(ctx.sources[0].started[1],2);assert.equal(ctx.sources[0].started[2],2);
  e.seek(67.5);settle(e);await e.playReverse();const source=ctx.sources.at(-1);assert.ok(Math.abs(source.started[0]-17.54)<1e-8);assert.equal(source.started[1],2);assert.equal(source.started[2],2);
});
