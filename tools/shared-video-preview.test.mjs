import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const inputSource = readFileSync(new URL('../_7-shared-scripts/media/controls-input.js', import.meta.url), 'utf8');
const viewSource = readFileSync(new URL('../_7-shared-scripts/media/controls-view.js', import.meta.url), 'utf8');

function sourceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed ${name}`);
}

test('shared preview stays hidden during camera gestures and pending seek completion', () => {
  const instrumented = viewSource
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/\bexport /g, '')
    .replace('return {\n    setViewportRectProvider,', 'return {\n    getPreviewVisible: () => hoverPreview.visible,\n    setViewportRectProvider,');
  const source = `${inputSource.replace('export function', 'function')}\n${instrumented}\ncreateVideoControlsUI`;
  let now = 1000;
  const createVideoControlsUI = runInNewContext(source, {
    performance: { now: () => now }, snapSyncMs: x => x,
    createVideoShortcutGuide: () => ({})
  });
  const listeners = new Map();
  const previewVideo = {
    duration: 100, currentTime: 0, pause() {},
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); }
  };
  const ui = createVideoControlsUI();
  ui.setState({ canPlay: true, canSeek: true, duration: 100, previewVideo });
  const meta = { canvasWidth: 1000, canvasHeight: 500 };
  const move = (buttons, pointerType = 'mouse') => ui.handlePointerMove({ canvasX: 500, canvasY: 454, buttons, pointerType }, meta);
  assert.equal(move(0), true);
  assert.equal(ui.getPreviewVisible(), true);
  const delayedSeek = listeners.get('seeked');
  ui.setCameraGestureActive(true);
  assert.equal(ui.getPreviewVisible(), false);
  delayedSeek();
  assert.equal(ui.getPreviewVisible(), false);
  assert.equal(move(2), false);
  assert.equal(move(0, 'touch'), false);
  ui.setCameraGestureActive(false);
  assert.equal(move(0), false);
  now += 121;
  assert.equal(move(0), true);
  assert.equal(ui.getPreviewVisible(), true);
  assert.equal(move(4), false);
  assert.equal(ui.getPreviewVisible(), false);

  const actions = [];
  ui.onAction = action => actions.push(action);
  const down = ui.handlePointerEvent({ canvasX: 500, canvasY: 454, type: 'pointerdown', buttons: 1 }, meta);
  assert.equal(down, true);
  assert.equal(ui.handlePointerMove({ canvasX: 650, canvasY: 454, buttons: 1 }, meta), true);
  assert.ok(actions.some(action => action.type === 'seekToRatio' && action.ratio > 0.6));
  assert.equal(ui.getPreviewVisible(), false);
  ui.endPointerInteraction();
});

test('thumbnail width stays proportional to player width', () => {
  const drawHoverPreview = runInNewContext(`${sourceFunction(viewSource, 'drawHoverPreview')}\ndrawHoverPreview`, {
    hoverPreview: { visible: true, ratio: 0.5, time: 50 },
    formatTime: () => '0:50'
  });
  for (const [playerWidth, expectedWidth] of [[1000, 240], [300, 72]]) {
    let imageWidth = 0;
    const ctx = {
      save() {}, restore() {}, fillRect() {}, strokeRect() {}, fillText() {},
      drawImage(_video, _x, _y, width) { imageWidth = width; }
    };
    drawHoverPreview(ctx, {
      videoRect: { w: playerWidth }, progress: { x: 0, y: 200, w: playerWidth }
    }, { canSeek: true, previewVideo: { readyState: 2, videoWidth: 160, videoHeight: 90 } }, { fg: '#fff' }, 1);
    assert.equal(imageWidth, expectedWidth);
  }
});

test('Music uses one enlarged tablet transport rather than duplicate side controls', () => {
  const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  const start = source.indexOf('function renderTopPadGrid(){');
  const end = source.indexOf('function triggerInstrumentButton', start);
  const render = source.slice(start, end);
  assert.equal(render.includes('topPadUiRects.syncSlider = sliderRect'), false);
  assert.equal(render.includes('topPadUiRects.volumeSlider = volumeRect'), false);
  assert.match(source, /solidBars: true/);
  assert.match(source, /compact: true/);
  assert.equal(source.includes("headerLabel: 'Now playing'"), false);
});

test('compact Music transport fits visible controls with and without fullscreen', () => {
  const source = viewSource.replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '')
    .replace('return {\n    setViewportRectProvider,', 'return {\n    getLayout,\n    setSpeedExpanded: value => { speedExpanded = value; },\n    setViewportRectProvider,');
  const create = runInNewContext(`${inputSource.replace('export function', 'function')}\n${source}\ncreateVideoControlsUI`, {
    performance: { now: () => 0 }, snapSyncMs: x => x, createVideoShortcutGuide: () => ({})
  });
  const ui = create({controlScale:1.4,solidBars:true,compact:true});
  for(const fullscreen of [false,true]) for(const expanded of [false,true]) {
    ui.setState({canPlay:true,controls:{fullscreen,tablet:false,pitch:true,speed:true}});
    ui.setSpeedExpanded(expanded);
    for(const [w,h] of [[853,510],[640,385],[1024,600]]) {
      const layout = ui.getLayout(w,h);
      assert(layout.topBar.h + layout.bottomBar.h <= h * .27);
      assert(layout.volumeSlider.h < layout.barH * .1);
      assert(layout.syncSlider.w < w * .2);
      assert(layout.volumeSlider.x + layout.volumeSlider.w < layout.time.x);
      assert(layout.time.x + layout.time.w < (expanded ? layout.speedStops[0].x : layout.speed.x));
      assert(layout.speed.x + layout.speed.w < layout.pitch.x);
      if(fullscreen){
        const gap = layout.fullscreen.x - layout.help.x - layout.help.w;
        assert(gap >= 0 && gap <= layout.barH * .25);
        assert(layout.pitch.x + layout.pitch.w < layout.help.x);
      }
      assert(layout.play.y + layout.play.h <= h);
    }
  }
});

test('Music feathering switches live between full gradients and solid bars',()=>{
  const create=runInNewContext(`${inputSource.replace('export function','function')}\n${viewSource.replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'')}\ncreateVideoControlsUI`,{
    performance:{now:()=>0},snapSyncMs:x=>x,createVideoShortcutGuide:()=>({}),formatTime:()=> '0:00'
  });
  const ui=create({compact:true,solidBars:true,feather:true});
  const controls=Object.fromEntries(['exit','play','mute','volume','seek','speed','pitch','sync','tablet','fullscreen','help'].map(key=>[key,false]));
  for(const feather of [true,false,true]){
    const stops=[];
    const ctx=new Proxy({canvas:{width:1092,height:614},createLinearGradient(){const list=[];stops.push(list);return {addColorStop:(...args)=>list.push(args)};}},
      {get:(target,key)=>key in target?target[key]:()=>{}});
    ui.setState({canPlay:true,canSeek:false,controls,feather});
    ui.draw(ctx);
    assert.equal(stops.length,feather?2:0);
    if(feather){assert(stops[0].some(([stop])=>stop===.25));assert(stops[1].some(([stop])=>stop===.75));}
  }
  const panel=readFileSync(new URL('../debug/panel-shell.js',import.meta.url),'utf8');
  assert.match(panel,/data-setting="music.featherControls"/);
});

test('a trailing seek click does not issue a second seek after the press',()=>{
  const instrumented=viewSource.replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'')
    .replace('return {\n    setViewportRectProvider,','return {\n    getLayout,\n    setViewportRectProvider,');
  const create=runInNewContext(`${inputSource.replace('export function','function')}\n${instrumented}\ncreateVideoControlsUI`,{
    performance:{now:()=>0},snapSyncMs:x=>x,createVideoShortcutGuide:()=>({})
  });
  const ui=create({compact:true});
  ui.setState({canPlay:true,canSeek:true,playing:true,duration:100});
  const actions=[];ui.onAction=action=>actions.push(action);
  const rect=ui.getLayout(1000,614).progress;
  const event={canvasX:rect.x+rect.w*.5,canvasY:rect.y+rect.h/2};
  const meta={canvasWidth:1000,canvasHeight:614};
  ui.handlePointerEvent({...event,type:'pointerdown'},meta);
  ui.endPointerInteraction();
  ui.handlePointerEvent({...event,type:'click',detail:1},meta);
  assert.equal(actions.filter(action=>action.type==='seekToRatio').length,1);
});
