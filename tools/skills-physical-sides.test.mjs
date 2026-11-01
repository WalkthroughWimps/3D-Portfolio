import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class Vector3{
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  applyQuaternion(pose){this.z=pose.front?Math.abs(this.z):-Math.abs(this.z);return this;}
}
globalThis.__skillsTestThree={Vector3};
async function loadSource(path){
  const source=(await readFile(new URL(path,import.meta.url),'utf8'))
    .replace("import * as THREE from 'three';",'const THREE=globalThis.__skillsTestThree;');
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}
const [{PanelMotion},{PanelGraphicOrientation}]=await Promise.all([
  loadSource('../_7-shared-scripts/panel-assembly/preview-motion.mjs'),
  loadSource('../_7-shared-scripts/panel-assembly/PanelGraphicOrientation.mjs')
]);

function motionFixture(){
  const panel={record:{panelId:'card',axes:[{}]},baseQuaternion:{front:true},clicked:false,visibleArtworkSide:'icon'};
  const motion=Object.create(PanelMotion.prototype);
  Object.assign(motion,{panels:new Map([['card',panel]]),active:new Map(),queue:new Map(),righting:new Map(),
    displayBaseline:'icon',clickedSide:'name',focused:true,rig:{options:{},isPanelVisible:()=>true},
    _safeOptions:()=>true,_cancelRighting:()=>{},_scheduleRighting:()=>{},_changed:()=>{},
    setClicked:(id,value)=>{assert.equal(id,'card');panel.clicked=value;return true;},onDisplayChange:()=>{}});
  return {motion,panel};
}

test('the two prints stay on their physical materials as the card turns',()=>{
  const {motion,panel}=motionFixture();
  const graphics=Object.create(PanelGraphicOrientation.prototype);
  const icon={id:'icon'},name={id:'name'},front={map:null},back={map:null};
  graphics.motion=motion;graphics.artwork=new Map([['card',{front,back}]]);
  graphics.setArtwork('card',{iconFront:icon,iconBack:{id:'mirrored icon'},nameFront:{id:'mirrored name'},nameBack:name});
  assert.equal(front.map,icon);assert.equal(back.map,name);
  panel.baseQuaternion.front=false;graphics.syncDisplay('card');
  assert.equal(panel.visibleArtworkSide,'name');
  assert.equal(front.map,icon);assert.equal(back.map,name);
  panel.baseQuaternion.front=true;graphics.syncDisplay('card');
  assert.equal(panel.visibleArtworkSide,'icon');
  assert.equal(front.map,icon);assert.equal(back.map,name);
});

test('click and restored display intent queue a physical half turn',()=>{
  const {motion,panel}=motionFixture();
  assert.equal(motion.clickToggle('card'),true);
  assert.equal(panel.clicked,true);
  assert.equal(motion.getLogicalSide('card'),'name');
  assert.equal(motion._physicalSide(panel),'icon');
  assert.equal(motion.queue.get('card').target,Math.PI);
  motion.queue.clear();panel.clicked=false;panel.displayFlipped=false;
  assert.equal(motion.setDisplayFlipped('card',true),true);
  assert.equal(motion.queue.get('card').landingSide,'name');
});

test('a click during hover preserves the entry turn and changes its exit parity',()=>{
  const {motion,panel}=motionFixture();
  const turn={panel,hover:true,hovered:true,startSide:'icon',angle:.4,target:Math.PI};
  motion.active.set('card',turn);
  motion._setTurnTarget=(active,target)=>{active.target=target;};
  motion.clickToggle('card');
  assert.equal(turn.hovered,true);
  assert.equal(turn.target,Math.PI);
  turn.hovered=false;
  assert.equal(motion._hoverRestTarget(turn),Math.PI);
  motion._setIntent(panel,'icon');
  assert.equal(motion._hoverRestTarget(turn),2*Math.PI);
});
