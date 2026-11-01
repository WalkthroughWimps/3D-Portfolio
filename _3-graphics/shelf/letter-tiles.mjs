import * as THREE from 'three';
import {OrbitControls} from 'three/addons/OrbitControls.js';
import {installTabletopInput} from './tabletop-input.mjs';
import {ALPHABET,LetterTabletop,TILE_SPACING,PLAY_LIMIT} from './letter-tiles-model.mjs';

const $=id=>document.getElementById(id),mount=$('desktop'),model=new LetterTabletop(),resources=new Set(),objects=new Map(),abort=new AbortController();
const own=value=>(resources.add(value),value);
let renderer,scene,camera,orbit,input,gesture=null,selected='',raf=0,last=0,disposed=false;
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0),point=new THREE.Vector3();
function invalidate(){if(!disposed&&!document.hidden&&!raf)raf=requestAnimationFrame(render);}
function project(position){const p=new THREE.Vector3(...position).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];}
function onPlane(event,height=.2){const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera);plane.constant=-height;return ray.ray.intersectPlane(plane,point)?point.clone():null;}
function hit(event){onPlane(event);scene.updateMatrixWorld(true);const meshes=[];for(const root of objects.values())root.traverseVisible(obj=>{if(obj.isMesh)meshes.push(obj);});const match=ray.intersectObjects(meshes,false)[0];let obj=match?.object;while(obj&&!obj.userData.body)obj=obj.parent;const body=model.get(obj?.userData.body);return body?{body}:null;}
function select(id){selected=model.get(id)?id:'';invalidate();}
function clampTile(b){b.p[0]=THREE.MathUtils.clamp(b.p[0],-PLAY_LIMIT,PLAY_LIMIT);b.p[2]=THREE.MathUtils.clamp(b.p[2],-PLAY_LIMIT,PLAY_LIMIT);}
function startDrag(event,pick){
 const b=model.get(pick.body.id),p=onPlane(event,.24);if(!p)return;
 mount.focus({preventScroll:true});const members=model.cluster(b.id),originals=members.map(q=>[...q.p]);
 gesture={id:b.id,pointer:event.pointerId,original:[...b.p],members,originals,offset:[b.p[0]-p.x,b.p[2]-p.z]};
 for(const q of members){model.grab(q.id);q.p[1]=.24;}invalidate();
}
function moveDrag(event){
 const g=gesture,b=model.get(g?.id),p=onPlane(event,.24);if(!b||!p)return;
 if(g.fromSupply){g.moved||=Math.hypot(event.clientX-g.start[0],event.clientY-g.start[1])>6;b.p=[p.x,.24,p.z];clampTile(b);}
 else model.moveCluster(g.members,g.originals,p.x+g.offset[0]-g.original[0],p.z+g.offset[1]-g.original[2]);
 invalidate();
}
function removeDraw(id){if(gesture?.members?.some(b=>b.id===id))input.cancel();model.remove(id);if(selected===id)selected='';invalidate();}
function restoreCluster(g){g.members.forEach((b,i)=>{b.p=[...g.originals[i]];});model.settle(g.members);}
function endDrag(event){
 if(!gesture)return;const g=gesture,b=model.get(g.id);gesture=null;
 if(b){
  const r=mount.getBoundingClientRect(),inside=event&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
  if(g.fromSupply){
   if(!inside&&g.moved)removeDraw(b.id);
   else{if(!g.moved)b.p=[...g.original];if(!model.place(b.id,$('snap').checked))removeDraw(b.id);}
  }else{
   model.moveCluster(g.members,g.originals,b.p[0]-g.original[0],b.p[2]-g.original[2],$('snap').checked);
   if(!model.finishCluster(g.members))restoreCluster(g);
  }
 }
 if(orbit)orbit.enabled=true;invalidate();
}
function cancelDrag(){if(!gesture)return;const g=gesture;gesture=null;if(g.fromSupply)removeDraw(g.id);else restoreCluster(g);if(orbit)orbit.enabled=true;invalidate();}
function rotate(id,direction=1){const b=model.get(id);if(!b)return;b.angle+=direction*Math.PI/2;model.checkpoint(b);invalidate();}
function makeTileGeometry(){const s=new THREE.Shape(),h=.405,r=.055;s.moveTo(-h+r,-h);s.lineTo(h-r,-h);s.quadraticCurveTo(h,-h,h,-h+r);s.lineTo(h,h-r);s.quadraticCurveTo(h,h,h-r,h);s.lineTo(-h+r,h);s.quadraticCurveTo(-h,h,-h,h-r);s.lineTo(-h,-h+r);s.quadraticCurveTo(-h,-h,-h+r,-h);const g=own(new THREE.ExtrudeGeometry(s,{depth:.11,bevelEnabled:true,bevelSize:.035,bevelThickness:.02,bevelSegments:3,curveSegments:6}));g.rotateX(-Math.PI/2);g.translate(0,-.055,0);return g;}
const faces=new Map();let tileGeometry,topGeometry,wood,selectionGeometry,selectionMaterial;
function letterMaterial(letter){if(faces.has(letter))return faces.get(letter);const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d'),gradient=x.createLinearGradient(0,0,256,256);gradient.addColorStop(0,'#986442');gradient.addColorStop(1,'#75482e');x.fillStyle=gradient;x.fillRect(0,0,256,256);x.strokeStyle='#ae805b';x.lineWidth=2;x.strokeRect(10,10,236,236);x.fillStyle='#ffffff';x.font='bold 172px "Trebuchet MS", Arial, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(letter,128,140);const texture=own(new THREE.CanvasTexture(c));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());const m=own(new THREE.MeshStandardMaterial({map:texture,roughness:.83}));faces.set(letter,m);return m;}
function sync(){for(const [id,root] of objects)if(!model.get(id)){scene.remove(root);objects.delete(id);}const highlighted=new Set(gesture?.members?.map(b=>b.id)||[selected]);for(const b of model.bodies){let root=objects.get(b.id);if(!root){root=new THREE.Group();root.userData.body=b.id;const base=new THREE.Mesh(tileGeometry,wood);base.castShadow=base.receiveShadow=true;root.add(base);const top=new THREE.Mesh(topGeometry,letterMaterial(b.letter));top.rotation.x=-Math.PI/2;top.position.y=.076;top.receiveShadow=true;root.add(top);const outline=new THREE.LineSegments(selectionGeometry,selectionMaterial);outline.name='selection';root.add(outline);objects.set(b.id,root);scene.add(root);}root.position.set(b.p[0],b.p[1]+b.half[1],b.p[2]);root.rotation.y=b.angle;root.getObjectByName('selection').visible=highlighted.has(b.id);}}
function fit(top=true){const r=mount.getBoundingClientRect();camera.aspect=r.width/r.height;camera.updateProjectionMatrix();const distance=Math.max(12.5,17.3/camera.aspect)/(2*Math.tan(camera.fov*Math.PI/360));orbit.target.set(0,0,0);const direction=top?new THREE.Vector3(0,1,.001):new THREE.Vector3(.04,1,.56);camera.position.copy(direction.normalize().multiplyScalar(distance));camera.lookAt(orbit.target);orbit.update();$('top-view').setAttribute('aria-pressed',String(top));$('table-view').setAttribute('aria-pressed',String(!top));invalidate();}
function render(now){raf=0;if(disposed)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;const moving=model.step(dt);sync();renderer.render(scene,camera);$('letter-tiles-diagnostics').textContent=JSON.stringify({ready:true,selected,held:gesture?.id||null,cluster:gesture?.members?.map(b=>b.id)||[],count:model.bodies.length,moving,playLimit:PLAY_LIMIT,camera:{enabled:orbit.enabled,position:camera.position.toArray()},tiles:model.bodies.map(b=>({id:b.id,letter:b.letter,position:b.p,angle:b.angle,screen:project([b.p[0],b.p[1]+.15,b.p[2]])}))});if(moving||gesture)invalidate();}
function reset(){input.cancel();model.reset();selected='';invalidate();}
try{
 renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.append(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#23573f');camera=new THREE.PerspectiveCamera(36,1,.1,1200);orbit=new OrbitControls(camera,renderer.domElement);Object.assign(orbit,{enableDamping:false,enablePan:true,minDistance:5,maxDistance:500,maxPolarAngle:Math.PI/2-.06,mouseButtons:{LEFT:-1,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE}});
 scene.add(new THREE.HemisphereLight(0xffffff,0x315a36,2));const light=new THREE.DirectionalLight(0xfff7e6,2.1);light.position.set(-5,14,7);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-10,right:10,top:9,bottom:-9,near:1,far:35});light.shadow.normalBias=.015;light.shadow.radius=3;scene.add(light);
 const desk=new THREE.Mesh(own(new THREE.BoxGeometry(PLAY_LIMIT*2+2,.22,PLAY_LIMIT*2+2)),own(new THREE.MeshStandardMaterial({color:'#286a4b',roughness:.95})));desk.position.y=-.115;desk.receiveShadow=true;scene.add(desk);
 tileGeometry=makeTileGeometry();topGeometry=own(new THREE.PlaneGeometry(.79,.79));wood=own(new THREE.MeshStandardMaterial({color:'#74472a',roughness:.8}));selectionGeometry=own(new THREE.EdgesGeometry(own(new THREE.BoxGeometry(.9,.16,.9))));selectionMaterial=own(new THREE.LineBasicMaterial({color:'#f6dc90'}));sync();
 // Reuse packet-style right-button ownership for tiles without changing their physics kind.
 input=installTabletopInput({element:renderer.domElement,ready:()=>!disposed,getHit:event=>{const h=hit(event);return h?{body:{...h.body,kind:'cards'},busy:false}:null;},getDrag:()=>gesture,startDrag,moveDrag,endDrag,cancelDrag,select,setCameraEnabled:enabled=>{orbit.enabled=enabled;invalidate();},tapRight:id=>removeDraw(id),fan:()=>{},gather:()=>{}});
 for(const letter of ALPHABET){
  const button=document.createElement('button');button.textContent=letter;button.type='button';button.setAttribute('aria-label',`Draw ${letter} tile`);
  button.addEventListener('pointerdown',e=>{if(e.button!==0||gesture)return;e.preventDefault();const p=onPlane(e,.24);if(!p)return;const b=model.addLetter(letter);if(!b)return;select(b.id);gesture={id:b.id,pointer:e.pointerId,original:[...b.p],offset:[0,0],fromSupply:true,start:[e.clientX,e.clientY],moved:false};model.grab(b.id);b.p=[p.x,.24,p.z];clampTile(b);button.setPointerCapture(e.pointerId);orbit.enabled=false;invalidate();},{signal:abort.signal});
  button.addEventListener('pointermove',e=>{if(gesture?.fromSupply&&gesture.pointer===e.pointerId)moveDrag(e);},{signal:abort.signal});
  button.addEventListener('pointerup',e=>{if(gesture?.fromSupply&&gesture.pointer===e.pointerId){endDrag(e);mount.focus({preventScroll:true});}},{signal:abort.signal});
  button.addEventListener('pointercancel',cancelDrag,{signal:abort.signal});button.addEventListener('lostpointercapture',()=>{if(gesture?.fromSupply)cancelDrag();},{signal:abort.signal});
  button.addEventListener('click',e=>{if(e.detail!==0)return;const b=model.addLetter(letter);if(b){if(model.place(b.id,$('snap').checked))select(b.id);else removeDraw(b.id);mount.focus({preventScroll:true});}},{signal:abort.signal});$('alphabet').append(button);
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&gesture?.fromSupply){e.preventDefault();input.cancel();}},{signal:abort.signal});
 mount.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();input.cancel();return;}const b=model.get(selected);if(!b||e.target!==mount||gesture)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const members=model.cluster(b.id),originals=members.map(q=>[...q.p]),step=(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)*(e.shiftKey?.1:TILE_SPACING);model.moveCluster(members,originals,e.key==='ArrowLeft'||e.key==='ArrowRight'?step:0,e.key==='ArrowUp'||e.key==='ArrowDown'?step:0,$('snap').checked);if(!model.finishCluster(members))restoreCluster({members,originals});invalidate();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeDraw(b.id);}else if(e.key.toLowerCase()==='q'||e.key.toLowerCase()==='e'){e.preventDefault();rotate(b.id,e.key.toLowerCase()==='q'?-1:1);}},{signal:abort.signal});
 $('top-view').addEventListener('click',()=>fit(true),{signal:abort.signal});$('table-view').addEventListener('click',()=>fit(false),{signal:abort.signal});$('reset').addEventListener('click',reset,{signal:abort.signal});$('tidy').addEventListener('click',()=>{input.cancel();model.tidy();invalidate();},{signal:abort.signal});orbit.addEventListener('change',invalidate);
 const resize=new ResizeObserver(()=>{renderer.setSize(mount.clientWidth,mount.clientHeight,false);fit($('top-view').getAttribute('aria-pressed')==='true');});resize.observe(mount);$('loading').hidden=true;fit();
 const suspend=()=>{input.cancel();last=0;if(raf)cancelAnimationFrame(raf);raf=0;};
 window.addEventListener('blur',()=>input.cancel(),{signal:abort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else invalidate();},{signal:abort.signal});window.addEventListener('pageshow',()=>{last=0;invalidate();},{signal:abort.signal});window.addEventListener('pagehide',e=>{suspend();if(e.persisted)return;disposed=true;abort.abort();resize.disconnect();input.dispose();orbit.dispose();for(const resource of resources)resource.dispose();renderer.dispose();},{signal:abort.signal});
}catch(error){$('loading').textContent='The 3D desktop needs WebGL. Please enable it and reload.';console.error(error);}
