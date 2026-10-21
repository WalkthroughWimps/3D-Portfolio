import {RIBBON,laneHeight,secondsAtX} from './ribbon-path.mjs?v=addon-layout-2';
import {LIMITS} from './audio-engine.mjs?v=transport-ticks-1';
import {validClip,visibleInterval,overlaps,clipDuration as duration,clipEnd} from './clip-layout.mjs?v=panel-custom-1';
import {clipBand} from './clip-appearance.mjs?v=contrast-glows-1';

export function clipAtPoint(clips,point,position,selected=null,cycle=false,timeOverride=null,stackBlends=true) {
  if(Math.abs(point.x)>RIBBON.halfSpan||Math.abs(point.y)>RIBBON.lanePitch*1.5+RIBBON.width/2)return null;
  const lane=Math.max(0,Math.min(3,Math.round(1.5-point.y/RIBBON.lanePitch))),time=Number.isFinite(timeOverride)?timeOverride:secondsAtX(point.x,position);
  if(Math.abs(point.y-laneHeight(lane))>RIBBON.width/2)return null;
  const across=(laneHeight(lane)+RIBBON.width/2-point.y)/RIBBON.width;
  const matches=clips.filter(c=>{const w=visibleInterval(c,clips,{playable:false});return c.lane===lane&&time>=w.start&&time<w.end;});
  const bandMatches=matches.filter(c=>{const b=clipBand(c,clips,stackBlends);return across>=b.top&&across<b.top+b.height;});
  const candidates=cycle?matches:bandMatches;return cycle?(candidates.find(c=>c.id!==selected)||candidates[0]||null):(candidates.find(c=>c.id===selected)||candidates[0]||null);
}
/** Only exposed, on-bed edges can become handles. A blended pair keeps its own band. */
export function clipEdgeAtPoint(clips,point,position,{selected=null,stackBlends=true,tolerance=.18,timeOverride=null}={}){
  if(Math.abs(point.x)>RIBBON.halfSpan||Math.abs(point.y)>RIBBON.lanePitch*1.5+RIBBON.width/2)return null;
  const lane=Math.max(0,Math.min(3,Math.round(1.5-point.y/RIBBON.lanePitch))),time=Number.isFinite(timeOverride)?timeOverride:secondsAtX(point.x,position);
  if(Math.abs(point.y-laneHeight(lane))>RIBBON.width/2)return null;
  const across=(laneHeight(lane)+RIBBON.width/2-point.y)/RIBBON.width;
  return clips.flatMap(c=>{
    if(c.lane!==lane)return [];
    const band=clipBand(c,clips,stackBlends);if(across<band.top||across>band.top+band.height)return [];
    const window=visibleInterval(c,clips,{playable:false}),edges=[['start',c.start],['end',clipEnd(c)]];
    return edges.filter(([,at])=>at>=position-RIBBON.secondsInView/2&&at<=position+RIBBON.secondsInView/2&&at>=window.start-.0001&&at<=window.end+.0001&&Math.abs(time-at)<=tolerance)
      .map(([edge,at])=>({clip:c,edge,time:at,band,distance:Math.abs(time-at)}));
  }).sort((a,b)=>a.distance-b.distance||Number(b.clip.id===selected)-Number(a.clip.id===selected))[0]||null;
}
/** Pure preview. Left edge anchors the right edge; stretching preserves source trims. */
export function proposeClipEdge(clips,source,edge,time,{stretch=false}={}){
  const anchor=edge==='start'?clipEnd(source):source.start,normal=edge==='start'?-1:1;
  const crossing=stretch&&(time-anchor)*normal<0,reversed=Boolean(source.reversed)!==crossing;
  const side=crossing?-normal:normal;
  const sourceLength=source.out-source.in,minSource=.02,clip={...source,reversed};
  if(stretch){
    const targetLength=Math.max(.01,Math.abs(time-anchor));
    clip.rate=Math.max(.5,Math.min(2,sourceLength/targetLength));
    const length=sourceLength/clip.rate;
    clip.start=side<0?anchor-length:anchor;
  }else{
    const anchorSample=edge==='start'?(source.reversed?source.in:source.out):(source.reversed?source.out:source.in);
    const sampleSign=(source.reversed?-1:1)*normal;
    const available=sampleSign>0?source.buffer.duration-anchorSample:anchorSample;
    const length=Math.max(minSource,Math.min(Math.max(0,available),Math.max(minSource,(time-anchor)*normal*source.rate)));
    const otherSample=anchorSample+sampleSign*length;
    clip.in=Math.min(anchorSample,otherSample);clip.out=Math.max(anchorSample,otherSample);
    const seconds=(clip.out-clip.in)/clip.rate;
    clip.start=side<0?anchor-seconds:anchor;
  }
  const valid=validClip(clip);
  return {clip,sourceId:source.id,edge:side<0?'start':'end',gestureEdge:edge,stretch,valid,conflict:clips.some(c=>c.id!==source.id&&overlaps(c,clip))};
}
export function snapClipStart(clips,source,start,playhead,{copy=false,tolerance=.18}={}){
  const length=duration(source),targets=[{time:playhead,kind:0},{time:0,kind:0},{time:60,kind:1},...clips.filter(c=>copy||c.id!==source.id).flatMap(c=>{const w=visibleInterval(c,clips,{playable:false});return [{time:w.start,kind:0},{time:w.end,kind:1},{time:(w.start+w.end)/2,kind:2}];})];
  // Left, right, then center wins when several alignments are in range.
  for(const [kind,offset]of [[0,0],[1,length],[2,length/2]]){
    const candidates=targets.map(t=>({...t,distance:Math.abs(start+offset-t.time)})).filter(t=>t.distance<=tolerance).sort((a,b)=>a.kind-b.kind||a.distance-b.distance||a.time-b.time);
    if(candidates.length){const target=candidates[0];return {start:target.time-offset,snapped:true,target:target.time,distance:target.distance,anchor:['left','right','center'][kind]};}
  }
  return {start,snapped:false,distance:tolerance};
}
export function proposeClipMove(clips,source,origin,point,copy=false,{snap=true,playhead=0,tolerance=.18}={}) {
  const lane=Math.max(0,Math.min(3,Math.round(1.5-point.y/RIBBON.lanePitch)));
  const raw=source.start+(point.x-origin.x)*RIBBON.secondsInView/(2*RIBBON.halfSpan),snapped=snap?snapClipStart(clips,source,raw,playhead,{copy,tolerance}):null,start=snapped?.snapped?snapped.start:Math.round(raw*10)/10;
  const clip={...source,links:[],id:copy?'__odd_drag_copy__':source.id,start,lane};
  const onBed=Math.abs(point.y)<=RIBBON.lanePitch*1.5+RIBBON.width/2;
  const capacity=!copy||clips.length<LIMITS.clips;
  return {clip,copy,sourceId:source.id,snapped:Boolean(snapped?.snapped),conflict:clips.some(c=>(copy||c.id!==source.id)&&overlaps(c,clip)),valid:onBed&&capacity&&clip.out-clip.in>=.02&&validClip(clip)};
}

/** Nondestructive edge clipping: the original PCM remains available for retrimming. */
export function trimAtReelEnds(clip){
  const candidate={...clip};
  if(candidate.start<0){if(candidate.reversed)candidate.out+=candidate.start*candidate.rate;else candidate.in-=candidate.start*candidate.rate;candidate.start=0;}
  const end=candidate.start+duration(candidate);
  if(end>LIMITS.reel){if(candidate.reversed)candidate.in+=(end-LIMITS.reel)*candidate.rate;else candidate.out-=(end-LIMITS.reel)*candidate.rate;}
  return candidate;
}
