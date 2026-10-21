import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('./scroll-tablet-model.js', import.meta.url), 'utf8');
const {SCROLL_RIG: rig,createScrollMotion,scrollPose,scrollViewport,quadMatrix,faceExposure,TABLET_SCREENS,railAssembly} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('glass follows face exposure during the dwell while arm speeds remain configurable', () => {
  const motion=createScrollMotion();
  let state=motion.update(.3,false,false,{facing:faceExposure(.94)});
  assert.equal(state.lift,rig.lift);assert.equal(state.progress,0);assert.equal(state.unroll,0);
  state=motion.update(.4,false,false,{facing:faceExposure(.45)});assert.equal(state.lift,0);
  state=motion.update(rig.openSeconds/2,true,false,{facing:1,armSpeed:.5});assert.equal(state.progress,.25);assert.equal(state.ready,false);
  state=motion.update(rig.openSeconds,true,false,{facing:1,armSpeed:1});assert.equal(state.ready,true);
  state=motion.update(rig.closeSeconds/4,false,false,{facing:0,separateSpeeds:true,armSpeed:.25,foldSpeed:2});assert.equal(state.progress,.5);assert.equal(state.lift,rig.lift);
  state=motion.update(0,true,true,{facing:.5});assert.equal(state.ready,true);assert.equal(state.lift,rig.lift);
  assert.equal(motion.reset().lift,0);
});

test('two folding guides lock before both top carriages rise', () => {
  for(const side of [-1,1])for(let step=0;step<=600;step++){
    const state=createScrollMotion().update(rig.openSeconds*step/600,true),p=scrollPose(side,state,{x:side*1.7,y:0,width:1.2,height:1.9});
    const a=railAssembly(p);assert.equal(a.links.length,2);
    a.links.forEach(([from,to])=>assert.ok(Math.abs(Math.hypot(...from.map((v,i)=>v-to[i]))-a.linkLength)<1e-9));
    assert.ok(Math.abs(a.mountingLength-rig.rodGap)<1e-9);
    if(!p.locked){assert.equal(state.unroll,0);assert.ok(a.carriageTravel<p.guideLength);}
    else assert.ok(a.upper[1]>a.lower[1]);
    a.rails.forEach(([from,to])=>assert.ok(Math.abs(Math.hypot(...from.map((v,i)=>v-to[i]))-p.guideLength)<1e-9));
    if(p.fold>0){assert.equal(p.track,1);assert.equal(p.orientation,1);}
  }
});

test('rail hinge nests parallel to dowels and straightens before joint traversal',()=>{
  for(const side of [-1,1]){
    const target={x:side*1.7,y:0,width:1.2,height:1.9};
    const closed=railAssembly(scrollPose(side,createScrollMotion().state,target));
    assert.ok(Math.abs(closed.hinge[1]-closed.lower[1])<1e-12);
    assert.ok(Math.abs(closed.tip[0]-closed.lower[0])<1e-12);
    const p=scrollPose(side,createScrollMotion().update(rig.openSeconds,true),target),a=railAssembly(p);
    assert.ok(Math.abs(a.hinge[0]-a.lower[0])<1e-12);assert.ok(Math.abs(a.tip[0]-a.lower[0])<1e-12);
    assert.ok(a.carriageTravel>p.guideLength);assert.ok(a.carriageTravel<2*p.guideLength);
    assert.ok(Math.abs(a.upper[1]-a.lower[1]-target.height)<1e-12);
  }
});

test('sampled rail, bearing and carrier envelopes clear the pane and chassis opening',()=>{
  let pane=Infinity,chassis=Infinity;
  for(const side of [-1,1])for(const width of [.4,.8,1.2,rig.maxWidth])for(let step=0;step<=600;step++){
    const state=createScrollMotion().update(rig.openSeconds*step/600,true),p=scrollPose(side,state,{x:side*1.7,y:0,z:.36,width,height:width*900/546}),a=railAssembly(p);
    const segments=[...a.links,...a.rails,[a.carriage,a.upper,.007],...a.rollers.map(w=>[...w.axle,w.radius])];
    for(const point of [a.base,a.elbow])segments.push([point,point,.019]);
    for(const point of [a.lower,a.upper])segments.push([point,point,.026]);
    segments.push([a.hinge,a.hinge,.022],[a.tip,a.tip,.016]);
    for(const v of [[0,0,0],a.upperLocal]){
      const start=a.point(v),end=a.point([v[0]+side*(p.width+.074),v[1],v[2]]);
      segments.push([start,end,.013],[start,start,.026],[end,end,.024]);
    }
    for(let n=0;n<3;n++)segments.push([[side*.85,-side*.18,.08+.08*p.track*n],[side*.85,-side*.18,.2+.08*p.track*n],.011-.002*n]);
    for(const [from,to,r]of segments)for(let n=0;n<=40;n++){
      const q=from.map((v,j)=>v+(to[j]-v)*n/40),z=q[2]+state.lift+rig.seat;
      const paneGap=Math.hypot(Math.max(0,Math.hypot(q[0],q[1])-rig.radius),Math.max(0,q[2]-.002,-.013-q[2]))-r;pane=Math.min(pane,paneGap);assert.ok(paneGap>0,'pane envelope');
      const chassisGap=Math.hypot(Math.max(0,rig.openingRadius-Math.hypot(q[0],q[1])),Math.max(0,z-.034,-.026-z))-r;chassis=Math.min(chassis,chassisGap);assert.ok(chassisGap>0,'chassis envelope');
    }
  }
  console.log(`sampled pane clearance ${pane.toFixed(5)}, chassis opening ${chassis.toFixed(5)}`);
});

