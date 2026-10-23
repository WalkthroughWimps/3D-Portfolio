import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const base=new URL('./',import.meta.url),THREE=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('vendor/three.module.js',base)).toString('base64'));
const context=vm.createContext({console,performance,setTimeout,clearTimeout,queueMicrotask,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}}),modules=new Map(),three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const [key,value] of Object.entries(THREE))this.setExport(key,value);},{context});
async function get(url){if(modules.has(url.href))return modules.get(url.href);const m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context,identifier:url.href});modules.set(url.href,m);return m;}
async function load(name){const m=await get(new URL(name,base));await m.link((name,from)=>name==='three'?three:get(new URL(name,from.identifier)));await m.evaluate();return m.namespace;}
const {createGradePendants}=await load('grade-pendants.mjs'),{resetPose,arcCamera,shelfView}=await load('view-reset.mjs'),{installItemViewControls}=await load('item-view-controls.mjs'),{easelFrame,easelVideoPolicy,createEaselVideo}=await load('easel-video.mjs');
const {shelfRotationPolicy}=await load('view-policy.mjs'),{createSettingsStore}=await load('../../_7-shared-scripts/core/settings.js');
const data=JSON.parse(fs.readFileSync(new URL('assets/navigation/grade-meshes.json',base))),binary=fs.readFileSync(new URL('assets/navigation/grade-meshes.bin',base)),values=new Float32Array(binary.buffer,binary.byteOffset,binary.byteLength/4);
test('all six pendants retain finite, normalized original relief geometry and normals',()=>{
 assert.equal(data.grades.length,6);assert.equal(values.length,data.floats);
 for(const g of data.grades){assert.equal(g.parts.length,3);let triangles=0;for(const p of g.parts){assert.equal(p.count%9,0);triangles+=p.count/9;for(let i=p.offset;i<p.offset+p.count*2;i++)assert.ok(Number.isFinite(values[i]));}assert.ok(triangles>1000&&triangles<16000);}
});
test('all six circles have substantial closed backs, beveled rims and one subtle matte texture',()=>{
 const rig=createGradePendants(data,values),textures=new Set(),ray=new THREE.Raycaster();
 for(const [grade,entry] of rig.entries){
  const circle=entry.relief.children.find(m=>m.name.startsWith('circle_')),part=data.grades.find(g=>g.grade===grade).parts[0],normal=new THREE.Vector3(...values.subarray(part.offset+part.count,part.offset+part.count+3)).normalize(),position=circle.geometry.attributes.position,center=circle.geometry.boundingBox.getCenter(new THREE.Vector3());let lo=Infinity,hi=-Infinity;
  for(let i=0;i<position.count;i++){const p=new THREE.Vector3().fromBufferAttribute(position,i);assert.ok(p.toArray().every(Number.isFinite));const z=p.dot(normal);lo=Math.min(lo,z);hi=Math.max(hi,z);}
  assert.ok(Math.abs(hi-lo-.04)<1e-6);circle.updateMatrixWorld(true);
  for(const side of [-1,1]){ray.set(center.clone().addScaledVector(normal,side),normal.clone().multiplyScalar(-side));const hit=ray.intersectObject(circle)[0];assert.ok(hit,`Grade ${grade} has a visible ${side<0?'back':'front'}`);assert.ok(hit.face.normal.dot(normal)*side>.99);}
  const material=circle.material[0];assert.ok(material.roughness>=.9);assert.equal(material.metalness,0);assert.equal(material.side,THREE.FrontSide);assert.ok(material.bumpScale>0&&material.bumpScale<.001);assert.equal(material.bumpMap.image.width,128);assert.ok(circle.geometry.attributes.uv);textures.add(material.bumpMap);
 }
 assert.equal(textures.size,1);let disposed=0;[...textures][0].addEventListener('dispose',()=>disposed++);rig.dispose();assert.equal(disposed,1);
});
test('pendants stay anchored while the camera rotates and can be occluded by book geometry',()=>{
 const rig=createGradePendants(data,values),scene=new THREE.Scene(),book={group:new THREE.Group(),localBounds:{min:[-.7,-.1,-1],max:[.7,.1,1]}};book.group.rotation.x=Math.PI/2;scene.add(book.group);
 const ctx={state:'book',selected:'book-3',layout:'spread',page:-1,busy:false};rig.update({context:ctx,book,readingBounds:{min:[-2.1,-.1,-1],max:[.7,.1,1]},reduced:true});scene.updateMatrixWorld(true);
 const pendant=rig.entries.get(2).group,anchor=pendant.getWorldPosition(new THREE.Vector3()),block=new THREE.Mesh(new THREE.BoxGeometry(1.4,2,.6),new THREE.MeshBasicMaterial());scene.add(block);scene.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera(),ray=new THREE.Raycaster(),isPendant=o=>{while(o){if(o===pendant)return true;o=o.parent;}return false;};
 camera.position.set(anchor.x,0,5);ray.set(camera.position,anchor.clone().sub(camera.position).normalize());assert.ok(isPendant(ray.intersectObjects([pendant,block],true)[0]?.object));
 camera.position.set(5,0,-1);ray.set(camera.position,anchor.clone().sub(camera.position).normalize());assert.equal(ray.intersectObjects([pendant,block],true)[0]?.object,block);assert.equal(pendant.getWorldPosition(new THREE.Vector3()).distanceTo(anchor),0);
 for(const mesh of pendant.children[0].children){assert.equal(mesh.isSprite,undefined);for(const material of mesh.material){assert.equal(material.depthTest,true);assert.equal(material.depthWrite,true);}}
 rig.update({context:{...ctx,layout:'grid'},book,readingBounds:{min:[-2.1,-.1,-1],max:[.7,.1,1]},reduced:true});assert.equal(pendant.visible,false);rig.dispose();block.geometry.dispose();block.material.dispose();
});
test('both reset modes restore default zoom while preserving the appropriate other view component',()=>{
 const camera=new THREE.PerspectiveCamera(),target=new THREE.Vector3(2,1,0),home={position:[0,0,10],target:[0,0,0]};camera.position.set(7,4,2);
 const pan=resetPose(camera,target,home,'pan'),rotation=resetPose(camera,target,home,'rotation'),full=resetPose(camera,target,home);
 assert.ok(Math.abs(pan.position.distanceTo(pan.target)-10)<1e-12);assert.equal(pan.target.length(),0);assert.ok(pan.position.clone().sub(pan.target).normalize().distanceTo(camera.position.clone().sub(target).normalize())<1e-12);
 assert.equal(rotation.target.distanceTo(target),0);assert.equal(rotation.position.distanceTo(rotation.target),10);assert.equal(rotation.position.clone().sub(rotation.target).distanceTo(new THREE.Vector3(0,0,10)),0);assert.equal(full.position.distanceTo(new THREE.Vector3(0,0,10)),0);
});
test('animated resets orbit safely without passing through the object even from the reverse view',()=>{
 const start=new THREE.Vector3(0,0,-12),end=new THREE.Vector3(0,0,8),a=new THREE.Vector3(2,1,0),b=new THREE.Vector3();
 for(let i=0;i<=120;i++){const pose=arcCamera(start,a,end,b,i/120);assert.ok(pose.position.toArray().every(Number.isFinite));assert.ok(pose.position.distanceTo(pose.target)>=8-1e-12);}
 const last=arcCamera(start,a,end,b,1);assert.ok(last.position.distanceTo(end)<1e-12);assert.equal(last.target.distanceTo(b),0);
});
test('loaded shelf framing fills the vertical viewport across portrait and landscape aspects',()=>{
 const bounds=new THREE.Box3(new THREE.Vector3(-7.5,-3.5,-.6),new THREE.Vector3(7.5,3.5,.6));
 for(const aspect of [.65,1,1.6,2.4]){const view=shelfView(bounds,aspect),wide=shelfView(bounds,aspect,{wide:true}),camera=new THREE.PerspectiveCamera(35,aspect,.08,2500);camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld(true);const top=new THREE.Vector3(0,3.5,.6).project(camera),bottom=new THREE.Vector3(0,-3.5,.6).project(camera);assert.ok(Math.abs((top.y-bottom.y)/2-.94)<1e-12);assert.ok(wide.position.distanceTo(wide.target)>view.position.distanceTo(view.target));}
});
test('easel camera aligns to the upright picture UVs, independent of source normal winding',()=>{
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(3,2));mesh.position.set(2,-1,.5);mesh.rotation.set(-.25,-.3,.04);mesh.scale.setScalar(.7);mesh.geometry.attributes.normal.array.fill(-1);
 for(const aspect of [.65,1,1.8]){const view=easelFrame(mesh,aspect),camera=new THREE.PerspectiveCamera(35,aspect,.01,100);camera.position.copy(view.position);camera.up.copy(view.up);camera.lookAt(view.target);camera.updateMatrixWorld(true);const center=view.target.clone().project(camera);assert.ok(center.length()<1);assert.ok(Math.abs(center.x)+Math.abs(center.y)<1e-12);assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(view.normal)<-.999999);for(const [x,y] of [[-1.5,-1],[1.5,1]]){const p=new THREE.Vector3(x,y,0).applyMatrix4(mesh.matrixWorld).project(camera);assert.ok(Math.abs(p.x)<=.840001&&Math.abs(p.y)<=.760001);}}
 assert.equal(easelVideoPolicy({}).rotate,false);assert.equal(easelVideoPolicy({}).zoom,false);assert.equal(easelVideoPolicy({videoRotation:true,videoZoom:false}).rotate,true);mesh.geometry.dispose();mesh.material.dispose();
});
test('shelf rotation remains a bounded, separate preference from easel camera controls',()=>{
 const locked=shelfRotationPolicy(),gentle=shelfRotationPolicy(true);assert.equal(locked.minAzimuthAngle,0);assert.equal(locked.maxAzimuthAngle,0);assert.equal(locked.minPolarAngle,locked.maxPolarAngle);assert.ok(gentle.minAzimuthAngle<0&&gentle.maxAzimuthAngle>0&&gentle.maxAzimuthAngle<=Math.PI/6);assert.ok(gentle.minPolarAngle>Math.PI/3&&gentle.maxPolarAngle<Math.PI*2/3);
 const saved=new Map(),preferences={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,String(value)),removeItem:key=>saved.delete(key)},options={preferences,target:new EventTarget(),matchMedia:()=>({matches:false})};let store=createSettingsStore(options);for(const field of ['shelfRotation','videoRotation','videoZoom'])assert.equal(store.get().graphics[field],false);assert.equal(store.patch({graphics:{shelfRotation:true,videoZoom:true}}).ok,true);assert.equal(store.get().graphics.videoRotation,false);store.dispose();store=createSettingsStore(options);assert.equal(store.get().graphics.shelfRotation,true);assert.equal(store.get().graphics.videoZoom,true);assert.equal(store.get().graphics.videoRotation,false);store.dispose();
});
test('easel prepares without playback, starts only when presented, and restores its poster on exit',async()=>{
 class Element extends EventTarget{constructor(){super();this.attrs=new Map();}setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k)||null;}removeAttribute(k){this.attrs.delete(k);}}
 class Video extends Element{constructor(){super();this.paused=true;this.currentTime=0;this.duration=56.8;this.videoWidth=1920;this.videoHeight=1080;this.readyState=4;this.calls=0;}set src(v){this.setAttribute('src',v);}load(){}play(){this.calls++;this.paused=false;this.dispatchEvent(new Event('playing'));return Promise.resolve();}pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}}
 const video=new Video(),elements=new Map(),controls={hidden:true,querySelector(key){if(!elements.has(key))elements.set(key,new Element());return elements.get(key);}},geometry=new THREE.PlaneGeometry(3,2),original=[new THREE.MeshBasicMaterial()],mesh=new THREE.Mesh(geometry,original),player=createEaselVideo({mesh,video,controls,src:'test.mp4'});
 player.prepare();assert.equal(video.calls,0);assert.equal(controls.hidden,true);assert.equal(mesh.material,original);assert.equal(video.muted,true);video.dispatchEvent(new Event('loadedmetadata'));await player.start();assert.equal(video.calls,1);assert.equal(controls.hidden,false);assert.notEqual(mesh.material,original);assert.ok(Math.abs(player.diagnostics().letterbox[1]-32/27)<1e-12);assert.equal(player.needsFrames,true);player.syncAudio({allowed:true,muted:false,volume:.3});assert.equal(video.muted,false);assert.equal(video.volume,.3);player.leave();assert.equal(video.paused,true);assert.equal(video.currentTime,0);assert.equal(mesh.material,original);assert.equal(controls.hidden,true);assert.equal(player.needsFrames,false);await player.start();assert.equal(video.calls,1);player.dispose();geometry.dispose();original[0].dispose();
});
test('Graphics opt-in detects both double-click buttons and leaves single clicks and drags alone',async()=>{
 const dom=new EventTarget(),camera=new THREE.PerspectiveCamera(),controls={object:camera,target:new THREE.Vector3(),enabled:true,enablePan:false,update(){}},resets=[];camera.position.set(0,0,10);
 const input=installItemViewControls({controls,camera,domElement:dom,getDefaultView:()=>({position:[0,0,10],target:[0,0,0]}),onResetView:mode=>resets.push(mode)});
 const send=(type,button,x=10)=>{const e=new Event(type,{cancelable:true});for(const [key,value] of Object.entries({button,clientX:x,clientY:10}))Object.defineProperty(e,key,{value});dom.dispatchEvent(e);};
 for(const button of [1,2]){send('pointerdown',button);send('pointerup',button);assert.equal(resets.length,button===1?0:1);send('pointerdown',button);send('pointerup',button);await Promise.resolve();}
 assert.deepEqual(resets,['pan','rotation']);send('pointerdown',2);send('pointermove',2,100);send('pointerup',2,100);await Promise.resolve();assert.equal(resets.length,2);input.dispose();
});
