import test from 'node:test';
import assert from 'node:assert/strict';
import {armPose, ARM_LAYOUT, segmentGap} from '../_1-about/faces/odd/arm-motion.mjs';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const tip=p=>p.wrist.map((v,i)=>v+p.toolDirection[i]*ARM_LAYOUT.toolLength);

test('rigid links and fixed risers retain their lengths across normal and muted work',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(const x of[.06,.12,.168])for(const z of[.202,.225,.251])for(let step=0;step<=200;step++){
    const p=armPose(side,lane,step/200,{x:side*x,surface:{y:.075*(1.5-lane),z}});
    for(const[a,b,length]of[[p.base,p.shoulder,ARM_LAYOUT.shoulderLift],[p.shoulder,p.elbow,ARM_LAYOUT.upper],[p.elbow,p.knuckle,ARM_LAYOUT.forearm],[p.knuckle,p.wrist,ARM_LAYOUT.hand]])assert.ok(Math.abs(distance(a,b)-length)<1e-10);
    assert.deepEqual(p.base,[side*ARM_LAYOUT.baseX,side*ARM_LAYOUT.restY,ARM_LAYOUT.baseZ]);
    for(const point of[p.shoulder,p.elbow,p.knuckle,p.wrist])assert.ok(point[0]*side>=.0439999);
    assert.ok(p.elbow[2]>=ARM_LAYOUT.restZ-1e-10);
  }
});
test('subframe sampling has no discrete elbow branch jumps',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(const x of[.06,.12,.168]){
    let previous;
    for(let step=0;step<=10000;step++){
      const p=armPose(side,lane,step/10000,{x:side*x,surface:{y:.075*(1.5-lane),z:.205}});
      if(previous)for(const joint of['elbow','knuckle','wrist'])assert.ok(distance(p[joint],previous[joint])<.002,`${side}/${lane}/${x}/${step}/${joint}`);
      previous=p;
    }
  }
});
test('needle and unpicker meet the same supplied cloth surface without a fixed-depth approximation',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(const z of[.202,.224,.251]){
    const surface={x:side*.12,y:.075*(1.5-lane),z};
    const p=armPose(side,lane,.5,{surface,x:surface.x,working:true,phase:0});
    assert.ok(distance(tip(p),[surface.x,surface.y,surface.z])<1e-12);
    assert.ok(segmentGap(p.shoulder,p.elbow,p.wrist,tip(p))>.01);
    assert.ok(segmentGap(p.elbow,p.knuckle,p.wrist,tip(p))>.01);
  }
});
test('the tool lifts before crossing lanes and turns down before the contact approach',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++){
    const rest=armPose(side,lane,0),flap=armPose(side,lane,.04),lifted=armPose(side,lane,.12),contact=armPose(side,lane,.28),parked=armPose(side,lane,.96);
    assert.equal(flap.reach,0,'Flap finishes opening before either link unfolds');
    assert.equal(flap.flapOpen,1);
    assert.equal(parked.reach,0,'Links finish parking before the flap closes');
    assert.equal(parked.flapOpen,1);
    assert.ok(lifted.elbow[2]>rest.elbow[2]+.05,'Elbow lifts before lane crossing');
    for(let step=0;step<=20;step++){
      const pose=armPose(side,lane,step/100);
      if(pose.wrist[1]*side<.15)assert.ok(tip(pose)[2]>.31,'The tool clears the track before crossing it');
    }
    assert.equal(contact.toolDirection[2],-1);
    assert.ok(distance(tip(contact),contact.work)<1e-12);
  }
});

test('idle and unused arms double back inside their own panel-to-track gap',()=>{
  for(const side of[-1,1])for(let lane=0;lane<4;lane++)for(const progress of[0,.2,.5,.8,1]){
    const parked=armPose(side,lane,progress,{active:false,working:true,phase:1.3});
    const rest=armPose(side,0,0);
    for(const joint of['base','shoulder','elbow','knuckle','wrist'])assert.deepEqual(parked[joint],rest[joint]);
    for(const point of[parked.shoulder,parked.elbow,parked.knuckle,parked.wrist,tip(parked)]){
      assert.ok(point[1]*side-.006>.15,'Entire working joint envelope stays outside all four cloth tracks');
      assert.ok(point[1]*side<=.1840001,'Fold remains on the inner edge of its control panel');
    }
    assert.ok((parked.elbow[0]-parked.shoulder[0])*side<0,'Upper link folds inward from its corner socket');
    assert.ok((parked.knuckle[0]-parked.elbow[0])*side>0,'Forearm doubles back toward the corner');
    assert.ok(parked.elbow[0]*side>.12&&parked.wrist[0]*side<.40,'Fold stays inside its panel span');
    assert.ok(distance(armPose(side,lane,1).wrist,parked.wrist)<1e-12,'Finishing work returns to the same gap');
  }
});
