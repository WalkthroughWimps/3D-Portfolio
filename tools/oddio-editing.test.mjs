import{snapClipStart,clipAtPoint,clipEdgeAtPoint,proposeClipEdge}from'../_1-about/faces/odd/clip-gesture.mjs';
import{blendWindow,clipBand,dragPreviewClips,stableBlendAppearance,drawClipWaveform,waveformPeak}from'../_1-about/faces/odd/clip-appearance.mjs';
import test from'node:test';import assert from'node:assert/strict';
import{placementPlan,visibleInterval,validateLayout,clipEnd,sourceTimeAt}from'../_1-about/faces/odd/clip-layout.mjs';
import{createAudioEngine}from'../_1-about/faces/odd/audio-engine.mjs';
import{capturePlan}from'../_1-about/faces/odd/capture-placement.mjs';
import{createAtelierQueue}from'../_1-about/faces/odd/atelier-queue.mjs';
import{armPose,clothFeed,ARM_LAYOUT,segmentGap,canPairMove}from'../_1-about/faces/odd/arm-motion.mjs';
import{stepMagneticArrow}from'../_1-about/faces/odd/selector-motion.mjs';
import{sessionObject,unpackSession}from'../_1-about/faces/odd/session-io.mjs';
import{LANE_DEFAULTS}from'../_1-about/faces/odd/audio-effects.mjs';
const pcm=Float32Array.from({length:240000},(_,i)=>Math.sin(i*.13)*.2),buffer={duration:10,sampleRate:24000,getChannelData:()=>pcm},clip=(id,start,out=4,lane=0)=>({id,start,out,lane,in:0,rate:1,name:id,buffer,links:[]});
test('edge previews trim source or stretch rate around the opposite timeline edge without mutation',()=>{
  const c={...clip('edge',4,9),in:1},before={start:c.start,in:c.in,out:c.out,rate:c.rate};
  const left=proposeClipEdge([c],c,'start',5),right=proposeClipEdge([c],c,'end',11),slowRight=proposeClipEdge([c],c,'end',14,{stretch:true}),slowLeft=proposeClipEdge([c],c,'start',2,{stretch:true});
  assert.deepEqual([left.clip.start,left.clip.in,left.clip.out,left.clip.rate],[5,2,9,1]);
  assert.deepEqual([right.clip.start,right.clip.in,right.clip.out,right.clip.rate],[4,1,8,1]);
  assert.deepEqual([slowRight.clip.start,slowRight.clip.in,slowRight.clip.out,slowRight.clip.rate],[4,1,9,.8]);
  assert.deepEqual([slowLeft.clip.start,slowLeft.clip.in,slowLeft.clip.out,slowLeft.clip.rate],[2,1,9,.8]);
  assert.equal(proposeClipEdge([c],c,'end',100,{stretch:true}).clip.rate,.5);
  assert.deepEqual({start:c.start,in:c.in,out:c.out,rate:c.rate},before);
});
test('Shift edge crossing pivots at the fixed endpoint and reverses once',()=>{
  const c={...clip('pivot',6,5),in:1};
  const right=proposeClipEdge([c],c,'end',2,{stretch:true});
  assert.deepEqual([right.clip.start,clipEnd(right.clip),right.clip.in,right.clip.out,right.clip.rate,right.clip.reversed,right.edge],[2,6,1,5,1,true,'start']);
  const left=proposeClipEdge([c],c,'start',14,{stretch:true});
  assert.deepEqual([left.clip.start,clipEnd(left.clip),left.clip.in,left.clip.out,left.clip.reversed,left.edge],[10,14,1,5,true,'end']);
  assert.equal(proposeClipEdge([c],c,'end',10,{stretch:true}).clip.reversed,false);
  assert.equal(proposeClipEdge([c],c,'end',6,{stretch:true}).clip.reversed,false);
  assert.equal(proposeClipEdge([c],c,'end',2).clip.reversed,false);
  const already={...c,reversed:true};assert.equal(proposeClipEdge([already],already,'end',2,{stretch:true}).clip.reversed,false);
  assert.equal(c.reversed,undefined);
});
test('reverse source coordinates preserve fitted windows and replacement fragments',()=>{
  const c={...clip('reverse',4,8),in:1,reversed:true},window=visibleInterval(c,[c]);
  assert.deepEqual([sourceTimeAt(c,4),sourceTimeAt(c,7),window.in,window.out],[8,5,8,1]);
  const replacement={...clip('new',6,2),lane:0},plan=placementPlan([c,replacement],'new',{}, {strategy:'replace'});
  const left=plan.clips.find(v=>v.id==='reverse'),right=plan.clips.find(v=>v.id==='reverse-after-new');
  assert.deepEqual([left.start,left.in,left.out,left.reversed],[4,6,8,true]);
  assert.deepEqual([right.start,right.in,right.out,right.reversed],[8,1,4,true]);
});
test('waveform reads the opposite source edge after clip reversal',()=>{
  const data=Float32Array.from([.1,.1,.9,.9]),short={...clip('wave',0,4),buffer:{duration:4,sampleRate:1,getChannelData:()=>data}};
  assert.ok(Math.abs(waveformPeak(short,0,1)-.1)<1e-6);
  assert.ok(Math.abs(waveformPeak({...short,reversed:true},0,1)-.9)<1e-6);
});
test('edge hit respects visible ends and blended bands',()=>{
  const a=clip('a',4,6),b=clip('b',5,6);a.links=[{peer:'b',mode:'blend'}];b.links=[{peer:'a',mode:'blend'}];
  const x=time=>(time-8)*1.44/15,y=band=>.1125+.065*(.5-band);
  assert.equal(clipEdgeAtPoint([a,b],{x:x(4),y:y(.25)},8)?.clip.id,'a');
  assert.equal(clipEdgeAtPoint([a,b],{x:x(5),y:y(.75)},8)?.clip.id,'b');
  assert.equal(clipEdgeAtPoint([a,b],{x:x(5),y:y(.25)},8)?.clip.id,undefined);
  assert.equal(clipEdgeAtPoint([clip('off',-5)],{x:x(0),y:y(.5)},8),null);
});
const original=[clip('a',0),clip('b',8)],move=(strategy)=>placementPlan(original,'b',{start:2},{strategy});
test('an overlap is a read-only decision until a strategy is chosen',()=>{const before=JSON.stringify(original),plan=move(null);assert.equal(plan.conflict,true);assert.equal(plan.canBlend,true);assert.equal(JSON.stringify(original),before);});
test('capture keeps the playhead time while scanning voices and offers a choice only when all four are blocked',()=>{const existing=[clip('a',5,4,0),clip('b',5,4,1)],candidate=clip('new',6,2,0);let plan=capturePlan(existing,candidate,0);assert.equal(plan.candidate.start,6);assert.equal(plan.candidate.lane,2);const full=[...existing,clip('c',5,4,2),clip('d',5,4,3)];plan=capturePlan(full,candidate,0);assert.equal(plan.conflict,true);assert.equal(plan.candidate.start,6);assert.equal(plan.candidate.lane,0);});
test('capture replacement trims only covered sound and is undoable; blends reject a third clip',()=>{const existing=[clip('a',4,6,0),clip('b',4,6,1),clip('c',4,6,2),clip('d',4,6,3)],candidate=clip('new',6,2,0),plan=capturePlan(existing,candidate,0,{strategy:'replace'});assert.equal(validateLayout(plan.clips),true);assert.equal(plan.candidate.start,6);assert.equal(plan.clips.find(c=>c.id==='a').out,2);assert.equal(plan.clips.find(c=>c.id==='a-after-new').in,4);const e=createAudioEngine();e.clips.push(...existing.map(c=>({...c})));e.clips.push({...candidate});e.place('new',{}, {strategy:'replace'});e.undo();assert.equal(e.clips.find(c=>c.id==='a').out,6);e.dispose();const blended=placementPlan([clip('x',4,4),clip('y',10,4)],'y',{start:6},{strategy:'blend'}).clips;assert.throws(()=>capturePlan([...blended,clip('z',5,4,1),clip('q',5,4,2),clip('r',5,4,3)],clip('third',7,1),0,{strategy:'blend'}),/two clips/);});
test('fit clips keep all PCM and original trims, then reveal fully when separated',()=>{const plan=move('clip');assert.equal(validateLayout(plan.clips),true);const a=plan.clips.find(c=>c.id==='a'),b=plan.candidate;assert.equal(a.out,4);assert.equal(b.in,0);assert.equal(a.buffer,buffer);assert.equal(visibleInterval(a,plan.clips).end,3);assert.equal(visibleInterval(b,plan.clips).start,3);const apart=placementPlan(plan.clips,'b',{start:8}).clips;assert.equal(visibleInterval(apart[0],apart).end,4);assert.ok(apart.every(c=>!c.links.length));});
test('blend is two linked, separable clips and rejects any third overlap',()=>{const plan=move('blend');assert.equal(plan.clips.length,2);assert.equal(validateLayout(plan.clips),true);assert.equal(plan.candidate.links[0].mode,'blend');const three=[...plan.clips,clip('c',12)];assert.throws(()=>placementPlan(three,'c',{start:3},{strategy:'blend'}),/two clips/);assert.throws(()=>placementPlan(three,'c',{start:3},{strategy:'clip'}),/two clips/);const apart=placementPlan(plan.clips,'b',{start:10}).clips;assert.ok(apart.every(c=>!c.links.length));assert.equal(apart.find(c=>c.id==='b').out,4);});
test('swap exchanges original positions and is atomic if different lengths do not fit',()=>{const plan=move('swap');assert.equal(plan.candidate.start,0);assert.equal(plan.clips.find(c=>c.id==='a').start,8);const dense=[clip('a',0,8),clip('b',10,2),clip('c',13,2)];assert.throws(()=>placementPlan(dense,'b',{start:2},{strategy:'swap'}));assert.equal(dense[0].start,0);});
test('push right, left and both preserve clips and avoid overlap',()=>{const right=move('right');assert.equal(right.clips.find(c=>c.id==='a').start,6);const left=placementPlan([clip('a',4),clip('b',12)],'b',{start:6},{strategy:'left'});assert.equal(left.clips.find(c=>c.id==='a').start,2);const both=placementPlan([clip('a',4),clip('b',8),clip('c',16)],'c',{start:6},{strategy:'both'});assert.equal(both.clips.find(c=>c.id==='a').start,2);assert.equal(both.clips.find(c=>c.id==='b').start,10);for(const p of[right,left,both])assert.equal(validateLayout(p.clips),true);});
test('nearest gap stays on the voice and impossible pushes fail without mutation',()=>{const plan=move('nearest');assert.equal(plan.candidate.start,4);assert.equal(plan.candidate.lane,0);const dense=[clip('a',0,10),clip('b',50,10)];assert.throws(()=>placementPlan(dense,'a',{start:52},{strategy:'right'}));assert.equal(dense[1].start,50);});
test('off-reel placement retains the full source while only 0–60 seconds is playable',()=>{for(const start of[-3,58,70]){const c=placementPlan([clip('a',0)],'a',{start}).candidate,w=visibleInterval(c,[c]);assert.equal(c.in,0);assert.equal(c.out,4);assert.equal(c.start,start);assert.ok(w.end>=w.start);if(start===-3){assert.equal(w.start,0);assert.equal(w.in,3);assert.equal(w.end,1);}if(start===58)assert.equal(w.end,60);if(start===70)assert.equal(w.end-w.start,0);}});
test('engine resolution, remove, undo and redo restore link metadata without aliasing',()=>{const e=createAudioEngine();e.clips.push(...original.map(c=>({...c})));e.place('b',{start:2},{strategy:'blend'});assert.equal(e.clips[0].links.length,1);e.undo();assert.equal(e.clips.find(c=>c.id==='b').start,8);e.redo();assert.equal(e.clips.find(c=>c.id==='b').links[0].mode,'blend');e.remove('a');assert.equal(e.clips[0].links.length,0);e.undo();assert.equal(e.clips[0].links.length,1);e.dispose();});
test('duplicate stays on the same voice; clipboard paste shares source and is undoable',()=>{const e=createAudioEngine();e.clips.push(clip('a',0));const d=e.duplicate('a');assert.equal(d.lane,0);assert.equal(d.start,4);assert.equal(d.buffer,buffer);const pasted=e.paste({...d},{start:0,lane:1});assert.equal(pasted.buffer,buffer);assert.equal(pasted.lane,1);e.undo();assert.equal(e.clips.length,2);e.dispose();});
test('session v4 round-trips reversible links and off-reel positions; invalid triples reject',()=>{const clips=move('blend').clips,raw=sessionObject({clips,lanes:Array.from({length:4},()=>({...LANE_DEFAULTS})),position:0,loop:false,volume:1,muted:false});assert.equal(raw.version,4);const loaded=unpackSession(raw);assert.equal(loaded.clips[0].links[0].mode,'blend');raw.clips.push({...raw.clips[0],id:'third',links:[]});assert.throws(()=>unpackSession(raw));const off=sessionObject({clips:[clip('off',-3)],lanes:[],position:0,loop:false,volume:1,muted:false});assert.equal(unpackSession(off).clips[0].start,-3);});
test('reverse metadata round-trips, defaults for old sessions, and undo keeps blend links',()=>{
  const pair=move('blend').clips,e=createAudioEngine();e.clips.push(...pair);const oldLinks=e.clips[0].links.map(l=>({...l}));
  e.edit('a',{reversed:true});assert.equal(e.clips[0].reversed,true);assert.deepEqual(e.clips[0].links,oldLinks);
  const raw=sessionObject({clips:e.clips,lanes:e.lanes,position:0,loop:false,volume:1,muted:false});assert.equal(unpackSession(raw).clips[0].reversed,true);
  const prior={...raw,version:2,clips:raw.clips.map(c=>{const old={...c};delete old.reversed;return old;})};assert.equal(unpackSession(prior).clips[0].reversed,false);
  raw.clips[0].reversed='yes';assert.throws(()=>unpackSession(raw),/invalid clips/);
  e.undo();assert.equal(e.clips[0].reversed,false);e.redo();assert.equal(e.clips[0].reversed,true);e.dispose();
});
test('splitting and rejoining a reversed clip share its original PCM',async()=>{
  const e=createAudioEngine(),c={...clip('rev',2,7),in:1,reversed:true};e.clips.push(c);
  const right=e.split('rev',4);assert.deepEqual([c.in,c.out,right.in,right.out],[5,7,1,5]);
  assert.equal(right.buffer,c.buffer);const joined=await e.join('rev');assert.deepEqual([joined.in,joined.out,joined.reversed],[1,7,true]);
  assert.equal(joined.buffer,buffer);e.dispose();
});
const advance=(q,seconds)=>{let j;for(let n=0;n<Math.ceil(seconds/.02);n++)j=q.update(.02);return j;};
test('only close rightward moves pair; distant, left and lane-only moves are sequential',()=>{for(const patch of[{start:8},{start:10},{start:6.5},{start:2},{lane:1}]){const q=createAtelierQueue(),c=clip('a',6);q.sync([c],{silent:true});q.sync([{...c,...patch}]);let j=q.update(0);assert.equal(j.pass,patch.start===8?'paired':'unpick');if(j.pass==='unpick'){advance(q,2.8);j=q.update(0);assert.equal(j.pass,'sew');assert.ok(['travel','work'].includes(j.stage));}}assert.equal(canPairMove({kind:'retie',from:{start:1},to:{start:3}}),false);});
test('unpicked material remains whole at arrival, then shortens continuously at the tool',()=>{const q=createAtelierQueue(),c=clip('a',0);q.sync([c],{silent:true});q.sync([]);let j=advance(q,2),feed=clothFeed(j,0);assert.equal(feed.removeFraction,0);assert.equal(feed.base+feed.stations.remove*15/1.44,0);j=advance(q,.22);feed=clothFeed(j,0);assert.ok(feed.removeFraction>0&&feed.removeFraction<1);assert.equal(feed.writeFraction,0);assert.ok(Number.isFinite(feed.position));});
test('fixed arm links fold beside the tracks and stay in their own clearance envelope',()=>{const d=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(const x of[.06,.12,.168])for(let n=0;n<=100;n++){const p=armPose(side,lane,n/100,{x:side*x});for(const part of[p.base,p.shoulder,p.elbow,p.knuckle,p.wrist])assert.ok(part[0]*side>=.0439);for(const part of[p.knuckle,p.wrist])assert.ok(Math.abs(part[1])<.20);assert.ok(Math.abs(p.elbow[1])<=.405&&p.elbow[2]>=ARM_LAYOUT.restZ-1e-8&&p.elbow[2]<.52);if(Math.abs(p.elbow[1])>.19)assert.ok(p.elbow[2]>.29,"Elbow over the panel stays beyond its front surface");for(const[a,b,length]of[[p.base,p.shoulder,ARM_LAYOUT.shoulderLift],[p.shoulder,p.elbow,ARM_LAYOUT.upper],[p.elbow,p.knuckle,ARM_LAYOUT.forearm],[p.knuckle,p.wrist,ARM_LAYOUT.hand]])assert.ok(Math.abs(d(a,b)-length)<1e-7);if(n===0||n===100){assert.equal(p.base[2],.25);for(const part of[p.shoulder,p.elbow,p.knuckle,p.wrist])assert.ok(part[1]*side>=.163-1e-10&&part[2]>=ARM_LAYOUT.restZ&&part[2]<=ARM_LAYOUT.foldedWristZ+1e-10);assert.ok(p.toolDirection[2]===0);}const a=p.wrist.map((v,i)=>v+p.toolDirection[i]*.012),b=p.wrist.map((v,i)=>v+p.toolDirection[i]*ARM_LAYOUT.toolLength);assert.ok(segmentGap(p.shoulder,p.elbow,a,b)>.004);assert.ok(segmentGap(p.elbow,p.knuckle,a,b)>.004);}assert.ok(clipEnd(clip('a',0))===4);});
test('magnetic arrows overshoot then settle; reduced motion snaps',()=>{const state={angle:0,velocity:0};let maximum=0;for(let i=0;i<300;i++){stepMagneticArrow(state,Math.PI/2,1/120);maximum=Math.max(maximum,state.angle);}assert.ok(maximum>Math.PI/2+.1);assert.ok(Math.abs(state.angle-Math.PI/2)<.001);stepMagneticArrow(state,-Math.PI/2,.02,true);assert.equal(state.angle,-Math.PI/2);assert.equal(state.velocity,0);});
test('an inactive arm stays folded in the panel gap while its partner stitches',()=>{for(const side of[-1,1])for(let phase=0;phase<10;phase+=.1){const p=armPose(side,2,.5,{active:false,working:true,phase});assert.equal(p.base[2],.25);for(const joint of[p.shoulder,p.elbow,p.knuckle,p.wrist])assert.ok(joint[1]*side>=.163-1e-10&&joint[2]>=ARM_LAYOUT.restZ&&joint[2]<=ARM_LAYOUT.foldedWristZ+1e-10);assert.equal(p.reach,0);}});

