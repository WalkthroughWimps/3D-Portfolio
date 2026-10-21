import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FABRIC_TIMING,classifyFabricTime,fabricTimingRows} from '../_1-about/faces/odd/fabric-timing.mjs';
const schemaSource=readFileSync(new URL('../_7-shared-scripts/core/settings-schema.js',import.meta.url),'utf8');
const {SETTINGS_FIELDS}=await import('data:text/javascript,'+encodeURIComponent(schemaSource));

test('tick spacing is saved as whole milliseconds within the constructor range',()=>{
  const field=SETTINGS_FIELDS['about.odd.tickSpacingMs'];
  assert.equal(field.default,200);
  assert.equal(field.parse('333'),333);
  assert.equal(field.parse(333.6),334);
  assert.equal(field.parse(20),50);
  assert.equal(field.parse(1200),1000);
  assert.equal(field.parse(''),undefined);
  assert.equal(FABRIC_TIMING.subdivision,.2);
});

test('fine ticks and exact major markers form one valley sequence at every spacing',()=>{
  for(const spacing of [50,200,300,333,1000]){
    const rows=fabricTimingRows(0,60,spacing);
    const valleys=rows.filter(row=>row.mark);
    const times=valleys.map(row=>row.time);
    assert.equal(new Set(times).size,times.length,`duplicate valley at ${spacing} ms`);
    assert.ok(times.every((time,i)=>i===0||time>times[i-1]));
    for(const second of [0,1,5,10,30,59]){
      assert.equal(times.filter(time=>time===second).length,1,`${second} s at ${spacing} ms`);
      assert.equal(valleys.find(row=>row.time===second).mark.seconds,second%30===0?30:second%10===0?10:second%5===0?5:1);
    }
    for(let ms=0;ms<60000;ms+=spacing)assert.ok(times.includes(ms/1000),`missing fine tick ${ms} ms`);
    assert.equal(rows.length,valleys.length*2);
    for(let i=1;i<rows.length;i+=2){
      assert.equal(rows[i].mark,null);
      assert.ok(Math.abs(rows[i].time-(rows[i-1].time+(rows[i+1]?.time??60))/2)<1e-12);
    }
  }
});

test('invalid direct spacing falls back to the 200 ms pattern',()=>{
  assert.deepEqual(fabricTimingRows(0,1,NaN),fabricTimingRows(0,1,200));
});

test('major glow and colors keep precedence when major and fine ticks coincide',()=>{
  for(const spacing of [200,300,333]){
    assert.equal(classifyFabricTime(1,spacing).glow,.3);
    assert.equal(classifyFabricTime(5,spacing).seconds,5);
    assert.equal(classifyFabricTime(10,spacing).seconds,10);
    assert.equal(classifyFabricTime(30,spacing).seconds,30);
    const fine=classifyFabricTime(spacing/1000,spacing);
    assert.equal(fine.seconds,spacing/1000);
    assert.equal(fine.glow,.15);
  }
});
