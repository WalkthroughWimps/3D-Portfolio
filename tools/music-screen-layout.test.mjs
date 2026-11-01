import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleInstrumentSlide, layoutInstrumentPanels, clipInstrumentHit, musicPlayerRect, layoutMusicVideoZones, fitRecorderPreview, recorderPreviewSource } from '../_5-music/music-screen-layout.mjs';

test('instrument button reveals and clips the entire second panel with reversible motion', () => {
  const base = { width: 2400, panelWidth: 600, rowTop: 100, rowHeight: 150, gap: 24, divider: 1200 };
  const single = layoutInstrumentPanels({ ...base, progress: 0 });
  const dual = layoutInstrumentPanels({ ...base, progress: 1 });
  assert.equal(single.button.x, single.rightX);
  assert.equal(single.button.w, single.button.h);
  assert(single.button.h < base.rowHeight * 2 / 3);
  assert.equal(dual.button.x, dual.rightX + base.panelWidth + base.gap);
  assert(dual.leftX < single.leftX);
  assert(dual.button.x > single.button.x);
  assert(dual.button.x + dual.button.w < base.width);
  const midway = layoutInstrumentPanels({ ...base, progress: .5 });
  assert(midway.leftX < single.leftX && midway.leftX > dual.leftX);
  assert.equal(clipInstrumentHit({ x: midway.clipRight + 1, y: 100, w: 30, h: 30 }, midway.clipRight), null);
  assert.equal(clipInstrumentHit({ x: midway.clipRight - 10, y: 100, w: 30, h: 30 }, midway.clipRight).w, 10);
});

test('reversing an in-flight transition starts at its current position', () => {
  const opening = { from: 0, to: 1, start: 0, duration: 500 };
  const at = sampleInstrumentSlide(opening, 200);
  const closing = { from: at, to: 0, start: 200, duration: 500 };
  assert.equal(sampleInstrumentSlide(closing, 200), at);
  assert(sampleInstrumentSlide(closing, 400) < at);
  assert.equal(sampleInstrumentSlide(closing, 700), 0);
  assert.equal(sampleInstrumentSlide({ ...closing, duration: 0 }, 200), 0);
});

test('video player touches both dividers and recorder covers its zone without distortion', () => {
  for (const [w, h] of [[2048, 650], [2048, 520], [1024, 400]]) {
    const r = musicPlayerRect(w, h);
    assert.equal(r.x, w * 3.5 / 12);
    assert(Math.abs(r.x + r.w - w * 8.5 / 12) < 1e-8);
    assert(r.y >= 0 && r.y + r.h <= h);
  }
  const image = fitRecorderPreview({ x: 0, y: 80, w: 600, h: 300 });
  assert.deepEqual(image, { x: 0, y: 80, w: 600, h: 300 });
  const source = recorderPreviewSource(2707, 558, image);
  assert.equal(source.x, 0);
  assert(source.w < 2707 && source.h <= 558);
  assert(Math.abs(source.w / source.h - image.w / image.h) < 1e-8);
});

test('video expands to screen height, sharing movement between dividers and clipping the recorder',()=>{
  const width=2048,height=614;
  const idle=layoutMusicVideoZones(width,height,0);
  const full=layoutMusicVideoZones(width,height,1);
  assert(full.leftW<idle.leftW);
  assert(Math.abs(idle.leftW-full.leftW-(full.rightX-idle.rightX))<1e-8);
  assert.equal(full.video.y,0);
  assert.equal(full.video.h,height);
  assert.equal(full.video.w,height*16/9);
  assert(full.rightX>idle.rightX);
  assert(full.rightScale<1 && full.leftScale<1);
  assert(full.recorder.x>full.rightX);
  assert(full.recorder.x+full.recorder.w>width);
  for(const progress of [0,.1,.5,.9,1]){
    const zones=layoutMusicVideoZones(width,height,progress);
    assert(Math.abs(zones.video.w/zones.video.h-16/9)<1e-10);
    assert(Math.abs(zones.video.x+zones.video.w/2-width/2)<1e-8);
    assert(Math.abs(zones.leftW-zones.rightW)<1e-8);
    assert.equal(zones.video.x+zones.video.w,zones.rightX);
    assert(zones.rightW>=width*.1);
  }
});
