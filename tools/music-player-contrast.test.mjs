import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const view=read('../_7-shared-scripts/media/controls-view.js');
const input=read('../_7-shared-scripts/media/controls-input.js');
const music=read('../_5-music/music-piano-controls.v2.js');
const games=read('../_4-games/games.js');
function extract(source,name){
  const start=source.indexOf(`function ${name}(`); assert(start>=0);
  let depth=0;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    if(source[i]==='{')depth++;
    if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw Error(name);
}
const create=runInNewContext(`${input.replace('export function','function')}\n${view.replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'')
  .replace('return {\n    setViewportRectProvider,','return {\n    getLayout,\n    setViewportRectProvider,')}\ncreateVideoControlsUI`,{
  performance:{now:()=>0},snapSyncMs:x=>x,formatTime:()=> '0:00',drawBackControl:()=>{},
  createVideoShortcutGuide:()=>({})
});
const theme={bg:'#041b13',fg:'#ffa3d8',accent:'#ff8acf',rail:'#91b7a4',railOutline:'#03130c',bgAlpha:1};

function paint(ui){
  const records=[],gradients=[],stack=[];
  const target={canvas:{width:1092,height:614},globalAlpha:1,
    save(){stack.push(Object.fromEntries(Object.entries(this).filter(([,v])=>typeof v!=='function')));},
    restore(){Object.assign(this,stack.pop());},
    createLinearGradient(){const stops=[];gradients.push(stops);return {addColorStop:(...s)=>stops.push(s)};},
    fillRect(...rect){records.push({type:'fill',rect,color:this.fillStyle,alpha:this.globalAlpha});},
    stroke(){records.push({type:'stroke',color:this.strokeStyle,alpha:this.globalAlpha});},
    fillText(text){records.push({type:'text',text,color:this.fillStyle,alpha:this.globalAlpha});}
  };
  const ctx=new Proxy(target,{get:(object,key)=>key in object?object[key]:()=>{}});
  ui.draw(ctx);assert.equal(stack.length,0);
  return {records,gradients};
}

test('Music uses opaque mint empty rails, brighter pink controls, and short feather transitions',()=>{
  const ui=create({compact:true,solidBars:true,feather:true,featherProfile:'readable',theme});
  ui.setState({canPlay:true,canSeek:true,feather:true,volume:.3,duration:100,currentTime:25,
    controls:{play:true,mute:true,volume:true,seek:true,speed:true,sync:true,pitch:false}});
  const {records,gradients}=paint(ui),layout=ui.getLayout(1092,614);
  for(const rect of [layout.syncSlider,layout.progress]){
    assert(records.some(r=>r.type==='fill'&&r.color===theme.rail&&r.alpha===1&&r.rect[0]===rect.x&&r.rect[2]===rect.w));
  }
  assert(records.some(r=>r.type==='stroke'&&r.color===theme.rail&&r.alpha===1));
  assert(records.some(r=>r.type==='text'&&r.color===theme.fg));
  assert(gradients[0].some(([stop])=>stop===.62));
  assert(gradients[1].some(([stop])=>stop===.3));
  ui.setState({canPlay:true,feather:false,controls:{}});
  assert.equal(paint(ui).gradients.length,0);
});

test('hidden MIDI pitch control releases its space and cannot receive a pitch action',()=>{
  const ui=create({compact:true,solidBars:true,speedMode:'cycle'});
  ui.setState({canPlay:true,controls:{pitch:true,speed:true}});
  const withPitch=ui.getLayout(853,614);
  ui.setState({canPlay:true,controls:{pitch:false,speed:true}});
  const withoutPitch=ui.getLayout(853,614);
  assert.equal(withoutPitch.pitch.w,0);
  assert(withoutPitch.speed.x>withPitch.speed.x+withPitch.speed.w);
  const hit=ui.inspectPointerEvent({canvasX:withPitch.pitch.x+withPitch.pitch.w/2,canvasY:withPitch.pitch.y+withPitch.pitch.h/2},{canvasWidth:853,canvasHeight:614});
  assert.notEqual(hit.action?.type,'togglePitch');
});

test('recorded pitch is fixed while standalone video retains the saved pitch option',()=>{
  const calls=[],track={};
  const state={topPadVideo:{hqVideo:{},audio:{}},trackVideo:{hqVideo:track},getStoredPreservePitch:()=>true,
    setPreservePitchFlag:(media,preserve)=>calls.push([media,preserve])};
  runInNewContext(extract(music,'applyStoredPitchModeToMusicVideoSurfaces')+'\napplyStoredPitchModeToMusicVideoSurfaces();',state);
  assert.deepEqual(calls.map(([,preserve])=>preserve),[true,true,false]);
  let options;
  const context={trackVideo:{},MUSIC_PLAYER_THEME:theme,createVideoControlsUI:value=>{options=value;return {};}};
  runInNewContext(extract(music,'ensureTrackVideoUi')+'\nensureTrackVideoUi();',context);
  assert.equal(options.shortcutCapabilities.pitch,false);
  assert.equal(options.featherProfile,'readable');
});

test('Games reel gets a larger uncropped 16:9 picture with smaller chrome margins',()=>{
  const code=['getReelVideoAperture','fitRectContain'].map(name=>extract(games,name)).join('\n');
  const helpers=runInNewContext(code+'\n({getReelVideoAperture,fitRectContain})');
  for(const [w,h] of [[2048,1280],[1920,1080],[1024,768]]){
    const surface={x:10,y:20,w,h},aperture=helpers.getReelVideoAperture(surface);
    const old=helpers.fitRectContain(16,9,{x:10,y:20+h*.11,w,h:h*.76});
    const picture=helpers.fitRectContain(16,9,aperture);
    assert(picture.w*picture.h>=old.w*old.h-.001);
    if(old.w<w*.99) assert(picture.w*picture.h>old.w*old.h*1.15);
    assert(picture.x>=surface.x&&picture.y>=surface.y);
    assert(picture.x+picture.w<=surface.x+w+.001&&picture.y+picture.h<=surface.y+h+.001);
    assert(Math.abs(picture.w/picture.h-16/9)<1e-8);
  }
});
