import {createModelFace} from '../model-face.js';
import {createNotesWorkspace} from '../../notes/notes-face.js';

/** Notes integration boundary; the Notes chat owns the drawing implementation. */
export function createNotesFace({stage, focusFace, rotateBy, onInputOwnership} = {}) {
  const binding = createModelFace({id: 'notes', backingName: 'back.art'});
  const runtime = createNotesWorkspace({stage, onFocusFace: focusFace, onRotate: rotateBy, onInputOwnership});
  return {
    id: binding.id, backingName: binding.backingName, runtime,
    get backing() { return binding.backing; },
    get components() { return binding.components; },
    get gestureActive() { return runtime.gestureActive; },
    get rotating() { return runtime.rotating; },
    attach(context) { binding.attach(context); runtime.attach(context); },
    update(dt, {rotating = false} = {}) { runtime.update(dt, rotating || runtime.rotating); },
    frameLayout(state) { return runtime.frameLayout(state); },
    afterRender() { runtime.afterRender(); },
    endGesture() { runtime.endGesture(); },
    suspend() { runtime.suspend(); }, resume() { runtime.resume(); },
    detach() { runtime.detach(); binding.detach(); },
    dispose() { runtime.dispose(); binding.dispose(); }
  };
}
