import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../_1-about/notes/gear-model.js',import.meta.url),'utf8');
const g=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const near=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-5);
const setup=(guide,roller,inside=true)=>({guide,roller,hole:.9,inside,x:500,y:500,largeTeeth:192,smallTeeth:37});

function contains(outline,p) {
  let inside=false,distance=Infinity;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const a=outline[j],b=outline[i];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    distance=Math.min(distance,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));
  }
  return {inside,distance};
}

test('independent sizes retain the partner radius and integer closure through restoration',()=>{
  for(const guide of g.GUIDES)for(const roller of g.ROLLERS) {
    const s=g.fitGearSetup(setup(guide.id,roller.id)),limits=g.gearSizing(s);
    const small={...s,smallTeeth:8},a=g.gearGeometry(small,false),b=g.gearGeometry({...small,largeTeeth:limits.minLarge},false);
    assert.ok(Math.abs(a.radius-b.radius)<1e-8);
    const c=g.gearGeometry({...small,smallTeeth:Math.min(limits.maxSmall,16)},false);
    assert.equal(c.track.length,a.track.length);
    near(a.pose(0).pen,a.pose(1).pen);near(c.pose(0).pen,c.pose(1).pen);
    const restored=g.restoreGears([{...s,layerId:'p'}],[{id:'p'}])[0];
    assert.equal(restored.largeTeeth,s.largeTeeth);assert.equal(restored.smallTeeth,s.smallTeeth);assert.equal(restored.inside,true);
  }
});

test('all six guides admit full-body inside rolling and centered Fit pane for every roller',()=>{
  for(const guide of g.GUIDES)for(const roller of g.ROLLERS) {
    const s=g.fitGearSetup(setup(guide.id,roller.id)),geom=g.gearGeometry(s);
    assert.ok(geom.envelope<=470.001);
    assert.ok(geom.points.length<=4000&&geom.points.every(p=>Math.hypot(p.x-500,p.y-500)<=470.1));
    const outline=Array.from({length:769},(_,i)=>geom.track.at(i/768*geom.track.length));
    for(let i=0;i<64;i++) {
      const pose=geom.pose(i/64);
      for(let j=0;j<geom.profile.outline.length;j+=6) {
        const w=pose.world(geom.profile.outline[j]),p={x:w.x-500,y:w.y-500},hit=contains(outline,p);
        assert.ok(hit.inside||hit.distance<.12,`${guide.id}/${roller.id} outside by ${hit.distance}`);
      }
    }
    near(geom.pose(0).pen,geom.pose(1).pen);
  }
});

test('Fit pane and Compact contain the outside mechanism without scaling its guide implicitly',()=>{
  for(const guide of g.GUIDES)for(const roller of g.ROLLERS)for(const compact of [false,true]) {
    const s=g.fitGearSetup({...setup(guide.id,roller.id,false),smallTeeth:80},compact),geom=g.gearGeometry(s,false);
    assert.ok(geom.envelope<=(compact?300:470)+1e-5,`${guide.id}/${roller.id}: ${geom.envelope}`);
    near(geom.pose(0).pen,geom.pose(1).pen);
  }
});

test('size changes expose new multi-lap paths instead of repeating the same outline',()=>{
  const a=g.gearGeometry({...setup('circle','circle-24'),largeTeeth:192,smallTeeth:24});
  const b=g.gearGeometry({...setup('circle','circle-24'),largeTeeth:192,smallTeeth:37});
  assert.equal(a.laps,1);assert.equal(b.laps,37);
  assert.notDeepEqual(a.points,b.points);assert.deepEqual(b.points[0],b.points.at(-1));
});
