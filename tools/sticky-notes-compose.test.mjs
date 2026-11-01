import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const base=new URL('../',import.meta.url);
const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('_3-graphics/shelf/vendor/three.module.js',base)).toString('base64'));
const context=vm.createContext({console,window:new EventTarget()});
function stub(exports){return new vm.SyntheticModule(Object.keys(exports),function(){for(const [name,value] of Object.entries(exports))this.setExport(name,value);},{context});}
const shared=new vm.SourceTextModule(fs.readFileSync(new URL('_7-shared-scripts/sticky-notes/index.js',base),'utf8')+'\nexport {composePageAnchors};',{context});
await shared.link(name=>name.endsWith('data.js')?stub(Object.fromEntries(['validateBundle','mergeBundles','readLocal','writeLocal','newNote','inkFor','blankNoteAppearance'].map(name=>[name,()=>{}]))):name.endsWith('SettingsArchive.mjs')?stub({getSettingsArchive:()=>{}}):name.endsWith('panel-shell.js')?stub({initPanelShell:()=>{}}):stub({createDOMStickyAdapter:()=>{}}));
await shared.evaluate();
const {composePageAnchors}=shared.namespace;

test('page/scene composition preserves the read-history Set while filtering page anchors',()=>{
 const calls=[],notes=[{id:'page',anchor:{surface:'context:graphics:dom'}},{id:'book',anchor:{surface:'book:1:0'}}],dismissed=new Set(['book']);
 const composite=composePageAnchors({setNotes:(notes,history)=>calls.push({notes,history})},{setNotes:(notes,history)=>calls.push({notes,history})},'graphics');
 composite.setNotes(notes,dismissed);
 assert.equal(calls[0].notes,notes);assert.equal(calls[0].history,dismissed);
 assert.deepEqual(Array.from(calls[1].notes,n=>n.id),['book']);assert.equal(calls[1].history,dismissed);
 composite.setNotes(notes);assert.equal(calls.at(-1).history.size,0);
});

test('blank page notes have no visible placeholder words but remain accessible',async()=>{
 class Element extends EventTarget{constructor(){super();this.children=[];this.dataset={};this.attributes=new Map();this.style={setProperty(){}};}append(node){this.children.push(node);}remove(){}setAttribute(key,value){this.attributes.set(key,value);}}
 const doc={body:new Element(),createElement:()=>new Element()};
 const module=new vm.SourceTextModule(fs.readFileSync(new URL('_7-shared-scripts/sticky-notes/scene-adapter.js',base),'utf8'),{context});
 await module.link(name=>name==='three'?stub(THREE):name.endsWith('index.js')?stub({registerStickySceneAdapter:()=>()=>{}}):stub({inkFor:()=> '#111111'}));await module.evaluate();
 const adapter=module.namespace.createDOMStickyAdapter({pageId:'graphics',root:doc,register:false,visualOnly:true});
 try{const note={id:'blank-note',text:'',color:'#ffee77',size:1,rotation:0,anchor:{surface:'context:graphics:dom',triangle:0,bary:[1,0,0]}};adapter.setNotes([note]);const button=doc.body.children[0].children.find(node=>node.className==='sticky-note-page');assert.equal(button.textContent,'');assert.equal(button.attributes.get('aria-label'),'Empty sticky note');adapter.setNotes([{...note,text:'User words'}]);assert.equal(button.textContent,'User words');assert.equal(button.attributes.get('aria-label'),'User words');}finally{adapter.dispose();}
});

test('Graphics can register populated notes without history, then honor read/unread changes',async()=>{
 class Element extends EventTarget{constructor(){super();this.style={};this.classList={toggle(){}};}append(){}remove(){}getContext(){return {fillRect(){},strokeRect(){},fillText(){},measureText:text=>({width:text.length*20})};}}
 context.document={createElement:()=>new Element()};
 let adapter;
 const module=new vm.SourceTextModule(fs.readFileSync(new URL('_3-graphics/shelf/sticky-notes-adapter.mjs',base),'utf8'),{context});
 await module.link(name=>name==='three'?stub(THREE):name.endsWith('index.js')?stub({registerStickySceneAdapter:(_page,value)=>{adapter=value;return ()=>{};}}):stub({inkFor:()=> '#111111'}));
 await module.evaluate();
 const scene=new THREE.Scene(),group=new THREE.Group(),surface=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial());group.add(surface);scene.add(group);const camera=new THREE.PerspectiveCamera(35,1,.01,100);camera.position.z=3;camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 const canvas=new Element();canvas.parentElement=new Element();
 const root=()=>({root:new THREE.Group()}),runtime=module.namespace.createGraphicsStickyAdapter({scene,renderer:{domElement:canvas},camera,roomCamera3D:camera,books:[{group}],games:root(),shelf:root(),environment:root(),shelfContext:root(),invalidate(){}});
 const note={id:'saved-book-note',text:'Existing note',color:'#ffee77',size:1,rotation:0,anchor:{surface:'book:1:0',triangle:0,bary:[1,0,0],plane:{point:[0,0,0],normal:[0,0,1],tangent:[1,0,0]}}};
 try{
  adapter.setNotes([note]);runtime.update({state:'book'});
  const mesh=scene.children.find(o=>o.userData.stickyId===note.id);assert.ok(mesh);assert.equal(mesh.visible,true);
  const composite=composePageAnchors(adapter,{setNotes(){}},'graphics');composite.setNotes([note],new Set([note.id]));runtime.update({state:'book'});assert.equal(mesh.visible,false);assert.equal(mesh.material.opacity,.32);
  composite.setNotes([note],new Set());runtime.update({state:'book'});assert.equal(mesh.visible,true);assert.equal(mesh.material.opacity,1);
 }finally{runtime.dispose();surface.geometry.dispose();surface.material.dispose();}
});
