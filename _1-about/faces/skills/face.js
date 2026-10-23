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
  let assembly = null, settingsControls = null, unregister = null, inset = null, snapshot = null, beanBags = null, container = null, visuals = null, camera = null, controls = null, cube = null;
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
    camera = controls = cube = null;
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
      ({cube, camera, controls} = context);
      const {gltf, manifest, renderer, canvas} = context;
      assembly = createCardAssembly({model: cube, gltf, manifest, renderer, camera, autoFocus: true, interactive: true,
        onSelect: id => settingsControls?.selectPanel(id)});
      for (const node of [assembly.faceCarrier?.group || assembly.rig.deployNode, ...['V16 Concealed Stationary Bearing Stator GLB', 'V16 Eight Fixed Mounting Spokes GLB', 'V16 Recessed Cube Mounting Ring GLB'].map(context.findNode)].filter(Boolean)) visibility.set(node, node.visible);
      applySettings(snapshot);
      const section = document.createElement('section'); section.className = 'panel-controls';
      section.innerHTML = '<div class="panel-controls-tabs" role="tablist" aria-label="Skills settings"></div><div class="panel-controls-body"></div>';
      inset = createFilamentInset({renderer, stage: canvas, field: assembly.field,
        element: document.getElementById('about-filament-inset'), title: document.getElementById('about-filament-inset-title')});
      visuals=createBeanBagVisuals();
      beanBags=createBeanBagThrower({assembly,camera,controls,canvas,getBacking:()=>binding.backing,getSettings:()=>snapshot||{},getContainer:()=>container,supply,visuals,
        getRecoveryTarget:(id,position)=>container?.getRecoveryTarget?.(id%4,position),
        onCatch:id=>container?.onCatch?.(id),onDestroy:id=>container?.onDestroy?.(id)});
      container=createBeanBagContainer({assembly,camera,canvas,supply,visuals,getSettings:()=>snapshot||{}});
      const adapter = {...assembly, hostOwnsFocus: true, inset, beanBags, frameView: () => {}, refreshLifecycle: () => assembly.refreshPolicy(),
        get userReducedMotion() { return assembly.userReducedMotion; }};
      settingsControls = mountPreviewControls(adapter, {nav: section.firstElementChild, holder: section.lastElementChild});
      unregister = initPanelShell().registerContext('skills', 'Skills', section);
      applySettings(snapshot);
    },
    update(dt) { assembly?.update(dt); if (assembly && !document.hidden) supply.visit(Boolean(assembly.motion.focused)); container?.update(dt); beanBags?.update(dt); },
    frameLayout() { return null; },
    // Keep the face fixed only while an aimed shot and its preview use world coordinates.
    get gestureActive() { return Boolean(beanBags?.gestureActive); },
    endGesture(options) { beanBags?.endGesture(options); },
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
