import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../debug/performance-budget.js', import.meta.url), 'utf8');
const {frameBudget} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('frame budget treats refresh cadence as a reference, accepts faster displays and identifies sustained slow intervals', () => {
  const fast = frameBudget(Array(120).fill(1000 / 120));
  assert.equal(fast.slow, 0);
  assert.ok(fast.average < fast.targetMs);
  const slow = frameBudget([...Array(90).fill(1000 / 60), ...Array(10).fill(40)]);
  assert.equal(slow.count, 100);
  assert.equal(slow.slow, 10);
  assert.equal(slow.p95, 40);
  assert.ok(slow.average > slow.targetMs);
});

test('frame budget excludes invalid samples and does not manufacture a calibrated capacity', () => {
  assert.equal(frameBudget([]), null);
  assert.equal(frameBudget([0, -1, Infinity, NaN]), null);
  assert.equal(frameBudget([16], 0), null);
  const samples = [10, NaN, 20, 30];
  assert.equal(frameBudget(samples, 30).count, 3);
  assert.equal(frameBudget(samples, 30).slow, 0);
  assert.ok(Number.isNaN(samples[1]));
});
