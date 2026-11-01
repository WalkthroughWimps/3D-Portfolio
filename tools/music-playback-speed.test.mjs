import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const music = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../_7-shared-scripts/media/controls-view.js', import.meta.url), 'utf8');
const input = readFileSync(new URL('../_7-shared-scripts/media/controls-input.js', import.meta.url), 'utf8');
function extract(name) {
  const start = music.indexOf(`function ${name}(`);
  assert(start >= 0);
  let depth = 0;
  for(let i = music.indexOf('{', start); i < music.length; i++){
    if(music[i] === '{') depth++;
    if(music[i] === '}' && --depth === 0) return music.slice(start, i + 1);
  }
  throw Error(`Unclosed ${name}`);
}

test('Music speed press cycles once without opening a list or accepting the trailing click', () => {
  const source = view.replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '')
    .replace('return {\n    setViewportRectProvider,', 'return {\n    getLayout,\n    getSpeedExpanded: () => speedExpanded,\n    setViewportRectProvider,');
  const create = runInNewContext(`${input.replace('export function', 'function')}\n${source}\ncreateVideoControlsUI`, {
    performance: { now: () => 0 }, snapSyncMs: x => x, createVideoShortcutGuide: () => ({})
  });
  for(const fullscreen of [false, true]){
    const actions = [];
    const ui = create({compact:true,solidBars:true,speedMode:'cycle'});
    ui.setState({canPlay:true,canSeek:true,controls:{speed:true,pitch:true,fullscreen,tablet:false}});
    ui.onAction = action => actions.push(action.type);
    const layout = ui.getLayout(853,510);
    const event = type => ({type,canvasX:layout.speed.x+layout.speed.w/2,canvasY:layout.speed.y+layout.speed.h/2});
    const meta = {canvasWidth:853,canvasHeight:510};
    assert.equal(ui.handlePointerEvent(event('pointerdown'), meta), true);
    assert.equal(ui.handlePointerEvent(event('click'), meta), true);
    assert.deepEqual(actions,['cyclePlaybackRate']);
    assert.equal(ui.getSpeedExpanded(),false);
    const pitch = ui.inspectPointerEvent({canvasX:layout.pitch.x+layout.pitch.w/2,canvasY:layout.pitch.y+layout.pitch.h/2},meta);
    assert.equal(pitch.control,'pitch');
  }
});

test('cycling and shortcuts share Music rates and wrap only for the button', () => {
  const calls = [];
  const state = {
    TOPPAD_SPEED_OPTIONS:[.75,.85,1,1.2,1.6,2],currentPlaybackRate:1,
    topPadVideo:{mode:'idle'},setPlaybackRate(rate){calls.push(rate);state.currentPlaybackRate=rate;}
  };
  const code = `${extract('stepMusicPlaybackRate')}\n${extract('cycleMusicPlaybackRate')}`;
  runInNewContext(`${code}\nfor(let i=0;i<6;i++) cycleMusicPlaybackRate();\nstepMusicPlaybackRate(-1);`,state);
  assert.deepEqual(calls,[1.2,1.6,2,.75,.85,1,.85]);
  state.currentPlaybackRate=.75;
  runInNewContext(`${code}\nstepMusicPlaybackRate(-1);`,state);
  assert.equal(calls.at(-1),.75);
});

test('shifted punctuation shortcuts accept both character and physical-key reports', () => {
  const code = extract('handleTopPadVideoKeys');
  for(const [key,keyCode,direction] of [[',','Comma',-1],['<','Comma',-1],['.','Period',1],['>','Period',1]]){
    let prevented=false,stepped;
    runInNewContext(`${code}\nhandleTopPadVideoKeys(ev);`, {
      topPadVideo:{mode:'idle',focused:false},trackVideo:{keyboardFocused:true,ui:{},hqVideo:null},audioPlaying:false,
      document:{querySelector:()=>null},
      getTrackDurationSec:()=>120,getPlaybackPositionSec:()=>30,stepMusicPlaybackRate:value=>{stepped=value;},
      ev:{key,code:keyCode,shiftKey:true,target:{tagName:'CANVAS'},preventDefault(){prevented=true;}}
    });
    assert.equal(prevented,true);
    assert.equal(stepped,direction);
  }
});

test('standalone video speed updates both media clocks without changing pause state', () => {
  const video={playbackRate:1,paused:true}, audio={playbackRate:1,paused:true};
  const state={topPadVideo:{mode:'playing',hqVideo:video,audio},trackVideo:{active:false},currentPlaybackRate:1,
    applyStoredPitchModeToMusicVideoSurfaces(){},renderTopPadGrid(){}};
  runInNewContext(`${extract('setPlaybackRate')}\nsetPlaybackRate(1.6);`,state);
  assert.equal(video.playbackRate,1.6);
  assert.equal(audio.playbackRate,1.6);
  assert.equal(video.paused,true);
  assert.equal(audio.paused,true);
});
