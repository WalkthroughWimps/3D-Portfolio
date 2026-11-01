import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function load(file, name, extra={}) {
  const ctx={...extra};
  vm.runInNewContext(readFileSync(new URL(`../_4-games/${file}`,import.meta.url),'utf8').replaceAll('export function','function')+`\nglobalThis.result=${name};`,ctx);
  return ctx.result;
}
function gestures() {
  let now=1000;
  class Event {
    constructor(type,init={}){Object.assign(this,{type,button:2,buttons:2,pointerId:1,pointerType:'mouse',clientX:10,clientY:20},init);}
    preventDefault(){this.prevented=true;}
    stopImmediatePropagation(){this.stopped=true;}
  }
  class Target {
    listeners=new Map();
    addEventListener(t,f){this.listeners.set(t,[...(this.listeners.get(t)||[]),f]);}
    removeEventListener(t,f){this.listeners.set(t,(this.listeners.get(t)||[]).filter(fn=>fn!==f));}
    dispatchEvent(e){for(const f of [...(this.listeners.get(e.type)||[])]){f(e);if(e.stopped)break;}}
    setPointerCapture(){} releasePointerCapture(){}
  }
  const win=new Target();win.PointerEvent=Event;
  const el=new Target();el.ownerDocument={defaultView:win};
  const calls=[], orbit=[];
  const install=load('game-mouse-gestures.js','installGameMouseGestures',{performance:{now:()=>now}});
  const input=install({element:el,hitGame:()=>({x:50,y:60}),clickGame:(_p,b)=>calls.push(`click ${b}`),
    downGame:(_p,b)=>calls.push(`down ${b}`),upGame:(_p,b)=>calls.push(`up ${b}`)});
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])el.addEventListener(type,()=>orbit.push(type));
  const emit=(type,init)=>{const ev=new Event(type,init);el.dispatchEvent(ev);return ev;};
  return{emit,input,calls,orbit,win,advance:n=>{now+=n;}};
}
test('short RMB clicks reach the game exactly once and never enter camera/reset handlers',()=>{
  const h=gestures();for(let i=0;i<2;i++){h.emit('pointerdown');h.advance(30);h.emit('pointerup',{buttons:0});h.advance(30);}
  assert.deepEqual(h.calls,['click 2','click 2']);assert.deepEqual(h.orbit,[]);h.input.dispose();
});
test('RMB drag crosses the slop threshold before giving the complete gesture to OrbitControls',()=>{
  const h=gestures();h.emit('pointerdown');h.emit('pointermove',{clientX:13});assert.deepEqual(h.orbit,[]);
  h.emit('pointermove',{clientX:20});assert.equal(h.input.isCameraGesture(),true);
  h.emit('pointerup',{clientX:20,buttons:0});assert.deepEqual(h.calls,[]);
  assert.deepEqual(h.orbit,['pointerdown','pointermove','pointerup']);h.input.dispose();
});
test('MMB click and MMB-plus-wheel retain game editing, without panning',()=>{
  const h=gestures();h.emit('pointerdown',{button:1,buttons:4});h.emit('pointerup',{button:1,buttons:0});
  assert.deepEqual(h.calls,['click 1']);h.calls.length=0;
  h.emit('pointerdown',{button:1,buttons:4});h.emit('wheel');h.emit('wheel');h.advance(1000);
  h.emit('pointerup',{button:1,buttons:0});assert.deepEqual(h.calls,['down 1','up 1']);assert.deepEqual(h.orbit,[]);h.input.dispose();
});
test('long press, cancel and blur cannot turn into clicks or leave game buttons held',()=>{
  const h=gestures();h.emit('pointerdown');h.advance(800);h.emit('pointerup',{buttons:0});assert.deepEqual(h.calls,[]);
  h.emit('pointerdown');h.emit('pointercancel');assert.deepEqual(h.calls,[]);
  h.emit('pointerdown',{button:1,buttons:4});h.emit('wheel');h.win.dispatchEvent({type:'blur'});
  assert.deepEqual(h.calls,['down 1','up 1']);h.input.dispose();
});

