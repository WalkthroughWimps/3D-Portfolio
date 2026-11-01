import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const moduleURL = path => 'data:text/javascript;base64,' + readFileSync(new URL(path, import.meta.url)).toString('base64');
const THREE = await import(moduleURL('../_3-graphics/shelf/vendor/three.module.js'));
const {makePlane, planeWorld, fitSurface, aboutSourceId} = await import(moduleURL('../_7-shared-scripts/sticky-notes/placement.js'));
const appearance = moduleURL('../_7-shared-scripts/sticky-notes/note-appearance.js');
const dataSource = readFileSync(new URL('../_7-shared-scripts/sticky-notes/data.js', import.meta.url), 'utf8').replace("'./note-appearance.js'", JSON.stringify(appearance));
const {validateBundle} = await import('data:text/javascript;base64,' + Buffer.from(dataSource).toString('base64'));
const vec = (x,y,z) => new THREE.Vector3(x,y,z);
test('v2 preserves hit and local offsets under nonuniform scaling', () => {
  const parent = new THREE.Group();
  const source = new THREE.Mesh(new THREE.PlaneGeometry(2,2), new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  parent.add(source); source.scale.set(2,3,.5); source.rotation.set(.2,.4,.3); parent.updateMatrixWorld(true);
  const hit=vec(.2,.1,0).applyMatrix4(source.matrixWorld), normal=vec(0,0,1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(source.matrixWorld));
  const tangent=vec(1,0,0).transformDirection(source.matrixWorld), displacement=tangent.clone().multiplyScalar(.03), clearance=normal.clone().multiplyScalar(.003);
  const plane=makePlane(THREE,source,hit,normal,tangent,displacement,clearance);
  assert.ok(vec(...plane.point).applyMatrix4(source.matrixWorld).distanceTo(hit)<1e-9);
  const p=vec(0,0,0), n=p.clone(), t=p.clone(); planeWorld(THREE,source,plane,p,n,t);
  assert.ok(p.distanceTo(hit.clone().add(displacement).add(clearance))<1e-9);
  assert.ok(n.distanceTo(normal)<1e-9); assert.ok(Math.abs(n.dot(t))<1e-9);
  parent.position.set(2,-1,3); parent.rotation.set(.4,-.2,.1); parent.scale.set(.7,1.6,2); parent.updateMatrixWorld(true);
  planeWorld(THREE,source,plane,p,n,t);
  const expected=vec(...plane.point).add(vec(...plane.displacement)).add(vec(...plane.clearance)).applyMatrix4(source.matrixWorld);
  const expectedNormal=vec(...plane.normal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(source.matrixWorld));
  assert.ok(p.distanceTo(expected)<1e-9); assert.ok(n.distanceTo(expectedNormal)<1e-9); assert.ok(Math.abs(n.dot(t))<1e-9);
  const bundle={version:1,notes:[{id:'note_12345678',pageId:'docs',text:'',color:'#ffffff',rotation:0,size:1,anchor:{surface:'context:docs:test',triangle:0,bary:[1,0,0],plane}}]};
  assert.deepEqual(validateBundle(validateBundle(bundle)).notes[0].anchor.plane,plane);
  assert.throws(()=>validateBundle({...bundle,notes:[{...bundle.notes[0],anchor:{...bundle.notes[0].anchor,plane:{...plane,clearance:[NaN,0,0]}}}]}));
});
test('bounded placement shifts away from nearby geometry and rejects tall obstruction', () => {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const source=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material); source.updateMatrixWorld();
  const blocker=new THREE.Mesh(new THREE.BoxGeometry(.08,.5,.2),material); blocker.position.set(.13,0,.2); blocker.updateMatrixWorld();
  const args={point:vec(0,0,0),normal:vec(0,0,1),tangent:vec(1,0,0),source,candidates:[source,blocker],half:.125};
  const fit=fitSurface(THREE,args); assert.ok(fit); assert.ok(fit.displacement.length()>0); assert.ok(fit.clearance.length()<.01);
  blocker.scale.set(10,10,1); blocker.updateMatrixWorld(); assert.equal(fitSurface(THREE,args),null);
});

test('shallow relief uses a capped lift only after shifts fail', () => {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const source=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material); source.updateMatrixWorld();
  const relief=new THREE.Mesh(new THREE.BoxGeometry(1,1,.004),material); relief.position.z=.008; relief.updateMatrixWorld();
  const args={point:vec(0,0,0),normal:vec(0,0,1),tangent:vec(1,0,0),source,candidates:[source,relief],half:.125};
  const fit=fitSurface(THREE,args); assert.ok(fit); assert.ok(fit.clearance.length() > .003); assert.ok(fit.clearance.length() <= .015);
  relief.position.z=.04; relief.updateMatrixWorld(); assert.equal(fitSurface(THREE,args),null);
});

test('new About source identity follows an independently moving child', () => {
  const parent = new THREE.Group(), child = new THREE.Mesh(new THREE.PlaneGeometry(1,1));
  parent.add(child); parent.updateMatrixWorld(true);
  const plane=makePlane(THREE,child,vec(.1,.2,0),vec(0,0,1),vec(1,0,0),vec(0,0,0),vec(0,0,.003));
  assert.equal(aboutSourceId({nodes:42,primitives:1}), 'about:plane:source:gltf:42:1');
  assert.equal(aboutSourceId(null,'face.knob'), 'about:plane:source:owned:face.knob');
  assert.equal(aboutSourceId({meshes:42}), null);
  const legacyV2=makePlane(THREE,parent,vec(.1,.2,0),vec(0,0,1),vec(1,0,0),vec(0,0,0),vec(0,0,.003));
  const before=vec(0,0,0), after=vec(0,0,0), n=vec(0,0,0), t=vec(0,0,0);
  planeWorld(THREE,child,plane,before,n,t);
  child.position.set(.3,.1,.4); child.rotation.y=.4; parent.updateMatrixWorld(true);
  planeWorld(THREE,child,plane,after,n,t);
  assert.ok(after.distanceTo(vec(.1,.2,.003).applyMatrix4(child.matrixWorld))<1e-9);
  assert.ok(after.distanceTo(before)>.1);
  const oldPosition=vec(0,0,0); planeWorld(THREE,parent,legacyV2,oldPosition,n,t);
  assert.ok(oldPosition.distanceTo(before)<1e-9);
  assert.deepEqual(parent.position.toArray(),[0,0,0]);
  const bundle={version:1,notes:[{id:'note_12345678',pageId:'about',text:'',color:'#ffffff',rotation:0,size:1,anchor:{surface:aboutSourceId({nodes:42,primitives:1}),triangle:0,bary:[1,0,0],plane}}]};
  assert.deepEqual(validateBundle(bundle).notes[0].anchor, bundle.notes[0].anchor);
});
test('thin obstacle between samples demonstrates discrete sampling limit', () => {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const source=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material); source.updateMatrixWorld();
  const screen=new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.2),material); screen.position.set(.06,.06,.1); screen.updateMatrixWorld();
  const result=fitSurface(THREE,{point:vec(0,0,0),normal:vec(0,0,1),tangent:vec(1,0,0),source,candidates:[source,screen],half:.125});
  assert.ok(result); assert.equal(result.displacement.length(),0);
});
