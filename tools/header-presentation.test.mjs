import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../_7-shared-scripts/core/header.js', import.meta.url), 'utf8');
const { createVideoPresentationController } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('expanded video owners keep the header inert until the last owner exits', () => {
  const root = { body: { dataset: {} }, activeElement: null };
  const header = { inert: false };
  const dock = { inert: true };
  const drawer = { inert: false };
  const nodes = [header, dock, drawer];
  const controller = createVideoPresentationController(root, () => nodes);
  const send = (source, active) => controller.onEvent({ detail: { source, active } });

  send('videos', true);
  send('music', true);
  assert.equal(root.body.dataset.videoPresentation, 'active');
  assert.deepEqual(nodes.map(node => node.inert), [true, true, true]);

  send('videos', false);
  assert.equal(root.body.dataset.videoPresentation, 'active');
  assert.equal(header.inert, true);

  const lateUtility = { inert: false };
  nodes.push(lateUtility);
  controller.refresh();
  assert.equal(lateUtility.inert, true);

  send('music', false);
  assert.equal(root.body.dataset.videoPresentation, undefined);
  assert.deepEqual(nodes.map(node => node.inert), [false, true, false, false]);

  send('games', true);
  controller.clear();
  assert.equal(root.body.dataset.videoPresentation, undefined);
  assert.deepEqual(nodes.map(node => node.inert), [false, true, false, false]);
});
