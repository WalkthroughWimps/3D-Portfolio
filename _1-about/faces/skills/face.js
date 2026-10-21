import * as THREE from 'three';
import {createModelFace} from '../model-face.js';
import {createCardAssembly} from '../../../_7-shared-scripts/panel-assembly/CardAssembly.mjs';
import {mountPreviewControls} from '../../../_7-shared-scripts/panel-assembly/preview-controls.mjs';
import {createFilamentInset} from '../../../_7-shared-scripts/panel-assembly/preview-inset.mjs';
import {initPanelShell} from '../../../debug/panel-shell.js';
import {createBeanBagThrower} from './BeanBagThrower.mjs';
import {createBeanBagContainer} from './BeanBagContainer.mjs';
import {createBeanBagSupply} from './BeanBagSupply.mjs';
import {createBeanBagVisuals} from './BeanBagVisuals.mjs';

/** Owns Skills mounting, controls, inset and their teardown; borrows cube resources. */
export function createSkillsFace() {
  const binding = createModelFace({id: 'skills', backingName: 'back.skills'});
  let assembly = null, settingsControls = null, unregister = null, inset = null, snapshot = null, beanBags = null, container = null, visuals = null, camera = null, cube = null, cubeFit = null;
  const supply = createBeanBagSupply();
  const visibility = new Map();
  function applySettings(next) {
    snapshot = next;
    const enabled = next?.about?.skills?.enabled !== false;
    const contrast = Math.max(0, Math.min(1, next?.start?.contrast ?? .5));
    const ease = contrast * contrast * (3 - 2 * contrast);
    const gain = (.08 + (2.4 - .08) * ease) / (.08 + (2.4 - .08) * .5);
    for (const [node, visible] of visibility) node.visible = enabled && visible;
    assembly?.setHostReducedMotion(Boolean(next?.accessibility?.reducedMotion));
    assembly?.faceCarrier?.setEnabled(next?.cube?.uprightFaces !== false);
    assembly?.field?.setContrastGain(gain);
    assembly?.rig?.setContrastGain(gain);
    assembly?.nameFrames?.setContrastGain(gain);
    inset?.setContrastGain(gain);
    beanBags?.setContrast(gain);
    beanBags?.syncSettings();
  }
  function detach() {
    container?.dispose(); container = null;
    beanBags?.dispose(); beanBags = null;
    visuals?.dispose(); visuals = null;
    for (const [node, visible] of visibility) node.visible = visible; visibility.clear();
    settingsControls?.dispose(); settingsControls = null;
    unregister?.(); unregister = null;
    inset?.dispose(); inset = null;
    assembly?.dispose(); assembly = null;
    camera = cube = cubeFit = null;
    const element = document.getElementById('about-filament-inset');
    if (element) element.hidden = true;
    binding.detach();
  }
  return {
    id: binding.id, backingName: binding.backingName,
    get backing() { return binding.backing; },
    get components() { return assembly ? [...assembly.motion.panels.values()].map(panel => panel.body) : []; },
    get assembly() { return assembly; },
    get beanBags() { return beanBags; },
    get beanBagSupply() { return supply; },
    get beanBagVisuals() { return visuals; },
    get beanBagContainer() { return container; },
    applySettings,
    attach(context) {
      binding.attach(context);
      ({cube, camera} = context);
      const {gltf, manifest, renderer, canvas} = context;
      cube.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(cube), inverse = cube.matrixWorld.clone().invert();
      cubeFit = [];
      for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z])
        cubeFit.push(new THREE.Vector3(x,y,z).applyMatrix4(inverse));
      assembly = createCardAssembly({model: cube, gltf, manifest, renderer, camera, autoFocus: true, interactive: true,
        onSelect: id => settingsControls?.selectPanel(id)});
      for (const node of [assembly.faceCarrier?.group || assembly.rig.deployNode, ...['V16 Concealed Stationary Bearing Stator GLB', 'V16 Eight Fixed Mounting Spokes GLB', 'V16 Recessed Cube Mounting Ring GLB'].map(context.findNode)].filter(Boolean)) visibility.set(node, node.visible);
      applySettings(snapshot);
      const section = document.createElement('section'); section.className = 'panel-controls';
      section.innerHTML = '<div class="panel-controls-tabs" role="tablist" aria-label="Skills settings"></div><div class="panel-controls-body"></div>';
      inset = createFilamentInset({renderer, stage: canvas, field: assembly.field,
        element: document.getElementById('about-filament-inset'), title: document.getElementById('about-filament-inset-title')});
      const adapter = {...assembly, hostOwnsFocus: true, inset, frameView: () => {}, refreshLifecycle: () => assembly.refreshPolicy(),
        get userReducedMotion() { return assembly.userReducedMotion; }};
      settingsControls = mountPreviewControls(adapter, {nav: section.firstElementChild, holder: section.lastElementChild});
      unregister = initPanelShell().registerContext('skills', 'Skills', section);
      visuals=createBeanBagVisuals();
      beanBags=createBeanBagThrower({assembly,camera,canvas,getBacking:()=>binding.backing,getSettings:()=>snapshot||{},getContainer:()=>container,supply,visuals,
        getRecoveryTarget:(id,position)=>container?.getRecoveryTarget?.(id,position),
        onCatch:id=>container?.onCatch?.(id),onDestroy:id=>container?.onDestroy?.(id)});
      container=createBeanBagContainer({assembly,camera,canvas,supply,visuals,getSettings:()=>snapshot||{}});
      applySettings(snapshot);
    },
    update(dt) { assembly?.update(dt); if (assembly && !document.hidden) supply.visit(Boolean(assembly.motion.focused)); container?.update(dt); beanBags?.update(dt); },
    frameLayout({bounds, availableRight}) {
      if (!beanBags?.mode || !assembly?.motion.focused || !camera || !cubeFit || !container) return null;
      camera.updateMatrixWorld(true);cube.updateMatrixWorld(true);container.root.updateMatrixWorld(true);
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
      let maxX = 0, maxY = 0;
      for (const corner of cubeFit) {
        const point = corner.clone().applyMatrix4(cube.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        const depth = Math.max(camera.near + .01, -point.z - .07);
        maxX = Math.max(maxX, (Math.abs(point.x) + .07) / (depth * tan * camera.aspect));
        maxY = Math.max(maxY, (Math.abs(point.y) + .07) / (depth * tan));
      }
      // The basket is mounted below the cube; include its actual carriage without
      // fitting temporary projectiles or changing the shared camera from this face.
      const basket = new THREE.Box3().setFromObject(container.root);
      if (!basket.isEmpty()) for (const x of [basket.min.x, basket.max.x]) for (const y of [basket.min.y, basket.max.y]) for (const z of [basket.min.z, basket.max.z]) {
        const point = new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);
        const d = Math.max(camera.near + .01, -point.z - .06);
        maxX = Math.max(maxX, (Math.abs(point.x) + .06) / (d * tan * camera.aspect));
        maxY = Math.max(maxY, (Math.abs(point.y) + .06) / (d * tan));
      }
      const horizontal = Math.max(.1, (availableRight - 32) / bounds.width);
      const vertical = Math.max(.1, (bounds.height - 32) / bounds.height);
      return {zoom: Math.min(.84, horizontal / Math.max(.001,maxX), vertical / Math.max(.001,maxY)),
        launchClearance: beanBags.launchStandoff + .16};
    },
    // Keep the face fixed while an aimed shot and its preview use world coordinates.
    get gestureActive() { return Boolean(beanBags?.mode || beanBags?.gestureActive); },
    endGesture() { beanBags?.endGesture(); },
    afterRender({drawer}) {
      const element = document.getElementById('about-filament-inset'), freeRight = drawer?.getBoundingClientRect().left ?? innerWidth;
      if (!element) return;
      const show = settingsControls && inset?.state.enabled && !drawer?.classList.contains('is-closed') && freeRight >= 250 && settingsControls.activeTab === 'Filaments';
      element.hidden = !show;
      if (show) { element.style.right = `${Math.max(14, innerWidth - freeRight + 14)}px`; inset.render(assembly?.effectElapsed || 0); }
    },
    suspend() { container?.suspend(); beanBags?.suspend(); assembly?.suspend(); }, resume() { assembly?.resume(); beanBags?.resume(); container?.resume(); }, detach, dispose: detach
  };
}
