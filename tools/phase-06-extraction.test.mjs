import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function importModule(file) {
  return import(`data:text/javascript;base64,${Buffer.from(await fs.readFile(new URL(file, import.meta.url))).toString('base64')}`);
}
const catalogDependencies = {
  SOUND_FONT_BASE: '/soundfonts/musyngkite/',
  LOCAL_SOUNDFONT_BASES: { musyngkite:'/soundfonts/musyngkite/', fluidr3_gm:'/soundfonts/fluidr3_gm/', arachno:'/soundfonts/arachno/', wappydog:'/soundfonts/wappydog/' },
  SF2_HYPERSOUND_URL: '/soundfonts/hypersound/hypersound.sf2',
  SALAMANDER_DRUM_RANGE: { min:36, max:94 }
};

test('Music catalog preserves all baseline presets, envelopes, ranges, source order and random pools', async () => {
  const { createInstrumentCatalog } = await importModule('../_5-music/instruments/catalog.js');
  const catalog = createInstrumentCatalog(catalogDependencies);
  const baseline = JSON.parse(await fs.readFile(new URL('./fixtures/music-catalog-baseline.json', import.meta.url), 'utf8'));
  for (const key of Object.keys(baseline)) assert.deepEqual(catalog[key], baseline[key]);
  assert.deepEqual(catalog.getPreferredBasesForTab('keys'), ['/soundfonts/musyngkite/', '/soundfonts/fluidr3_gm/']);
  assert.deepEqual(catalog.getPreferredBasesForTab('solo'), ['/soundfonts/fluidr3_gm/', '/soundfonts/musyngkite/']);
  assert.equal(catalog.INSTRUMENT_CONFIG_BY_ID.get('fx_dog').sf2Url, '/soundfonts/hypersound/hypersound.sf2');
  assert.equal(catalog.INSTRUMENT_CONFIG_BY_ID.get('fx_drums').drumSampleSet, 'salamander');
});

test('Music catalogs isolate mutable load state while sharing each session preset identity', async () => {
  const { createInstrumentCatalog } = await importModule('../_5-music/instruments/catalog.js');
  const a = createInstrumentCatalog(catalogDependencies);
  const b = createInstrumentCatalog(catalogDependencies);
  const config = a.INSTRUMENT_CONFIG_BY_ID.get('keys_acoustic_piano');
  config.sampleRange = { min:21, max:108 };
  assert.equal(a.getDefaultConfigForTab('keys'), config);
  assert.equal(b.INSTRUMENT_CONFIG_BY_ID.get(config.id).sampleRange, undefined);
  a.INSTRUMENT_CONFIG_BY_ID.set('dynamic', {id:'dynamic',tab:'fx'});
  assert.equal(a.getInstrumentTabId({id:'dynamic'}), 'fx');
  assert.equal(b.getInstrumentTabId({id:'dynamic'}), 'keys');
});

test('Music map loader reads the historical MIDI wrapper without polluting the global object', async () => {
  const loader = await importModule('../_5-music/instruments/loader.js');
  const source = 'var MIDI = MIDI || {}; MIDI.Soundfont = MIDI.Soundfont || {}; MIDI.Soundfont.piano = {C4:"data:audio/mp3;base64,AQID", E4:"data:audio/mp3;base64,BAUG"};';
  const url = `data:text/javascript,${encodeURIComponent(source)}`;
  const map = await loader.loadMusyngKiteSoundfont(url, 'piano');
  assert.deepEqual(await loader.loadSoundfontMapFromJs(url), { key:'piano', map });
  assert.deepEqual(loader.computeSampleRangeFromMap(map), { min:60, max:64 });
  assert.equal(loader.findNearestSoundfontKey(map, 62), 'C4');
  assert.equal(loader.findNearestSoundfontKey(map, 64), 'E4');
  assert.deepEqual([...new Uint8Array(loader.decodeDataUriToArrayBuffer(map.C4))], [1,2,3]);
  assert.equal(loader.decodeDataUriToArrayBuffer('data:audio/mp3,plain'), null);
  assert.equal(globalThis.MIDI, undefined);
});

test('Music map loading surfaces failed fetch and CSP refusal without silently changing backend', async () => {
  const loader = await importModule('../_5-music/instruments/loader.js');
  await assert.rejects(loader.loadMusyngKiteSoundfont('data:text/javascript,invalid%20syntax!', 'piano'), SyntaxError);
  const source = loader.loadMusyngKiteSoundfont.toString();
  const failed = vm.runInNewContext(`(${source})('test','piano')`, { fetch: async () => ({ok:false,status:404}), console });
  await assert.rejects(failed, /404/);
  const blocked = vm.runInContext(`(${source})('test','piano')`, vm.createContext({ fetch: async () => ({ok:true,text:async()=> 'MIDI.Soundfont.piano = {}'}), console }, {codeGeneration:{strings:false,wasm:false}}));
  await assert.rejects(blocked, /Code generation from strings disallowed/);
});

