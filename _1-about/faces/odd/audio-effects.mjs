export const LANE_DEFAULTS=Object.freeze({gain:.7,tone:18000,echo:0,reverb:0,drive:0,wow:0,bass:20,muted:false});
const impulses=new WeakMap();
function springImpulse(ctx){
  if(impulses.has(ctx))return impulses.get(ctx);
  const rate=ctx.sampleRate||24000,buffer=ctx.createBuffer(1,Math.ceil(rate*2),rate),data=buffer.getChannelData(0);let seed=71831;
  for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;const t=i/rate;data[i]=((seed/4294967296-.5)*.62+Math.sin(t*1950+Math.sin(t*390)*2)*.16)*Math.exp(-t*4.2)*(1-Math.exp(-t*80));}
  impulses.set(ctx,buffer);return buffer;
}
export function createLaneCircuit(ctx,settings,destination){
  // One shared output tap per voice includes its dry and effect signals.
  const meter=ctx.createAnalyser?.(),meterData=new Uint8Array(256);
  if(meter){meter.fftSize=256;meter.connect(destination);}
  const output=meter||destination;
  const input=ctx.createGain(),filter=ctx.createBiquadFilter(),dry=ctx.createGain(),wet=ctx.createGain(),feedback=ctx.createGain();
  filter.type='lowpass';filter.Q.value=.65;feedback.gain.value=.28;input.connect(filter);
  let processed=filter,bass=null,shaper=null,wow=null,oscillator=null,wowDepth=null,reverbWet=null,convolver=null,delay=null,lastDrive=-1;
  if(ctx.createWaveShaper&&ctx.createConvolver&&ctx.createOscillator){
    bass=ctx.createBiquadFilter();bass.type='highpass';bass.Q.value=.65;filter.connect(bass);
    shaper=ctx.createWaveShaper();shaper.oversample='2x';bass.connect(shaper);
    wow=ctx.createDelay(.1);shaper.connect(wow);oscillator=ctx.createOscillator();oscillator.type='sine';oscillator.frequency.value=.7;wowDepth=ctx.createGain();oscillator.connect(wowDepth).connect(wow.delayTime);oscillator.start(0);
    processed=wow;reverbWet=ctx.createGain();reverbWet.connect(output);
  }
  processed.connect(dry).connect(output);wet.connect(output);
  let initialized=false;
  const target=(param,value)=>initialized&&param.setTargetAtTime?param.setTargetAtTime(value,ctx.currentTime,.015):param.value=value;
  function reset(){
    if(delay){processed.disconnect(delay);delay.disconnect();feedback.disconnect();}
    delay=ctx.createDelay(1);delay.delayTime.value=.24;processed.connect(delay).connect(wet);delay.connect(feedback).connect(delay);
    if(reverbWet){if(convolver){processed.disconnect(convolver);convolver.disconnect();}convolver=ctx.createConvolver();convolver.buffer=springImpulse(ctx);processed.connect(convolver).connect(reverbWet);}
  }
  function apply(){
    target(input.gain,settings.muted?0:settings.gain);target(filter.frequency,settings.tone);target(wet.gain,settings.echo*.7);
    if(bass){target(bass.frequency,settings.bass??20);target(wow.delayTime,(settings.wow??0)*.004);target(wowDepth.gain,(settings.wow??0)*.0025);target(reverbWet.gain,(settings.reverb??0)*.65);
      const drive=settings.drive??0;if(drive!==lastDrive){lastDrive=drive;if(!drive)shaper.curve=null;else{const curve=new Float32Array(2048),gain=1+drive*14;for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i*2/(curve.length-1)-1)*gain)/Math.tanh(gain);shaper.curve=curve;}}
    }
    initialized=true;
  }
  reset();apply();
  return {input,filter,settings,apply,reset,getLevel(){if(!meter?.getByteTimeDomainData)return 0;meter.getByteTimeDomainData(meterData);let sum=0;for(const x of meterData)sum+=((x-128)/128)**2;return Math.sqrt(sum/meterData.length);},dispose(){try{oscillator?.stop();}catch{}for(const node of[input,filter,dry,wet,feedback,bass,shaper,wow,oscillator,wowDepth,reverbWet,convolver,delay,meter])node?.disconnect();}};
}
