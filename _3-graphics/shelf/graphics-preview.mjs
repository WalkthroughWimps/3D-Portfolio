import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {installItemViewControls} from './item-view-controls.mjs';
import {createGroovyNavigation,groovyArtwork} from './groovy-navigation.mjs';
import {createGradePendants} from './grade-pendants.mjs';
import {createEaselVideo,easelFrame,easelVideoPolicy} from './easel-video.mjs';
import {createConsent} from '../../_7-shared-scripts/core/consent.js';
import {resetPose,arcCamera,shelfView} from './view-reset.mjs';
import {getSharedSettings} from '../../_7-shared-scripts/core/settings.js';
import {createMarkerSampler,SOURCE_SCALE,slerp} from './marker-player-model.mjs';
import {applyClearanceTrack} from './clearance-track.mjs';
import {createSourceBook} from './source-book-rig.mjs';
import {createSourceShelf} from './source-shelf-rig.mjs';
import {createSourceEnvironment} from './source-environment-rig.mjs';
import {createSourceGames} from './source-games-rig.mjs';
import {createFeltSurface} from './felt-material.mjs';
import {selectionInterval,shelvingIntervals,takeOutIntervals,bookClickIntent} from './book-action-model.mjs';
import {PageTurnInput,draggedPage,isPageWheel} from './page-turn-input.mjs';
import {GridPages,gridPoses,gridView,gridReflow,readerFrame,animationBounds,poseBox,overviewPoses,focusPoses,blendFocus,contextFold,readerOpen,prepareFocusContacts,applyFocusContacts,tightView,gridArtworkFiles} from './book-layout.mjs';
import {artworkFiles} from './book-presentation.mjs';
import {closedShape} from './closed-shape.mjs';
import {createShelfContext} from './shelf-context-rig.mjs';
import {roomRetreat,FRONT_SHELF_POLICY} from './room-retreat.mjs';
import {rotationPolicy,shelfRotationPolicy} from './view-policy.mjs';
import {sampleWorldTrack} from './world-track.mjs';
let gradeRig,easelPlayer,resetting=false,lastViewReset=null,defaultView={position:[0,0,15],target:[0,0,0]},mouseControls,groovy,skipRequested=false,skipCount=0,lastSkipSource=null;let projectionEnabled=getSharedSettings().get().graphics?.centerOnViewport||false;
const videoConsent=createConsent(),viewingEasel=()=>selected==='easel';
const viewCenter=new THREE.Vector3();
const focusContactCache=new Map(),focusWorkers=new Set();
const turnInput=new PageTurnInput(),savedPages=Array(6).fill(0),gridPages=new GridPages(),bookOrigin=closedShape().center;
let layout='spread',gridContextPage=0,pageDrag=null,focusAmount=0,focusEnd=null,focusTargets=null,focusContacts=null,focusPrepMs=0,focusWaitMs=0,shotName='shelf',gridWasOpen=false;
const $=id=>document.getElementById(id),mount=$('shelf-preview'),systemReduced=matchMedia('(prefers-reduced-motion: reduce)'),reduced={get matches(){return systemReduced.matches||getSharedSettings().get().accessibility.reducedMotion;}};
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.append(renderer.domElement);
renderer.autoClear=false;renderer.info.autoReset=false;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.08,2500),roomCamera3D=new THREE.PerspectiveCamera(35,1,.08,2500),orbit=new OrbitControls(camera,renderer.domElement);
orbit.enableDamping=false;orbit.enablePan=false;orbit.zoomToCursor=false;orbit.mouseButtons={LEFT:-1,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
scene.add(new THREE.HemisphereLight(0xffffff,0x707070,.85));const key=new THREE.DirectionalLight(0xffffff,2.05);key.position.set(-4,6,12);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:40});key.shadow.bias=-.0001;key.shadow.normalBias=.0015;key.shadow.radius=3.5;scene.add(key);const fill=new THREE.DirectionalLight(0xffffff,.35);fill.position.set(5,3,-4);scene.add(fill);scene.children.filter(o=>o.isLight).forEach(o=>o.layers.enable(1));roomCamera3D.layers.set(1);
const pageSurface=createFeltSurface(),coverSurface=createFeltSurface({strength:.7}),textures=new Map(),loader=new THREE.TextureLoader(),bookRoot=new THREE.Group();scene.add(bookRoot);
let meta,sampler,contacts,books=[],contactProbe,shelf,environment,games,gameData,gameValues,shelfContext,ready=false,disposed=false,raf=0,last=0,renderCount=0;
let state='shelf',selected='',busy=false,bookFrame=6467,gameFrame=6467,bookOverride=null,gameOverride=null,page=-1,contextOpacity=1,contextTarget=1,tween=null,cameraTween=null,contextTween=null;
const settings={imperfection:0,bookendImperfection:.08,thickness:1},identity=new THREE.Matrix4(),roomMatrix=new THREE.Matrix4(),ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),failed=new Set();let pointerStart=null,focusKey='',readingBounds=null,hiddenAt=0;
const ease=t=>t*t*t*(10+t*(-15+6*t)),mix=(a,b,t)=>a+(b-a)*t;
function invalidate(){if(!disposed&&!document.hidden&&!raf)raf=requestAnimationFrame(render);}
function status(text){$('status').textContent=text;}
async function texture(url){if(textures.has(url))return textures.get(url);const p=loader.loadAsync(new URL(url,import.meta.url).href).then(t=>{t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());if(disposed){t.dispose();return null;}textures.set(url,t);invalidate();return t;}).catch(error=>{failed.add(url);throw error;});textures.set(url,p);return p;}
const getTexture=url=>textures.get(url)?.isTexture?textures.get(url):null;
function bookPose(frame){
 const p=sampler.frame(frame,settings);p.poses.forEach((v,i)=>v.localBounds=books[i].closedBounds(1));applyClearanceTrack(p.poses,frame,contacts,meta);
 if(frame>=6436&&frame<=6501){const weight=Math.min(ease(Math.min(1,(frame-6436)/31)),1-ease(Math.max(0,(frame-6468)/33)));
  p.poses.forEach(v=>{v.position[2]+=.0015*Math.sin(v.grade*1.8)*weight;});}
 return p.poses;
}
function displayedPoses(){let poses=bookOverride||bookPose(bookFrame);if(focusEnd){poses=blendFocus(poses,focusEnd,focusTargets,focusAmount);if(focusContacts&&!bookOverride&&(state==='selecting-book'||state==='leaving-book'))poses=applyFocusContacts(poses,focusContacts.offsets,(bookFrame-focusContacts.start)/(focusContacts.end-focusContacts.start));return poses;}return state==='grid'?gridHome():poses;}
function requestFocusTrack(which,grade,progress,from,to,warm=false){
 if(reduced.matches)return Promise.resolve(null);const key=`${which}:${(mount.clientWidth/mount.clientHeight).toFixed(4)}:${grade}:${from}:${to}:${progress.toFixed(5)}`;
 if(focusContactCache.has(key))return Promise.resolve(focusContactCache.get(key));
 if(warm&&focusWorkers.size>=2)return Promise.resolve(null);
 const interval=selectionInterval(meta.markers,which,grade,to===0),end=bookPose(selectionInterval(meta.markers,which,grade).endFrame),targets=focusPoses(grade,readingBounds,which,end,which==='grid'?gridHome():null,mount.clientWidth/mount.clientHeight),cache=new Map();
 const bounds=progress=>{const k=progress.toFixed(6);if(!cache.has(k)){const b=contactProbe.update(progress);cache.set(k,{min:[...b.min],max:[...b.max]});}return cache.get(k);};
 const samples=Array.from({length:121},(_,tick)=>{const t=tick/120,a=mix(from,to,ease(t)),poses=blendFocus(bookPose(mix(interval.frame,interval.endFrame,t)),end,targets,a);return poses.map(p=>({grade:p.grade,position:p.position,quaternion:p.quaternion,scale:p.scale,scaleVector:p.scaleVector,pinned:p.pinned,localBounds:bounds(p.grade===grade?(which==='grid'||to===0?progress:mix(-1,progress,readerOpen(a))):(which==='grid'?progress:-1))}));});
 const promise=new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./focus-contact-worker.mjs',import.meta.url),{type:'module'});focusWorkers.add(worker);
  const done=()=>{worker.terminate();focusWorkers.delete(worker);};
  worker.onmessage=({data})=>{done();if(data.error){focusContactCache.delete(key);reject(Error(data.error));return;}const track={start:interval.frame,end:interval.endFrame,offsets:data.offsets,solveMs:data.solveMs};focusContactCache.set(key,track);resolve(track);invalidate();};
  worker.onerror=error=>{done();focusContactCache.delete(key);reject(Error(error.message||'Contact preparation failed'));};worker.postMessage({samples});
 });focusContactCache.set(key,promise);return promise;
}
async function prepareFocusPath(interval,from,to){
 if(reduced.matches){focusContacts=null;focusPrepMs=focusWaitMs=0;return;}
 const started=performance.now();focusContacts=await requestFocusTrack(layout,Number(selected.split('-')[1]),page,from,to);focusWaitMs=performance.now()-started;focusPrepMs=focusContacts?.solveMs||0;
}
function warmReturnPath(){
 if(reduced.matches||state!=='book'||busy||page!==turnInput.target||!Number.isInteger(page))return;
 requestFocusTrack(layout,Number(selected.split('-')[1]),layout==='grid'?page:-1,1,0,true).catch(console.error);
}
function activeBookPages(){return state==='book'||state==='grid';}
function blendBooks(a,b,t){return a.map((p,i)=>({...p,position:p.position.map((v,j)=>mix(v,b[i].position[j],t)),quaternion:slerp(p.quaternion,b[i].quaternion,t),scaleVector:p.scaleVector.map((v,j)=>mix(v,b[i].scaleVector[j],t)),progress:mix(p.progress,b[i].progress,t),turns:p.turns.map((v,j)=>mix(v,b[i].turns[j],t))}));}
function gamePose(frame){return gameData.parts.map((p,i)=>sampleWorldTrack(gameData,gameValues,frame,i));}
function blendGames(a,b,t){return a.map((v,i)=>[...v.slice(0,3).map((n,j)=>mix(n,b[i][j],t)),...slerp(v.slice(3,7),b[i].slice(3,7),t),...v.slice(7).map((n,j)=>mix(n,b[i][j+7],t))]);}
function animate(duration,update){return new Promise(resolve=>{tween={start:null,duration:reduced.matches||skipRequested?1:duration,update,resolve};invalidate();});}
async function bookClip(a,b,label,focus=null){status(label);bookOverride=null;bookFrame=a;await animate(Math.abs(b-a)/30*1000,t=>{bookFrame=mix(a,b,t);if(focus)focusAmount=mix(focus[0],focus[1],ease(t));});bookFrame=b;}
async function bookBridge(frame,duration=240){const a=bookOverride||bookPose(bookFrame),b=bookPose(frame);await animate(duration,t=>bookOverride=a.some(p=>p.gridRows===3)&&!focusEnd?gridReflow(a,b,ease(t)):blendBooks(a,b,ease(t)));bookFrame=frame;bookOverride=null;}
async function gameBridge(frame){const a=gameOverride||gamePose(gameFrame),b=gamePose(frame);await animate(250,t=>gameOverride=blendGames(a,b,ease(t)));gameFrame=frame;gameOverride=null;}
async function gameClip(a,b,label){status(label);if(gameFrame!==a)await gameBridge(a);await animate(Math.abs(b-a)/30*1000,t=>gameFrame=mix(a,b,t));gameFrame=b;}
function updateViewInput(){const video=viewingEasel(),p=easelVideoPolicy(getSharedSettings().get().graphics);orbit.enabled=!busy&&(!video||p.rotate||p.zoom);orbit.enableRotate=!video||p.rotate;orbit.enableZoom=!video||p.zoom;orbit.enablePan=false;}
function setBusy(value){if(value){mouseControls?.cancelFocusAnimation();stopPageDrag(null,true);turnInput.release();}busy=value;document.body.classList.toggle('busy',value);document.querySelectorAll('#actions button,#actions input,[data-item]').forEach(b=>b.disabled=value);updateViewInput();}
function policy(item){Object.assign(orbit,item?{...rotationPolicy(true),minPolarAngle:.001,maxPolarAngle:Math.PI-.001,minDistance:.6,maxDistance:100}:{...FRONT_SHELF_POLICY,...shelfRotationPolicy(getSharedSettings().get().graphics?.shelfRotation),minDistance:state==='shelf'?5:.6});}
function cameraTo(position,target,duration=650,{remember=true,arc=false}={}){
 if(remember){viewCenter.copy(target);defaultView={position:position.toArray(),target:target.toArray()};}
 cameraTween={from:camera.position.clone(),fromTarget:orbit.target.clone(),position:position.clone(),target:target.clone(),arc,start:null,duration:reduced.matches||skipRequested?1:duration};invalidate();
}
function updateRoomView(wide=false){
 const aspect=mount.clientWidth/mount.clientHeight,view=shelfView(shelfContext.bounds,aspect,{wide});roomCamera3D.aspect=aspect;roomCamera3D.updateProjectionMatrix();return view;
}
function roomCamera(instant=false,wide=false){
 policy(false);const {position,target}=updateRoomView(wide);cameraTo(position,target,instant?1:650);
 if(instant){camera.position.copy(position);orbit.target.copy(target);camera.lookAt(target);cameraTween=null;orbit.update();mouseControls?.captureDefaultPose();}
}
async function resetPresentation(mode='all'){
 mouseControls?.clear();const view=resetPose(camera,orbit.target,defaultView,mode),delta=camera.position.distanceTo(view.position)+orbit.target.distanceTo(view.target);
 lastViewReset={mode,from:{position:camera.position.toArray(),target:orbit.target.toArray()},to:{position:view.position.toArray(),target:view.target.toArray()},completed:false};
 if(delta>1e-7){resetting=true;cameraTo(view.position,view.target,480,{remember:false,arc:true});await animate(480,()=>{});resetting=false;}
 lastViewReset.completed=true;lastViewReset.completedPose={position:camera.position.toArray(),target:orbit.target.toArray()};
}
function roomTarget(target){
 if(target===contextTarget)return contextTween?.promise||Promise.resolve();
 contextTween?.resolve();contextTarget=target;let resolve;const promise=new Promise(r=>resolve=r);
 contextTween={start:null,duration:reduced.matches||skipRequested?1:1100,from:contextOpacity,target,promise,resolve};invalidate();return promise;
}
function layer(root,n){root.traverse(o=>{if(o.isMesh)o.layers.set(n);});}
function visibleBox(root){root.updateMatrixWorld(true);const b=new THREE.Box3();root.traverseVisible(o=>{if(o.isMesh){o.geometry.computeBoundingBox();b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});return b;}
function fitBox(box,direction=new THREE.Vector3(.05,.14,1),duration=650,reading=false){if(box.isEmpty())return;camera.fov=35;camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();const sphere=box.getBoundingSphere(new THREE.Sphere()),half=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect)),distance=sphere.radius/Math.sin(half)*1.16;if(reading){
 const z=direction.clone().normalize(),x=new THREE.Vector3().crossVectors(camera.up,z).normalize(),y=new THREE.Vector3().crossVectors(z,x).normalize(),tanY=Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect;
 let d=0;for(const a of [box.min.x,box.max.x])for(const b of [box.min.y,box.max.y])for(const c of [box.min.z,box.max.z]){const v=new THREE.Vector3(a,b,c).sub(sphere.center),depth=v.dot(z);d=Math.max(d,Math.abs(v.dot(x))/(tanX*.88)+depth,Math.abs(v.dot(y))/(tanY*.78)+depth);}
 cameraTo(sphere.center.clone().addScaledVector(z,d),sphere.center,duration);
 }else cameraTo(sphere.center.clone().add(direction.clone().normalize().multiplyScalar(distance)),sphere.center,duration);}
