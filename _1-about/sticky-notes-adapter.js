import {makePlane, planeWorld, fitSurface, aboutSourceId} from '../_7-shared-scripts/sticky-notes/placement.js';
import * as THREE from 'three';
import {registerStickySceneAdapter} from '../_7-shared-scripts/sticky-notes/index.js';
import {inkFor} from '../_7-shared-scripts/sticky-notes/data.js';
import {makeNoteFontSelect,noteFontId,noteRotation,noteCanvasFont,loadNoteFont} from '../_7-shared-scripts/sticky-notes/note-appearance.js';

const point = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const normal = new THREE.Vector3(), tangent = new THREE.Vector3(), up = new THREE.Vector3();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hashPath = value => {let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16);};
function stablePath(node,space){const parts=[];for(let p=node;p&&p!==space;p=p.parent){
  const name=p.name||'unnamed';const siblings=p.parent?.children.filter(child=>child.name===p.name)||[];
  parts.unshift(`${name}:${siblings.indexOf(p)}`);
}return parts.join('/');}

function triangleVertices(mesh, triangle) {
  const geometry = mesh.userData.stickyPlaneGeometry || mesh.geometry, positions = geometry?.getAttribute('position'), index = geometry?.getIndex();
  if (!positions || triangle * 3 + 2 >= (index?.count ?? positions.count)) return false;
  const vertex = offset => index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset;
  if ([0,1,2].some(offset => vertex(offset) >= positions.count)) return false;
  const read = (offset, target) => !mesh.userData.stickyPlaneGeometry && mesh.getVertexPosition
    ? mesh.getVertexPosition(vertex(offset), target)
    : target.fromBufferAttribute(positions, vertex(offset));
  read(0,a); read(1,b); read(2,c);
  return true;
}

