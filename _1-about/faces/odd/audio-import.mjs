const aborted=()=>new DOMException('Clip loading canceled.','AbortError');

/** A stalled browser decoder/resume must never lock the machine indefinitely. */
export function audioDeadline(work,{signal,timeoutMs=20000,label='processing audio'}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(aborted());return;}
    let done=false;
    const finish=(callback,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);callback(value);};
    const cancel=()=>finish(reject,aborted());
    const timer=setTimeout(()=>finish(reject,new Error(`Timed out while ${label}. Try again or choose another file.`)),timeoutMs);
    signal?.addEventListener('abort',cancel,{once:true});
    Promise.resolve().then(work).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}

export function localAudioContext(length=1,rate=24000) {
  const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Offline)throw Error('Offline audio processing is unavailable in this browser.');
  return new Offline(1,Math.max(1,length),rate);
}

export async function prepareAudioFile(file,{limits,signal,onStage=()=>{},timeoutMs=20000,validate=()=>{}}) {
  if(file.size>limits.fileBytes)throw Error('Please choose a file under 20 MB.');
  if(!file.size)throw Error('That audio file is empty. Choose another file.');
  const step=async(stage,label,work)=>{
    if(signal?.aborted)throw aborted();
    onStage(stage);return audioDeadline(work,{signal,timeoutMs,label});
  };
  const bytes=await step('Reading file','reading the file',()=>file.arrayBuffer());
  // Decoding is independent of the playback device and autoplay permission.
  const decoder=localAudioContext(1,limits.sampleRate);
  const decoded=await step('Decoding audio','decoding the audio',()=>decoder.decodeAudioData(bytes));
  if(!decoded.length||!Number.isFinite(decoded.duration)||decoded.duration<=0)throw Error('That file contains no readable audio.');
  if(decoded.duration>limits.clip+.01)throw Error(`This audio is ${decoded.duration.toFixed(1)} seconds long. The current limit is ${limits.clip} seconds per clip. Choose a shorter file.`);
  validate(decoded);
  const offline=localAudioContext(Math.ceil(decoded.duration*limits.sampleRate),limits.sampleRate);
  const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const buffer=await step('Preparing mono tape','preparing the tape',()=>offline.startRendering());
  if(signal?.aborted)throw aborted();
  return buffer;
}
