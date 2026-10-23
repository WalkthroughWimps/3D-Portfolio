import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installHeldMouseChord} from './held-mouse-chord.mjs';
import {Tabletop} from './tabletop-model.mjs';
import {FreeformSession} from './freeform-session.mjs';
import {navigationActions} from './groovy-navigation.mjs';
import {characterSettings} from './token-settings.mjs';
const base=new URL('./',import.meta.url),data=JSON.parse(fs.readFileSync(new URL('global-conquest-pieces.json',base))),map=JSON.parse(fs.readFileSync(new URL('global-conquest-map.json',base)));
const THREE=await import('data:text/javascript;base64,'+fs.readFileSync(new URL('vendor/three.module.js',base)).toString('base64'));
const context=vm.createContext({console,performance,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}}),modules=new Map();
const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const [key,value] of Object.entries(THREE))this.setExport(key,value);},{context});
async function get(url){if(modules.has(url.href))return modules.get(url.href);const m=new vm.SourceTextModule(fs.readFileSync(url,'utf8'),{context,identifier:url.href});modules.set(url.href,m);return m;}
async function load(file){const m=await get(new URL(file,base));await m.link((name,from)=>name==='three'?three:get(new URL(name,from.identifier)));await m.evaluate();return m.namespace;}
const dice=await load('dice.mjs'),view=await load('item-view-controls.mjs');
test('both game tables have six slotted stands; only Manor has two D8 and no transport sticks',()=>{
 const gc=new Tabletop(data),manor=new Tabletop({...data,mode:'manor'});
 assert.equal(gc.bodies.filter(b=>b.kind==='stand').length,6);assert.equal(gc.bodies.filter(b=>b.kind==='dice').length,0);
 assert.equal(manor.bodies.filter(b=>b.kind==='stand').length,6);assert.equal(manor.bodies.filter(b=>b.kind==='dice').length,2);assert.equal(manor.bodies.filter(b=>b.kind==='stick').length,0);
});
test('D8 labels and rest orientations agree for all eight outcomes and arbitrary yaw',()=>{
 for(const face of dice.D8_FACES)for(const yaw of [0,.37,2,5.7]){const q=dice.d8RestQuaternion(face.value,yaw),n=new THREE.Vector3(...face.normal).applyQuaternion(q);assert.ok(n.distanceTo(new THREE.Vector3(0,1,0))<1e-12);}
 assert.deepEqual(Array.from({length:8},(_,i)=>dice.rollD8(()=>(i+.5)/8)),[1,2,3,4,5,6,7,8]);
});
test('player count changes only hand ownership, conserving all cards and piece positions',()=>{
 const table=new Tabletop(data),game=new FreeformSession(table,map,{players:3}),original=game.allCards().slice().sort();
 game.active=2;game.player.hand.push(...game.vehicleDeck.cards.splice(0,9));const poses=table.bodies.map(b=>[b.id,[...b.p]]);game.setPlayerCount(1);
 assert.equal(game.players.length,1);assert.deepEqual(game.allCards().slice().sort(),original);for(const [id,p] of poses)assert.deepEqual(table.get(id).p,p);
 game.setPlayerCount(6);assert.equal(game.players.length,6);assert.deepEqual(game.allCards().slice().sort(),original);assert.deepEqual(game.allowed(),[]);assert.equal(game.phase,'freeform');
});
test('reducing player count returns a hand even when its entire physical deck was drawn',()=>{
 const table=new Tabletop({...data,mode:'manor',decks:[{id:'characters',label:'Characters',cards:['001','002','003']}]});const game=new FreeformSession(table,map,{players:2});const packet=table.bodies.find(b=>b.kind==='cards');game.active=1;game.returnToHand(packet.id);assert.equal(table.bodies.filter(b=>b.kind==='cards').length,0);game.setPlayerCount(1);assert.equal(game.allCards().length,3);assert.equal(new Set(game.allCards()).size,3);
});
test('cuts, deck insertion, flips and hand transfers preserve card identity and order',()=>{
 const table=new Tabletop(data,{random:()=>.25}),game=new FreeformSession(table,map),deck=game.vehicleDeck,original=[...deck.cards];const cut=table.cut(deck.id),n=Math.floor(original.length/2);
 assert.deepEqual(cut.cards,original.slice(0,n));assert.deepEqual(deck.cards,original.slice(n));
 const card=table.packet(cut,cut.cards.splice(0,1),[0,.004,0]);const id=card.cards[0];table.insert(card.id,deck.id,{random:false,side:'bottom'});assert.equal(deck.cards.at(-1),id);
 const before=[...deck.cards];table.flip(deck.id);assert.deepEqual(deck.cards,[...before].reverse());
 const loose=table.packet(deck,deck.cards.splice(0,1),[0,.004,0]);const identity=loose.cards[0];game.returnToHand(loose.id);assert.ok(game.player.hand.includes(identity));const physical=game.physicalFromHand(identity,[1,.004,1]);assert.deepEqual(physical.cards,[identity]);assert.equal(new Set(game.allCards()).size,game.allCards().length);
});
test('friction allows a strong throw to travel while stopping gentle slides; unsafe pieces reset',()=>{
 const t=new Tabletop(data);t.bodies=t.bodies.filter(b=>b.kind==='meeple').slice(0,1);const b=t.bodies[0];b.p=[0,.004,0];t.checkpoint(b);t.release(b.id,[8,0,0]);for(let i=0;i<90;i++)t.step(1/120);assert.ok(b.p[0]>.8);for(let i=0;i<600;i++)t.step(1/120);assert.ok(Math.hypot(...b.v)<.02);b.p=[100,0,0];t.step(1/60);assert.deepEqual(b.p,b.home);b.tilt=[.7,1];t.grab(b.id);assert.deepEqual(b.tilt,[0,0]);
});
test('navigation is contextual, with adjacent book actions separate from the right column',()=>{
 const state={state:'book',selected:'book-3',layout:'spread',page:-1,busy:false},actions=navigationActions(state);
 assert.deepEqual(actions.filter(a=>a.side).map(a=>[a.id,a.grade,a.side]),[['previous-book',2,'left']]);assert.ok(actions.some(a=>a.id==='spread'&&a.label==='Back to spread'));assert.ok(actions.some(a=>a.id==='layout'&&a.label==='Grid'));
 assert.equal(navigationActions({...state,busy:true}).length,0);assert.equal(navigationActions({...state,state:'shelf'}).length,0);assert.ok(!navigationActions({...state,selected:'book-1'}).some(a=>a.id==='previous-book'));assert.ok(!navigationActions({...state,selected:'book-6'}).some(a=>a.id==='next-book'));
 for(const page of [-1,0,9,10])assert.equal(navigationActions({...state,layout:'grid',page}).filter(a=>a.grade).length,0);
 assert.equal(navigationActions({...state,page:2}).filter(a=>a.grade).length,0);assert.equal(navigationActions({...state,page:-.5}).filter(a=>a.grade).length,0);assert.equal(navigationActions({...state,turning:true}).filter(a=>a.grade).length,0);assert.deepEqual(navigationActions({...state,page:10}).filter(a=>a.grade).map(a=>[a.id,a.grade,a.side]),[['next-book',4,'right']]);
 for(const selected of ['game-0','game-1'])assert.ok(navigationActions({...state,state:'game-open',selected}).some(a=>a.id==='play-game'));
});
test('character overrides preserve transparent artwork and independent silhouette settings',()=>{
 const settings={artwork:null,outline:true,stroke:'#fff2db',strokeWidth:4,characters:{2:{artwork:'data:image/png;base64,transparent',strokeWidth:9}}};
 assert.equal(characterSettings(settings,1).artwork,null);assert.equal(characterSettings(settings,2).strokeWidth,9);assert.equal(characterSettings(settings,2).stroke,'#fff2db');assert.equal(characterSettings(settings,3).strokeWidth,4);
});
test('put-away clears shared focus, pan, camera up and projection; fresh poses become reset defaults',()=>{
 const dom=new EventTarget(),camera=new THREE.PerspectiveCamera(),controls={object:camera,target:new THREE.Vector3(),enabled:true,enablePan:false,update(){}};camera.position.set(0,0,10);
 const ui=view.installItemViewControls({controls,camera,domElement:dom});ui.captureDefaultPose();camera.up.set(1,0,0);controls.enablePan=true;camera.setViewOffset(100,100,12,10,100,100);ui.clear();assert.deepEqual(camera.up.toArray(),[0,1,0]);assert.equal(controls.enablePan,false);assert.equal(camera.view.enabled,false);ui.captureDefaultPose();assert.equal(ui.isPanned(),false);ui.dispose();
 const source=fs.readFileSync(new URL('graphics-preview.mjs',base),'utf8');assert.match(source,/async function putAway\(\)\{\s*mouseControls\?\.clear/);assert.match(source,/roomCamera\(true\);mouseControls\?\.captureDefaultPose/);assert.match(source,/removeAttribute\('src'\)/);
});
test('runtime no longer imports programmed game rules or assets from the ignored lab',()=>{
 for(const file of ['graphics-preview.mjs','tabletop.mjs','freeform-session.mjs']){const source=fs.readFileSync(new URL(file,base),'utf8');assert.ok(!source.includes('global-conquest-game.mjs'));assert.ok(!source.includes('output/coursebook-lab'));assert.ok(!/game\.(chooseStart|canPlay|move|sweep|steal)\(/.test(source));}
 const keys=JSON.parse(fs.readFileSync(new URL('groovy-keyframes.json',base)));assert.equal(keys.fps,30);assert.equal(keys.enter.length,12);assert.equal(keys.exit.length,21);
});

test('all six grade controls are rendered from source pendants and skipping covers the full action chain',()=>{
 for(let grade=1;grade<=6;grade++){const png=fs.readFileSync(new URL(`assets/navigation/grade-${grade}.png`,base));assert.equal(png.subarray(1,4).toString(),'PNG');}
 const source=fs.readFileSync(new URL('graphics-preview.mjs',base),'utf8');assert.match(source,/skipRequested=busy/);assert.match(source,/reduced.matches\|\|skipRequested\?1:duration/);assert.match(source,/t\.update\(1\);t\.resolve\(\)/);assert.match(source,/event.key.toLowerCase\(\)!=='s'/);
});

test('RMB works while LMB already holds a die, including releasing LMB first',()=>{
 const element=new EventTarget();let gesture={id:'die',pointer:1},rolls=0,releases=0,rightUps=0;
 const chord=installHeldMouseChord({element,getGesture:()=>gesture,onRightDown:()=>rolls++,onRightUp:()=>rightUps++,onLeftUp:()=>{releases++;gesture=null;}});
 const send=(type,button)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'button',{value:button});element.dispatchEvent(e);};
 // An additional mouse button does not fire a second pointerdown in browsers.
 send('mousedown',2);assert.equal(rolls,1);send('mouseup',0);assert.equal(releases,1);assert.equal(gesture,null);send('mouseup',2);assert.equal(rightUps,1);
 gesture={id:'card',pointer:1};send('mousedown',2);send('mouseup',2);assert.equal(rolls,2);assert.equal(rightUps,2);assert.ok(gesture);send('mouseup',0);assert.equal(releases,2);
 chord.dispose();gesture={id:'other'};send('mousedown',2);assert.equal(rolls,2);
});