function paint(note) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = note.color; ctx.fillRect(0,0,512,512);
  ctx.strokeStyle = '#40350888'; ctx.lineWidth = 10; ctx.strokeRect(6,6,500,500);
  ctx.fillStyle = inkFor(note.color); ctx.font = noteCanvasFont(note.font,43);
  const rows = [''];
  for (const word of note.text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = rows.at(-1) ? `${rows.at(-1)} ${word}` : word;
    if (ctx.measureText(candidate).width > 422 && rows.at(-1)) rows.push(word);
    else rows[rows.length-1] = candidate;
    if (rows.length >= 7) break;
  }
  rows.slice(0,7).forEach((row,i) => ctx.fillText(row.slice(0,30), 40, 94+i*55));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createAboutStickyAdapter({scene, cube, gltf, camera, canvas, onInputOwnership = () => {}}) {
  const surfaceMap = new Map(), reverse = new Map(), sourceReverse = new Map(), entries = new Map();
  let occluders = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let handlers = null, placing = false, shown = true, editing = false, gesture = null, suspended = false, disposed = false;
  let previousCursor = null;
  function scanSurfaces(){occluders=[];surfaceMap.clear();reverse.clear();sourceReverse.clear();
    const sourceCandidates=new Map();
    cube.traverse(node => {
    if (!node.isMesh || node.isInstancedMesh || !node.geometry?.getAttribute('position')) return;
    occluders.push(node);
    const association = gltf.parser.associations.get(node);
    const semanticId = node.userData?.stickySurfaceId;
    const sourceId=aboutSourceId(association,semanticId);
    if(sourceId){const matches=sourceCandidates.get(sourceId)||[];matches.push(node);sourceCandidates.set(sourceId,matches);}
    const id = node.userData?.stickyPlaneGeometry && semanticId
      ? `about:owned:${semanticId}` : association?.nodes !== undefined
      ? `about:gltf:${association.nodes}:${association.primitives ?? 0}`
      : association?.meshes !== undefined
        ? `about:gltfmesh:${association.meshes}:${association.primitives ?? 0}`
        : typeof semanticId === 'string' && /^[a-zA-Z0-9:._-]{1,140}$/.test(semanticId)
          ? `about:owned:${semanticId}` : null;
    // Procedural surfaces need an explicit semantic ID. Parent-path indices change
    // when face branches move between authored layout groups.
    if(!id || surfaceMap.has(id))return;
    surfaceMap.set(id,node); reverse.set(node,id);
  });
    for(const [id,matches] of sourceCandidates)if(matches.length===1){surfaceMap.set(id,matches[0]);sourceReverse.set(matches[0],id);}
    for(const id of ['about','skills','notes','odd','clock','refs']){
      const group=cube.getObjectByName(`About ${id} authored space`);
      if(group)surfaceMap.set(`about:plane:${id}`,group);
    }
    cube.traverse(node=>{
      if(!node.children.length||!node.name)return;
      let space=node.parent;while(space&&!/^About (about|skills|notes|odd|clock|refs) authored space$/.test(space.name))space=space.parent;
      if(!space)return;
      surfaceMap.set(`about:plane:${space.name.split(' ')[1]}:${hashPath(stablePath(node,space))}`,node);
    });
  }
  scanSurfaces();
  const hint = document.createElement('div'); hint.className='sticky-notes-placement-hint'; hint.hidden=true;
  hint.textContent='Click a cube surface to place the note · Esc cancels';
  canvas.parentElement.append(hint);
  const invalidHint = document.createElement('div');invalidHint.className='sticky-notes-placement-hint';invalidHint.hidden=true;
  invalidHint.style.bottom='3.7rem';invalidHint.style.background='#ffe0d8';invalidHint.style.color='#5f1d19';
  invalidHint.setAttribute('role','status');canvas.parentElement.append(invalidHint);
  let invalidTimer=0;
  function invalidDrop(message){handlers?.report?.(message);invalidHint.textContent=message;invalidHint.hidden=false;
    clearTimeout(invalidTimer);invalidTimer=setTimeout(()=>{invalidHint.hidden=true;},2500);}
  const dragHint = document.createElement('div'); dragHint.className='sticky-notes-placement-preview'; dragHint.hidden=true;
  canvas.parentElement.append(dragHint);
  const dialog = document.createElement('dialog'); dialog.className='sticky-notes-about-create';
  dialog.setAttribute('aria-label','Create sticky note');
  const form = document.createElement('form'); form.method='dialog';
  const heading=document.createElement('h3');heading.textContent='New sticky note';
  const fields = {};
  for (const [key,label,type,defaultValue] of [['text','Text','textarea',''],['color','Color','color','#fff2a8'],['size','Size','number','1'],['rotation','Rotation (degrees)','number','0']]) {
    const wrap=document.createElement('label');wrap.textContent=label;
    const field=document.createElement(type==='textarea'?'textarea':'input');
    if(type!=='textarea')field.type=type;
    field.value=defaultValue;field.name=key;
    if(key==='text'){field.maxLength=1200;field.rows=5;}
    if(key==='size'){field.min='.2';field.max='2';field.step='.1';}
    if(key==='rotation'){field.min='-10';field.max='10';field.step='1';}
    wrap.append(field);form.append(wrap);fields[key]=field;
  }
  fields.font=makeNoteFontSelect(document);const fontWrap=document.createElement('label');fontWrap.textContent='Handwriting';fontWrap.append(fields.font);form.append(fontWrap);
  const buttons=document.createElement('div');buttons.className='sticky-notes-about-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
  const save=document.createElement('button');save.type='submit';save.textContent='Place note';
  buttons.append(cancel,save);form.prepend(heading);form.append(buttons);dialog.append(form);document.body.append(dialog);
  let pendingAnchor=null;
  function closeDraft(){pendingAnchor=null;if(dialog.open)dialog.close();onInputOwnership(false);}
  cancel.addEventListener('click',closeDraft);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDraft();});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const appearance={text:fields.text.value.trim(),color:fields.color.value,font:noteFontId(fields.font.value),
      size:Number(fields.size.value),rotation:noteRotation(fields.rotation.value)};
    if(appearance.text.length>1200 || !/^#[0-9a-fA-F]{6}$/.test(appearance.color) ||
      !Number.isFinite(appearance.size) || appearance.size<.2 || appearance.size>2 ||
      !Number.isFinite(appearance.rotation)) return;
    if(pendingAnchor && handlers?.onPlaceWithAppearance?.(pendingAnchor,appearance)) closeDraft();
  });
  function openDraft(anchor){
    pendingAnchor=anchor;
    for(const [key,value] of Object.entries({text:'',color:'#fff2a8',size:'1',rotation:'0',font:'matt'}))fields[key].value=value;
    onInputOwnership(true);dialog.showModal();fields.text.focus();
  }
  function rayFromEvent(event){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return false;
    ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    cube.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);ray.setFromCamera(ndc,camera);
    return true;
  }
  function visible(mesh){
    for(let node=mesh;node&&node!==scene;node=node.parent)if(!node.visible)return false;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    return materials.some(material=>material?.visible!==false && material?.colorWrite!==false && material?.opacity!==0);
  }
  function branchVisible(node){for(let p=node;p&&p!==scene;p=p.parent)if(!p.visible)return false;return true;}
  function opaque(mesh){
    if(!visible(mesh))return false;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    return materials.some(material=>material?.visible!==false&&material?.colorWrite!==false&&
      (material?.opacity??1)>=.95&&(!material.transparent||material.depthWrite!==false));
  }
  function nearestPhysical(){return ray.intersectObjects(occluders.filter(opaque),false)[0]||null;}
  function anchorAt(event){
    scanSurfaces();nextScan=performance.now()+1000;
    if(!rayFromEvent(event))return {error:'Drop the note on the cube.'};
    const hit=nearestPhysical();
    if(!hit)return {error:'Choose a visible cube surface.'};
    const mesh=hit.object;
    if(hit.faceIndex==null||!hit.face)return {error:'This surface cannot hold a note.'};
    let space=mesh.parent;
    while(space && !/^About (about|skills|notes|odd|clock|refs) authored space$/.test(space.name))space=space.parent;
    if(space){
      const faceId=space.name.split(' ')[1];
      let support=mesh.parent&&mesh.parent!==space?mesh.parent:space;
      while(support!==space&&(!support.name||support.children.length<2))support=support.parent;
      const supportId=support===space?`about:plane:${faceId}`:
        `about:plane:${faceId}:${hashPath(stablePath(support,space))}`;
      let hitNormal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
      if(mesh.userData.stickyPlaneGeometry&&triangleVertices(mesh,0))
        hitNormal=b.clone().sub(a).cross(c.clone().sub(a)).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld));
      if(hitNormal.dot(camera.position.clone().sub(hit.point))<0)hitNormal.negate();
      const positions=mesh.geometry?.getAttribute('position');
      if(!positions)return {error:'This surface cannot hold a note.'};
      const first=mesh.getVertexPosition
        ?mesh.getVertexPosition(hit.face.a,new THREE.Vector3())
        :new THREE.Vector3().fromBufferAttribute(positions,hit.face.a);
      const second=mesh.getVertexPosition
        ?mesh.getVertexPosition(hit.face.b,new THREE.Vector3())
        :new THREE.Vector3().fromBufferAttribute(positions,hit.face.b);
      const edge=second.sub(first).transformDirection(mesh.matrixWorld);
      const hitTangent=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
      hitTangent.addScaledVector(hitNormal,-hitTangent.dot(hitNormal)).normalize();
      if(hitTangent.lengthSq()<.5)hitTangent.copy(edge).addScaledVector(hitNormal,-edge.dot(hitNormal)).normalize();

      const candidates=occluders.filter(opaque);
      const appearance=handlers?.getPlacementAppearance?.(),size=appearance?.size??2;
      const angle=(appearance?.rotation??0)*Math.PI/180;
      const hitUp=new THREE.Vector3().crossVectors(hitNormal,hitTangent).normalize();
      const side=hitTangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(hitUp,Math.sin(angle));
      const fit=fitSurface(THREE,{point:hit.point,normal:hitNormal,tangent:side,source:mesh,candidates,half:.125*size});
      if(!fit)return {error:'This object blocks note placement.'};
      const sourceId=sourceReverse.get(mesh),anchorSource=sourceId?mesh:support;
      return {anchor:{surface:sourceId||supportId,triangle:0,bary:[1,0,0],plane:makePlane(THREE,anchorSource,hit.point,hitNormal,hitTangent,fit.displacement,fit.clearance)}};
    }
    if(!reverse.has(mesh))return {error:'This surface cannot hold a note.'};
    let triangle=hit.faceIndex;
    if(mesh.userData.stickyPlaneGeometry){
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      if(!materials[hit.face.materialIndex]?.name.includes(mesh.userData.stickyPlaneMaterial))
        return {error:'Choose the green fish-scale backing.'};
      const flat=mesh.worldToLocal(hit.point.clone());
      let found=false;
      for(let i=0;i<2;i++){
        if(!triangleVertices(mesh,i))continue;
        const projected=new THREE.Vector3(flat.x,flat.y,a.z);
        const weights=THREE.Triangle.getBarycoord(projected,a,b,c,new THREE.Vector3());
        if(weights && weights.toArray().every(value=>value>=-.001&&value<=1.001)){
          triangle=i;found=true;break;
        }
      }
      if(!found)return {error:'Choose the green fish-scale backing.'};
    }
    if(!triangleVertices(mesh,triangle))return {error:'This surface cannot hold a note.'};
    const local=mesh.worldToLocal(hit.point.clone());
    if(mesh.userData.stickyPlaneGeometry)local.z=a.z;
    const bary=THREE.Triangle.getBarycoord(local,a,b,c,new THREE.Vector3());
    if(!bary||bary.toArray().some(value=>!Number.isFinite(value)||value<-.001||value>1.001))
      return {error:'Choose a visible cube surface.'};
    return {anchor:{surface:reverse.get(mesh),triangle,bary:bary.toArray().map(value=>clamp(value,0,1))}};
  }
  function makeEntry(note){
    const geometry=new THREE.PlaneGeometry(1,1);
    const texture=paint(note);
    const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.stickyId=note.id;mesh.renderOrder=4;
    scene.add(mesh);const entry={note,geometry,texture,material,mesh,visible:false};
    void loadNoteFont(note.font).then(loaded=>{if(!loaded||disposed||entries.get(note.id)!==entry)return;
      const replacement=paint(note);entry.material.map=replacement;entry.material.needsUpdate=true;entry.texture.dispose();entry.texture=replacement;});
    return entry;
  }
  function discard(entry){entry.mesh.removeFromParent();entry.geometry.dispose();entry.texture.dispose();entry.material.dispose();}
  function setNotes(notes){
    const ids=new Set(notes.map(note=>note.id));
    for(const [id,entry] of entries)if(!ids.has(id)){discard(entry);entries.delete(id);}
    for(const note of notes){
      const old=entries.get(note.id);
      if(old && JSON.stringify(old.note)===JSON.stringify(note))continue;
      if(old)discard(old);
      entries.set(note.id,makeEntry(note));
    }
    update();handlers?.visibilityChanged?.();
  }
  let nextScan=0;
  function update(){
    if(disposed)return;
    if(performance.now()>=nextScan){scanSurfaces();nextScan=performance.now()+1000;}
    cube.updateWorldMatrix(true,true);
    for(const entry of entries.values()){
      const {note,mesh}=entry,source=surfaceMap.get(note.anchor.surface);
      const plane=note.anchor.plane;
      const active=shown&&!suspended&&source&&(plane?branchVisible(source):visible(source)&&triangleVertices(source,note.anchor.triangle));
      entry.visible=!!active;mesh.visible=!!active;
      if(!active)continue;
      if(plane){if(plane.version===2)planeWorld(THREE,source,plane,point,normal,tangent);
        else{point.fromArray(plane.point).applyMatrix4(source.matrixWorld);
        normal.fromArray(plane.normal).transformDirection(source.matrixWorld).normalize();
        tangent.fromArray(plane.tangent).transformDirection(source.matrixWorld).normalize();}}
      else{point.copy(a).multiplyScalar(note.anchor.bary[0]).addScaledVector(b,note.anchor.bary[1]).addScaledVector(c,note.anchor.bary[2]).applyMatrix4(source.matrixWorld);
      normal.copy(b).sub(a).cross(c.clone().sub(a)).transformDirection(source.matrixWorld).normalize();
      if(source.userData.stickyPlaneTangent)
        tangent.fromArray(source.userData.stickyPlaneTangent).transformDirection(source.matrixWorld).normalize();
      else tangent.copy(b).sub(a).transformDirection(source.matrixWorld).normalize();}
      up.crossVectors(normal,tangent).normalize();
      tangent.crossVectors(up,normal).normalize();
      const angle=note.rotation*Math.PI/180, co=Math.cos(angle),si=Math.sin(angle);
      const side=tangent.clone().multiplyScalar(co).addScaledVector(up,si);
      const top=up.clone().multiplyScalar(co).addScaledVector(tangent,-si);
      mesh.position.copy(point).addScaledVector(normal,plane?.version===2?0:.009);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,top,normal));
      mesh.scale.setScalar(.25*note.size);
    }
  }
  function onPointerDown(event){
    if(event.target!==canvas||event.button!==0||suspended||!handlers)return;
    if(editing) document.activeElement?.blur?.();
    if(!rayFromEvent(event))return;
    const noteHit=ray.intersectObjects([...entries.values()].filter(entry=>entry.visible).map(entry=>entry.mesh),false)[0];
    if(noteHit)scanSurfaces();
    const closerSurface=noteHit && nearestPhysical();
    const selectedHit=noteHit && (!closerSurface || noteHit.distance < closerSurface.distance+.003) ? noteHit : null;
    if(placing||selectedHit){
      gesture={id:event.pointerId,x:event.clientX,y:event.clientY,action:placing?'place':'select',noteId:selectedHit?.object.userData.stickyId};
      event.preventDefault();event.stopImmediatePropagation();
    }
  }
  function onPointerUp(event){
    if(!gesture||gesture.id!==event.pointerId)return;
    const next=gesture;gesture=null;event.preventDefault();event.stopImmediatePropagation();
    if(event.button!==0||Math.hypot(event.clientX-next.x,event.clientY-next.y)>6)return;
    if(next.action==='select')handlers?.selectNote?.(next.noteId);
    else{const result=anchorAt(event);if(result.anchor)handlers?.onPlace?.(result.anchor);else invalidDrop(result.error);}
  }
  const owner=canvas.parentElement||canvas;
  owner.addEventListener('pointerdown',onPointerDown,true);
  window.addEventListener('pointerup',onPointerUp,true);
  const clear=()=>{gesture=null;};window.addEventListener('pointercancel',clear,true);window.addEventListener('blur',clear);
  let dragPreviewTime=-Infinity;
  const unregister=registerStickySceneAdapter('about',{
    setHandlers(value){handlers=value;},setNotes,
    setPlacing(value){placing=value;hint.hidden=!value;if(value){previousCursor??=canvas.style.cursor;canvas.style.cursor='crosshair';}else if(previousCursor!==null){canvas.style.cursor=previousCursor;previousCursor=null;}},
    setEditingFocused(value){editing=value;},setNotesShown(value){shown=value;update();},
    visibleCount(){return [...entries.values()].filter(entry=>entry.visible).length;},
    unresolvedCount(){return [...entries.values()].filter(({note})=>{const source=surfaceMap.get(note.anchor.surface);return !source||!note.anchor.plane&&!triangleVertices(source,note.anchor.triangle);}).length;},
    isVisible(id){return entries.get(id)?.visible||false;},
    getAnchorRect(id){const entry=entries.get(id);if(!entry?.visible)return null;const rect=canvas.getBoundingClientRect();const p=entry.mesh.position.clone().project(camera);return {left:rect.left+(p.x+1)*rect.width/2-20,top:rect.top+(1-p.y)*rect.height/2-20,width:40,height:40};},
    previewIconDrag(event){
      if(!event){dragHint.hidden=true;dragPreviewTime=-Infinity;return;}
      const rect=canvas.getBoundingClientRect(),inside=event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
      dragHint.hidden=!inside;if(!inside)dragPreviewTime=-Infinity;if(inside){dragHint.style.left=`${event.clientX-rect.left}px`;dragHint.style.top=`${event.clientY-rect.top}px`;const now=performance.now();if(now-dragPreviewTime>=100){dragPreviewTime=now;dragHint.classList.toggle('invalid',!anchorAt(event).anchor);}}
    },
    placeFromIcon(event){const result=anchorAt(event);if(result.anchor)openDraft(result.anchor);else invalidDrop(result.error);}
  });
  return {update,suspend(){suspended=true;gesture=null;dragPreviewTime=-Infinity;update();},resume(){suspended=false;update();},dispose(){
    if(disposed)return;disposed=true;unregister();handlers=null;gesture=null;closeDraft();
    owner.removeEventListener('pointerdown',onPointerDown,true);window.removeEventListener('pointerup',onPointerUp,true);
    window.removeEventListener('pointercancel',clear,true);window.removeEventListener('blur',clear);
    if(previousCursor!==null)canvas.style.cursor=previousCursor;
    clearTimeout(invalidTimer);hint.remove();invalidHint.remove();dragHint.remove();dialog.remove();for(const entry of entries.values())discard(entry);entries.clear();
  }};
}
