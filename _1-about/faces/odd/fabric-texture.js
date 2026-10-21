import {visibleInterval,clipDuration} from './clip-layout.mjs?v=panel-custom-1';
import {blendWindow,clipBand,waveformPeak,activeWaveformColors,OFF_TAPE_WAVEFORM_COLORS,OFF_TAPE_GLOW_RATIO} from './clip-appearance.mjs?v=contrast-glows-1';
import {MUTE_GLOW_RATIO,MUTED_DETAIL_GLOW_RATIO,scaleSrgbColor} from './fabric-glow.mjs';
import {FABRIC_TIMING,fabricTimingRows} from './fabric-timing.mjs?v=transport-ticks-1';
import {TAPE_BED} from './tape-bed.mjs?v=bed-1';
export const FABRIC_TIME=FABRIC_TIMING;
export const YARN_COLORS=['#e1cfa3','#413c2c','#89c7cb','#62385a'];
export function drawFabric(canvas,lane,clips,COLORS,duration,selected,{highlightColor='#d9f5ff',muted=false,selectedLane=false,stackBlends=true,tickSpacingMs=200}={},glowCanvas=null){
  const ctx=canvas.getContext('2d'),height=canvas.height,width=canvas.width,y=t=>(t-FABRIC_TIME.start)/FABRIC_TIME.span*height,glow=glowCanvas?.getContext('2d'),patches=clips.map(clip=>({clip,interval:clip.visualManufacture?{start:clip.start,end:clip.start+clipDuration(clip)}:visibleInterval(clip,clips,{playable:false}),blend:blendWindow(clip,clips),band:clipBand(clip,clips,stackBlends)})).filter(p=>p.interval.end>p.interval.start);
  // UV X rises with lane Y, so the visually upper band occupies the high canvas X half.
  const bandX=band=>8+(width-16)*(1-band.top-band.height),bandWidth=band=>(width-16)*band.height;
  const glowScale=glowCanvas?glowCanvas.height/height:1;if(glow){glow.save();glow.scale(1,glowScale);}
  const addSoftGlowLine=(paths,x1,y1,x2,y2,color,ratio,lineWidth)=>{const key=color+':'+ratio+':'+lineWidth;let group=paths.get(key);if(!group){group={color,ratio,lineWidth,path:new Path2D()};paths.set(key,group);}group.path.moveTo(x1,y1);group.path.lineTo(x2,y2);};
  ctx.fillStyle=COLORS[lane];ctx.fillRect(0,0,width,height);if(glow){glow.fillStyle='#000';glow.fillRect(0,0,width,height);}
  for(const{clip,interval,band}of patches){ctx.fillStyle=clip.visualGhost?'#898b88':clip.preview==='invalid'?'#d88b71':YARN_COLORS[0];ctx.fillRect(bandX(band),y(interval.start),bandWidth(band),y(interval.end)-y(interval.start));}
  for(const{clip,interval,blend,band}of patches)if(blend&&!clip.visualGhost){const start=Math.max(interval.start,blend.start),end=Math.min(interval.end,blend.end);if(end>start){ctx.fillStyle=YARN_COLORS[2];ctx.fillRect(bandX(band),y(start),bandWidth(band),y(end)-y(start));}}
  if(muted&&glow){glow.save();glow.beginPath();glow.rect(8,1,width-16,height-2);glow.clip();glow.strokeStyle=scaleSrgbColor('#702638',MUTED_DETAIL_GLOW_RATIO);glow.shadowColor=scaleSrgbColor('#702638',MUTED_DETAIL_GLOW_RATIO*.25);glow.shadowBlur=1;glow.lineWidth=.75;const weavePath=new Path2D();for(let x=30;x<width-3;x+=6){weavePath.moveTo(x+.5,1);weavePath.lineTo(x+.5,height-1);}glow.stroke(weavePath);glow.restore();}
  for(const{clip,interval,blend,band}of patches){
    const begin=interval.start,end=interval.end;if(end<=begin)continue;ctx.save();ctx.beginPath();ctx.rect(8,y(begin),width-16,y(end)-y(begin));ctx.clip();ctx.lineWidth=1.5;
    ctx.beginPath();ctx.rect(bandX(band),y(begin),bandWidth(band),y(end)-y(begin));ctx.clip();
    const count=Math.max(1,Math.ceil(y(end)-y(begin))),step=(end-begin)/count;
    const glowPaths=glow?new Map():null;if(glow){glow.save();glow.beginPath();glow.rect(8,y(begin),width-16,y(end)-y(begin));glow.clip();}
    const activeColors=activeWaveformColors(COLORS[lane]||'#e1cfa3');for(let n=0;n<count;n++){const time=begin+n*step,offTape=time<0||time>=60,overlap=blend&&time>=blend.start&&time<blend.end,side=blend?.peer?Number(String(clip.id)>String(blend.peer.id)):clip.blendSide,center=bandX(band)+bandWidth(band)*(overlap&&!stackBlends&&(blend?.peer||clip.blended)?(side===1?.30:.70):.5),scale=Math.min(44,bandWidth(band)*(overlap&&!stackBlends?.20:.42)),peak=waveformPeak(clip,time,step),waveColor=offTape?OFF_TAPE_WAVEFORM_COLORS.body:clip.visualGhost?'#666d6c':muted?'#9d4554':overlap?activeColors.first:activeColors.body,accent=offTape?OFF_TAPE_WAVEFORM_COLORS.accent:clip.visualGhost?'#abb0ac':muted?'#e2a0b1':activeColors.accent;ctx.strokeStyle=waveColor;ctx.beginPath();ctx.moveTo(center-peak*scale,y(begin)+n);ctx.lineTo(center+peak*scale,y(begin)+n);ctx.stroke();if(glow&&!clip.visualGhost&&peak>.03)addSoftGlowLine(glowPaths,center-peak*scale,y(begin)+n,center+peak*scale,y(begin)+n,waveColor,offTape?OFF_TAPE_GLOW_RATIO:MUTED_DETAIL_GLOW_RATIO,1.5);if(peak>.03){ctx.strokeStyle=accent;ctx.lineWidth=1;for(const x of[center-peak*scale,center+peak*scale]){ctx.beginPath();ctx.moveTo(x-1,y(begin)+n);ctx.lineTo(x+1,y(begin)+n);ctx.stroke();if(glow&&!clip.visualGhost)addSoftGlowLine(glowPaths,x-1,y(begin)+n,x+1,y(begin)+n,accent,offTape?OFF_TAPE_GLOW_RATIO:MUTED_DETAIL_GLOW_RATIO,1);}ctx.lineWidth=1.5;}}
    if(glow){for(const{color,ratio,lineWidth,path}of glowPaths.values()){glow.strokeStyle=scaleSrgbColor(color,ratio);glow.shadowColor=scaleSrgbColor(color,ratio*.25);glow.shadowBlur=1;glow.lineWidth=lineWidth;glow.stroke(path);}glow.restore();}
    ctx.translate(bandX(band)+6,y(begin)+Math.min(y(end)-y(begin)-3,100));ctx.rotate(-Math.PI/2);ctx.fillStyle='#304233';ctx.font='10px monospace';ctx.fillText(clip.name.slice(0,28),0,0);ctx.restore();
  }
  for(const{clip,interval,band}of patches.sort((a,b)=>Number(a.clip.id===selected)-Number(b.clip.id===selected))){const top=y(interval.start),bottom=y(interval.end),h=bottom-top,picked=!clip.visualGhost&&(clip.id===selected||clip.preview),outline=(target,color,lit)=>{target.save();target.strokeStyle=color;target.lineWidth=lit?1.8:1.2;target.globalAlpha=lit?1:.62;target.shadowColor=color;target.shadowBlur=lit?2:0;target.beginPath();for(const side of[0,1])for(let at=0;at<=Math.ceil(h/2);at++){const yy=Math.min(bottom,top+at*2),xx=(side?bandX(band)+bandWidth(band)-2:bandX(band)+2)+Math.sin(at*Math.PI/2)*1.5;if(!at)target.moveTo(xx,yy);else target.lineTo(xx,yy);}target.stroke();target.restore();};const color=clip.visualGhost?'#777d79':clip.preview==='invalid'?'#b5422e':muted?'#d95b65':highlightColor;outline(ctx,color,picked);if(picked&&glow)outline(glow,color,true);}
  // Color the existing dark valley weft. The emissive line occupies a quarter of a diffuse
  // texel (one texel at full emission resolution), rather than a stretched diffuse texel; all tiers keep the same hairline width.
  // The timing weft belongs to the playable tape; the surrounding cloth keeps its woven texture.
  ctx.save();ctx.beginPath();ctx.rect(0,y(TAPE_BED.start),width,y(TAPE_BED.end)-y(TAPE_BED.start));ctx.clip();
  if(glow){glow.save();glow.beginPath();glow.rect(0,y(TAPE_BED.start),width,y(TAPE_BED.end)-y(TAPE_BED.start));glow.clip();}
  for(const {time,mark} of fabricTimingRows(TAPE_BED.start,TAPE_BED.end,tickSpacingMs)){
    const row=y(time);
    ctx.fillStyle=!mark?(muted?'#efb0bf32':'#ffffff24'):(muted?'#882c3c60':mark.color?mark.color+'2c':'#111b182c');ctx.fillRect(0,row-.5,width,1);
    if(glow&&mark){const color=muted?'#d9a1af':mark.color||'#c4d5d1';glow.fillStyle=scaleSrgbColor(color,mark.glow);glow.fillRect(8,row-.125,width-16,.25);}
  }
  ctx.restore();if(glow)glow.restore();
  for(let x=0;x<width;x+=3){ctx.fillStyle=muted?(x%6?'#e7a5b52a':'#91394b66'):x%6?'#ffffff18':'#19271d24';ctx.fillRect(x,0,1,height);}ctx.strokeStyle='#f2dfb0a0';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);for(const x of[3,width-4]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}ctx.setLineDash([]);
  if(muted||selectedLane){
    for(const [target,color]of [[ctx,muted?'#d95b65':highlightColor],[glow,scaleSrgbColor(muted?'#d95b65':highlightColor,muted?MUTE_GLOW_RATIO:1)]])if(target){
      target.save();target.strokeStyle=color;target.lineWidth=1.4;target.beginPath();
      for(const side of[0,1])for(let row=0;row<=height;row+=2){const x=(side?width-4:3)+.5*Math.sin(row*Math.PI/6);if(!row)target.moveTo(x,row);else target.lineTo(x,row);}
      target.stroke();target.restore();
    }
  }
  // Temporal seams stay crisp and unlit, so touching clips remain distinguishable.
  ctx.fillStyle='#32453c';for(const{interval,band}of patches)for(const t of[interval.start,interval.end]){ctx.fillRect(bandX(band),y(t),bandWidth(band),.7);if(glow)glow.clearRect(bandX(band),y(t)-1,bandWidth(band),2);}
  // A 0.2-second backing and bright embroidery sit wholly outside each hard playable edge.
  const boundaryRows=y(TAPE_BED.start+.2)-y(TAPE_BED.start);
  for(const [time,sign,color]of[[TAPE_BED.start,-1,'#adddce'],[TAPE_BED.end,1,'#e1a6ba']]){
    const edge=y(time),top=sign<0?edge-boundaryRows:edge,threadTop=sign<0?edge-1.15:edge;
    ctx.save();ctx.beginPath();ctx.rect(0,top,width,boundaryRows);ctx.clip();
    ctx.fillStyle=COLORS[lane]||'#e1cfa3';ctx.fillRect(0,top,width,boundaryRows);
    ctx.fillStyle='#ffffff55';ctx.fillRect(0,top,width,boundaryRows);
    ctx.fillStyle=color;ctx.fillRect(0,threadTop,width,1.15);
    ctx.strokeStyle=color;ctx.lineWidth=.65;ctx.beginPath();
    for(let x=1;x<width;x+=4){ctx.moveTo(x,top+.8);ctx.lineTo(x+2,top+boundaryRows-1.45);ctx.moveTo(x+2,top+.8);ctx.lineTo(x,top+boundaryRows-1.45);}ctx.stroke();ctx.restore();
    if(glow){glow.save();glow.beginPath();glow.rect(8,top,width-16,boundaryRows);glow.clip();glow.fillStyle=scaleSrgbColor(COLORS[lane]||color,.12);glow.fillRect(8,top,width-16,boundaryRows);glow.fillStyle=scaleSrgbColor(color,.65);glow.shadowColor=scaleSrgbColor(color,.3);glow.shadowBlur=2;glow.fillRect(8,threadTop,width-16,1.15);glow.restore();}
  }
  if(glow)glow.restore();
}
