import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const ASSET = new URL('../../../assets/butterfly/butterfly-flap.glb', import.meta.url).href;
const clamp = value => Math.max(0, Math.min(1, value));
const WING_SPAN = .08; // 55% of the default .146-wide lower arch.
const REST_PITCH = Math.PI / 2;
const DISPLAY_PITCH = REST_PITCH + 40 * Math.PI / 180;

/** A single borrowed-camera, door-triggered visitor. No independent render loop. */
export function createRefsButterfly(THREE, placement, doors, options, loader = new GLTFLoader()) {
  const root = new THREE.Group(); root.name = 'refs.butterfly'; root.userData.refsTransient = true;
  const turn = new THREE.Group(); root.add(turn);
  let current = options, portal = null, scene = null, model = null, mixer = null, action = null;
  let camera = null, canvas = null, state = 'loading', elapsed = 0, reduced = false;
  let suspended = false, disposed = false, armed = true;
  let generation = 0, launchStart = null, launchEnd = null, launchMiddle = null;
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(state); };
  const setState = next => { if (state !== next) { state = next; emit(); } };
  function disposeRig(rig) {
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    rig.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [node.material].flat().filter(Boolean)) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
      if (node.skeleton) skeletons.add(node.skeleton);
    });
    rig.removeFromParent();
    for (const skeleton of skeletons) skeleton.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) {
      texture.dispose();
      texture.source?.data?.close?.(); // GLTFLoader may decode the owned image as an ImageBitmap.
    }
  }
  function perch() {
    portal = doors.getPortal(current.butterflyHost);
    if (!scene || !portal) return;
    portal.interiorRoot.add(root);
    root.position.set(0, portal.frontY + .022 - portal.interiorRoot.position.y, 0);
    root.rotation.set(0, 0, 0); root.scale.setScalar(1); turn.rotation.z = 0;
    model.rotation.x = REST_PITCH;
    scene.visible = true;
  }
  function reset() {
    elapsed = 0; launchStart = launchEnd = launchMiddle = null;
    armed = true;
    if (scene) { perch(); scene.visible = current.butterflyEnabled;
      setState(current.butterflyEnabled ? 'perched' : 'disabled'); }
  }
  function launch() {
    if (!scene) return;
    root.updateWorldMatrix(true, false);
    launchStart = root.getWorldPosition(new THREE.Vector3());
    placement.attach(root);
    if (camera && canvas) {
      camera.updateWorldMatrix(true, false);
      const projected = launchStart.clone().project(camera);
      const direction = projected.x >= 0 ? 1 : -1;
      launchEnd = new THREE.Vector3(direction * 1.45, 1.35, projected.z).unproject(camera);
      const mid = new THREE.Vector3(projected.x + direction * .18, projected.y + .22, projected.z).unproject(camera);
      launchMiddle = mid;
    } else {
      launchMiddle = launchStart.clone().add(new THREE.Vector3(-.1, -.1, .1));
      launchEnd = launchStart.clone().add(new THREE.Vector3(-3, -1, 2));
    }
    elapsed = 0; setState('flying');
  }
  function load() {
    const ticket = ++generation;
    loader.load(ASSET, gltf => {
      if (disposed || ticket !== generation) { disposeRig(gltf.scene); return; }
      scene = gltf.scene;
      model = new THREE.Group(); model.rotation.x = REST_PITCH; model.add(scene);
      turn.add(model);
      model.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(model);
      const span = Math.max(bounds.getSize(new THREE.Vector3()).x, .001);
      model.scale.setScalar(WING_SPAN / span);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.copy(center).multiplyScalar(-WING_SPAN / span);
      mixer = new THREE.AnimationMixer(scene);
      if (gltf.animations[0]) { action = mixer.clipAction(gltf.animations[0]); action.play(); mixer.update(0); }
      perch(); scene.visible = current.butterflyEnabled;
      setState(current.butterflyEnabled ? 'perched' : 'disabled');
    }, undefined, () => { if (!disposed && ticket === generation) setState('load failed'); });
  }
  load();
  return {
    root, get status() { return state; }, subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    setViewContext(value) { camera = value?.camera ?? null; canvas = value?.canvas ?? null; },
    configure(next) {
      if (disposed) return;
      const changedHost = next.butterflyHost !== current.butterflyHost;
      current = next;
      root.visible = Boolean(next.cabinetEnabled && next.cabinetFrontEnabled && !next.cabinetCutaway);
      if (!next.butterflyEnabled) { scene && (scene.visible = false); setState('disabled'); return; }
      if (changedHost || state === 'disabled') reset();
      else if (scene && state === 'perched') perch();
    },
    reset,
    setReducedMotion(value) {
      reduced = Boolean(value);
      if (reduced && ['emerging', 'turning', 'flapping', 'flying'].includes(state)) {
        root.removeFromParent(); setState('gone');
      }
    },
    suspend() { suspended = true; }, resume() { suspended = false; },
    update(dt) {
      if (disposed || suspended || !current.butterflyEnabled || !scene) return;
      const door = doors.getState(current.butterflyHost);
      if (!door) return;
      if (state === 'perched') {
        if (!door.openTarget && door.openAmount < .05) armed = true;
        if (armed && door.openTarget && door.openAmount >= .55) {
          armed = false;
          if (reduced) { root.removeFromParent(); setState('gone'); }
          else { elapsed = 0; setState('emerging'); }
        }
      } else if (state === 'emerging' || state === 'turning' || state === 'flapping') {
        if (!door.openTarget) { reset(); return; }
        elapsed += Math.max(0, dt);
        if (state === 'emerging') {
          const t = clamp(elapsed / .22);
          root.position.y = portal.frontY + .022 - portal.interiorRoot.position.y - .055 * t;
          model.rotation.x = REST_PITCH + (DISPLAY_PITCH - REST_PITCH) * t;
          if (t === 1) { elapsed = 0; setState('turning'); }
        } else if (state === 'turning') {
          const t = clamp(elapsed / .46); turn.rotation.z = Math.PI * (t * t * (3 - 2 * t));
          mixer?.update(Math.max(0, dt));
          if (t === 1) { elapsed = 0; setState('flapping'); }
        } else {
          mixer?.update(Math.max(0, dt));
          if (elapsed >= .75) launch();
        }
      } else if (state === 'flying') {
        elapsed += Math.max(0, dt);
        const t = clamp(elapsed / .8), world = new THREE.Vector3();
        if (t < .25) world.copy(launchStart).lerp(launchMiddle, t / .25);
        else world.copy(launchMiddle).lerp(launchEnd, (t - .25) / .75);
        root.position.copy(placement.worldToLocal(world));
        root.scale.setScalar(1 + .35 * t);
        const tangent = (t < .25 ? launchMiddle.clone().sub(launchStart) :
          launchEnd.clone().sub(launchMiddle)).normalize();
        tangent.applyQuaternion(placement.getWorldQuaternion(new THREE.Quaternion()).invert());
        root.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tangent.normalize());
        root.rotateOnAxis(new THREE.Vector3(0, -1, 0), Math.sin(t * 26) * .10);
        mixer?.update(Math.max(0, dt));
        if (t === 1) { root.removeFromParent(); setState('gone'); }
      } else if (state === 'gone' && !door.openTarget && door.openAmount < .05) reset();
    },
    dispose() {
      if (disposed) return; disposed = true; ++generation;
      listeners.clear(); action?.stop();
      if (scene) { mixer?.stopAllAction(); mixer?.uncacheRoot(scene); disposeRig(scene); }
      root.removeFromParent();
    }
  };
}
