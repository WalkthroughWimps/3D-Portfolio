import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stepInnerSpeed} from '../_1-about/faces/odd/meter-settings.mjs';
import {createAudioEngine} from '../_1-about/faces/odd/audio-engine.mjs';
const schema=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../_7-shared-scripts/core/settings-schema.js',import.meta.url),'utf8')).toString('base64'));

test('rotation arrows move by tenths or whole multipliers and clamp at both limits',()=>{
  assert.equal(stepInnerSpeed(.2,1),.3);
  assert.equal(stepInnerSpeed(.2,1,true),1.2);
  assert.equal(stepInnerSpeed(4.9,1,true),5);
  assert.equal(stepInnerSpeed(.3,-1,true),.2);
  let speed=.2;for(let i=0;i<48;i++)speed=stepInnerSpeed(speed,1);assert.equal(speed,5);
});
test('constructor and cylinder preferences validate persisted and cross-page values',()=>{
  const fields=schema.SETTINGS_FIELDS;
  assert.equal(fields['about.odd.sewingAnimations'].parse('false'),false);
  assert.equal(fields['about.odd.innerRotation'].parse('none'),'none');
  assert.equal(fields['about.odd.innerRotation'].parse('counterclockwise'),'counterclockwise');
  assert.equal(fields['about.odd.innerRotation'].parse('invalid'),undefined);
  assert.equal(fields['about.odd.innerSpeed'].parse(10),5);
  assert.equal(fields['about.odd.innerSpeed'].parse(''),undefined);
  for(const name of ['mainMeterWidth','mainMeterHeight','trackMeterWidth','trackMeterHeight']){
    assert.equal(fields['about.odd.'+name].default,1);
    assert.equal(fields['about.odd.'+name].parse(.1),.6);
    assert.equal(fields['about.odd.'+name].parse(2),1.1);
    assert.equal(fields['about.odd.'+name].parse(NaN),undefined);
  }
});
test('output mute retains the prior numeric volume through repeated toggles',()=>{
  const engine=createAudioEngine();
  try{engine.setMaster(.5);for(let i=0;i<3;i++){engine.setMuted(true);assert.equal(engine.muted,true);assert.equal(engine.volume,.5);engine.setMuted(false);assert.equal(engine.muted,false);assert.equal(engine.volume,.5);}}
  finally{engine.dispose();}
});