test('Shift snap aligns either edge to clips or playhead without changing duration',()=>{const c=clip('moving',9,2),other=clip('target',4.127,2);assert.equal(snapClipStart([c,other],c,2.2,12).start,2.127);assert.equal(snapClipStart([c,other],c,10.1,12).start,10);assert.equal(snapClipStart([c,other],c,8.9,12).snapped,false);assert.equal(snapClipStart([c],c,7.1,12,{copy:true}).start,7);});
test('blend window is exactly the overlap while both sources keep their full extents',()=>{const p=move('blend'),a=p.clips.find(c=>c.id==='a'),b=p.clips.find(c=>c.id==='b'),w=blendWindow(a,p.clips);assert.equal(w.start,2);assert.equal(w.end,4);assert.equal(w.peer.id,'b');assert.equal(blendWindow(b,p.clips).peer.id,'a');assert.equal(a.in,0);assert.equal(a.out,4);});
test('reverse transport reverses samples, respects trim/rate, pauses and keeps sync position',async t=>{const prior=globalThis.AudioContext,param=()=>({value:0,setTargetAtTime(){}}),node=()=>({gain:param(),frequency:param(),Q:param(),delayTime:param(),threshold:param(),ratio:param(),connect(n){return n;},disconnect(){}});let ctx;globalThis.AudioContext=class{constructor(){ctx=this;this.currentTime=10;this.state='running';this.destination=node();this.sources=[];}createGain(){return node();}createDynamicsCompressor(){return node();}createAnalyser(){return node();}createBiquadFilter(){return node();}createDelay(){return node();}createBuffer(channels,length,rate){const data=new Float32Array(length);return{length,sampleRate:rate,duration:length/rate,getChannelData:()=>data};}createBufferSource(){const source={...node(),playbackRate:param(),start(...args){this.started=args;},stop(){this.stopped=true;}};this.sources.push(source);return source;}async resume(){}async close(){}};const e=createAudioEngine();t.after(()=>{e.dispose();if(prior)globalThis.AudioContext=prior;else delete globalThis.AudioContext;});const data=Float32Array.from([0,.1,.2,.3,.4,.5,.6,.7]),buffer={length:8,duration:1,sampleRate:8,getChannelData:()=>data};e.clips.push({id:'reverse',name:'Ramp',lane:0,start:2,in:.25,out:.75,rate:2,buffer,links:[]});const begin=e.playReverse();e.tick(performance.now()+7000);await begin;assert.deepEqual([...ctx.sources[0].buffer.getChannelData(0)],[...data].reverse());assert.equal(e.direction,-1);assert.ok(Math.abs(ctx.sources[0].started[1]-.25)<1e-8);assert.ok(Math.abs(ctx.sources[0].started[2]-.5)<1e-8);ctx.currentTime=10.14;const position=e.tick().position;assert.ok(Math.abs(position-2.15)<1e-8);e.pause();ctx.currentTime=11;assert.equal(e.tick().position,position);await e.playReverse();e.setSyncOffsetMs(-100);assert.equal(e.tick().position,position);assert.equal(ctx.sources.at(-1).playbackRate.value,2);});




