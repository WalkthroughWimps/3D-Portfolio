import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('games active video Home and End seek to bounds and synchronize audio', async () => {
  const source = await read('_4-games/games.js');
  const start = source.indexOf('function handleKeyDown(ev) {');
  const end = source.indexOf('\nfunction enterContentView()', start);
  assert.ok(start >= 0 && end > start);
  const video = { duration: 120, currentTime: 45, paused: true };
  const audio = {};
  let syncs = 0;
  const context = vm.createContext({
    contentMode: 'video', reelVideo: video, reelAudio: audio,
    playerVideo: null, playerAudio: null, needsRedraw: false,
    syncAudioToVideo(v, a) { assert.equal(v, video); assert.equal(a, audio); syncs++; }
  });
  vm.runInContext(`${source.slice(start, end)}\nthis.handleKeyDown = handleKeyDown;`, context);
  for (const [key, expected] of [['Home', 0], ['End', 120]]) {
    let prevented = false;
    context.handleKeyDown({ key, shiftKey: false, preventDefault() { prevented = true; } });
    assert.equal(video.currentTime, expected);
    assert.equal(prevented, true);
  }
  assert.equal(syncs, 2);
  assert.equal(context.needsRedraw, true);
  video.duration = Infinity;
  video.currentTime = 8;
  context.handleKeyDown({ key: 'Home', shiftKey: false, preventDefault() {} });
  assert.equal(video.currentTime, 8);
});

test('media seek callback owns the action, while missing callback uses the default', async () => {
  const source = (await read('_7-shared-scripts/media/controller.js'))
    .replace(/^import .*?;\s*/m, '');
  let fallbackCalls = 0;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(`const seekMediaWithFreeze = (...args) => { globalThis.__seekFallback(...args); };\nconst clampSeekRatio = ratio => Math.max(0, Math.min(1, Number(ratio) || 0));\n${source}`).toString('base64')}`;
  globalThis.__seekFallback = () => { fallbackCalls++; };
  try {
    const { createMediaController } = await import(moduleUrl);
    const video = { duration: 20, currentTime: 0 };
    const audio = {};
    const seen = [];
    const custom = createMediaController({ getActiveVideo: () => video, getActiveAudio: () => audio,
      seek: (ratio, v, a) => { seen.push([ratio, v, a]); } });
    custom.dispatch({ type: 'seekToRatio', ratio: 3 });
    custom.dispatch({ type: 'seekToRatio', ratio: -2 });
    assert.deepEqual(seen.map(([ratio]) => ratio), [1, 0]);
    assert.equal(seen[0][1], video);
    assert.equal(seen[0][2], audio);
    assert.equal(fallbackCalls, 0);
    const normal = createMediaController({ getActiveVideo: () => video, getActiveAudio: () => audio });
    normal.dispatch({ type: 'seekToRatio', ratio: 0.5 });
    assert.equal(fallbackCalls, 1);
  } finally {
    delete globalThis.__seekFallback;
  }
});

test('graphics and music model URLs resolve to existing local assets and intended CDN paths', async () => {
  const graphics = await read('_3-graphics/graphics.js');
  const music = await read('_5-music/music-piano-controls.v2.js');
  const facade = await read('_7-shared-scripts/assets-config.js');
  assert.match(facade, /return assets\.resolve\(path\)/);
  const policyUrl = `data:text/javascript;base64,${Buffer.from(await read('_7-shared-scripts/core/asset-policy.js')).toString('base64')}`;
  const assetsSource = (await read('_7-shared-scripts/core/assets.js')).replace("from './asset-policy.js'", `from '${policyUrl}'`);
  const { createAssets } = await import(`data:text/javascript;base64,${Buffer.from(assetsSource).toString('base64')}`);
  assert.match(graphics, /MODEL_PATH = assetUrl\('\.\.\/assets\/glb\/card-test\.glb'\)/);
  assert.match(music, /loader\.load\(`\$\{assetUrl\('\.\.\/assets\/glb\/toy-piano\.glb'\)\}/);
  for (const name of ['card-test.glb', 'toy-piano.glb']) {
    assert.ok(existsSync(resolve('assets/glb', name)));
    assert.equal(new URL(`../assets/glb/${name}`, `http://127.0.0.1:8878/_${name === 'card-test.glb' ? '3-graphics/graphics' : '5-music/music'}.html`).pathname, `/assets/glb/${name}`);
    for (const [host, expected] of [
      ['127.0.0.1', `http://127.0.0.1:8878/assets/glb/${name}`],
      ['matthallportfolio.com', `https://assets.matthallportfolio.com/glb/${name}`]
    ]) {
      const pageUrl = `http${host === '127.0.0.1' ? '' : 's'}://${host}${host === '127.0.0.1' ? ':8878' : ''}/_${name === 'card-test.glb' ? '3-graphics/graphics' : '5-music/music'}.html`;
      const assets = createAssets({ pageUrl, siteBaseUrl: new URL('/', pageUrl).href, stored: null });
      assert.equal(assets.resolve(`../assets/glb/${name}`), expected);
    }
  }
});

