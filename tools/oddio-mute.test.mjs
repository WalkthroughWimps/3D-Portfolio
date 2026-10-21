import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK_MUTE,muteOffset,stepTrackMute,guidedMutePoint} from '../_1-about/faces/odd/track-mute.mjs';
import {ribbonPoint,RIBBON,laneHeight} from '../_1-about/faces/odd/ribbon-path.mjs';

test('reader withdrawal is bounded, symmetric and returns flat before the shoulder rollers',()=>{
  assert.equal(muteOffset(0),-TRACK_MUTE.depth);
  for(let i=0;i<=1000;i++){
    const x=i/1000*.8,offset=muteOffset(x);
    assert.equal(offset,muteOffset(-x));assert.ok(offset<=0&&offset>=-TRACK_MUTE.depth);
    if(x>=TRACK_MUTE.halfSpan)assert.equal(offset,0);
  }
  for(const x of[-.4,-.34,-.28,.28,.34,.4])assert.equal(muteOffset(x),0);
  for(const edge of[TRACK_MUTE.flatSpan,TRACK_MUTE.halfSpan])assert.ok(Math.abs((muteOffset(edge+.000001)-muteOffset(edge-.000001))/.000002)<.001);
});
test('muting is reversible, frame-rate independent and reduced motion is immediate',()=>{
  const evolve=(dt,muted,value=0,seconds=1)=>{for(let i=0;i<Math.round(seconds/dt);i++)value=stepTrackMute(value,muted,dt);return value;};
  assert.ok(Math.abs(evolve(1/30,true)-evolve(1/120,true))<.00001);
  assert.equal(evolve(1/60,true,0,2),1);assert.equal(evolve(1/60,false,1,2),0);
  assert.equal(stepTrackMute(.3,true,0,true),1);assert.equal(stepTrackMute(.7,false,0,true),0);
  assert.equal(stepTrackMute(.4,true,0),.4);
});
test('lowered lanes retain their height, time mapping, reel paths and reader clearance',()=>{
  for(let lane=0;lane<4;lane++)for(const position of[0,30,60]){
    for(let i=0;i<=RIBBON.rows;i++){
      const t=i/RIBBON.rows,p=ribbonPoint(t,position,0,lane),z=p.z+(t>=.30&&t<=.70?muteOffset(p.x):0);
      if(t<.30||t>.70)assert.equal(z,p.z);
      else{assert.equal(p.y,laneHeight(lane));if(Math.abs(p.x)<.004)assert.ok(z<.21);}
      assert.ok(Number.isFinite(z));
    }
  }
});


test('front reader pushes wool inward beneath a clear playhead cover',()=>{
  for(const amount of[0,.25,.5,.75,1])for(let lane=0;lane<4;lane++){
    const p=guidedMutePoint(ribbonPoint(.5,30,0,lane),amount),readerZ=TRACK_MUTE.rollerZ-TRACK_MUTE.depth*amount;
    assert.ok(readerZ-TRACK_MUTE.rollerRadius-p.z>=.00099);
    assert.ok(TRACK_MUTE.playheadZ-.004>readerZ+TRACK_MUTE.rollerRadius);
    assert.equal(p.y,laneHeight(lane));
  }
});
