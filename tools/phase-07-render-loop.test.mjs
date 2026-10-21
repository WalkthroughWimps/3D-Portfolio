import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../_7-shared-scripts/scene/demand-render-loop.js', import.meta.url), 'utf8');
const { createDemandRenderLoop } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture(draw) {
  const target = new EventTarget();
  target.hidden = false;
  const frames = new Map();
  let id = 0;
  const loop = createDemandRenderLoop({ target, draw,
    requestFrame: callback => { frames.set(++id, callback); return id; },
    cancelFrame: frame => frames.delete(frame) });
  return { target, loop, frames, tick() {
    const [key, callback] = frames.entries().next().value;
    frames.delete(key); callback(100);
  } };
}
test('static rendering coalesces input and drains damping requests made during drawing', () => {
  let draws = 0;
  const f = fixture(() => { if (++draws < 3) f.loop.invalidate(); });
  f.loop.invalidate(); f.loop.invalidate();
  assert.equal(f.frames.size, 1);
  f.tick(); f.tick(); f.tick();
  assert.equal(draws, 3);
  assert.equal(f.frames.size, 0);
});
test('hidden scenes cancel pending GPU work and redraw once when visible', () => {
  let draws = 0;
  const f = fixture(() => draws++);
  f.loop.invalidate();
  f.target.hidden = true; f.target.dispatchEvent(new Event('visibilitychange'));
  f.loop.invalidate(); assert.equal(f.frames.size, 0);
  f.target.hidden = false; f.target.dispatchEvent(new Event('visibilitychange'));
  f.tick(); assert.equal(draws, 1); assert.equal(f.frames.size, 0);
});
test('disposing a demand renderer rejects queued callbacks and removes resume work', () => {
  let draws = 0;
  const f = fixture(() => draws++);
  f.loop.invalidate();
  const stale = [...f.frames.values()][0];
  f.loop.dispose(); f.loop.dispose(); stale(100);
  f.target.dispatchEvent(new Event('visibilitychange')); f.loop.invalidate();
  assert.equal(draws, 0); assert.equal(f.frames.size, 0);
});
