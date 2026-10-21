import {createAboutFace} from './about/face.js';
import {createSkillsFace} from './skills/face.js';
import {createNotesFace} from './notes/face.js';
import {createClockFace} from './clock/face.js';
import {createRefsFace} from './refs/face.js';
import {createOddFace} from './odd/face.js?v=transport-ticks-1';
import {createSpeakerResponse} from './speaker-response.js';
import {createBackingControls} from './backing-controls.js';
import {createInteriorDrive} from './interior-drive.js';

export const cubeAssets = Object.freeze({
  model: new URL('../../assets/about-cube/glb/model.glb', import.meta.url),
  metadata: new URL('../../assets/panel-assembly/runtime.json', import.meta.url)
});

export function createFaceRegistry(options) {
  const faces = new Map([createAboutFace(options), createSkillsFace(), createNotesFace(options), createClockFace(options), createRefsFace(options), createOddFace(options)].map(face => [face.id, face]));
  const speakers = createSpeakerResponse();
  const backings = createBackingControls(faces), interior = createInteriorDrive(faces);
  let attached = false, disposed = false, suspended = false;
  const disabled = new Set();
  function each(method, ...args) { for (const face of faces.values()) if (!['update', 'afterRender', 'resume'].includes(method) || !disabled.has(face.id)) face[method]?.(...args); }
  function detach() { interior.detach(); backings.detach(); speakers.detach(); for (const face of [...faces.values()].reverse()) face.detach?.(); attached = false; }
  return {
    get: id => faces.get(id),
    get entries() { return [...faces.values()]; },
    get interior() { return interior; },
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
      try { each('attach', {...context, findNode}); speakers.attach(faces); backings.attach(); interior.attach(context); attached = true; }
      catch (error) { detach(); throw error; }
    },
    update(dt, state) { if (attached && !disposed) { each('update', dt, state); backings.update(); interior.update(dt); speakers.update(dt, faces.get('odd')?.runtime?.engine.getLevel() || 0); } },
    afterRender(state) { if (attached && !disposed) each('afterRender', state); },
    applySettings(snapshot) { if (!disposed) {
      each('applySettings', snapshot);
      for (const face of faces.values()) {
        const off = snapshot.about?.[face.id]?.enabled === false;
        if (off) { disabled.add(face.id); face.suspend?.(); }
        else if (!off && disabled.delete(face.id) && !suspended) face.resume?.();
      }
      speakers.applySettings(snapshot); backings.applySettings(snapshot); interior.applySettings(snapshot);
    } },
    endGestures() { each('endGesture'); },
    suspend() { if (!disposed) { suspended = true; interior.suspend(); speakers.suspend(); each('suspend'); } },
    resume() { if (!disposed) { suspended = false; interior.resume(); speakers.resume(); each('resume'); } }, detach,
    dispose() { if (disposed) return; disposed = true; interior.dispose(); backings.dispose(); speakers.dispose(); for (const face of [...faces.values()].reverse()) face.dispose(); attached = false; }
  };
}
