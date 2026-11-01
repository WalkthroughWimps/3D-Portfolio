import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { growUpperTablet, UPPER_TABLET_HEIGHT_SCALE } from '../_5-music/music-tablet-proportions.mjs';

class Vector {
  constructor(x=0,y=0,z=0){ Object.assign(this,{x,y,z}); }
  clone(){ return new Vector(this.x,this.y,this.z); }
  copy(other){ return this.set(other.x,other.y,other.z); }
  set(x,y,z){ Object.assign(this,{x,y,z}); return this; }
  add(other){ this.x+=other.x;this.y+=other.y;this.z+=other.z;return this; }
  applyQuaternion({x,y,z,w}){
    const vx=this.x,vy=this.y,vz=this.z;
    this.x=(1-2*y*y-2*z*z)*vx+(2*x*y-2*w*z)*vy+(2*x*z+2*w*y)*vz;
    this.y=(2*x*y+2*w*z)*vx+(1-2*x*x-2*z*z)*vy+(2*y*z-2*w*x)*vz;
    this.z=(2*x*z-2*w*y)*vx+(2*y*z+2*w*x)*vy+(1-2*x*x-2*y*y)*vz;
    return this;
  }
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} equals ${b}`);
function fixture(){
  const tablet={name:"pe'rPad_tablet",position:new Vector(244,2,-2845),scale:{x:2.4,y:2.5,z:2.5},
    quaternion:{x:-Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2},
    geometry:{boundingBox:{min:{y:-1100},max:{y:1100}}},updateWorldMatrix(){}};
  const stand={name:'tablet_stand',position:new Vector(0,.43,0),scale:{x:.00005,y:.00005,z:.00005}};
  const lower={name:'SK_backboard_screen',position:new Vector(1,2,3),scale:{x:1,y:1,z:1}};
  const root={traverse:fn=>[stand,tablet,lower].forEach(fn)};
  const point=y=>new Vector(0,y*tablet.scale.y,0).applyQuaternion(tablet.quaternion).add(tablet.position);
  return {tablet,stand,lower,root,point};
}

test('frame and child screen grow upward by 25%, preserving bottom clearance, width and lower assembly',()=>{
  const {tablet,stand,lower,root,point}=fixture();
  const bottom=point(-1100),top=point(1100),screenBottom=point(-990),screenTop=point(990);
  const lowerBefore=JSON.stringify([stand,lower]);
  growUpperTablet(root);
  assert.equal(UPPER_TABLET_HEIGHT_SCALE,1.25);
  for(const axis of ['x','y','z']) near(point(-1100)[axis],bottom[axis]);
  near(Math.hypot(...['x','y','z'].map(axis=>point(1100)[axis]-point(-1100)[axis])),Math.hypot(top.x-bottom.x,top.y-bottom.y,top.z-bottom.z)*1.25);
  near(Math.hypot(...['x','y','z'].map(axis=>point(990)[axis]-point(-990)[axis])),Math.hypot(screenTop.x-screenBottom.x,screenTop.y-screenBottom.y,screenTop.z-screenBottom.z)*1.25);
  assert.equal(tablet.scale.x,2.4);assert.equal(tablet.scale.z,2.5);
  assert.equal(JSON.stringify([stand,lower]),lowerBefore);
});

test('the preview is idempotent and returning its scale to 1 restores the original transform',()=>{
  const {tablet,root}=fixture();
  const before=JSON.stringify({position:tablet.position,scale:tablet.scale});
  growUpperTablet(root);
  const grown=JSON.stringify({position:tablet.position,scale:tablet.scale});
  growUpperTablet(root);
  assert.equal(JSON.stringify({position:tablet.position,scale:tablet.scale}),grown);
  growUpperTablet(root,1);
  assert.equal(JSON.stringify({position:tablet.position,scale:tablet.scale}),before);
  assert.equal(growUpperTablet({traverse(){}}),null);
});

test('actual GLB places the screen under the upper frame and growth precedes canvas aspect measurement',t=>{
  const glbPath=new URL('../assets/glb/toy-piano.glb',import.meta.url);
  if(!existsSync(glbPath)){t.skip('Local model not hydrated');return;}
  const bytes=readFileSync(glbPath);
  const data=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const tablet=data.nodes.find(node=>node.name==="pe'rPad_tablet");
  const screenIndex=data.nodes.findIndex(node=>node.name==="pe'rPad_screen");
  assert.ok(tablet.children.includes(screenIndex));
  const source=readFileSync(new URL('../_5-music/music-piano-controls.v2.js',import.meta.url),'utf8');
  const load=source.slice(source.indexOf('gltf => {'));
  assert.ok(load.indexOf('growUpperTablet(root)')<load.indexOf('root.traverse'));
  assert.ok(load.indexOf('root.traverse')<load.indexOf('createTopPadCanvas(aspect)'));
});