test('navigation pauses sewing without discarding clips, and a busy rack keeps every pending write',()=>{
  const q=createAtelierQueue(),clips=Array.from({length:20},(_,i)=>clip('queued-'+i,i*2,1,i%4));
  q.sync(clips);assert.equal(q.pendingJobs.length,20);
  let job=q.update(.02);assert.equal(job.kind,'weave');const before=job.progress;
  for(let i=0;i<100;i++)assert.equal(q.update(.05,{blocked:true}),null);
  job=q.update(0);assert.equal(job.progress,before);assert.equal(q.pendingJobs.length,19);
  assert.ok(q.update(.02).progress>before);
});

test('a take already stitched while recording is not sewn twice, but undo restoration is',()=>{
  const q=createAtelierQueue(),recorded={...clip('take',10,2),visualRecorded:true,visualRecordedId:'take'};
  q.sync([recorded]);assert.equal(q.pendingJobs.length,0);
  q.sync([]);assert.equal(q.pendingJobs[0].kind,'delete');
  q.sync([recorded]);assert.equal(q.pendingJobs[0].kind,'restore');
  q.sync([recorded,{...recorded,id:'copied-take',start:15}]);assert.equal(q.pendingJobs.find(j=>j.id==='copied-take').kind,'weave');
});


test('blended strips occupy separate half-height bands and each band can be picked directly',()=>{
  const pair=move('blend').clips,a=pair.find(c=>c.id==='a'),b=pair.find(c=>c.id==='b');
  assert.deepEqual(clipBand(a,pair),{top:0,height:.5});assert.deepEqual(clipBand(b,pair),{top:.5,height:.5});
  assert.equal(clipAtPoint(pair,{x:0,y:.1125+.015},3,null,false,3).id,'a');
  assert.equal(clipAtPoint(pair,{x:0,y:.1125-.015},3,null,false,3).id,'b');
  assert.equal(clipAtPoint(pair,{x:0,y:.1125-.015},1,null,false,1),null);
  assert.deepEqual(clipBand({...a,links:[]},pair),{top:0,height:1});
});

