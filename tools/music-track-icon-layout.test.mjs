import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { layoutMusicTrackIcons, layoutSelectedMusicTrackIcons, drawMusicTrackIcon, withMusicCanvasState } from '../_5-music/music-track-icon-layout.mjs';

function fakeCanvas() {
  const stack = [];
  return {
    scaleValue: 1, clipped: false, arcs: [], strokes: [],
    save() { stack.push({scaleValue: this.scaleValue, clipped: this.clipped}); },
    restore() { Object.assign(this, stack.pop()); },
    scale(x) { this.scaleValue *= x; },
    beginPath() {}, closePath() {}, fill() {},
    clip() { this.clipped = true; },
    arc(x, y, radius) { assert(Number.isFinite(radius) && radius > 0); this.arcs.push(radius); },
    stroke() { this.strokes.push({color: this.strokeStyle, width: this.lineWidth}); }
  };
}

test('track icons skip invalid radii and never draw invalid shrinking rings', () => {
  for (const radius of [NaN, Infinity, -1, 0, .005, .5, 1, 1.001, 25]) {
    const ctx = fakeCanvas();
    drawMusicTrackIcon(ctx, {x: 4, y: 5, r: radius, alpha: 1}, {color: '#abc', hover: false});
    assert(ctx.arcs.every(r => Number.isFinite(r) && r > 0));
    assert.equal(ctx.arcs.length, radius > 0 && Number.isFinite(radius) ? (radius > 1 ? 2 : 1) : 0);
    if (radius === 25) assert.deepEqual(ctx.strokes, [{color: '#abc', width: 2}]);
  }
});

test('an icon drawing failure restores clipping and the enclosing scale for later frames', () => {
  const ctx = fakeCanvas();
  assert.throws(() => withMusicCanvasState(ctx, () => {
    ctx.scale(.3);
    drawMusicTrackIcon(ctx, {x: 4, y: 5, r: 10, alpha: 1}, {
      color: '#abc', image: {complete: true, naturalWidth: 10},
      drawImage() { throw new Error('image failed'); }
    });
  }), /image failed/);
  assert.equal(ctx.scaleValue, 1);
  assert.equal(ctx.clipped, false);
  withMusicCanvasState(ctx, () => drawMusicTrackIcon(ctx, {x: 4, y: 5, r: 10, alpha: 1}, {color: '#def'}));
  assert.equal(ctx.scaleValue, 1);
  assert.equal(ctx.clipped, false);
  assert.equal(ctx.strokes.at(-1).color, '#def');
});

const schemaSource = readFileSync(new URL('../_7-shared-scripts/core/settings-schema.js', import.meta.url), 'utf8');
const easingSource = readFileSync(new URL('../_7-shared-scripts/core/transform-easing.js', import.meta.url), 'utf8');
const SETTINGS_FIELDS = runInNewContext(`${easingSource.replace(/\bexport /g, '')}\n${schemaSource.replace(/^import .*;$/gm, '').replace(/\bexport /g, '')}\nSETTINGS_FIELDS`);

test('each selected icon centers and grows while other slots shrink without changing their identities', () => {
  const circles=layoutMusicTrackIcons({leftW:480,cellW:170,cellH:51,titleY:38,nameY:528,trackCount:6}).circles;
  for(let selectedIndex=0;selectedIndex<6;selectedIndex++){
    for(const progress of [0,.5,1]){
      const result=layoutSelectedMusicTrackIcons(circles,{selectedIndex,progress,leftW:480,height:614});
      assert.equal(result.length,6);
      if(progress===1){
        assert.equal(result[selectedIndex].x,240);
        assert(result[selectedIndex].r>circles[selectedIndex].r);
        assert.deepEqual(result.map(c=>c.interactive),circles.map((_,i)=>i===selectedIndex));
        assert(result.every((c,i)=>i===selectedIndex||c.r===0&&c.alpha===0));
      }
      if(progress===0) assert.deepEqual(result.map(({x,y,r})=>({x,y,r})),circles);
    }
  }
});

function fixture(H, settings = {}) {
  const cellH = H / 12;
  const cellW = H / 6;
  const leftW = cellW * 3.5;
  const titleY = Math.round(cellH * .75);
  const baselineRadius = Math.min((leftW - Math.round(cellW * .14) * 2) * .35, cellH * .98);
  const nameY = Math.round(Math.round(cellH * 4.25) + baselineRadius + cellH * .55);
  return { ...layoutMusicTrackIcons({ leftW, cellW, cellH, titleY, nameY, ...settings }), leftW, titleY, nameY };
}