test('tablet viewport layouts keep controls within the available screen without forcing zoom', () => {
  for(const width of [320,390,720,1000,1280,1920])for(const availableRight of [width,width*.8]){
    const v=scrollViewport({width,height:900,availableRight,top:170,layers:true});
    if(v.hidden)continue;
    assert.ok(v.left.x>=0);assert.ok(v.left.x+v.left.width<=v.right.x);assert.ok(v.right.x+v.right.width<=availableRight);
    assert.ok(v.left.y+v.left.height<=900);assert.equal(v.zoom,1);
    if(v.narrow)assert.ok(v.left.height<=900*.38);
    assert.equal(v.offset,(width-availableRight)/2);
  }
  const fit=scrollViewport({width:1600,height:900,top:170,fit:true,glassLeft:-1000,glassRight:2600});
  assert.ok(fit.zoom>0&&fit.zoom<1);
});

test('perspective HTML matrices exactly meet all four rendered screen corners', () => {
  for(const points of [[{x:12,y:80},{x:312,y:80},{x:312,y:680},{x:12,y:680}],
    [{x:10,y:20},{x:500,y:90},{x:450,y:600},{x:50,y:550}]]){
    const matrix=quadMatrix(points,320,600);assert.ok(matrix);
    [[0,0],[320,0],[320,600],[0,600]].forEach(([x,y],i)=>{
      const w=matrix[3]*x+matrix[7]*y+1;
      assert.ok(Math.abs((matrix[0]*x+matrix[4]*y+matrix[12])/w-points[i].x)<1e-8);
      assert.ok(Math.abs((matrix[1]*x+matrix[5]*y+matrix[13])/w-points[i].y)<1e-8);
    });
  }
  assert.equal(quadMatrix(Array(4).fill({x:0,y:0}),300,600),null);
  assert.equal(quadMatrix([{x:NaN,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],300,600),null);
});

test('scrolls return to the rim after zooming out and only clamp at the viewport boundary',()=>{
  const small=scrollViewport({width:2000,height:1000,glassLeft:900,glassRight:1100});
  assert.equal(small.left.x+small.left.width,868);assert.equal(small.right.x,1132);
  const large=scrollViewport({width:2000,height:1000,glassLeft:100,glassRight:1900});
  assert.equal(large.left.x,40);assert.equal(large.right.x+large.right.width,1960);
  assert.ok(small.left.x>large.left.x);assert.ok(small.right.x<large.right.x);
});

test('glass waits for full arm stow, lowers smoothly and reverses without resetting motion',()=>{
  const motion=createScrollMotion();motion.update(rig.openSeconds,true,false,{facing:1});
  let s=motion.update(.5,false,false,{facing:0});assert.ok(s.progress>0&&s.progress<1);assert.equal(s.lift,rig.lift);
  const closing=s.progress;s=motion.update(.2,true,false,{facing:1});assert.ok(s.progress>closing&&s.progress<1);assert.equal(s.lift,rig.lift);
  motion.update(rig.closeSeconds,false,false,{facing:0});s=motion.update(.1,false,false,{facing:0});assert.ok(s.lift>=0&&s.lift<rig.lift);
  assert.equal(motion.update(.4,false,false,{facing:0}).lift,0);
});

test('viewport scaling preserves both immutable framebuffer aspect ratios at every size',()=>{
  for(const width of [320,390,720,1280,1920])for(const height of [600,900,1200]) {
    const v=scrollViewport({width,height});[v.left,v.right].forEach((r,i)=>{assert.ok(Math.abs(r.width/r.height-TABLET_SCREENS[i].width/TABLET_SCREENS[i].height)<1e-9);});
  }
});

test('rigid scroll rods keep their full length and separate bobs through a complete cycle',()=>{
  for(const side of [-1,1])for(const width of [.4,.9,rig.maxWidth]) {
    const target={x:side*1.5,y:0,width,height:width*900/546};
    const motion=createScrollMotion();
    for(const open of [true,false])for(let step=0;step<=500;step++) {
      const p=scrollPose(side,motion.update(.01,open),target);
      assert.equal(p.width,width);
      assert.ok(Math.abs(p.fixedY-p.movingY)>=2*rig.bobRadius+.0099);
      assert.equal(p.yaw,0);
    }
  }
  assert.equal(TABLET_SCREENS[0].width,TABLET_SCREENS[1].width);
});
