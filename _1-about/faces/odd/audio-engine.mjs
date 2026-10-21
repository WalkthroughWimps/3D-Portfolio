import {clampTapePosition} from './tape-bed.mjs?v=bed-1';
import {cloneClip,validClip,validateLayout,placementPlan,visibleInterval,cleanLinks,sourceTimeAt} from './clip-layout.mjs?v=panel-custom-1';
import {createLaneCircuit,LANE_DEFAULTS} from './audio-effects.mjs?v=track-meters-1';
import {sessionObject,unpackSession,wavBlob} from './session-io.mjs?v=panel-custom-1';
import {prepareAudioFile,localAudioContext,audioDeadline} from './audio-import.mjs?v=import-1';
import {capturePlan} from './capture-placement.mjs?v=capture-1';
export const LIMITS = Object.freeze({ lanes: 4, clips: 48, reel: 60, clip: 30, storage: 120, fileBytes: 20 * 1024 * 1024, sampleRate: 24000 });
export const duration = clip => (clip.out - clip.in) / clip.rate;
export const sourceSeconds = clips => [...new Set(clips.map(c => c.buffer))].reduce((sum, buffer) => sum + buffer.duration, 0);
export function fits(clips,candidate,ignore=candidate.id){return validClip(candidate)&&validateLayout([...clips.filter(c=>c.id!==ignore),candidate]);}
export function firstSlot(clips, buffer, preferred = 0) {
  for (let step = 0; step < LIMITS.lanes; step++) {
    const lane = (preferred + step) % LIMITS.lanes;
    const positions = [0, ...clips.filter(c => c.lane === lane).map(c => c.start + duration(c))].sort((a, b) => a - b);
    for (const start of positions) {
      const candidate = { buffer, lane, start, in: 0, out: buffer.duration, rate: 1 };
      if (fits(clips, candidate)) return {lane, start};
    }
  }
  throw new Error('No clear stretch of tape. Trim or remove a strip to make room.');
}