const ui={gameRect:{x:0,y:88,w:2048,h:1152},top:{x:0,y:0,w:2048,h:88},bottom:{x:0,y:1240,w:2048,h:88},backRect:{x:20,y:12,w:60,h:60}};
function zoom(){const z=load('game-instruction-zoom.js','createGameInstructionZoom')();
  // Closed panels draw only their icons. No renderer is needed to test input.
  const noop=()=>{};const ctx=new Proxy({},{get:()=>noop,set:()=>true});
  z.draw(ctx,ui,{fg:'#fff',bg:'#000'});return z;}
const center=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
test('instruction hover previews, clicks pin, and X closes without immediately reopening',()=>{
  for(const id of ['top','bottom']){const z=zoom(),r=z.getLayout()[id];z.move(center(r.icon));assert.equal(z.isOpen(id),true);
    z.press(center(r.icon));z.move(null);assert.equal(z.isOpen(id),true);
    z.press(center(r.close));assert.equal(z.isOpen(id),false);z.move(null);z.move(center(r.icon));assert.equal(z.isOpen(id),true);z.reset();assert.equal(z.hit(center(r.icon)),null);}
});
test('top mask keeps the curved gear and back arrow available; border growth avoids tiles',()=>{
  const z=zoom(),l=z.getLayout();z.move(center(l.top.icon));
  assert.equal(z.hit({x:l.gear.x,y:l.gear.y-l.gear.r*.8}),null);
  assert.equal(z.hit(center(l.back)),null);
  assert.ok(l.top.box.y<ui.gameRect.y && l.top.box.y+l.top.box.h<=ui.gameRect.y+ui.gameRect.h*.05+.01);
  assert.ok(ui.gameRect.y-l.top.box.y>l.bottom.box.y+l.bottom.box.h-(ui.gameRect.y+ui.gameRect.h));
  assert.ok(l.bottom.box.x<ui.gameRect.w*.72);
  z.move(center(l.bottom.icon));
  assert.equal(z.hit({x:l.board.x+l.board.w-2,y:l.bottom.box.y+20}),null);
});
test('all headings use the shared labels rather than internal slugs',()=>{
  const games=readFileSync(new URL('../_4-games/games.js',import.meta.url),'utf8');
  const title=games.slice(games.indexOf('function getCurrentGameTitle()'),games.indexOf('function computeGameUiLayout('));
  const ctx={currentGameId:'pick-a-square',GAME_LIST:[{id:'pick-a-square',label:'Pick a Square!'}]};
  vm.runInNewContext(title+'\nglobalThis.value=getCurrentGameTitle();',ctx);assert.equal(ctx.value,'Pick a Square!');
});

test('menu labels, standalone browser titles and exported project titles agree',()=>{
  const names={};vm.runInNewContext(readFileSync(new URL('../_4-games/game-names.js',import.meta.url),'utf8')
    .replace('export const GAME_NAMES','globalThis.names'),names);
  const ctx={GAME_NAMES:names.names,assetUrl:x=>x};
  const catalog=readFileSync(new URL('../_4-games/games-layout.js',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export const','const').replaceAll('export function','function');
  vm.runInNewContext(catalog+'\nglobalThis.list=GAME_LIST;',ctx);
  for(const entry of ctx.list){assert.equal(entry.label,names.names[entry.id]);assert.ok(!entry.label.includes('-'));assert.ok(entry.label.endsWith('!'));
    const html=readFileSync(new URL(`../games/${entry.id}/index.html`,import.meta.url),'utf8');
    assert.ok(html.includes(`<title>${entry.label}</title>`));assert.ok(html.includes('_4-games/game-title.js'));
    const data=JSON.parse(readFileSync(new URL(`../games/${entry.id}/data.json`,import.meta.url),'utf8'));
    assert.equal(data.project[0],entry.label);}
});
