import {prepareFocusContacts} from './focus-contact-path.mjs';
self.onmessage=({data})=>{try{const started=performance.now(),steps=(data.samples.length-1)/2;const offsets=prepareFocusContacts(t=>data.samples[Math.round(t*steps*2)],steps);self.postMessage({offsets,solveMs:performance.now()-started});}catch(error){self.postMessage({error:error.message});}};
