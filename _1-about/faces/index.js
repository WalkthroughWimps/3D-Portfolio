import {createAboutFace} from './about/face.js';
import {createSkillsFace} from './skills/face.js';
import {createNotesFace} from './notes/face.js';
import {createClockFace} from './clock/face.js';
import {createRefsFace} from './refs/face.js';
import {createOddFace} from './odd/face.js?v=transport-ticks-1';
import {createSpeakerResponse} from './speaker-response.js';
import {createBackingControls} from './backing-controls.js';
import {createInteriorDrive} from './interior-drive.js';
import {createFaceLayout} from './face-layout.js';
import {createFaceTravel} from './face-travel.js';

export const cubeAssets = Object.freeze({
  model: new URL('../../assets/about-cube/glb/model.glb', import.meta.url),
  metadata: new URL('../../assets/panel-assembly/runtime.json', import.meta.url)
});

export function createFaceRegistry(options) {
  let layout = null;
  const faceOptions = id => ({...options, focusFace: (mount, ...args) =>
    options.focusFace(layout?.toPhysicalMount(id, mount) || mount, ...args)});
  const faces = new Map([createAboutFace(faceOptions('about')), createSkillsFace(), createNotesFace(faceOptions('notes')),
    createClockFace(faceOptions('clock')), createRefsFace(faceOptions('refs')), createOddFace(faceOptions('odd'))].map(face => [face.id, face]));
  const speakers = createSpeakerResponse();
  const backings = createBackingControls(faces), interior = createInteriorDrive(faces), travel = createFaceTravel(faces);
  let attached = false, disposed = false, suspended = false;
  const disabled = new Set();
  function each(method, ...args) { for (const face of faces.values()) if (!['update', 'afterRender', 'resume'].includes(method) || !disabled.has(face.id)) face[method]?.(...args); }
  function detach() {
    try { travel.detach(); interior.detach(); backings.detach(); speakers.detach(); for (const face of [...faces.values()].reverse()) face.detach?.(); }
    finally { layout?.restore(); layout = null; attached = false; }
  }
  return {
    get: id => faces.get(id),
    get entries() { return [...faces.values()]; },
    get interior() { return interior; },
    get travel() { return travel; },
    get layout() { return layout; },
    physicalMount(id, mount) { return layout?.toPhysicalMount(id, mount) || mount; },
    get gestureActive() { return [...faces.values()].some(face => face.gestureActive); },
    get rotating() { return [...faces.values()].some(face => face.rotating); },
    attach(context) {
      if (disposed) throw new Error('Cannot attach disposed cube faces');
      if (attached) detach();
      const nodes = new Map();
      context.cube.traverse(node => {
        nodes.set(node.name, node);
        const association = context.gltf.parser.associations.get(node);
        if (association?.nodes !== undefined) nodes.set(context.gltf.parser.json.nodes[association.nodes].name, node);
      });
      const findNode = name => nodes.get(name) || nodes.get(`${name} Export`) || null;
      try {
        layout = createFaceLayout(context.cube, context.gltf);
        for (const face of faces.values()) face.attach?.({...context, cube: layout.space(face.id),
          authoredSpace: layout.space(face.id), physicalCube: context.cube, layout, findNode});
        travel.attach({...context, layout}); speakers.attach(faces); backings.attach(); interior.attach({...context, layout}); attached = true;
      }
      catch (error) { detach(); throw error; }
    },
    update(dt, state) { if (attached && !disposed) {
      const engine = faces.get('odd')?.runtime?.engine;
      const level = engine?.getLevel() || 0;
      faces.get('about')?.setAudioLevel?.(engine?.getFishLevel() || 0);
      travel.update(dt); each('update', dt, state); backings.update(); interior.update(dt); speakers.update(dt, level);
    } },
    afterRender(state) { if (attached && !disposed) each('afterRender', state); },
    applySettings(snapshot) { if (!disposed) {
      each('applySettings', snapshot);
      for (const face of faces.values()) {
        const off = snapshot.about?.[face.id]?.enabled === false;
        if (off) { disabled.add(face.id); face.suspend?.(); }
        else if (!off && disabled.delete(face.id) && !suspended) face.resume?.();
      }
      speakers.applySettings(snapshot); backings.applySettings(snapshot); interior.applySettings(snapshot); travel.applySettings(snapshot);
    } },
    endGestures(options) { each('endGesture', options); },
    suspend() { if (!disposed) { suspended = true; travel.suspend(); interior.suspend(); speakers.suspend(); each('suspend'); } },
    resume() { if (!disposed) { suspended = false; travel.resume(); interior.resume(); speakers.resume(); each('resume'); } }, detach,
    dispose() {
      if (disposed) return; disposed = true;
      try { travel.dispose(); interior.dispose(); backings.dispose(); speakers.dispose(); for (const face of [...faces.values()].reverse()) face.dispose(); }
      finally { layout?.restore(); layout = null; attached = false; }
    }
  };
}
