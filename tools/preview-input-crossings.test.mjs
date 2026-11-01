import test from 'node:test';
import assert from 'node:assert/strict';
import {createPointerTrail,panelAtSlot,tracePanelSlotSegment} from '../_7-shared-scripts/panel-assembly/pointer-slot-traversal.mjs';

class Point {
  constructor(x,y=0){this.x=x;this.y=y;}
  clone(){return new Point(this.x,this.y);}
  lerp(other,t){this.x+=(other.x-this.x)*t;this.y+=(other.y-this.y)*t;return this;}
}
const point=x=>new Point(x);
const slot=(id,x,width=.4)=>({panel:{id},center:point(x),width});

test('fast pointer segment visits slots skipped between its endpoints in travel order',()=>{
  const slots=[slot('first',0),slot('skipped',1),slot('last',2)];
  const from=point(-.4),to=point(2),trail=createPointerTrail();
  trail.push(from,0);
  const events=tracePanelSlotSegment(from,to,slots,panelAtSlot);
  assert.deepEqual(events.map(({type,panel})=>`${type}:${panel.id}`),[
    'enter:first','exit:first','enter:skipped','exit:skipped','enter:last'
  ]);
  assert.deepEqual(events.map(({t})=>t),[...events.map(({t})=>t)].sort((a,b)=>a-b));
  const directions=events.map(({type,t})=>{
    trail.push(from.clone().lerp(to,t),t*100);
    return trail.direction(type==='enter');
  });
  assert.deepEqual(directions,['W','E','W','E','W']);
});

test('face-plane selection uses the nearest enabled footprint',()=>{
  const slots=[slot('left',0,1),slot('right',.4,1)];
  assert.equal(panelAtSlot(point(.1),slots),slots[0].panel);
  assert.equal(panelAtSlot(point(.35),slots),slots[1].panel);
  assert.equal(panelAtSlot(point(1),slots),null);
  assert.equal(panelAtSlot(null,slots),null);
  assert.equal(panelAtSlot(point(.1),slots.slice(1)),slots[1].panel);
});

test('segment samples receive only footprints covering their midpoint',()=>{
  const slots=[slot('first',0,.5),slot('second',1,.5),slot('off-path',2,.5)];
  const seen=[];
  tracePanelSlotSegment(point(-.4),point(1.4),slots,(sample,candidates)=>{
    seen.push({x:sample.x,ids:candidates.map(({panel})=>panel.id)});
    assert.ok(candidates.every(({center,width})=>Math.abs(sample.x-center.x)<width/2));
    return candidates[0]?.panel||null;
  });
  assert.ok(seen.some(({ids})=>ids.includes('first')));
  assert.ok(seen.some(({ids})=>ids.includes('second')));
  assert.ok(seen.every(({ids})=>!ids.includes('off-path')));
});

test('long dense pointer trails retain the recent heading and bounded length',()=>{
  const trail=createPointerTrail(.18);
  for(let i=0;i<10000;i++)trail.push(point(i*.0002),i*.01);
  assert.ok(Math.abs(trail.length-.18)<1e-7);
  assert.equal(trail.direction(),'E');
});
