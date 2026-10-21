import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK_MUTE,guidedMutePoint,muteOffset,muteArc} from '../_1-about/faces/odd/track-mute.mjs';
import {RIBBON,ribbonPoint} from '../_1-about/faces/odd/ribbon-path.mjs';
import {MUTE_GLOW_RATIO,MUTE_GLOW_BYTE} from '../_1-about/faces/odd/fabric-glow.mjs';

test('both roller footprints constrain every lane above the rubber at all mute/flex extremes',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(const amount of[0,.1,.5,.9,1])for(const flex of[-.006,0,.006])for(let n=0;n<=100;n++){
    const x=side*TRACK_MUTE.shoulder+(n/100*2-1)*TRACK_MUTE.drumRadius,t=.30+.4*(x+RIBBON.halfSpan)/(2*RIBBON.halfSpan),p=guidedMutePoint(ribbonPoint(t,30,flex,lane),amount);
    assert.ok(p.z-p.free*.003-TRACK_MUTE.drumZ-TRACK_MUTE.drumRadius>=.000999);
  }
});
test('muted ramps are taut, rounded at their knees and retain pinned material time',()=>{
  const slope=x=>(muteOffset(x+.000001)-muteOffset(x-.000001))/.000002;
  for(const x of[.10,.15,.20,.24])assert.ok(Math.abs(slope(x)-slope(.15))<1e-8);
  for(const x of[TRACK_MUTE.flatSpan,TRACK_MUTE.halfSpan])assert.ok(Math.abs(slope(x))<.001);
  assert.equal(muteArc(0),0);assert.ok(muteArc(.28)>.28);
  for(const x of[-.25,-.1,0,.1,.25]){const p=guidedMutePoint(ribbonPoint(.3+.4*(x+.72)/1.44,30,.006,0),1);assert.equal(p.free,0);assert.ok(Math.abs(p.z-(TRACK_MUTE.contactZ+muteOffset(x)))<1e-12);}
});
test('muted thread mask encodes two-thirds linear glow in an sRGB texture',()=>{
  const encoded=MUTE_GLOW_BYTE/255,linear=((encoded+.055)/1.055)**2.4;
  assert.equal(MUTE_GLOW_RATIO,2/3);assert.ok(Math.abs(linear-MUTE_GLOW_RATIO)<.004);
});