async function workerHarness(hostname) {
  const listeners = new Map();
  const stores = new Map();
  const put = async (name, key, response) => {
    if (!stores.has(name)) stores.set(name, new Map());
    stores.get(name).set(String(key), response);
  };
  let offline = false;
  let putFails = false;
  const requests = [];
  const context = vm.createContext({
    URL, Promise, Response, Headers,
    importScripts: (path) => {
      assert.equal(path, './sw-asset-config.js');
      vm.runInContext(configSource, context);
    },
    self: { location: { hostname, origin: `https://${hostname}` },
      addEventListener: (name, callback) => listeners.set(name, callback),
      skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { open: async (name) => ({
      match: async (key) => stores.get(name)?.get(String(key))?.clone(),
      put: async (key, response) => { if (putFails) throw new Error('cache full'); return put(name, key, response); }
    }), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
    fetch: async (request) => {
      requests.push(String(request.url || request));
      if (offline) throw new Error('offline');
      if (request.headers?.get('range')) return new Response('ass', { status: 206, headers: { 'Content-Range': 'bytes 0-2/5', 'Content-Length': '3', 'Content-Type': 'video/webm' } });
      return new Response('asset', { headers: { 'Content-Length': '5', 'Content-Type': 'video/webm' } });
    }
  });
  const configSource = await read('sw-asset-config.js');
  vm.runInContext(await read('sw.js'), context);
  const waitEvent = async (name) => {
    let pending;
    listeners.get(name)({ waitUntil(value) { pending = value; } });
    await pending;
  };
  const request = async (url, range) => {
    let pending;
    listeners.get('fetch')({ request: { url, method: 'GET', headers: new Headers(range ? { Range: range } : {}) }, respondWith(value) { pending = value; } });
    return pending ? await pending : null;
  };
  return { waitEvent, request, requests, stores, setOffline(value) { offline = value; }, setPutFails(value) { putFails = value; } };
}

for (const host of ['127.0.0.1', 'matthallportfolio.com']) {
  test(`service worker caches the intended intro asset and serves it offline on ${host}`, async () => {
    const worker = await workerHarness(host);
    const origin = host === '127.0.0.1' ? `https://${host}` : 'https://assets.matthallportfolio.com';
    const asset = `${origin}/Renders/tablet-animation.webm`;
    await worker.waitEvent('install');
    assert.ok(worker.requests.includes(host === '127.0.0.1' ? '/Renders/tablet-animation.webm' : asset));
    worker.setOffline(true);
    assert.equal(await (await worker.request(asset)).text(), 'asset');
    assert.equal(await worker.request(`${origin}/Renders/other.webm`), null);
    assert.equal(await worker.request(`https://other.example/Renders/tablet-animation.webm`), null);
    assert.equal(worker.requests.length, 1);
    await worker.waitEvent('activate');
    assert.ok(worker.stores.has('intro-cache-v4'));
  });
}

test('service worker reports network failure when intro asset was never cached', async () => {
  const worker = await workerHarness('matthallportfolio.com');
  worker.setOffline(true);
  await worker.waitEvent('install');
  const response = await worker.request('https://assets.matthallportfolio.com/Renders/tablet-animation.webm');
  assert.equal(response.type, 'error');
});

test('service worker slices cached intro ranges including open and suffix forms', async () => {
  const worker = await workerHarness('127.0.0.1');
  await worker.waitEvent('install');
  worker.setOffline(true);
  const url = 'https://127.0.0.1/Renders/tablet-animation.webm';
  for (const [range, expectedRange, expectedBody] of [
    ['bytes=1-3', 'bytes 1-3/5', 'sse'], ['bytes=2-', 'bytes 2-4/5', 'set'], ['bytes=-2', 'bytes 3-4/5', 'et']
  ]) {
    const response = await worker.request(url, range);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), expectedRange);
    assert.equal(response.headers.get('content-length'), String(expectedBody.length));
    assert.equal(await response.text(), expectedBody);
  }
  const unsatisfied = await worker.request(url, 'bytes=9-10');
  assert.equal(unsatisfied.status, 416);
  assert.equal(unsatisfied.headers.get('content-range'), 'bytes */5');
  const multiple = await worker.request(url, 'bytes=0-1,3-4');
  assert.equal(multiple.status, 416);
});

test('service worker passes online partial responses and successful responses through cache write failure', async () => {
  const worker = await workerHarness('127.0.0.1');
  const url = 'https://127.0.0.1/Renders/tablet-animation.webm';
  await worker.waitEvent('install');
  worker.stores.get('intro-cache-v4')?.clear();
  const partial = await worker.request(url, 'bytes=0-2');
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('content-range'), 'bytes 0-2/5');
  assert.equal(await partial.text(), 'ass');
  worker.stores.get('intro-cache-v4')?.clear();
  worker.setPutFails(true);
  const full = await worker.request(url);
  assert.equal(full.status, 200);
  assert.equal(await full.text(), 'asset');
});