function gridHome(){return gridPoses(bookPose(2713),mount.clientWidth/mount.clientHeight);}
function layoutBox(which){const box=new THREE.Box3();for(const p of which==='grid'?gridHome():bookPose(314))box.union(poseBox(p,which==='grid'?readingBounds:books[p.grade-1].closedBounds(1)));return box;}
function fitBookLayout(which){const aspect=mount.clientWidth/mount.clientHeight,v=which==='grid'?gridView(gridHome(),readingBounds,aspect):tightView(layoutBox(which),aspect);cameraTo(v.position,v.target);}
function focusedBox(){return readerFrame(focusTargets[Number(selected.split('-')[1])-1],readingBounds);}
function fitFocused(){const v=tightView(focusedBox(),mount.clientWidth/mount.clientHeight,{fillX:.96,fillY:.86});cameraTo(v.position,v.target);}
async function frameBookAnimation(name,clips,destination){
 const box=animationBounds(bookPose,clips,p=>books[p.grade-1].closedBounds(1),layoutBox(destination));
 const view=tightView(box,mount.clientWidth/mount.clientHeight,{fillX:.92,fillY:.72});
 shotName=name;cameraTo(view.position,view.target,450);
 // Complete the single establishing move before playing the source motion.
 await animate(450,()=>{});
}
async function settleGridHome(){
 const from=bookOverride||bookPose(bookFrame),to=gridHome();
 await animate(320,t=>bookOverride=to[0].gridRows===3?gridReflow(from,to,ease(t)):blendBooks(from,to,ease(t)));bookOverride=null;
}
async function frameFocusAnimation(){
 if(layout==='grid')return;
 // Hold the reader/fan composition. A swinging cover may briefly approach its
 // edge; do not make every book retreat to accommodate that isolated corner.
 shotName=`reader-${layout}`;fitFocused();await animate(650,()=>{});
}
function gameBox(frame,index){const box=new THREE.Box3(),m=new THREE.Matrix4();gameData.parts.forEach((p,i)=>{if(p.game!==index)return;const v=sampleWorldTrack(gameData,gameValues,frame,i);if(Math.max(...v.slice(7))<.001)return;m.compose(new THREE.Vector3().fromArray(v).multiplyScalar(SOURCE_SCALE),new THREE.Quaternion().fromArray(v,3),new THREE.Vector3().fromArray(v,7));box.union(games.parts[i].obj.geometry.boundingBox.clone().applyMatrix4(m));});return box;}
function gameClipBox(a,b,index){const box=new THREE.Box3();for(let f=a;f<=b;f+=2)box.union(gameBox(f,index));box.union(gameBox(b,index));return box;}
function updateNavigation(){groovy?.update({state,selected,layout,page,busy,turning:!!pageDrag||Math.abs(page-turnInput.target)>.001});$('skip-animation').hidden=!(busy||tween||cameraTween||contextTween);}
function refreshActions(){updateNavigation();const book=selected.startsWith('book-'),game=selected.startsWith('game-'),browse=book||state==='grid';$('actions').hidden=!selected&&!['spread','grid','stack'].includes(state);$('spread').hidden=!book;$('spread').textContent=`Back to ${layout}`;$('layout').hidden=!(book||state==='spread'||state==='grid');$('layout').textContent=layout==='spread'?'Show grid':'Show spread';$('open-book').hidden=!browse;$('page-controls').hidden=!browse;$('previous-page').hidden=!browse;$('next-page').hidden=!browse;$('page-label').textContent=state==='grid'?'Grid pages (all books)':'Cover to cover';$('open-game').hidden=!game||state==='game-open';$('close-game').hidden=!game||state!=='game-open';$('play-game').hidden=!game||state!=='game-open';$('open-book').textContent=state==='grid'?(turnInput.target>-.99&&turnInput.target<9.99?'Close all':'Open all'):(turnInput.target>-.99&&turnInput.target<9.99?'Close book':'Read');document.body.classList.toggle('item-active',state!=='shelf');$('play-game').textContent='Tabletop';$('return').textContent=viewingEasel()?'Back to shelf':'Put away';}
async function work(task,{reset='all'}={}){if(!ready||busy)return;setBusy(true);refreshActions();try{await resetPresentation(reset);await task();}catch(error){status('The transition could not finish. Reload the graphics page to retry.');console.error(error);}finally{skipRequested=false;setBusy(false);refreshActions();focusKey='';promoteArt().catch(console.error);invalidate();}}
async function selectBook(grade){
 if(selected===`book-${grade}`)return;
 if(state==='shelf'){
  const clips=takeOutIntervals(layout);state='taking-books';selected='';refreshActions();policy(false);
  await prepareMotionArt();await frameBookAnimation(`take-out-${layout}`,clips,layout);roomTarget(0);
  await bookClip(...clips[0],'Taking the coursebooks off the shelf...');await bookBridge(clips[1][0],160);
  await bookClip(...clips[1],layout==='grid'?'Arranging the coursebooks in the grid...':'Spreading the coursebooks...');
  if(layout==='grid'){await bookBridge(2713,100);await settleGridHome();turnInput.reset(gridPages.progress);page=-1;}else{turnInput.reset(-1);page=-1;}
  state=layout;$('actions').open=false;if(layout==='grid')fitBookLayout('grid');status(`Choose a coursebook from the ${layout}, or switch layouts.`);refreshActions();focusKey='';await promoteArt();return;
 }
 const swapping=selected.startsWith('book-');if(swapping)await backToLayout(false);if(state!==layout)return;
 if(layout==='grid'){const resting=gridPages.commit(turnInput.target),start=page;turnInput.reset(resting);if(Math.abs(start-resting)>.001)await animate(160,t=>page=mix(start,resting,ease(t)));page=resting;}
 const marker=selectionInterval(meta.markers,layout,grade),end=marker.endFrame;
 selected=`book-${grade}`;state='selecting-book';focusAmount=0;focusEnd=bookPose(end);focusTargets=focusPoses(grade,readingBounds,layout,focusEnd,layout==='grid'?gridHome():null,mount.clientWidth/mount.clientHeight);gridWasOpen=layout==='grid';if(gridWasOpen)gridContextPage=gridPages.progress;
 turnInput.reset(gridWasOpen?gridPages.focus():savedPages[grade-1]);page=turnInput.target;
 await promoteArt();policy(true);await prepareFocusPath(marker,0,1);await frameFocusAnimation();await bookBridge(marker.frame,120);await bookClip(marker.frame,end,`Choosing Grade ${grade}...`,[0,1]);
 focusAmount=1;state='book';$('actions').open=false;$('page').value=turnInput.target;
 status(`Grade ${grade} · click/drag pages · scroll zoom · Shift+scroll turn · middle-click focus / drag pan / double-click center.`);refreshActions();promoteArt().catch(console.error);
}
async function closeBook(){const start=page;turnInput.reset(-1);await animate(450,t=>{page=mix(start,-1,ease(t));});page=-1;}
async function backToLayout(refit=true){
 if(!selected.startsWith('book-'))return;
 const grade=Number(selected.split('-')[1]);savedPages[grade-1]=Math.round(turnInput.target);if(layout==='grid'){const resting=gridPages.commit(turnInput.target),start=page;turnInput.reset(resting);const contextStart=gridContextPage;if(Math.abs(start-resting)>.001||contextStart!==resting)await animate(260,t=>{page=mix(start,resting,ease(t));gridContextPage=mix(contextStart,resting,ease(t));});page=gridContextPage=resting;}else await closeBook();
 const m=selectionInterval(meta.markers,layout,grade,true);await prepareFocusPath(m,1,0);
 state='leaving-book';if(refit)await frameFocusAnimation();await bookBridge(m.frame,100);await bookClip(m.frame,m.endFrame,`Returning to the ${layout}...`,[1,0]);await bookBridge(layout==='spread'?314:2713,160);
 focusEnd=focusTargets=focusContacts=null;focusAmount=0;selected='';state=layout;$('actions').open=false;policy(false);
 if(layout==='grid'){turnInput.reset(gridPages.progress);page=turnInput.target;}
 if(refit&&layout!=='grid'){shotName=`overview-${layout}`;fitBookLayout(layout);}
 status(layout==='grid'?'Grid pages turn together · Shift+scroll over a book or use the page controls · click a book to inspect.':'Choose a coursebook from the spread, switch layouts, or put the set away.');refreshActions();focusKey='';promoteArt().catch(console.error);
}
async function switchLayout(){
 if(selected.startsWith('book-'))await backToLayout(false);
 if(state!==layout)return;
 const toGrid=layout==='spread';if(!toGrid){gridPages.commit(turnInput.target);await closeBook();}
 if(!toGrid)bookOverride=gridHome();state='changing-layout';await prepareMotionArt();
 const a=toGrid?2443:177,b=toGrid?2713:314;
 await frameBookAnimation(toGrid?'spread-to-grid':'grid-to-spread',[[a,b]],toGrid?'grid':'spread');
 await bookBridge(a,180);await bookClip(a,b,toGrid?'Gathering and arranging the original grid...':'Gathering and spreading the coursebooks...');
 if(toGrid)await settleGridHome();layout=toGrid?'grid':'spread';state=layout;$('actions').open=false;
 if(toGrid){turnInput.reset(gridPages.progress);page=-1;fitBookLayout('grid');}else{turnInput.reset(-1);page=-1;}
 status(toGrid?'Grid pages turn together · Shift+scroll over a book or use the page controls · click a book to inspect.':'Choose a coursebook from the spread.');focusKey='';promoteArt().catch(console.error);refreshActions();
}
async function selectGame(index){if(state!=='shelf')return;selected=`game-${index}`;state='taking-game';roomTarget(0);refreshActions();policy(true);fitBox(gameClipBox(6504,6536,index),new THREE.Vector3(.15,.8,1));await gameClip(6504,6536,'Taking the board games off the shelf…');roomTarget(0);state='game';fitBox(gameBox(6536,index),new THREE.Vector3(.12,1.2,1));status(`${gameData.games[index].name} · drag for full rotation · open the box when ready.`);refreshActions();}
async function frameEasel(duration=1000){
 const view=easelFrame(shelfContext.easel,mount.clientWidth/mount.clientHeight);camera.up.copy(view.up);cameraTo(view.position,view.target,duration,{arc:true});await animate(duration,()=>{});
}
async function selectEasel(){
 if(state!=='shelf')return;selected='easel';state='focusing-easel';shotName='easel-video';policy(true);easelPlayer.prepare();refreshActions();status('Moving into place at the easel…');
 await frameEasel();state='easel';refreshActions();status('The Great Race · video on the original easel · Escape returns to the shelf.');await easelPlayer.start();
}
async function openGame(){if(!selected.startsWith('game-')||state!=='game')return;const i=Number(selected.split('-')[1]),a=i?6750:6536,b=i?6864:6641;fitBox(gameClipBox(a,b,i),new THREE.Vector3(.1,.55,1));await gameClip(a,b,'Opening the original box and folding board…');state='game-open';fitBox(gameBox(b,i),new THREE.Vector3(.1,.75,1));status(`${gameData.games[i].name} · inspect the board or enter the freeform tabletop.`);refreshActions();}
async function closeGame(returning=false){if(state!=='game-open')return;const i=Number(selected.split('-')[1]),a=i?6867:6647,b=i?6957:6748;fitBox(gameClipBox(a,b,i),new THREE.Vector3(.1,.65,1));await gameClip(a,b,'Folding the board and closing the box…');state='game';if(!returning)fitBox(gameBox(gameFrame,i),new THREE.Vector3(.12,1.2,1));refreshActions();}
async function putAway(){
 mouseControls?.clear();pointerStart=null;orbit.enablePan=false;camera.up.set(0,1,0);camera.clearViewOffset();$('tabletop-dialog').close();$('tabletop-frame').removeAttribute('src');
 if(viewingEasel()){easelPlayer.leave();state='leaving-easel';status('Returning to the shelf…');roomCamera();await animate(650,()=>{});}
 if(selected.startsWith('book-'))await backToLayout();
 if(state==='spread'||state==='grid'){
  if(state==='grid'){gridPages.commit(turnInput.target);await closeBook();}const [gather,shelved]=shelvingIntervals(state);if(state==='grid')bookOverride=gridHome();state='putting-books';await prepareMotionArt();await frameBookAnimation(`put-away-${layout}`,[gather,shelved],layout);
  await bookBridge(gather[0],180);await bookClip(...gather,'Gathering the coursebooks into their original stack...');
  await bookBridge(shelved[0],260);roomTarget(1);roomCamera();await bookClip(...shelved,'Sliding the coursebooks back onto the shelf...');bookFrame=shelved[1];
 }
 else if(selected.startsWith('game-')){if(state==='game-open')await closeGame(true);state='putting-game';await gameBridge(6959);roomTarget(1);roomCamera();await gameClip(6959,6992,'Putting the board games back on the shelf…');gameFrame=6467;}
 if(contextTween)await contextTween.promise;
 selected='';state='shelf';page=turnInput.target=-1;roomTarget(1);policy(false);roomCamera(true);mouseControls?.captureDefaultPose();status('Choose a coursebook or board game.');refreshActions();
}
function choose(id){if(id==='easel'&&viewingEasel())return;work(async()=>{if(id==='easel')await selectEasel();else if(id.startsWith('book-'))await selectBook(Number(id.split('-')[1]));else await selectGame(Number(id.split('-')[1]));});}
async function prepareMotionArt(){
 // Covers are already resident. Pin medium art for the visible grid leaves;
 // other hidden leaves use a permanent 256px tier rather than white surfaces.
 const faces=layout==='grid'?gridArtworkFiles(page):['front.jpg','back.jpg'];
 await Promise.all(books.flatMap(b=>faces.map(f=>texture(`assets/grade-${b.grade}/travel/${f}`))));
 focusKey='';await promoteArt();
}
async function promoteArt(){
 const grade=selected.startsWith('book-')?Number(selected.split('-')[1]):0,grid=layout==='grid'&&(state==='grid'||!!grade),leaf=Math.floor(page),key=`${grade}:${grid}:${leaf}`;
 if(key===focusKey)return;focusKey=key;
 const high=grade?artworkFiles(page):[],medium=grid?gridArtworkFiles(page):[],wanted=high.map(f=>`assets/grade-${grade}/${f}`);
 for(let g=1;g<=6;g++)for(const f of medium)wanted.push(`assets/grade-${g}/grid/${f}`);
 await Promise.all(wanted.map(texture));if(disposed||focusKey!==key)return;
 const highSet=new Set(high),mediumSet=new Set(medium);
 for(const b of books)b.setArtwork(file=>(b.grade===grade&&highSet.has(file)?getTexture(`assets/grade-${b.grade}/${file}`):null)||(mediumSet.has(file)?getTexture(`assets/grade-${b.grade}/grid/${file}`):null)||getTexture(`assets/grade-${b.grade}/travel/${file}`));
 // Full reader images are bounded to the nearby leaves of the chosen grade.
 const keep=new Set(high.map(f=>`assets/grade-${grade}/${f}`)),keepGrid=new Set(wanted.filter(url=>url.includes('/grid/')));
 for(const [url,t] of textures)if(t?.isTexture&&(/^assets\/grade-\d+\/[^/]+\.jpg$/.test(url)&&!keep.has(url)&&!busy||/^assets\/grade-\d+\/grid\/[^/]+\.jpg$/.test(url)&&!keepGrid.has(url)&&!busy)){t.dispose();textures.delete(url);}
 invalidate();
}
function applyScene(){
 const room=roomRetreat(contextOpacity,shelfContext.bounds.getCenter(new THREE.Vector3()).toArray());
 roomMatrix.compose(new THREE.Vector3().fromArray(room.position),new THREE.Quaternion(),new THREE.Vector3().setScalar(room.scale));
 const gameSelected=selected.startsWith('game-')?Number(selected.split('-')[1]):-1,booksStored=state==='shelf'||gameSelected>=0||viewingEasel();
 const poses=displayedPoses(),bookSelected=selected.startsWith('book-')?Number(selected.split('-')[1]):0;
 poses.forEach((p,i)=>{const b=books[i],chosen=bookSelected===i+1,focused=!!focusEnd,grid=state==='grid';let progress=p.progress,turns=p.turns;if(grid){progress=page;turns=null;}else if(focused){progress=chosen?(gridWasOpen||state==='book'||state==='leaving-book'?page:mix(-1,page,readerOpen(focusAmount))):(layout==='grid'?gridContextPage:-1);turns=null;}b.update(progress,1,turns,p.flipStrength);b.group.userData.progress=progress;b.group.position.fromArray(p.position);b.group.quaternion.fromArray(p.quaternion);b.group.scale.fromArray(p.scaleVector);b.group.visible=p.scale>.001;});
 layer(bookRoot,booksStored?1:0);bookRoot.matrixAutoUpdate=false;bookRoot.matrix.copy(booksStored?roomMatrix:identity);bookRoot.matrixWorldNeedsUpdate=true;bookRoot.visible=!booksStored||room.visible;
 shelf.update(sampler.frame(6467,settings).shelf,settings.bookendImperfection,bookPose(6467));environment.update(6467);environment.wall.visible=false;
 for(const root of [shelf.root,environment.root,shelfContext.root]){layer(root,1);root.matrixAutoUpdate=false;root.matrix.copy(roomMatrix);root.matrixWorldNeedsUpdate=true;root.visible=room.visible;}
 games.update(gameFrame,identity);
 if(gameOverride)games.parts.forEach(({obj},i)=>{const v=gameOverride[i];obj.matrix.compose(new THREE.Vector3().fromArray(v).multiplyScalar(SOURCE_SCALE),new THREE.Quaternion().fromArray(v,3),new THREE.Vector3().fromArray(v,7));obj.matrixWorldNeedsUpdate=true;obj.visible=Math.max(...v.slice(7))>.001;});
 games.parts.forEach(({obj,part},i)=>{
  const stored=gameSelected<0||part.game!==gameSelected;
  if(gameSelected>=0&&part.game!==gameSelected){const v=sampleWorldTrack(gameData,gameValues,6467,i);obj.matrix.compose(new THREE.Vector3().fromArray(v).multiplyScalar(SOURCE_SCALE),new THREE.Quaternion().fromArray(v,3),new THREE.Vector3().fromArray(v,7));obj.visible=Math.max(...v.slice(7))>.001;}
  obj.layers.set(stored?1:0);if(stored){obj.matrix.premultiply(roomMatrix);obj.visible&&=room.visible;}obj.matrixWorldNeedsUpdate=true;
 });
}
function render(now){raf=0;if(!ready)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;let moving=false;
 if(tween){const t=tween;if(t.start===null)t.start=now;const u=Math.min(1,(now-t.start)/t.duration);t.update(u);moving=true;if(u===1){tween=null;t.resolve();}}
 if(cameraTween){const t=cameraTween;if(t.start===null)t.start=now;const u=Math.min(1,(now-t.start)/t.duration),e=ease(u);if(t.arc){const pose=arcCamera(t.from,t.fromTarget,t.position,t.target,e);camera.position.copy(pose.position);orbit.target.copy(pose.target);}else{camera.position.lerpVectors(t.from,t.position,e);orbit.target.lerpVectors(t.fromTarget,t.target,e);}camera.lookAt(orbit.target);moving=true;if(u===1){cameraTween=null;orbit.update();mouseControls?.captureDefaultPose();}}
 if(activeBookPages()&&!busy){if(turnInput.settle(now))moving=true;$('page').value=turnInput.target;}
 if(Math.abs(turnInput.target-page)>.0001&&!tween){page=reduced.matches?turnInput.target:THREE.MathUtils.damp(page,turnInput.target,12,dt);if(Math.abs(turnInput.target-page)<.001)page=turnInput.target;moving=true;promoteArt().catch(console.error);}
 if(contextTween){const t=contextTween;if(t.start===null)t.start=now;const u=Math.min(1,(now-t.start)/t.duration);contextOpacity=mix(t.from,t.target,ease(u));moving=true;if(u===1){contextOpacity=t.target;contextTween=null;t.resolve();}}
 warmReturnPath();applyScene();updateNavigation();moving=updateGradeNavigation(dt)||moving;if(state==='shelf'||viewingEasel()){roomCamera3D.position.copy(camera.position);roomCamera3D.quaternion.copy(camera.quaternion);}mouseControls?.projection.update({enabled:projectionEnabled&&state!=='shelf'&&!viewingEasel()&&!busy,panned:mouseControls.isPanned(),width:mount.clientWidth,height:mount.clientHeight,getCenter:()=>viewCenter.clone()});renderer.info.reset();renderer.setClearColor(0x000000,0);renderer.clear();if(contextOpacity>0)renderer.render(scene,roomCamera3D);if(state!=='shelf'){renderer.clearDepth();renderer.render(scene,camera);}renderCount++;scene.updateMatrixWorld(true);
 const project=obj=>{const box=visibleBox(obj),p=box.getCenter(new THREE.Vector3()).project(camera),r=mount.getBoundingClientRect();return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];};
 $('graphics-diagnostics').textContent=JSON.stringify({ready,state,layout,selected,busy,easelVideo:easelPlayer?.diagnostics(),videoViewPolicy:easelVideoPolicy(getSharedSettings().get().graphics),resetting,lastViewReset,defaultView,shelfFraming:'vertical fill after load',gradePendants:gradeRig?.diagnostics(camera,[bookRoot,games.root])||[],skipCount,lastSkipSource,bookFrame,gameFrame,page,pageTarget:turnInput.target,inputOwner:turnInput.owner,bookFraming:'stationary grid / enlarged centered spread reader',gridContextPage,middleMouse:'click focus / drag pan / double-click center',shotName,gridPage:gridPages.progress,focusAmount,focusPrepMs,focusWaitMs,alignment:'neat source; spine offsets at most .0015 scene units',cameraTracksAnimatedBounds:false,pageWheel:'Shift+scroll',liningResolution:selected.startsWith('book-')?['inside-front.jpg','inside-back.jpg'].map(file=>({file,width:getTexture(`assets/grade-${selected.split('-')[1]}/${file}`)?.image?.width||128})):[],contextOpacity,backingVisible:false,background:'fixed CSS pattern',patternInScene:false,boundedWall:true,roomRetreat:roomRetreat(contextOpacity),wallBounds:shelfContext.bounds.min.toArray().concat(shelfContext.bounds.max.toArray()),sideWall:false,purpleFloor:false,context3D:true,artworkPendingReview:false,viewResetOnPutAway:true,renderCount,moving,failed:[...failed],camera:{position:camera.position.toArray(),target:orbit.target.toArray(),limits:{azimuth:[orbit.minAzimuthAngle,orbit.maxAzimuthAngle],polar:[orbit.minPolarAngle,orbit.maxPolarAngle]}},books:books.map(b=>({grade:b.grade,visible:b.group.visible,screen:project(b.group),position:b.group.position.toArray(),scale:b.group.scale.toArray(),quaternion:b.group.quaternion.toArray(),progress:b.group.userData.progress})),games:gameData.games.map((g,i)=>{const box=gameBox(gameFrame,i),p=box.getCenter(new THREE.Vector3()).project(camera),r=mount.getBoundingClientRect();return {name:g.name,screen:[r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2]};}),triangles:renderer.info.render.triangles,draws:renderer.info.render.calls});
 if(moving||tween||cameraTween||easelPlayer?.needsFrames)invalidate();
}
function pick(e){
 const r=mount.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.layers.set(state==='shelf'?1:0);ray.setFromCamera(ndc,state==='shelf'?roomCamera3D:camera);
 const targets=[];for(const root of [bookRoot,games.root,...(state==='shelf'||viewingEasel()?[shelfContext.root,shelf.root,environment.root]:[])])if(root.visible)root.traverseVisible(o=>{if(o.isMesh)targets.push(o);});
 const hit=ray.intersectObjects(targets,false)[0];if(!hit)return null;let o=hit.object;while(o&&o.userData.navigation===undefined&&o.userData.book===undefined&&o.userData.game===undefined&&!o.userData.easel)o=o.parent;
 if(o?.userData.easel)return {...hit,id:'easel'};
 if(o?.userData.navigation)return o.userData.enabled?{...hit,navigation:o.userData.navigation,id:`grade-${o.userData.navigation.grade}`} :null;
 return o?{...hit,grade:o.userData.book,id:o.userData.book?`book-${o.userData.book}`:`game-${o.userData.game}`}:null;
}
function syncPage(){ $('page').value=turnInput.target;refreshActions();invalidate(); }
function stopPageDrag(e,cancel=false){
 if(!pageDrag||e&&e.pointerId!==pageDrag.id)return;
 const d=pageDrag;pageDrag=null;
 if(!cancel&&!d.moved)turnInput.turn(d.direction);else turnInput.release();
 if(renderer.domElement.hasPointerCapture(d.id))renderer.domElement.releasePointerCapture(d.id);
 updateViewInput();syncPage();
}
renderer.domElement.addEventListener('pointerdown',e=>{
 if(e.button!==0||!ready||busy||pageDrag)return;
 const hit=pick(e);pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId,time:performance.now(),hitId:hit?.id};
 if(bookClickIntent(state,hit?.id,selected)!=='page')return;
 const b=books[hit.grade-1],local=b.group.worldToLocal(hit.point.clone()),direction=page<=-.999?1:page>=9.999?-1:local.x+bookOrigin[0]>=0?1:-1;
 const p0=b.group.localToWorld(new THREE.Vector3()).project(camera),p1=b.group.localToWorld(new THREE.Vector3(1.42,0,0)).project(camera),r=mount.getBoundingClientRect();
 const axis=new THREE.Vector2((p1.x-p0.x)*r.width/2,-(p1.y-p0.y)*r.height/2),span=Math.max(40,axis.length());axis.normalize();
 turnInput.begin('page');turnInput.set(page);pageDrag={id:e.pointerId,start:page,x:e.clientX,y:e.clientY,axis,span,direction,moved:false};pointerStart=null;
 orbit.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);mount.focus({preventScroll:true});e.stopPropagation();e.preventDefault();
},true);
renderer.domElement.addEventListener('pointermove',e=>{
 if(!pageDrag||e.pointerId!==pageDrag.id)return;const d=pageDrag,dx=e.clientX-d.x,dy=e.clientY-d.y;d.moved||=Math.hypot(dx,dy)>5;
 if(d.moved){turnInput.set(draggedPage(d.start,-(dx*d.axis.x+dy*d.axis.y)/d.span,d.direction));page=turnInput.target;syncPage();}
 e.preventDefault();e.stopPropagation();
},true);
renderer.domElement.addEventListener('pointerup',e=>{
 if(pageDrag){stopPageDrag(e);e.stopPropagation();return;}
 const p=pointerStart;pointerStart=null;if(!p||!ready||busy||p.id!==e.pointerId||Math.hypot(e.clientX-p.x,e.clientY-p.y)>5||performance.now()-p.time>450)return;
 const hit=pick(e);if(hit&&hit.id===p.hitId&&bookClickIntent(state,hit.id,selected)!=='page')hit.navigation?choose(`book-${hit.navigation.grade}`):choose(hit.id);
},true);
renderer.domElement.addEventListener('pointercancel',e=>{pointerStart=null;stopPageDrag(e,true);});
renderer.domElement.addEventListener('lostpointercapture',e=>stopPageDrag(e,true));
renderer.domElement.addEventListener('wheel',e=>{
 if(!isPageWheel(e)||!ready||busy||!activeBookPages()||!pick(e)||(state==='book'&&pick(e)?.id!==selected))return;
 e.preventDefault();e.stopImmediatePropagation();turnInput.wheel(e.deltaY,e.deltaMode,mount.clientHeight,performance.now());syncPage();
},{capture:true,passive:false});
renderer.domElement.addEventListener('pointermove',e=>{if(!ready||busy||reduced.matches||!['grid','spread'].includes(state))return;const hit=pick(e);if(hit?.grade)requestFocusTrack(layout,hit.grade,layout==='grid'?Math.round(page):savedPages[hit.grade-1],0,1,true).catch(console.error);},{passive:true});
window.addEventListener('blur',()=>{mouseControls?.cancelFocusAnimation();orbit.enablePan=false;stopPageDrag(null,true);turnInput.release();invalidate();});
orbit.addEventListener('start',()=>cameraTween=null);orbit.addEventListener('change',()=>{if((state==='shelf'||viewingEasel())&&!busy&&!cameraTween){roomCamera3D.position.copy(camera.position);roomCamera3D.quaternion.copy(camera.quaternion);}invalidate();});$('return').addEventListener('click',()=>work(putAway));$('spread').addEventListener('click',()=>work(backToLayout));$('layout').addEventListener('click',()=>work(switchLayout));$('open-game').addEventListener('click',()=>work(openGame));$('close-game').addEventListener('click',()=>work(closeGame));
$('previous-page').addEventListener('click',()=>{turnInput.turn(-1);syncPage();});$('next-page').addEventListener('click',()=>{turnInput.turn(1);syncPage();});
$('open-book').addEventListener('click',()=>{turnInput.reset(turnInput.target>=9.99?9:turnInput.target>-.99?-1:0);syncPage();});
$('page').addEventListener('pointerdown',()=>turnInput.begin('slider'));
$('page').addEventListener('keydown',e=>{const directions={ArrowRight:1,ArrowUp:1,PageUp:1,ArrowLeft:-1,ArrowDown:-1,PageDown:-1};if(e.key in directions){e.preventDefault();turnInput.turn(directions[e.key]);syncPage();}else if(e.key==='Home'||e.key==='End'){e.preventDefault();turnInput.reset(e.key==='Home'?-1:10);syncPage();}});
$('page').addEventListener('input',e=>{turnInput.set(Number(e.target.value));syncPage();});
for(const event of ['change','pointerup','pointercancel','lostpointercapture','blur','keyup'])$('page').addEventListener(event,()=>{turnInput.release();syncPage();});
document.querySelectorAll('[data-item]').forEach(b=>b.addEventListener('click',()=>{choose(b.dataset.item);b.closest('details').open=false;}));
mount.addEventListener('keydown',e=>{if(activeBookPages()&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();stopPageDrag(null,true);turnInput.turn(e.key==='ArrowRight'?1:-1);syncPage();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('tabletop-dialog').open&&state!=='shelf'&&!busy){e.preventDefault();work(putAway);}});
$('play-game').addEventListener('click',()=>{const game=selected==='game-1'?'manor-mayhem':'global-conquest',url=new URL(`./tabletop.html?game=${game}`,import.meta.url).href;if($('tabletop-frame').src!==url)$('tabletop-frame').src=url;$('tabletop-dialog').setAttribute('aria-label',`${game} tabletop`);$('tabletop-frame').title=`${game} tabletop`;$('tabletop-dialog').showModal();});$('leave-tabletop').addEventListener('click',()=>$('tabletop-dialog').close());
mouseControls=installItemViewControls({controls:orbit,camera,domElement:renderer.domElement,
 focusDurationMs:()=>reduced.matches?1:320,pivotOnRightDown:false,handleRightButton:false,interruptFocusOnMiddleDown:true,
 canInteract:()=>ready&&!busy&&!pageDrag&&(!viewingEasel()||easelVideoPolicy(getSharedSettings().get().graphics).rotate),getDefaultView:()=>defaultView,onResetView:mode=>work(async()=>{},{reset:mode}),
 getHitPoint:e=>{const hit=pick(e);if(hit)return hit.point;if(state!=='shelf')return null;const objects=[];for(const root of [shelf.root,environment.root,shelfContext.root])root.traverseVisible(o=>{if(o.isMesh)objects.push(o);});return ray.intersectObjects(objects,false)[0]?.point||null;},
 getDefaultFocusPoint:()=>state==='shelf'?shelfContext.bounds.getCenter(new THREE.Vector3()):selected.startsWith('book-')&&layout==='spread'?focusedBox().getCenter(new THREE.Vector3()):['spread','grid','book'].includes(state)?layoutBox(layout).getCenter(new THREE.Vector3()):selected.startsWith('game-')?gameBox(gameFrame,Number(selected.split('-')[1])).getCenter(new THREE.Vector3()):viewCenter.clone(),onMiddleDown:()=>{pointerStart=null;cameraTween=null;},onFocusStart:()=>cameraTween=null});