test('queued blend partners retain canonical bands and overlap after one clip is temporarily hidden',()=>{
  const source=[clip('a',0,4,0),clip('b',8,4,1)],pair=placementPlan(source,'b',{start:2,lane:0},{strategy:'blend'}).clips;
  const projected=pair.map(c=>stableBlendAppearance(c,pair));
  for(const visible of projected){
    const alone=[visible];
    assert.deepEqual(clipBand(visible,alone),{top:visible.id==='a'?0:.5,height:.5});
    assert.deepEqual(clipBand(visible,alone,false),{top:0,height:1});
    assert.deepEqual(blendWindow(visible,alone),{start:2,end:4,peer:null});
    const manufactured={...visible,links:[],start:10,blendRange:{start:12,end:14}};
    assert.deepEqual(clipBand(manufactured,[manufactured]),{top:visible.id==='a'?0:.5,height:.5});
    assert.equal(blendWindow(manufactured,[manufactured]).start,12);
  }
  assert.equal(clipAtPoint(pair,{x:0,y:.1125-.015},3,'a',false,3,false).id,'a');
});

test('overlapping 2D clips paint both source waveforms within the shared interval',()=>{
  const pair=move('blend').clips,a=pair.find(c=>c.id==='a');
  const strokes=stackBlends=>{const lines=[];const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(x,y){lines.push([x,y]);},stroke(){}};drawClipWaveform(ctx,a,pair,4,30,{stackBlends});return lines;};
  assert.equal(strokes(true).length,4);
  const overlapping=strokes(false);assert.equal(overlapping.length,6);
  assert.equal(new Set(overlapping.filter(([x])=>x===2).map(([,y])=>y)).size,2);
});

