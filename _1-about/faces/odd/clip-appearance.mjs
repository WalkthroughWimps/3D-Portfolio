import {clipEnd,sourceTimeAt} from './clip-layout.mjs?v=panel-custom-1';
export const DEFAULT_LANE_COLORS=['#cf542c','#188b91','#dfaa27','#788b36'];
const hexRgb=color=>{const m=/^#([\da-f]{6})$/i.exec(color||'');return m?[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)):null;};
const rgbHex=rgb=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const tint=(color,amount)=>{const rgb=hexRgb(color);return rgb?rgbHex(rgb.map(v=>v+(245-v)*amount)):color;};
export function activeWaveformColors(color=DEFAULT_LANE_COLORS[0]){return {body:color,first:tint(color,.48),second:tint(color,.25),accent:tint(color,.72)};}
export const ACTIVE_WAVEFORM_COLORS=activeWaveformColors();
export const OFF_TAPE_WAVEFORM_COLORS={body:'#565b5a',accent:'#858b88'};
export const OFF_TAPE_GLOW_RATIO=1/3;
export function blendWindow(clip,clips){const peer=clips.find(c=>c.id===clip.links?.find(l=>l.mode==='blend')?.peer);if(peer)return {start:Math.max(clip.start,peer.start),end:Math.min(clipEnd(clip),clipEnd(peer)),peer};return clip.blendRange?{...clip.blendRange,peer:null}:null;}
export function clipBand(clip,clips,stackBlends=true){
  if(!stackBlends)return {top:0,height:1};
  if(clip.visualBand)return {...clip.visualBand};
  const peer=blendWindow(clip,clips)?.peer;
  if(!peer&&clip.blended)return {top:clip.blendSide===1?.5:0,height:.5};
  if(!peer||peer.lane!==clip.lane)return {top:0,height:1};
  return {top:String(clip.id)<String(peer.id)?0:.5,height:.5};
}
export function stableBlendAppearance(clip,clips){
  const range=blendWindow(clip,clips);
  if(!range?.peer||range.peer.lane!==clip.lane)return clip;
  return {...clip,blendRange:{start:range.start,end:range.end},blended:true,blendSide:String(clip.id)<String(range.peer.id)?0:1};
}
export function dragPreviewClips(clips,preview){
  if(!preview?.clip)return clips;
  if(preview.edge)return clips.map(c=>c.id===preview.sourceId?{...preview.clip,preview:preview.valid?'valid':'invalid'}:c);
  const sourceId=preview.sourceId??preview.clip.id;
  const originals=clips.map(c=>c.id===sourceId?{...c,visualGhost:true}:c);
  return [...originals,{...preview.clip,id:'__odd_drag_preview__',links:[],visualGhost:false,preview:preview.valid?'valid':'invalid'}];
}
export function waveformPeak(clip,time,step){const data=clip.buffer.getChannelData(0),a=sourceTimeAt(clip,time)*clip.buffer.sampleRate,b=sourceTimeAt(clip,time+step)*clip.buffer.sampleRate,begin=Math.max(0,Math.floor(Math.min(a,b))),end=Math.min(data.length,Math.ceil(Math.max(a,b)));let peak=0;for(let i=begin;i<end;i+=Math.max(1,Math.floor((end-begin)/16)))peak=Math.max(peak,Math.abs(data[i]));return peak;}
export function drawClipWaveform(ctx,clip,clips,width=300,height=30,options={}){
  const full=(clip.out-clip.in)/clip.rate,blend=blendWindow(clip,clips),muted=Boolean(options.muted),stackBlends=options.stackBlends!==false,colors=muted?{body:'#9d4554',first:'#8d4859',second:'#b65e77'}:activeWaveformColors(options.color||DEFAULT_LANE_COLORS[clip.lane]||DEFAULT_LANE_COLORS[0]);
  ctx.clearRect(0,0,width,height);ctx.lineWidth=1.2;
  for(let x=0;x<width;x++){
    const time=clip.start+x/width*full,offTape=time<0||time>=60;
    const overlap=blend&&time>=blend.start&&time<blend.end;
    // Each full-height strip paints both sources in their shared interval. The top DOM strip may cover its partner.
    const sources=overlap&&!stackBlends&&blend.peer?[clip,blend.peer]:[clip];
    for(const source of sources){const peak=Math.max(.04,waveformPeak(source,time,full/width)),center=sources.length===2?height*(String(source.id)<String(blend.peer.id===source.id?clip.id:blend.peer.id)?.30:.70):height*.5,scale=sources.length===2?.20:.43,top=center-peak*height*scale,bottom=center+peak*height*scale;ctx.strokeStyle=offTape?OFF_TAPE_WAVEFORM_COLORS.body:overlap?colors.first:colors.body;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();if(offTape&&peak>.04){ctx.fillStyle=OFF_TAPE_WAVEFORM_COLORS.accent;ctx.fillRect(x-.5,top,1,1);ctx.fillRect(x-.5,bottom-1,1,1);}}
  }
}