renderer.domElement.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
const resize=new ResizeObserver(()=>{renderer.setSize(mount.clientWidth,mount.clientHeight,false);camera.aspect=mount.clientWidth/mount.clientHeight;camera.updateProjectionMatrix();if(ready){updateRoomView();if(state==='shelf')roomCamera(true);else if(viewingEasel()){const v=easelFrame(shelfContext.easel,mount.clientWidth/mount.clientHeight);camera.up.copy(v.up);cameraTo(v.position,v.target,1);}else if(selected.startsWith('book-')&&focusTargets){if(layout==='grid'){focusTargets=focusPoses(Number(selected.split('-')[1]),readingBounds,'grid',focusEnd,gridHome(),mount.clientWidth/mount.clientHeight);focusContacts=null;fitBookLayout('grid');}else fitFocused();}else if(state==='spread'||state==='grid')fitBookLayout(layout);else if(selected.startsWith('game-'))fitBox(gameBox(gameFrame,Number(selected.split('-')[1])));}invalidate();});resize.observe(mount);
document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){easelPlayer?.suspend();stopPageDrag(null,true);turnInput.release();hiddenAt=performance.now();if(raf)cancelAnimationFrame(raf);raf=0;}else{easelPlayer?.resume();const pause=performance.now()-hiddenAt;if(tween?.start!==null&&tween)tween.start+=pause;if(cameraTween?.start!==null&&cameraTween)cameraTween.start+=pause;if(contextTween?.start!==null&&contextTween)contextTween.start+=pause;invalidate();}});
window.addEventListener('pagehide',e=>{if(raf)cancelAnimationFrame(raf);if(e.persisted)return;disposed=true;resize.disconnect();gradeRig?.dispose();easelPlayer?.dispose();videoConsent.dispose();window.removeEventListener('audioConsentChanged',syncVideoAudio);groovy?.dispose();stopSettings();mouseControls?.dispose();orbit.dispose();books.forEach(b=>b.dispose());contactProbe?.dispose();for(const worker of focusWorkers)worker.terminate();focusWorkers.clear();shelf?.dispose();environment?.dispose();games?.dispose();pageSurface.dispose();coverSurface.dispose();for(const t of textures.values())if(t.isTexture)t.dispose();shelfContext?.dispose();renderer.dispose();});window.addEventListener('pageshow',invalidate);
async function init(){try{const json=url=>fetch(new URL(url,import.meta.url)).then(r=>{if(!r.ok)throw Error(url);return r.json();}),binary=url=>fetch(new URL(url,import.meta.url)).then(r=>{if(!r.ok)throw Error(url);return r.arrayBuffer();});const [m,motion,props,env,envMotion,gd,gv,track,contextData,contextValues,pendantData,pendantValues]=await Promise.all([json('marker-motion.json'),binary('presentation-motion.bin'),json('source-shelf-assets.json'),json('source-environment.json'),binary('source-environment.bin'),json('source-board-games.json'),binary('source-board-games.bin'),binary('clearance-study09-0-1.bin'),json('shelf-context.json'),binary('shelf-context.bin'),json('assets/navigation/grade-meshes.json'),binary('assets/navigation/grade-meshes.bin')]);gradeRig=createGradePendants(pendantData,new Float32Array(pendantValues));meta=m;sampler=createMarkerSampler(m,new Float32Array(motion));contacts=new Float32Array(track);gameData=gd;gameValues=new Float32Array(gv);
 const files=['front.jpg','back.jpg','inside-front.jpg','inside-back.jpg',...Array.from({length:18},(_,i)=>`page-${String(i+1).padStart(2,'0')}.jpg`)];await Promise.all(Array.from({length:6},(_,i)=>[...files.map(f=>texture(`assets/grade-${i+1}/thumbs/${f}`)),...files.map(f=>texture(`assets/grade-${i+1}/travel/${f}`))]).flat());
 books=Array.from({length:6},(_,i)=>{const b=createSourceBook({grade:i+1,pageSurface,coverSurface,texture:getTexture});b.group.userData.book=i+1;bookRoot.add(b.group);return b;});contactProbe=createSourceBook({grade:1,pageSurface,coverSurface,texture:()=>null});shelf=createSourceShelf(props,scene);environment=createSourceEnvironment(env,new Float32Array(envMotion),scene);games=await createSourceGames(gd,gameValues,scene,Math.min(16,renderer.capabilities.getMaxAnisotropy()));
 await Promise.all([...new Set(contextData.materials.map(m=>m.texture).filter(Boolean))].map(texture));
 shelfContext=createShelfContext(contextData,new Float32Array(contextValues),scene,getTexture,env.parts[0]);
 easelPlayer=createEaselVideo({mesh:shelfContext.easel,src:new URL('./assets/easel/the-great-race.mp4',import.meta.url).href,controls:$('easel-controls'),video:$('easel-video'),invalidate,notify:status,requestAudio:async()=>{const choice=await videoConsent.prompt();syncVideoAudio();return choice.allowed;}});syncVideoAudio();
 const rest=books[0].update(4);readingBounds={min:[...rest.min],max:[...rest.max]};books[0].update(-1);
 books.forEach(b=>b.setArtwork(file=>getTexture(`assets/grade-${b.grade}/travel/${file}`)));
 ready=true;document.querySelectorAll('[data-item]').forEach(button=>button.disabled=false);refreshActions();$('loading').hidden=true;roomCamera(true,true);const loadedView=updateRoomView();cameraTo(loadedView.position,loadedView.target,1100);invalidate();
 }catch(error){$('loading').textContent=`The graphics shelf could not load: ${error.message}`;console.error(error);}}
