import test from 'node:test';
import assert from 'node:assert/strict';
import {RIBBON,GUIDE,FOLDERS,EXIT_GUIDE,folderExitDepth,ribbonPoint} from '../_1-about/faces/odd/ribbon-path.mjs';

const routeT=(u,side)=>side<0?.30-u*.12:.70+u*.12;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const direction=(a,b)=>{const length=distance(a,b);return [(b.x-a.x)/length,(b.y-a.y)/length,(b.z-a.z)/length];};

test('aligned folders keep only a short straight return after each end roller',()=>{
  assert.ok(FOLDERS.centers.every(x=>x===FOLDERS.centers[0]));
  const gap=RIBBON.guideX-FOLDERS.centers[0]-FOLDERS.length/2;
  assert.ok(gap>.005&&gap<.045);
  for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(let i=0;i<=16;i++){
    const u=GUIDE.wrapEnd+(FOLDERS.entryU-GUIDE.wrapEnd)*i/16,p=ribbonPoint(routeT(u,side),30,0,lane);
    assert.ok(Math.abs(p.z-(GUIDE.centerZ-GUIDE.tapeRadius))<1e-10);
    assert.ok(p.fold<1e-10);
  }
});

test('folder-to-reel routes stay short, turn at most ninety degrees, and meet windings smoothly',()=>{
  for(const position of[0,15,30,45,60])for(const side of[-1,1])for(let lane=0;lane<4;lane++){
    const points=Array.from({length:257},(_,i)=>ribbonPoint(routeT(FOLDERS.exitU+(1-FOLDERS.exitU)*i/256,side),position,0,lane));
    let length=0,turn=0,prior=null;
    for(let i=1;i<points.length;i++){
      assert.ok(Number.isFinite(points[i].x+points[i].y+points[i].z));
      const d=direction(points[i-1],points[i]);length+=distance(points[i-1],points[i]);
      if(prior)turn+=Math.acos(Math.max(-1,Math.min(1,prior.reduce((sum,v,k)=>sum+v*d[k],0))));
      prior=d;
    }
    assert.ok(length/distance(points[0],points.at(-1))<1.2,'no detour or overshoot');
    assert.ok(turn<Math.PI/2+.03,'three-dimensional centerline turn <= 90 degrees');
    const t=side<0?.18:.82,a=ribbonPoint(t-.000001,position,0,lane),b=ribbonPoint(t,position,0,lane),c=ribbonPoint(t+.000001,position,0,lane),left=direction(a,b),right=direction(b,c);
    assert.ok(left.reduce((sum,v,k)=>sum+v*right[k],0)>.995,'reel contact has a continuous tangent');
  }
});


test('exit guide bodies stay behind the front track run for every axial slot',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++){
    assert.ok(folderExitDepth(side,lane)+EXIT_GUIDE.bodyLength/2<RIBBON.frontDepth-.001);
  }
});
