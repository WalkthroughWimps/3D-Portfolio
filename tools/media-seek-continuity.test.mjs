import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../_7-shared-scripts/media/transport.js',import.meta.url),'utf8');
const {seekMediaWithFreeze}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

class Media extends EventTarget {
  constructor(paused){super();this.paused=paused;this.ended=false;this.duration=100;this.readyState=2;this.seeking=false;this.time=0;this.plays=0;}
  get currentTime(){return this.time;}
  set currentTime(value){this.time=value;this.seeking=true;}
  pause(){this.paused=true;}
  play(){this.plays++;this.paused=false;return Promise.resolve();}
  finish(){this.seeking=false;this.dispatchEvent(new Event('seeked'));this.dispatchEvent(new Event('canplay'));}
}

test('rapid seeks preserve playing intent, ignore stale readiness and resume only the latest target once',async()=>{
  const video=new Media(false),audio=new Media(false);
  seekMediaWithFreeze(video,20,{audio,syncMs:250});
  assert.equal(video.paused,true);
  seekMediaWithFreeze(video,40,{audio,syncMs:250});
  video.dispatchEvent(new Event('canplay'));
  assert.equal(video.plays,0);
  video.finish();
  await Promise.resolve();
  assert.equal(video.currentTime,40);
  assert.equal(audio.currentTime,39.75);
  assert.equal(video.paused,false);
  assert.equal(audio.paused,false);
  assert.equal(video.plays,1);
  assert.equal(audio.plays,1);
});

test('seeking from pause keeps both media paused even across repeated drags',async()=>{
  const video=new Media(true),audio=new Media(true);
  seekMediaWithFreeze(video,20,{audio});
  seekMediaWithFreeze(video,60,{audio});
  video.finish();
  await Promise.resolve();
  assert.equal(video.paused,true);
  assert.equal(audio.paused,true);
  assert.equal(audio.currentTime,60);
  assert.equal(video.plays,0);
});

test('a pending seek cannot restart Music after the player has exited',()=>{
  const video=new Media(false),audio=new Media(false);
  let active=true;
  seekMediaWithFreeze(video,40,{audio,canResume:()=>active});
  active=false;
  video.finish();
  assert.equal(video.plays,0);
  assert.equal(audio.plays,0);
});