function syncVideoAudio(){const audio=getSharedSettings().get().audio;easelPlayer?.syncAudio({...audio,allowed:videoConsent.get().allowed});}
window.addEventListener('audioConsentChanged',syncVideoAudio);
const stopSettings=getSharedSettings().subscribe((snapshot,change)=>{projectionEnabled=!!snapshot.graphics?.centerOnViewport;syncVideoAudio();updateViewInput();if(state==='shelf'&&change.changed.includes('graphics.shelfRotation')){if(!snapshot.graphics.shelfRotation&&!busy)void work(async()=>{policy(false);orbit.update();});else policy(false);}if(viewingEasel()&&!busy&&change.changed.some(p=>p==='graphics.videoRotation'||p==='graphics.videoZoom')&&!snapshot.graphics.videoRotation&&!snapshot.graphics.videoZoom)void work(async()=>{});invalidate();},{immediate:false});
groovy=createGroovyNavigation({reduced:()=>reduced.matches,onAction:(action,grade)=>{if(action==='previous-book'||action==='next-book')choose(`book-${grade}`);else $(action)?.click();}});
function updateGradeNavigation(dt){
 if(!gradeRig)return false;return gradeRig.update({context:{state,selected,layout,page,busy:busy&&!resetting,turning:!!pageDrag||Math.abs(page-turnInput.target)>.001},book:selected.startsWith('book-')?books[Number(selected.split('-')[1])-1]:null,readingBounds,dt,reduced:reduced.matches});
}
function skipAnimation(source='button'){
 if(!(busy||tween||cameraTween||contextTween))return;skipRequested=busy;skipCount++;lastSkipSource=source;
 if(cameraTween){const t=cameraTween;cameraTween=null;camera.position.copy(t.position);orbit.target.copy(t.target);camera.lookAt(orbit.target);orbit.update();mouseControls?.captureDefaultPose();}
 if(contextTween){const t=contextTween;contextTween=null;contextOpacity=t.target;t.resolve();}
 if(tween){const t=tween;tween=null;t.update(1);t.resolve();}
 invalidate();
}
$('skip-animation').addEventListener('click',()=>skipAnimation());
document.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='s'||!(busy||tween||cameraTween||contextTween)||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select,[contenteditable=true]'))return;event.preventDefault();event.stopImmediatePropagation();skipAnimation('keyboard');},{capture:true});
$('leave-tabletop').innerHTML=groovyArtwork('Back','back');$('leave-tabletop').setAttribute('aria-label','Return to game box');$('leave-tabletop').title='Return to game box';
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===$('tabletop-frame').contentWindow&&event.data?.type==='tabletop:return')$('tabletop-dialog').close();});
init();