test('Music SF2 metadata preserves real Hypersound preset headers and handles incomplete input', async () => {
  const loader = await importModule('../_5-music/instruments/loader.js');
  const bytes = await fs.readFile(new URL('../soundfonts/hypersound/hypersound.sf2', import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const presets = loader.extractSf2PresetList(buffer);
  assert.deepEqual(presets[0], {name:'Mellow grand piano',preset:0,bank:0});
  assert.equal(loader.normalizeSf2Name(' Mellow grand piano '), 'MELLOWGRANDPIANO');
  assert.ok(presets.every(preset => preset.name !== 'EOP' && Number.isInteger(preset.bank) && Number.isInteger(preset.preset)));
  assert.deepEqual(loader.extractSf2PresetList(new ArrayBuffer(5)), []);
  assert.equal(loader.noteNameToMidi('A0'), 21);
  assert.equal(loader.midiToNoteName(108), 'C8');
});

test('Music UI disposal detaches a pending shared preview without stopping borrowed media', async () => {
  const inputSource = await fs.readFile(new URL('../_7-shared-scripts/media/controls-input.js', import.meta.url), 'utf8');
  const inputUrl = `data:text/javascript;base64,${Buffer.from(inputSource).toString('base64')}`;
  const source = (await fs.readFile(new URL('../_7-shared-scripts/media/controls-view.js', import.meta.url), 'utf8'))
    .replace("import { snapSyncMs } from '../global-sync.js';", 'const snapSyncMs = value => Math.round(value / 5) * 5;')
    .replace("from './controls-input.js'", `from '${inputUrl}'`);
  const { createVideoControlsUI } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const { disposeMusicVideoControls } = await importModule('../_5-music/ui/video-controls-lifetime.js');
  const listeners = new Set();
  const borrowed = { duration:100, currentTime:0, pauses:0, pause(){this.pauses++;},
    addEventListener(type, fn){assert.equal(type,'seeked'); listeners.add(fn);},
    removeEventListener(type, fn){assert.equal(type,'seeked'); listeners.delete(fn);} };
  const ui = createVideoControlsUI();
  ui.setState({canSeek:true,canPlay:true,duration:100,previewVideo:borrowed});
  assert.equal(ui.handlePointerMove({canvasX:50,canvasY:80},{canvasWidth:100,canvasHeight:100}), true);
  assert.equal(listeners.size,1);
  const pauseCount = borrowed.pauses;
  const owner = {ui,uiCanvas:{},uiCtx:{},hqVideo:borrowed,lqVideo:borrowed};
  disposeMusicVideoControls(owner);
  disposeMusicVideoControls(owner);
  assert.equal(listeners.size,0);
  assert.equal(borrowed.pauses,pauseCount);
  assert.equal(owner.hqVideo,borrowed);
  assert.equal(owner.ui,null);
  assert.equal(ui.handlePointerMove({canvasX:50,canvasY:80},{canvasWidth:100,canvasHeight:100}), false);
});

test('Music debug history wrappers preserve call semantics and restore only their own hooks', async () => {
  const { mountMusicDiagnostics } = await importModule('../debug/music-diagnostics.js');
  const target = new EventTarget();
  const logs = [];
  const push = function(...args) { assert.equal(this, historyObject); return args; };
  const replace = () => 42;
  const historyObject = {pushState:push,replaceState:replace};
  const dispose = mountMusicDiagnostics({ target, historyObject, storage:{getItem:()=>null,setItem:()=>{}},
    locationObject:{href:'http://test/music'},performanceObject:{getEntriesByType:()=>[]},logger:{log:(...args)=>logs.push(args),warn:()=>{}} });
  assert.deepEqual(historyObject.pushState('state','','#test'), ['state','','#test']);
  target.dispatchEvent(new Event('popstate'));
  const count = logs.length;
  const laterOwner = () => 99;
  historyObject.replaceState = laterOwner;
  dispose(); dispose();
  target.dispatchEvent(new Event('popstate'));
  assert.equal(logs.length,count);
  assert.equal(historyObject.pushState,push);
  assert.equal(historyObject.replaceState,laterOwner);
});

test('Music diagnostics remain unloaded when disabled and ignore an import completing after disposal', async () => {
  const { createLocalPreferences } = await importModule('../_7-shared-scripts/local-preferences.js');
  const source = (await fs.readFile(new URL('../debug/debug-loader.js', import.meta.url),'utf8'))
    .replace("import { localPreferences } from '../_7-shared-scripts/local-preferences.js';", '')
    .replaceAll('export ', '')
    .replace("await import('./music-diagnostics.js')", 'await loadForTest()');
  let imports = 0, mounts = 0, resolveImport;
  const controller = new AbortController();
  const dependencies = { URLSearchParams, window:{location:{search:'?debug=0',pathname:'/music'}},
    localPreferences: createLocalPreferences(() => { throw new Error('blocked storage'); }),
    console:{warn:()=>{}}, scope:{signal:controller.signal,defer:()=>{}},
    loadForTest:() => { imports++; return new Promise(resolve=>{resolveImport=resolve;}); } };
  const context = vm.createContext(dependencies);
  vm.runInContext(source,context);
  assert.equal(vm.runInContext('getPageDebugState("/music")',context),false);
  await vm.runInContext('loadMusicDiagnostics({scope,pageId:"/music"})',context);
  assert.equal(imports,0);
  dependencies.window.location.search = '?debug=1';
  const loading = vm.runInContext('loadMusicDiagnostics({scope,pageId:"/music"})',context);
  assert.equal(imports,1);
  controller.abort();
  resolveImport({mountMusicDiagnostics:()=>{mounts++; return ()=>{};}});
  await loading;
  assert.equal(mounts,0);
});