/** One source per lane; all strips in a lane share its effect circuit. */
export function createAudioEngine(onChange = () => {}, {now = () => performance.now()} = {}) {
  let context, master, meter, graphs = [], sources = [], disposed = false, generation = 0, outputMuted = false, volume = 1, siteMuted = false;
  let playing = false, origin = 0, audioOrigin = 0, position = 0, playStart = 0, playUntil = 0, loop = false, syncMs = 0, activeClips = [], playbackReturn = null, playbackSession = false, completedPlayback = false, soloClip = null;
  let direction=1,reverseBuffers=new WeakMap();
  let winding=null, playbackPending=false;
  let recorder = null, stream = null, recordTimer = null, pending = false, busy = false, recordingAt = 0, recordGeneration = 0;
  let capturePreview=null,capturePending=null,captureAnalyser=null,captureSource=null,captureReady=null,capturePrepareAt=0;
  let loading=null,loadController=null;
  const clips = [], lanes = Array.from({length: LIMITS.lanes}, () => ({...LANE_DEFAULTS})),undoStack=[],redoStack=[];
  const snapshot=()=>clips.map(cloneClip);
  function pruneHistory(){while(undoStack.length+redoStack.length>20||sourceSeconds([...clips,...undoStack.flat(),...redoStack.flat()])>180){if(undoStack.length)undoStack.shift();else if(redoStack.length)redoStack.shift();else break;}}
  function remember(){undoStack.push(snapshot());redoStack.length=0;pruneHistory();}
  const meterData = new Uint8Array(256);
  const emit = () => onChange();
  async function wake() {
    if (disposed) throw new Error('This deck has closed.');
    if (!context) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('This browser does not support Web Audio.');
      context = new Context(); master = context.createGain(); master.gain.value = outputMuted || siteMuted ? 0 : volume;
      const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.ratio.value = 16;
      meter = context.createAnalyser(); meter.fftSize = 256;
      master.connect(limiter).connect(meter).connect(context.destination);
      graphs = lanes.map(settings => createLaneCircuit(context,settings,master));
      lanes.forEach((_, i) => applyLane(i));
    }
    try{await audioDeadline(()=>context.resume(),{timeoutMs:5000,label:'starting audio output'});}
    catch{throw Error('Audio output did not start. Click Play again, or close other audio previews and retry. Your clips are still on the reel.');}
    if (disposed) throw new Error('This deck has closed.');
    return context;
  }
  function applyLane(index) {
    const graph = graphs[index], settings = lanes[index]; if (!graph) return;
    graph.apply(settings);
    if(soloClip?.lane===index&&settings.muted){const gain=graph.input.gain;if(gain.setTargetAtTime)gain.setTargetAtTime(settings.gain,context.currentTime,.015);else gain.value=settings.gain;}
  }
  function clearSources() {
    for (const source of sources) { try { source.stop(); } catch {} source.disconnect(); }
    sources = [];
    // Flush the tape echo so stop, seek and retrigger are immediately silent.
    for (const graph of graphs) graph.reset();
  }
  function clock() { return playing ? direction<0?Math.max(playUntil,playStart-Math.max(0,context.currentTime-origin)):Math.max(playStart, context.currentTime - origin) : position; }
  function reversed(buffer,ctx=context,cache=reverseBuffers){let result=cache.get(buffer);if(!result){result=ctx.createBuffer(1,buffer.length,buffer.sampleRate);const input=buffer.getChannelData(0),output=result.getChannelData(0);for(let i=0;i<input.length;i++)output[i]=input[input.length-1-i];cache.set(buffer,result);}return result;}
  function scheduleSources() {
    for (const clip of activeClips) {
      const window=visibleInterval(clip,clips),begin=direction<0?Math.min(window.end,playStart,playStart-Math.max(0,context.currentTime-audioOrigin)):Math.max(window.start,playStart,context.currentTime-audioOrigin),remaining=direction<0?begin-window.start:window.end-begin;
      if (remaining <= 0) continue;
      const source = context.createBufferSource(),effectiveReverse=Boolean(clip.reversed)!==(direction<0);source.buffer = effectiveReverse?reversed(clip.buffer):clip.buffer; source.playbackRate.value = clip.rate;
      const gain=context.createGain(),blend=clip.links?.some(l=>l.mode==='blend')?Math.SQRT1_2:1;gain.gain.value=(clip.gain??1)*blend;gain.connect(graphs[clip.lane].input);source.connect(gain);sources.push({clipId:clip.id,gain,blend,stop(){},disconnect(){gain.disconnect();}});
      const sample=sourceTimeAt(clip,begin);source.start(direction<0?audioOrigin+playStart-begin:audioOrigin+begin,effectiveReverse?Math.max(0,clip.buffer.duration-sample):sample,remaining*clip.rate);
      sources.push(source);
    }
  }
  function setSyncOffsetMs(value) {
    const number = Number(value);
    if (disposed || !Number.isFinite(number)) return;
    const next = Math.round(Math.max(-3000, Math.min(3000, number)) / 5) * 5;
    if (next === syncMs) return;
    syncMs = next;
    if (playing) {
      // Keep the visible tape steady; only reschedule audio against its clock.
      const current = clock();
      clearSources();if(direction<0){playStart=current;origin=context.currentTime;}else origin = context.currentTime - current; audioOrigin = origin + syncMs / 1000;
      scheduleSources();
    }
  }
  function cancelWinding(){if(winding){const previous=winding;winding=null;previous.resolve(false);}}
  function advanceWinding(at){
    const travel=winding;if(!travel||at<=travel.last)return;
    let remaining=Math.max(0,(at-travel.last)/1000);
    while(remaining>0&&winding===travel){
      const dt=Math.min(.02,remaining),distance=travel.target-position,sign=Math.sign(distance);
      const desired=sign*Math.min(12,Math.sqrt(72*Math.abs(distance)));
      const next=travel.velocity+Math.max(-36*dt,Math.min(36*dt,desired-travel.velocity));
      const movement=(travel.velocity+next)*.5*dt;
      if(sign===0||sign*(distance-movement)<=0){position=travel.target;travel.velocity=0;winding=null;travel.resolve(true);emit();break;}
      position=clampTapePosition(position+movement);travel.velocity=next;remaining-=dt;
    }
    travel.last=at;
  }
  function windTo(value){
    const at=now();advanceWinding(at);
    const target=clampTapePosition(value);if(winding?.target===target)return winding.done;
    const velocity=winding?.velocity??0;cancelWinding();
    if(Math.abs(target-position)<.001){position=target;emit();return Promise.resolve(true);}
    let resolve;const done=new Promise(r=>{resolve=r;});
    winding={target,last:at,velocity,resolve,done};emit();return done;
  }
  function pause() {
    advanceWinding(now());
    if (playing) position = direction<0?Math.max(playUntil,clock()):Math.min(playUntil, clock());
    playing = false; playbackPending=false; generation++; cancelWinding();clearSources(); activeClips = [];reverseBuffers=new WeakMap();if(soloClip){const lane=soloClip.lane;soloClip=null;applyLane(lane);}emit();
  }
  function stop() {
    const target=playbackSession?playbackReturn??0:0;
    pause();playbackReturn=null;playbackSession=false;completedPlayback=false;
    return windTo(target);
  }
  async function play(only = null,backwards=false) {
    if (pending || recorder || busy) throw new Error('Finish loading or recording before playback.');
    if (!clips.length) throw new Error('Feed the deck a recording or an audio file first.');
    const switchingDirection=(playing||playbackPending)&&direction!==(backwards?-1:1);
    if(playing||playbackPending){pause();if(!switchingDirection)return false;}
    if(completedPlayback){playbackReturn=null;completedPlayback=false;}
    direction=backwards?-1:1;
    const selected=only?[only]:[...clips],audible=selected.map(c=>visibleInterval(c,clips)).filter(w=>w.end>w.start);
    if(!audible.length)throw Error('These clips are outside the playable 0–60 second reel.');
    const ticket=++generation;playbackPending=true;
    const target=only?clampTapePosition(backwards?visibleInterval(only,clips).end:visibleInterval(only,clips).start):null;
    const audibleStart=Math.min(...audible.map(w=>w.start)),audibleEnd=Math.max(...audible.map(w=>w.end));
    activeClips=selected;playUntil=only?(backwards?audibleStart:audibleEnd):backwards?Math.max(0,audibleStart-.8):Math.min(60,audibleEnd+.8);
    const requestedPosition=winding?.target??position;
    const destination=target??(switchingDirection?null:backwards&&requestedPosition<=audibleStart+.001?Math.min(60,audibleEnd):!backwards&&requestedPosition>=audibleEnd-.001?0:null);
    if(playbackReturn===null)playbackReturn=destination??requestedPosition;
    playbackSession=true;
    const travel=destination===null?(winding?.done??Promise.resolve(true)):windTo(destination);
    let arrived;try{[,arrived]=await Promise.all([wake(),travel]);}catch(error){if(ticket===generation)pause();throw error;}
    if(!arrived||ticket!==generation||disposed)return false;
    playbackPending=false;clearSources();soloClip=only; if(only)applyLane(only.lane);
    playStart = position;
    // Positive offsets delay audio; negative offsets delay the visual tape so
    // the beginning of a sound is retained instead of being trimmed away.
    origin = context.currentTime + .04 + Math.max(0, -syncMs / 1000) - (backwards?0:position);
    audioOrigin = origin + syncMs / 1000;
    scheduleSources();
    playing = true; emit();return true;
  }
  function seek(value) {if(playing||playbackPending)pause();const target=clampTapePosition(value);playbackReturn=target;completedPlayback=false;return windTo(target);}
  function tick(at=now()) {
    advanceWinding(at);
    if (playing && context.currentTime >= Math.max(origin, audioOrigin) + (direction<0?playStart-playUntil:playUntil)) {
      const backwards=direction<0,wasAudition=Boolean(soloClip);pause();if(loop&&!wasAudition)void play(null,backwards).catch(() => {});else completedPlayback=true;
    }
    if(captureReady&&capturePreview?.preparing){capturePreview.prepareSeconds=Math.min(2,(performance.now()-capturePrepareAt)/1000);if(capturePreview.prepareSeconds>=2){const ready=captureReady;captureReady=null;ready(true);}}
    const elapsed=recorder&&capturePreview?Math.min(capturePreview.maxSeconds,(performance.now()-recordingAt)/1000):0;
    if(capturePreview&&recorder){capturePreview.seconds=elapsed;if(captureAnalyser){captureAnalyser.getByteTimeDomainData(meterData);let peak=0;for(const sample of meterData)peak=Math.max(peak,Math.abs(sample-128)/128);const index=Math.min(255,Math.floor(elapsed*8));capturePreview.peaks[index]=Math.max(capturePreview.peaks[index]||0,peak);}}
    return {position: recorder&&capturePreview?clampTapePosition(capturePreview.start+elapsed):clampTapePosition(clock()), recording: elapsed};
  }
  function captureCandidate(buffer,name,id,start,lane,recorded=false){if(start>=60)throw Error("Move the playhead before 60 seconds to add sound.");return {id,name,buffer,lane,start,in:0,out:Math.min(buffer.duration,LIMITS.clip,60-start),rate:1,gain:1,reversed:false,links:[],visualRecorded:recorded,visualRecordedId:recorded?id:null};}
  function finishCapture(buffer,name,{id,start,lane,recorded=false}){
    if(disposed)return;
    if(clips.length>=LIMITS.clips)throw Error('The 48-strip rack is full. Remove a strip first.');
    if(sourceSeconds(clips)+buffer.duration>LIMITS.storage+.001)throw Error('Source storage is full (120 seconds).');
    const candidate=captureCandidate(buffer,name,id,start,lane,recorded),plan=capturePlan(clips,candidate,lane);
    if(plan.conflict){capturePending={candidate,lane};emit();return null;}
    plan.candidate.visualRecorded=recorded&&plan.candidate.lane===lane;return commitPlacement(plan);
  }
  function planCapture(strategy=null){if(!capturePending)return null;return capturePlan(clips,capturePending.candidate,capturePending.lane,{strategy});}
  function resolveCapture(strategy){if(!capturePending)return null;const plan=planCapture(strategy);const clip=commitPlacement(plan);capturePending=null;emit();return clip;}
  function cancelCapture(){capturePending=null;emit();}
  function add(buffer, name, preferred) {
    if (disposed) return;
    if (clips.length >= LIMITS.clips) throw new Error('The 48-strip rack is full. Remove a strip first.');
    if (!buffer.length || buffer.duration > LIMITS.clip + .01) throw new Error('Each strip can hold up to 30 seconds. Choose a shorter sound.');
    if (sourceSeconds(clips) + buffer.duration > LIMITS.storage) throw new Error('Source storage is full (120 seconds). Remove every clip using an unwanted sound to free it. Copies share their original source.');
    const slot = firstSlot(clips, buffer, preferred);
    remember();pause(); const clip = { id: crypto.randomUUID(), name: name.slice(0, 64), buffer, ...slot, in: 0, out: buffer.duration, rate: 1, gain:1, reversed:false };
    clips.push(clip);pruneHistory(); emit(); return clip;
  }
  async function decode(blob, name, lane = 0) {
    const buffer=await prepareAudioFile(blob,{limits:LIMITS,signal:loadController?.signal,onStage:stage=>{if(loading){loading={...loading,stage};emit();}},validate:decoded=>{
      if(sourceSeconds(clips)+decoded.duration>LIMITS.storage+.001)throw Error('Source storage is full (120 seconds). Remove every clip using an unwanted sound to free it. Copies share their original source.');
      firstSlot(clips,decoded,lane);
    }});
    if (disposed) return;
    return add(buffer, name, lane);
  }
  async function importFile(file, lane = 0) {
    if (busy || pending || recorder) throw new Error('Finish the current recording or import first.');
    if(disposed)throw Error('This deck has closed.');
    if(clips.length>=LIMITS.clips)throw Error('The 48-strip rack is full. Remove a strip first.');
    loadController=new AbortController();loading={name:String(file.name||'Audio file'),stage:'Reading file',startedAt:performance.now()};
    busy = true; emit();
    try { return await decode(file, String(file.name||'Imported sound').replace(/\.[^.]+$/, ''), lane); }
    catch (error) { if (error.name === 'EncodingError' || error.name === 'NotSupportedError') throw new Error('That audio format could not be read. Try WAV, MP3, Ogg, or M4A.'); throw error; }
    finally { loading=null;loadController=null;busy = false; emit(); }
  }
  function cancelLoad(){loadController?.abort();}
  async function record(lane = 0) {
    if (pending || recorder || busy || capturePending) return;
    if (clips.length >= LIMITS.clips) throw new Error('The 48-strip rack is full. Remove a strip first.');
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error('Microphone recording needs a supported browser on HTTPS or localhost. You can still import audio.');
    const start=tick().position,maxSeconds=Math.min(LIMITS.clip,60-start);
    if(maxSeconds<.1)throw Error('Move the playhead earlier to record on the reel.');
    pause(); const ticket = ++recordGeneration; pending = true; emit();
    let acquired;
    try {
      await wake(); acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed || !pending || ticket !== recordGeneration) { acquired.getTracks().forEach(t => t.stop()); return; }
      stream = acquired;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(stream, mime ? {mimeType: mime} : undefined), chunks = [];
      const probe={id:'__capture_probe__',lane,start,in:0,out:.05,rate:1,links:[],buffer:{duration:.05}},open=capturePlan(clips,probe,lane);
      capturePreview={id:crypto.randomUUID(),lane:open.conflict?lane:open.candidate.lane,start,seconds:0,maxSeconds,preparing:true,prepareSeconds:0,peaks:new Float32Array(256)};
      capturePrepareAt=performance.now();const ready=new Promise(resolve=>{captureReady=resolve;});emit();
      const armed=await ready;if(!armed||disposed||!pending||ticket!==recordGeneration){acquired.getTracks().forEach(t=>t.stop());capturePreview=null;return;}
      capturePreview.preparing=false;capturePreview.armed=true;recorder=capture;
      try{captureSource=context.createMediaStreamSource(stream);captureAnalyser=context.createAnalyser();captureAnalyser.fftSize=512;captureSource.connect(captureAnalyser);}catch{captureSource=null;captureAnalyser=null;}
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => { capture.onstop = null; stopRecording(); recorder = null; capturePreview=null;busy = false; emit(); onChange('Recording failed. Check your microphone and try again.'); };
      capture.onstop = async () => {
        const captured=capturePreview;stopTracks(); recorder = null; busy = true; emit();
        try { if (!disposed&&captured) { const buffer=await prepareAudioFile(new Blob(chunks,{type:capture.mimeType}),{limits:LIMITS});const clip=finishCapture(buffer,`Mic take ${clips.length + 1}`,{...captured,recorded:true});if(clip)onChange(null,clip); } }
        catch (error) { if (!disposed) onChange(error.message); }
        finally { capturePreview=null;busy = false; emit(); }
      };
      capture.start(250); recordingAt = performance.now(); recordTimer = setTimeout(stopRecording, Math.max(100,(maxSeconds-.25)*1000));
    } catch (error) {
      acquired?.getTracks().forEach(t => t.stop());
      if (disposed || ticket !== recordGeneration) return;
      stream = null; recorder = null;capturePreview=null;stopTracks();
      throw new Error(error.name === 'NotAllowedError' ? 'Microphone access was declined. Allow it in your browser, or import an audio file.' : error.name === 'NotFoundError' ? 'No microphone was found. Connect one, or import an audio file.' : error.message);
    } finally { if (ticket === recordGeneration) pending = false; emit(); }
  }
  function stopTracks() { clearTimeout(recordTimer); recordTimer = null;captureSource?.disconnect();captureAnalyser?.disconnect();captureSource=null;captureAnalyser=null;stream?.getTracks().forEach(t => t.stop()); stream = null; }
  function stopRecording() {
    pending = false; recordGeneration++;if(captureReady){const ready=captureReady;captureReady=null;ready(false);}
    if(recorder&&capturePreview){capturePreview.seconds=Math.min(capturePreview.maxSeconds,(performance.now()-recordingAt)/1000);position=clampTapePosition(capturePreview.start+capturePreview.seconds);}
    if (recorder && recorder.state !== 'inactive') { busy = true; recorder.stop(); }
    stopTracks(); emit();
  }
  function commitPlacement(plan){if(plan.conflict){const error=Error('Choose how to resolve the overlap.');error.overlap=plan;throw error;}if(sourceSeconds(plan.clips)>LIMITS.storage+.001)throw Error('Source storage is full (120 seconds).');remember();pause();clips.splice(0,clips.length,...plan.clips);pruneHistory();emit();return clips.find(c=>c.id===plan.candidate.id);}
  function planPlacement(id,patch,options={}){return placementPlan(clips,id,patch,options);}
  function place(id,patch,options={}){if(busy||pending||recorder)throw Error('Finish loading or recording first.');return commitPlacement(placementPlan(clips,id,patch,{...options,newId:options.newId??crypto.randomUUID()}));}
  function paste(source,patch={},strategy=null){if(busy||pending||recorder)throw Error('Finish loading or recording first.');if(clips.length>=LIMITS.clips)throw Error('The 48-clip rack is full.');const candidate={...cloneClip(source),id:crypto.randomUUID(),links:[],...patch};return commitPlacement(placementPlan([...clips,candidate],candidate.id,{}, {strategy}));}
  function edit(id,patch){const c=clips.find(v=>v.id===id);if(!c)return;if(Object.keys(patch).some(k=>['start','lane','in','out','rate'].includes(k)&&patch[k]!==c[k]))return place(id,patch);if(busy||pending||recorder)throw Error('Finish loading or recording first.');if(!validClip({...c,...patch}))throw Error('Keep this clip within its source and speed limits.');if(Object.entries(patch).every(([key,value])=>c[key]===value))return c;remember();const gainOnly=Object.keys(patch).every(key=>key==='gain');if(!gainOnly)pause();Object.assign(c,patch);if(gainOnly)for(const source of sources)if(source.clipId===id){const param=source.gain.gain,value=(c.gain??1)*source.blend;if(param.setTargetAtTime)param.setTargetAtTime(value,context.currentTime,.015);else param.value=value;}emit();return c;}
  function remove(id){if(busy||pending||recorder)throw Error('Finish loading or recording first.');const index=clips.findIndex(c=>c.id===id);if(index<0)return;remember();pause();clips.splice(index,1);cleanLinks(clips);emit();}
  function duplicate(id,patch) {
    if(busy||pending||recorder)throw new Error('Finish loading or recording first.');
    const source=clips.find(c=>c.id===id);if(!source)return;
    if(clips.length>=LIMITS.clips)throw new Error('The 48-strip rack is full. Remove a strip first.');
    const copy={...source,links:[],id:crypto.randomUUID(),name:(source.name+' copy').slice(0,64)};
    if(patch)Object.assign(copy,patch);
    else{
      let slot;
      for(let step=0;step<1&&!slot;step++){
        const lane=(source.lane+step)%LIMITS.lanes;
        for(const start of [...new Set([0,...clips.filter(c=>c.lane===lane).map(c=>c.start+duration(c))])].sort((a,b)=>{const edge=source.start+duration(source);return Number(a<edge)-Number(b<edge)||a-b;}))if(start>=0&&start+duration(copy)<=60+.001&&fits(clips,{...copy,lane,start})){slot={lane,start};break;}
      }
      if(!slot)throw new Error('No clear stretch of tape for a copy.');Object.assign(copy,slot);
    }
    if(!fits(clips,copy))throw new Error('That copy would overlap another strip or run past the reel.');
    remember();pause();clips.push(copy);emit();return copy;
  }
  function undo(){if(!undoStack.length||busy||recorder||pending)return false;redoStack.push(snapshot());const prior=undoStack.pop();pause();clips.splice(0,clips.length,...prior);emit();return true;}
  function redo(){if(!redoStack.length||busy||recorder||pending)return false;undoStack.push(snapshot());const next=redoStack.pop();pause();clips.splice(0,clips.length,...next);emit();return true;}
  function split(id,at){
    if(busy||pending||recorder)throw Error('Finish loading or recording first.');
    const c=clips.find(c=>c.id===id);if(!c)return;if(c.links?.length)throw Error('Move fitted or blended clips apart before splitting.');if(clips.length>=LIMITS.clips)throw Error('The 48-strip rack is full.');
    if(!Number.isFinite(at)||at<=c.start+.02||at>=c.start+duration(c)-.02)throw Error('Place the playhead inside the selected clip to split it.');
    const cut=sourceTimeAt(c,at),right={...c,id:crypto.randomUUID(),name:(c.name+' B').slice(0,64),start:at};remember();pause();if(c.reversed){c.in=cut;right.out=cut;}else{c.out=cut;right.in=cut;}clips.push(right);emit();return right;
  }
  async function join(id){
    if(busy||recorder||pending)throw Error('Finish the current operation first.');const a=clips.find(c=>c.id===id);if(!a)return;
    const end=a.start+duration(a),b=clips.filter(c=>c.id!==id&&c.lane===a.lane&&c.start>=end-.001).sort((c,d)=>c.start-d.start)[0];
    if(a.links?.length||b?.links?.length)throw Error('Move fitted or blended clips apart before joining.');if(!b||Math.abs(b.start-end)>.02)throw Error('Move the next clip against this clip before joining them.');
    let candidate;
    if(a.buffer===b.buffer&&(a.gain??1)===(b.gain??1)&&a.rate===b.rate&&Boolean(a.reversed)===Boolean(b.reversed)&&Math.abs(a.reversed?a.in-b.out:a.out-b.in)<.0001)candidate=a.reversed?{...a,in:b.in}:{...a,out:b.out};
    else{const seconds=duration(a)+duration(b);if(seconds>30.001)throw Error('A joined source can hold up to 30 seconds.');busy=true;emit();try{const ctx=await wake(),buffer=ctx.createBuffer(1,Math.round(seconds*LIMITS.sampleRate),LIMITS.sampleRate),data=buffer.getChannelData(0);let offset=0;for(const c of[a,b]){const input=c.buffer.getChannelData(0),n=Math.round(duration(c)*LIMITS.sampleRate);for(let i=0;i<n&&offset+i<data.length;i++){const t=sourceTimeAt(c,c.start+i/LIMITS.sampleRate)*c.buffer.sampleRate-(c.reversed?1:0),j=Math.floor(t),f=t-j;data[offset+i]=((input[j]??0)*(1-f)+(input[j+1]??0)*f)*(c.gain??1);}offset+=n;}candidate={...a,buffer,in:0,out:buffer.duration,rate:1,gain:1,reversed:false};}finally{busy=false;emit();}}
    const remaining=clips.filter(c=>c!==a&&c!==b);if(sourceSeconds([...remaining,candidate])>LIMITS.storage+.001)throw Error('There is not enough source storage for the joined sound.');
    if(disposed)return;remember();pause();Object.assign(a,candidate);clips.splice(clips.indexOf(b),1);pruneHistory();emit();return a;
  }
  function saveSession(extra={}){if(busy||recorder||pending)throw Error('Finish recording or loading before saving.');return new Blob([JSON.stringify(sessionObject({clips,lanes,position:tick().position,loop,volume,muted:outputMuted,extra}))],{type:'application/json'});}
  async function loadSession(file){
    if(busy||recorder||pending)throw Error('Finish the current operation first.');if(file.size>24*1024*1024)throw Error('That session file is too large.');busy=true;emit();
    try{const state=unpackSession(JSON.parse(await file.text())),ctx=await wake(),buffers=state.sources.map(s=>{const b=ctx.createBuffer(1,s.pcm.length,s.rate);b.getChannelData(0).set(s.pcm);return b;}),loaded=state.clips.map(c=>({id:c.id,name:c.name,lane:c.lane,start:c.start,in:c.in,out:c.out,rate:c.rate,gain:c.gain??1,reversed:c.reversed===true,buffer:buffers[c.source],links:(c.links||[]).map(l=>({...l}))}));
      if(disposed)return;pause();playbackReturn=state.position;completedPlayback=false;clips.splice(0,clips.length,...loaded);state.lanes.forEach((l,i)=>Object.assign(lanes[i],l));lanes.forEach((_,i)=>applyLane(i));void windTo(state.position);loop=state.loop;volume=state.volume;outputMuted=state.muted;if(master)master.gain.value=outputMuted||siteMuted?0:volume;undoStack.length=redoStack.length=0;emit();return state.extra;
    }catch(error){if(error instanceof SyntaxError)throw Error('That session file could not be read.');throw error;}finally{busy=false;emit();}
  }
  async function exportWav({clipId=null,effects=true,tails=true,applyVolume=true}={}){
    if(busy||recorder||pending)throw Error('Finish the current operation first.');const selected=(clipId?clips.filter(c=>c.id===clipId):clips).map(c=>({clip:cloneClip(c),window:visibleInterval(c,clips)})).filter(p=>p.window.end>p.window.start);if(!selected.length)throw Error('Choose sound inside the playable 0–60 second reel.');const start=clipId?selected[0].window.start:0,seconds=Math.max(...selected.map(p=>p.window.end))-start+(effects&&tails?2:0);busy=true;emit();
    let circuits=[];try{const offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(seconds*LIMITS.sampleRate)),LIMITS.sampleRate),reverseCache=new WeakMap(),output=offline.createGain();output.gain.value=applyVolume?volume:1;const limiter=offline.createDynamicsCompressor();limiter.threshold.value=-6;limiter.ratio.value=16;output.connect(limiter).connect(offline.destination);if(effects)circuits=lanes.map(l=>createLaneCircuit(offline,{...l},output));for(const {clip:c,window:w} of selected){const source=offline.createBufferSource();source.buffer=c.reversed?reversed(c.buffer,offline,reverseCache):c.buffer;source.playbackRate.value=c.rate;const gain=offline.createGain();gain.gain.value=(c.gain??1)*(c.links.some(l=>l.mode==='blend')?Math.SQRT1_2:1);gain.connect(effects?circuits[c.lane].input:output);source.connect(gain);const sample=sourceTimeAt(c,w.start);source.start(w.start-start,c.reversed?Math.max(0,c.buffer.duration-sample):sample,(w.end-w.start)*c.rate);}const buffer=await offline.startRendering();return wavBlob(buffer);}finally{circuits.forEach(g=>g.dispose());busy=false;emit();}
  }
  async function bell(lane = 0) {
    if (busy || recorder || pending || capturePending) throw new Error('Finish loading or recording first.');
    if(disposed)throw Error('This deck has closed.');
    const start=tick().position;if(start+2>60+.001)throw Error('Move the playhead earlier to print the bell on the reel.');
    const ctx=localAudioContext(),buffer = ctx.createBuffer(1, LIMITS.sampleRate * 2, LIMITS.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) { const t = i / LIMITS.sampleRate; data[i] = .35 * (Math.sin(t * 2 * Math.PI * 523.25) + .3 * Math.sin(t * 2 * Math.PI * 1318)) * Math.exp(-t * 4) * Math.min(1, t * 100); }
    return finishCapture(buffer,'Brass moon bell',{id:crypto.randomUUID(),start,lane});
  }
  return {
    clips, lanes, wake, play, playReverse:(only=null)=>play(only,true),pause,stop, seek, tick, importFile, cancelLoad,record, stopRecording, edit, duplicate, remove, bell, setSyncOffsetMs,split,join,undo,redo,saveSession,loadSession,exportWav,place,planPlacement,paste,planCapture,resolveCapture,cancelCapture,
    get capturePreview(){return capturePreview;},get capturePending(){return capturePending;},
    get loading(){return loading;},
    get direction(){return direction;},
    get auditionClipId(){return soloClip?.id??null;},
    get winding(){return Boolean(winding);},get windingDirection(){return winding?Math.sign(winding.velocity)||Math.sign(winding.target-position):0;},get targetPosition(){return winding?.target??clampTapePosition(clock());},get playbackPending(){return playbackPending;},
    get canUndo(){return undoStack.length>0;},get canRedo(){return redoStack.length>0;},
    get syncOffsetMs() { return syncMs; },
    get playing() { return playing; }, get recording() { return Boolean(recorder); }, get pending() { return pending; }, get busy() { return busy; },
    get loop() { return loop; }, set loop(value) { loop = Boolean(value); emit(); },
    setLane(index, patch) { Object.assign(lanes[index], patch); applyLane(index); emit(); },
    get muted() { return outputMuted; },
    setMuted(value) { outputMuted = Boolean(value); if (master) master.gain.setTargetAtTime(outputMuted || siteMuted ? 0 : volume, context.currentTime, .015); emit(); },
    get volume() { return volume; },
    get siteMuted() { return siteMuted; },
    setSiteMuted(value) { siteMuted = Boolean(value); if (master) master.gain.setTargetAtTime(outputMuted || siteMuted ? 0 : volume, context.currentTime, .015); emit(); },
    setMaster(value) { const next = Number(value); if (!Number.isFinite(next)) return; volume = Math.max(0, Math.min(2, next)); if (master) master.gain.setTargetAtTime(outputMuted || siteMuted ? 0 : volume, context.currentTime, .015); emit(); },
    getLevel() { if (!meter || !playing || outputMuted || siteMuted || !volume || context.state !== 'running') return 0; meter.getByteTimeDomainData(meterData); let sum=0; for(const x of meterData)sum+=((x-128)/128)**2; return Math.sqrt(sum/meterData.length); },
    getLaneLevels() { return Array.from({length:4},(_,i)=>playing&&!outputMuted&&!siteMuted&&volume&&context?.state==='running'?graphs[i]?.getLevel()||0:0); },
    suspend() { pause(); stopRecording(); void context?.suspend(); },
    dispose() { if (disposed) return; disposed = true;cancelLoad(); generation++; pause(); pending = false; if (recorder) { recorder.onstop = null; recorder.ondataavailable = null; } stopRecording(); recorder = null;capturePreview=null;capturePending=null;graphs.forEach(g=>g.dispose()); void context?.close(); clips.length = 0; graphs = [];undoStack.length=redoStack.length=0; }
  };
}
