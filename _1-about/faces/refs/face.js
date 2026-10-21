import {createModelFace} from '../model-face.js';

/** Expose the authored Refs backing through the shared face lifecycle. */
export function createRefsFace() {
  return createModelFace({id: 'refs', backingName: 'back.refs'});
}
