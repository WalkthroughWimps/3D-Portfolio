import {isAudioAllowed,onAudioConsentChange} from '../../../_7-shared-scripts/audio-consent.js';
/** Synthesized cue arrangements; no recordings or remote sound assets. */
export const cuePatterns=Object.freeze({
  miss:[
    {notes:[55,52,48],times:[0,.22,.44],duration:.24,type:'sawtooth'},
    {notes:[57,54,50],times:[0,.19,.43],duration:.26,type:'triangle'},
    {notes:[53,51,46],times:[0,.24,.48],duration:.23,type:'sawtooth'},
    {notes:[60,55,54,57,55,58,57],times:[0,.18,.27,.40,.58,1.0,1.22],duration:.14,type:'triangle'},
    {notes:[60,55,54,57,55,60,57],times:[0,.18,.27,.40,.58,1.0,1.22],duration:.14,type:'triangle'}
  ],
  hit:[
    {notes:[60,64,67,72],times:[0,.10,.20,.34],duration:.22,type:'triangle'},
    {notes:[67,72,76],times:[0,.16,.32],duration:.25,type:'sine'},
    {notes:[62,69,74,78],times:[0,.10,.23,.38],duration:.19,type:'triangle'},
    {notes:[64,68,71,80],times:[0,.12,.24,.40],duration:.22,type:'sine'}
  ]
});
export function createCuePicker(random=Math.random){const last={miss:-1,hit:-1};return kind=>{const pool=cuePatterns[kind];if(!pool)throw new TypeError('Unknown bean-bag cue');const choices=pool.map((_,i)=>i).filter(i=>i!==last[kind]);const index=choices[Math.min(choices.length-1,Math.floor(Math.max(0,random())*choices.length))];last[kind]=index;return{kind,index,...pool[index]};};}
export function createBeanBagSounds(getSettings=()=>({})){let context=null,bus=null,lastTime=-Infinity,disposed=false;const pick=createCuePicker(),voices=new Set(),history=[];
  const settings=()=>getSettings()||{};
  function stop(){for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
  function sync(){if(!context)return;const {volume=1,muted=false}=settings();const silent=muted||!isAudioAllowed();bus.gain.setValueAtTime(silent?0:Math.max(0,Math.min(1,volume))*.16,context.currentTime);if(silent||volume===0)stop();}
  const unsubscribe=onAudioConsentChange(sync);
  function unlock(){if(disposed||!isAudioAllowed())return;try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;if(!context){context=new Audio();bus=context.createGain();bus.connect(context.destination);}sync();context.resume().catch(()=>{});}catch{/* Audio is optional when the browser has no output device. */}}
  function play(kind){const {muted=false,volume=1}=settings();if(disposed||!isAudioAllowed()||muted||volume===0||!context||context.state!=='running'||document.hidden||context.currentTime-lastTime<.14)return false;lastTime=context.currentTime;if(voices.size>16)stop();const cue=pick(kind);history.push({kind,index:cue.index});if(history.length>24)history.shift();
    cue.notes.forEach((note,i)=>{const osc=context.createOscillator(),envelope=context.createGain(),filter=context.createBiquadFilter(),start=context.currentTime+.015+cue.times[i],end=start+cue.duration;
      osc.type=cue.type;const hz=440*2**((note-69)/12);osc.frequency.setValueAtTime(hz,start);if(kind==='miss'&&cue.index<3)osc.frequency.exponentialRampToValueAtTime(hz*.79,end);
      filter.type='lowpass';filter.frequency.value=kind==='miss'?740:2500;filter.Q.value=kind==='miss'?3:.6;
      envelope.gain.setValueAtTime(.0001,start);envelope.gain.exponentialRampToValueAtTime(.8,start+.022);envelope.gain.exponentialRampToValueAtTime(.0001,end);
      osc.connect(filter);filter.connect(envelope);envelope.connect(bus);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();filter.disconnect();envelope.disconnect();};osc.start(start);osc.stop(end+.02);
    });return true;
  }
  return{unlock,play,sync,getStats:()=>({state:context?.state||'uninitialized',voices:voices.size,history:[...history]}),suspend(){stop();context?.suspend().catch(()=>{});},dispose(){if(disposed)return;disposed=true;unsubscribe();stop();context?.close().catch(()=>{});}};
}
