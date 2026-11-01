import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PICKER_COLUMNS, createLatestAuditionQueue } from '../_5-music/instruments/picker-state.mjs';
const catalogSource = readFileSync(new URL('../_5-music/instruments/catalog.js', import.meta.url), 'utf8');
const { createInstrumentCatalog } = await import(`data:text/javascript,${encodeURIComponent(catalogSource)}`);

test('instrument browser lays out five options per row', () => {
  assert.equal(PICKER_COLUMNS, 5);
  assert.equal(Math.ceil(42 / (PICKER_COLUMNS * 4)), 3);
});

test('FX button order is Drums, Steel Drum, Telephone, Dog on both panels', () => {
  const catalog = createInstrumentCatalog({
    SOUND_FONT_BASE: '/soundfonts/musyngkite/',
    LOCAL_SOUNDFONT_BASES: { musyngkite: '/soundfonts/musyngkite/', fluidr3_gm: '/soundfonts/fluidr3_gm/' },
    SALAMANDER_DRUM_RANGE: { min: 35, max: 81 }
  });
  const expected = ['fx_drums', 'fx_steel_drum', 'fx_telephone', 'fx_dog'];
  for(const layout of [catalog.INSTRUMENT_LAYOUT, catalog.LEFT_INSTRUMENT_LAYOUT, catalog.RIGHT_INSTRUMENT_LAYOUT]){
    assert.deepEqual(layout.filter(item => item.id.startsWith('fx_')).map(item => item.id), expected);
  }
  assert.equal(catalog.INSTRUMENT_CONFIG_BY_ID.get('fx_steel_drum').patch, 'steel_drums');
  assert.equal(catalog.INSTRUMENT_CONFIG_BY_ID.has('fx_odd'), false);
});

test('rapid auditions commit only the latest choice and keep sides independent', async () => {
  const queue = createLatestAuditionQueue();
  const committed = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const first = queue.run('picker', async () => { await firstGate; return 'piano'; }, value => committed.push(value));
  await Promise.resolve();
  const skipped = queue.run('picker', async () => 'organ', value => committed.push(value));
  const latest = queue.run('picker', async () => 'violin', value => committed.push(value));
  const otherSide = queue.run('fx:right', async () => 'dog', value => committed.push(value));
  releaseFirst();
  assert.deepEqual(await Promise.all([first, skipped, latest, otherSide]), [null, null, 'violin', 'dog']);
  assert.deepEqual(committed, ['violin', 'dog']);
});

test('closing a picker invalidates an in-flight audition without blocking later work', async () => {
  const queue = createLatestAuditionQueue();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let applied = false;
  const pending = queue.run('picker', async () => { await gate; return 'old'; }, () => { applied = true; });
  await Promise.resolve();
  queue.cancel('picker');
  release();
  assert.equal(await pending, null);
  assert.equal(applied, false);
  assert.equal(await queue.run('picker', async () => 'new', () => { applied = true; }), 'new');
  assert.equal(applied, true);
});
