import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cache = new Map();
async function browserModule(path) {
  if (cache.has(path)) return cache.get(path);
  let source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  for (const match of [...source.matchAll(/from ['"](\.[^'"]+)['"]/g)]) {
    const parent = path.split('/').slice(0, -1).join('/');
    const child = new URL(match[1], `https://test.invalid/${parent}/`).pathname.slice(1);
    source = source.replace(match[0], `from '${await browserModule(child)}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  cache.set(path, url);
  return url;
}
async function load(path) { return import(await browserModule(path)); }
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0, failWrites = false;
  return { values,
    get writes() { return writes; },
    set failWrites(value) { failWrites = value; },
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes++; if (failWrites) throw new Error('quota'); values.set(key, String(value)); },
    removeItem(key) { writes++; if (failWrites) throw new Error('quota'); values.delete(key); }
  };
}

test('settings migrate raw legacy values and preserve canonical zero and false', async () => {
  const { createPreferences } = await load('_7-shared-scripts/core/preferences.js');
  const { createSettingsStore } = await load('_7-shared-scripts/core/settings.js');
  const raw = storage({
    'site.audio.volume': '0', 'site.audio.sync': '0', 'site.audio.muted': 'false',
    'globalAudioMidiOffsetMs': '-120',
    'site.a11y.settings': JSON.stringify({ masterVolume: 0.8, audioSyncMs: 200, mute: true, custom: 'retain' })
  });
  const events = new EventTarget();
  const store = createSettingsStore({ preferences: createPreferences(() => raw), target: events, matchMedia: () => ({ matches: false }) });
  assert.equal(store.get().audio.volume, 0);
  assert.equal(store.get().audio.syncMs, 0);
  assert.equal(store.get().audio.muted, false);
  assert.equal(Object.isFrozen(store.get().audio), true);
  const seen = [];
  store.subscribe((snapshot, change) => seen.push(change), { immediate: false });
  assert.equal(store.patch({ audio: { volume: 0.6, syncMs: -273 } }).ok, true);
  assert.equal(store.get().audio.syncMs, -275);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].changed, ['audio.volume', 'audio.syncMs']);
  assert.equal(JSON.parse(raw.getItem('site.a11y.settings')).custom, 'retain');
  const before = raw.writes;
  raw.setItem('site.audio.volume', '0.75');
  const event = new Event('storage'); Object.defineProperty(event, 'key', { value: 'site.audio.volume' });
  events.dispatchEvent(event);
  assert.equal(store.get().audio.volume, 0.75);
  assert.equal(raw.writes, before + 1, 'other-tab refresh must not write back');
  assert.equal(seen.at(-1).source, 'other-tab');
  assert.equal(store.patch({ audio: { volume: NaN, muted: true } }).ok, false);
  assert.equal(store.get().audio.muted, false);
  store.reset(['audio.volume', 'audio.syncMs']);
  assert.equal(store.get().audio.volume, 0.25);
  assert.equal(store.get().audio.syncMs, -270);
  assert.equal(raw.getItem('globalAudioMidiOffsetMs'), null);
  store.dispose();
});

test('settings keep failed writes in session and retry explicitly', async () => {
  const { createPreferences } = await load('_7-shared-scripts/core/preferences.js');
  const { createSettingsStore } = await load('_7-shared-scripts/core/settings.js');
  const raw = storage();
  const store = createSettingsStore({ preferences: createPreferences(() => raw), target: new EventTarget(), matchMedia: () => ({ matches: false }) });
  raw.failWrites = true;
  store.patch({ audio: { volume: 0 } });
  assert.equal(store.get().audio.volume, 0);
  assert.equal(store.get().persistence, 'session');
  raw.failWrites = false;
  store.retry();
  assert.equal(raw.getItem('site.audio.volume'), '0');
  assert.equal(store.get().persistence, 'persistent');
  store.dispose();
});

test('explicit reduced-motion choice remains saved when it matches the OS', async () => {
  const { createPreferences } = await load('_7-shared-scripts/core/preferences.js');
  const { createSettingsStore } = await load('_7-shared-scripts/core/settings.js');
  const raw = storage();
  const media = new EventTarget();
  media.matches = false;
  const store = createSettingsStore({ preferences: createPreferences(() => raw), target: new EventTarget(), matchMedia: () => media });
  assert.equal(store.patch({ accessibility: { reducedMotion: false } }).ok, true);
  assert.equal(JSON.parse(raw.getItem('site.a11y.settings')).reducedMotion, false);
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  assert.equal(store.get().accessibility.reducedMotion, false);
  store.reset(['accessibility.reducedMotion']);
  assert.equal(store.get().accessibility.reducedMotion, true);
  store.dispose();
});

test('consent denial survives blocked writes and focus until persisted values change', async () => {
  const { createConsent } = await load('_7-shared-scripts/core/consent.js');
  let cookie = 'site_audio_allowed=true';
  const doc = { get cookie() { return cookie; }, set cookie(_value) { throw new Error('blocked'); } };
  const raw = storage({ 'site.audio.allowed': 'true' });
  raw.failWrites = true;
  const target = new EventTarget();
  const consent = createConsent({ doc, target, storage: raw });
  const denied = consent.setAllowed(false);
  assert.equal(denied.allowed, false);
  assert.equal(denied.persistence, 'session');
  target.dispatchEvent(new Event('focus'));
  assert.equal(consent.get().allowed, false);
  cookie = 'site_audio_allowed=false';
  target.dispatchEvent(new Event('focus'));
  assert.equal(consent.get().allowed, false);
  consent.dispose();
});

test('asset resolution honors page/site paths, GLB mapping, soundfonts, spaces, queries and overrides', async () => {
  const { resolveAsset, createAssets, resolveAssetsBase } = await load('_7-shared-scripts/core/assets.js');
  const pageUrl = 'https://matthallportfolio.com/portfolio/_5-music/music.html';
  const siteBaseUrl = 'https://matthallportfolio.com/portfolio/';
  const cdn = 'https://assets.matthallportfolio.com/';
  assert.equal(resolveAsset('../assets/glb/toy-piano.glb?v=1', { pageUrl, siteBaseUrl, assetsBase: cdn }), `${cdn}glb/toy-piano.glb?v=1`);
  assert.equal(resolveAsset('../soundfonts/salamander drums/x.sf2?q=1#part', { pageUrl, siteBaseUrl, assetsBase: cdn }), `${cdn}soundfonts/salamander%20drums/x.sf2?q=1#part`);
  assert.equal(resolveAsset('../assets/video-playback-icons/volume_high.svg', { pageUrl, siteBaseUrl, assetsBase: cdn }), `${siteBaseUrl}assets/video-playback-icons/volume_high.svg`);
  assert.equal(resolveAsset('../assets/glb/card-test.glb', { pageUrl, siteBaseUrl, assetsBase: '' }), `${siteBaseUrl}assets/glb/card-test.glb`);
  assert.equal(resolveAsset('https://elsewhere.example/a.glb?q=1#x', { pageUrl, siteBaseUrl, assetsBase: cdn }), 'https://elsewhere.example/a.glb?q=1#x');
  assert.equal(createAssets({ pageUrl, siteBaseUrl, assetsBase: cdn }).fromKey('Videos/demo%20one.webm'), `${cdn}Videos/demo%20one.webm`);
  assert.equal(resolveAssetsBase({ pageUrl, query: '?assetsBase=', stored: cdn }), '');
  assert.equal(resolveAssetsBase({ pageUrl, query: '?assetsBase=javascript%3Afoo', stored: '/custom/' }), 'https://matthallportfolio.com/custom/');
});

test('soundfont application budget admits Arachno and rejects definitive drums', async () => {
  const { assessPackage } = await load('_7-shared-scripts/storage/soundfont-budget.js');
  const manifest = JSON.parse(await readFile(new URL('../data/soundfont-packages.json', import.meta.url)));
  const arachno = manifest.packages.find(pkg => pkg.id === 'arachno-sf2');
  const drums = manifest.packages.find(pkg => pkg.id === 'definitive-drums-sf2');
  assert.equal(assessPackage(arachno).payloadBytes, 155405818);
  assert.equal(assessPackage(arachno).fits, true);
  assert.equal(assessPackage(drums).payloadBytes, 256317998);
  assert.equal(assessPackage(drums).fits, false);
  const { createSoundfontStore } = await load('_7-shared-scripts/storage/soundfont-store.js');
  const store = createSoundfontStore({ manifest, indexedDB: null, channelFactory: () => null, cryptoApi: { randomUUID: () => 'test' } });
  await assert.rejects(store.saveSelections(['definitive-drums-bank']), { code: 'budget' });
  await assert.rejects(store.saveSelections(['arachno-bank']), { code: 'unsupported' });
  await store.dispose();
});