test('four icons use two columns and two rows, growing to three rows for six', () => {
  for(const H of [256,512,1024]) for(const trackCount of [4,5,6]) for(const verticalOffset of [0,.22,.34]) for(const horizontalSpacing of [.12,.36]) for(const iconSize of [.16,.32]) {
    const result = fixture(H,{trackCount,verticalOffset,horizontalSpacing,iconSize});
    assert.equal(result.circles.length,trackCount);
    assert.equal(result.circles[0].x,result.circles[1].x);
    assert.equal(result.circles[0].y,result.circles[2].y);
    assert.equal(result.circles[1].y,result.circles[3].y);
    assert(result.circles[0].x < result.circles[2].x);
    assert.ok(result.circles[1].y>result.circles[0].y);
    for(const circle of result.circles) {
      assert.ok(circle.y-circle.r>=result.area.top-1e-9);
      assert.ok(circle.y+circle.r<=result.area.bottom+1e-9);
      assert.ok(circle.x-circle.r>=0 && circle.x+circle.r<=result.leftW);
    }
    for(let i=0;i<trackCount;i++) for(let j=i+1;j<trackCount;j++) {
      const a=result.circles[i],b=result.circles[j];
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.r+b.r-1e-9);
    }
  }
});

test('default icons sit between the fixed heading and song box with symmetric outer positions', () => {
  const result = fixture(512);
  const [middle, left, right] = result.circles;
  assert.equal(left.y, right.y);
  assert.equal(left.r, right.r);
  assert.equal(middle.r, left.r);
  assert.ok(Math.abs((middle.y + left.y) / 2 - result.area.midY) < 1e-9);
  assert.ok(Math.abs(left.x + right.x - result.leftW) < 1e-9);
  assert.ok(middle.y - middle.r >= result.area.top);
  assert.ok(left.y + left.r <= result.area.bottom);
  assert.ok(left.x - left.r > 0 && right.x + right.r < result.leftW);
});

test('separating the top and side rows permits a larger shared radius', () => {
  const flat = fixture(512, {iconSize: .32, horizontalSpacing: .26, verticalOffset: 0});
  const separated = fixture(512, {iconSize: .32, horizontalSpacing: .26, verticalOffset: .15});
  assert.ok(separated.circles[0].r > flat.circles[0].r);
});

test('extreme saved settings cannot send icon circles into heading, name box, or side borders', () => {
  for (const H of [320, 410, 512]) {
    for (const iconSize of [.16, .32]) {
      for (const horizontalSpacing of [.12, .36]) for (const verticalOffset of [0, .34]) {
        const result = fixture(H, { iconSize, horizontalSpacing, verticalOffset });
        assert.ok(result.circles.every(circle => circle.r === result.circles[0].r));
        for (const circle of result.circles) {
          assert.ok(circle.y - circle.r >= result.area.top - 1e-9);
          assert.ok(circle.y + circle.r <= result.area.bottom + 1e-9);
          assert.ok(circle.x - circle.r >= 0);
          assert.ok(circle.x + circle.r <= result.leftW);
        }
        for (let i = 0; i < result.circles.length; i++) for (let j = i + 1; j < result.circles.length; j++) {
          const a = result.circles[i], b = result.circles[j];
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 1e-9, `icons ${i}/${j} separate at ${H}`);
        }
      }
    }
  }
});

test('Music icon settings are persisted, parsed and clamped independently', () => {
  for (const [key, max] of [
    ['music.trackIconSize', .32],
    ['music.trackIconSpacing', .36], ['music.trackIconVerticalOffset', .34]
  ]) {
    assert.ok(SETTINGS_FIELDS[key]?.key);
    assert.equal(SETTINGS_FIELDS[key].parse(10), max);
    assert.ok(Number.isFinite(SETTINGS_FIELDS[key].default));
  }
  assert.equal(SETTINGS_FIELDS['music.trackOuterIconSize'], undefined);
  assert.deepEqual(fixture(512,{outerSize: .7}).circles, fixture(512,{outerSize: 1.3}).circles);
});
