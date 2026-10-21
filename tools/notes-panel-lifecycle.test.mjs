import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../debug/panel-shell.js', import.meta.url), 'utf8');
const start = source.indexOf('  let sideInterlock = null;');
const end = source.indexOf('  for (const panel of [left, right]) {\n    panel.querySelector', start);
assert.ok(start >= 0 && end > start, 'shared panel lifecycle is present');

function panel() {
  const names = new Set(['is-closed']);
  const toggle = {setAttribute(name, value) { this[name] = value; }};
  const body = {inert:true};
  return {classList:{contains:name=>names.has(name),toggle(name,active){active?names.add(name):names.delete(name);}},
    querySelector:selector=>selector === '.review-panel-toggle' ? toggle : body, toggle, body};
}
function harness(width = 1200) {
  const left=panel(), right=panel(), timers=new Map(); let nextTimer=0;
  const sandbox={left,right,aboutPage:false,innerWidth:width,performanceStats:{refresh(){}},matchMedia:()=>({matches:false}),
    setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),console};
  const api=vm.runInNewContext(`${source.slice(start,end)}\n({close,registerSideInterlock,pending})`,sandbox);
  return {...api,left,right,timers,flush(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('an admin drawer opens only after its Notes side finishes tucking', async()=>{
  const h=harness();let finish,events=[];
  h.registerSideInterlock({beforeOpen:side=>{events.push(`tuck:${side}`);return new Promise(resolve=>finish=resolve);},onChange:(side,open)=>events.push(`${side}:${open}`)});
  events=[];h.close(h.right,false);await settle();
  assert.deepEqual(events,['tuck:right']);assert.equal(h.right.classList.contains('is-closed'),true);
  finish();await settle();assert.equal(h.right.classList.contains('is-closed'),false);assert.deepEqual(events,['tuck:right','right:true']);
  h.close(h.right,true);assert.equal(h.right.classList.contains('is-closed'),true);assert.deepEqual(events,['tuck:right','right:true']);
  h.flush();assert.equal(events.at(-1),'right:false');
});

test('a cancelled pending opening cannot reappear and the opposite side stays independent', async()=>{
  const h=harness(),finishes={},events=[];
  h.registerSideInterlock({beforeOpen:side=>new Promise(resolve=>{finishes[side]=resolve;events.push(`tuck:${side}`);}),onChange:(side,open)=>events.push(`${side}:${open}`)});
  events.length=0;h.close(h.left,false);h.close(h.right,false);await settle();
  assert.deepEqual(events,['tuck:left','tuck:right']);
  h.close(h.left,true);finishes.left();finishes.right();await settle();
  assert.equal(h.left.classList.contains('is-closed'),true);assert.equal(h.right.classList.contains('is-closed'),false);
  assert.ok(events.includes('left:false'));assert.ok(events.includes('right:true'));
});

test('on a narrow viewport the other admin drawer closes after the requested Notes exit', async()=>{
  const h=harness(390);let finish;const events=[];
  h.registerSideInterlock({beforeOpen:side=>side==='right'?new Promise(resolve=>finish=resolve):Promise.resolve(),onChange:(side,open)=>events.push(`${side}:${open}`)});
  events.length=0;h.close(h.left,false);await settle();assert.equal(h.left.classList.contains('is-closed'),false);
  h.close(h.right,false);await settle();assert.equal(h.left.classList.contains('is-closed'),false);
  finish();await settle();assert.equal(h.left.classList.contains('is-closed'),true);assert.equal(h.right.classList.contains('is-closed'),false);
});

test('reopening during the drawer close transition cancels the Notes return', async()=>{
  const h=harness(),events=[];
  h.registerSideInterlock({beforeOpen:()=>Promise.resolve(),onChange:(side,open)=>events.push(`${side}:${open}`)});
  events.length=0;h.close(h.right,false);await settle();h.close(h.right,true);
  assert.equal(h.timers.size,1);
  h.close(h.right,false);await settle();h.flush();
  assert.equal(h.right.classList.contains('is-closed'),false);
  assert.deepEqual(events,['right:true','right:true']);
});

test('unregistering Notes during its delayed exit leaves no stale Notes callback', async()=>{
  const h=harness(),events=[];let finish;
  const unregister=h.registerSideInterlock({beforeOpen:()=>new Promise(resolve=>finish=resolve),onChange:(side,open)=>events.push(`${side}:${open}`)});
  events.length=0;h.close(h.right,false);await settle();unregister();finish();await settle();
  assert.equal(h.right.classList.contains('is-closed'),false);
  assert.deepEqual(events,[]);
});