test('drag previews leave a grey source and a separate destination without mutating clip placement',()=>{
  const pair=move('blend').clips,source=pair[0],before=JSON.stringify(pair),preview={clip:{...source,start:15,lane:1,links:[]},valid:true,sourceId:source.id};
  const visual=dragPreviewClips(pair,preview);assert.equal(JSON.stringify(pair),before);
  assert.equal(visual.find(c=>c.id===source.id).visualGhost,true);assert.equal(visual.find(c=>c.id===source.id).start,source.start);
  const destination=visual.find(c=>c.id==='__odd_drag_preview__');assert.equal(destination.start,15);assert.equal(destination.lane,1);assert.equal(destination.preview,'valid');assert.deepEqual(clipBand(destination,visual),{top:0,height:1});
});

test('replacing part of an existing blend preserves separable source pairs outside the replacement',()=>{
  const pair=placementPlan([clip('a',4,6),clip('b',12,6)],'b',{start:4},{strategy:'blend'}).clips;
  const candidate=clip('new',6,2),plan=placementPlan([...pair,candidate],'new',{}, {strategy:'replace'});
  assert.equal(validateLayout(plan.clips),true);assert.equal(plan.clips.length,5);assert.ok(plan.clips.find(c=>c.id==='a').links.length===1);assert.ok(plan.clips.find(c=>c.id==='a-after-new').links.length===1);
  assert.ok(plan.clips.filter(c=>c.id!=='new').every(c=>c.buffer===buffer));
});
