import * as THREE from 'three';
import {prefersReducedMotion} from '../../_7-shared-scripts/core/motion-preference.js';

const distances = Object.freeze({about: .08, refs: .09, notes: .10, odd: .10, clock: .09});
const entries = ['about', 'refs', 'notes', 'odd', 'clock'];

/** Host-owned face travel. Face entries expose their moving root; borrowed GLTF backings stay fixed. */
export function createFaceTravel(faces) {
  let host = null, suspended = false, reduced = false;
  const states = new Map();
  const cameraPoint = new THREE.Vector3();

  function bind(id) {
    const face=faces.get(id),part=face?.travelPart;
    if (!part) return null;
    const prior=states.get(id);
    if (prior?.part===part) return prior;
    if (prior) prior.part.position.copy(prior.base);
    const mount=face.travelMount, axis=new THREE.Vector3(...(face.travelAxis||mount.normal)).normalize();
    const state={id,part,base:part.position.clone(),axis,normal:new THREE.Vector3(...mount.normal).normalize(),
      amount:0,velocity:0,target:0,candidate:false,elapsed:0,focused:false};
    states.set(id,state); return state;
  }

  function update(dt) {
    if (!host || suspended) return;
    const step=THREE.MathUtils.clamp(dt,0,.05);
    const motionReduced=reduced||prefersReducedMotion();
    host.camera.getWorldPosition(cameraPoint);
    for (const id of entries) {
      const state=bind(id); if (!state) continue;
      const enabled=host.settings?.about?.[id]?.enabled!==false && state.part.visible;
      const space=host.layout.space(id),local=space.worldToLocal(cameraPoint.clone()).normalize();
      const facing=local.dot(state.normal),candidate=enabled && facing>(state.focused?.35:.5);
      if (candidate!==state.candidate) {state.candidate=candidate;state.elapsed=0;}
      else state.elapsed+=step;
      if (motionReduced) state.focused=candidate;
      else if (state.elapsed>=(candidate?.06:.45)) state.focused=candidate;
      state.target=enabled && state.focused?distances[id]:0;
      if (motionReduced) {state.amount=state.target;state.velocity=0;}
      else {
        state.velocity=THREE.MathUtils.clamp(state.velocity+(68*(state.target-state.amount)-15*state.velocity)*step,-.5,.5);
        state.amount+=state.velocity*step;
        if (Math.abs(state.target-state.amount)<1e-5 && Math.abs(state.velocity)<1e-4) {state.amount=state.target;state.velocity=0;}
      }
      state.amount=THREE.MathUtils.clamp(state.amount,0,distances[id]);
      state.part.position.copy(state.base).addScaledVector(state.axis,state.amount);
      state.part.updateWorldMatrix(true,true);
    }
  }

  function detach() {
    for (const state of states.values()) state.part.position.copy(state.base);
    states.clear();host=null;suspended=false;
  }
  return {attach(context) {detach();host=context;},update,
    applySettings(snapshot) {if(host)host.settings=snapshot;reduced=Boolean(snapshot.accessibility?.reducedMotion);},
    suspend() {suspended=true;},resume() {suspended=false;},detach,dispose:detach,
    get states() {return states;}};
}
