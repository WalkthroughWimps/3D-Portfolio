// Pure layout coordinates for controls outside the main Oddio covers.
// Stored distances are hundredths of a model unit; rendered coordinates are model units.
export const MAX_GAP=30;
export const MAIN_PANELS=Object.freeze({
  upper:Object.freeze({edgeX:.4,minY:.19,maxY:.82}),
  lower:Object.freeze({edgeX:.4,minY:-.82,maxY:-.19})
});
export const ADDON_SPECS=Object.freeze({
  meter:Object.freeze({width:.100,height:.384,depth:[.247,.340],hosts:Object.freeze(['upper']),defaults:Object.freeze({side:'left',host:'upper',gap:5,y:39.5})}),
  transport:Object.freeze({width:.205,height:.163,depth:[.234,.275],hosts:Object.freeze(['upper','lower']),defaults:Object.freeze({side:'right',host:'lower',gap:2,y:-29})}),
  shuttle:Object.freeze({width:.205,height:.163,depth:[.234,.275],hosts:Object.freeze(['upper','lower']),defaults:Object.freeze({side:'left',host:'lower',gap:7.7,y:-27})}),
  trackMeters:Object.freeze({width:.180,height:.290,depth:[.234,.313],hosts:Object.freeze(['upper']),defaults:Object.freeze({side:'right',host:'upper',gap:1.8,y:36.5})})
});
const dimension=value=>Math.max(.6,Math.min(1.10,Number.isFinite(Number(value))?Number(value):1));
export function getAddonSpecs(settings={}){
  const mainWidth=dimension(settings.mainMeterWidth),mainHeight=dimension(settings.mainMeterHeight);
  const trackWidth=dimension(settings.trackMeterWidth),trackHeight=dimension(settings.trackMeterHeight);
  return {
    ...ADDON_SPECS,
    meter:{...ADDON_SPECS.meter,width:ADDON_SPECS.meter.width*mainWidth,height:ADDON_SPECS.meter.height*mainHeight},
    trackMeters:{...ADDON_SPECS.trackMeters,width:ADDON_SPECS.trackMeters.width*trackWidth,height:ADDON_SPECS.trackMeters.height*trackHeight}
  };
}
export const SAFE_RADIUS=.815;
export const HOST_MARGIN=.008;
const IDS=Object.keys(ADDON_SPECS),SPACE=.012;
const prefix=id=>'addon'+id[0].toUpperCase()+id.slice(1);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export const panelEdgeX=(host,y)=>host==='lower'&&y<-.38?.49:(MAIN_PANELS[host]?.edgeX??MAIN_PANELS.upper.edgeX);
function fields(id,settings={}){
  const fallback=ADDON_SPECS[id].defaults,key=prefix(id),side=settings[key+'Side'],host=settings[key+'Host'];
  return {side:side==='left'||side==='right'?side:fallback.side,host:host==='upper'||host==='lower'?host:fallback.host,gap:clamp(finite(settings[key+'Gap'],fallback.gap),0,MAX_GAP),y:clamp(finite(settings[key+'Y'],fallback.y),-82,82)};
}
function envelope(id,input,specs=ADDON_SPECS){
  const spec=specs[id],panel=MAIN_PANELS[input.host],sign=input.side==='right'?1:-1;
  if(!spec.hosts.includes(input.host))return null;
  let minY=panel.minY+spec.height/2+HOST_MARGIN,maxY=panel.maxY-spec.height/2-HOST_MARGIN;
  // The widest possible lower-cover edge is used first so a body straddling
  // its shoulder cannot be certified against the narrow portion alone.
  const conservativeEdge=input.host==='lower'?.49:panel.edgeX;
  const centerLimit=Math.sqrt(Math.max(0,SAFE_RADIUS**2-(conservativeEdge+spec.width)**2))-spec.height/2;
  if(input.host==='upper')maxY=Math.min(maxY,centerLimit);
  else minY=Math.max(minY,-centerLimit);
  if(minY>maxY)return null;
  const y=clamp(input.y/100,minY,maxY),outerY=Math.max(Math.abs(y-spec.height/2),Math.abs(y+spec.height/2));
  // SAFE_RADIUS reserves the .885 opening's depth lost at the meter's .340
  // front face. Its corners, guide rail, follower and support tips fit within
  // this cross-section before the loaded backing profile is checked.
  const outerX=Math.sqrt(Math.max(0,SAFE_RADIUS**2-outerY**2));
  const edge=panelEdgeX(input.host,y-spec.height/2);
  const allowedGap=Math.max(0,Math.min(MAX_GAP/100,outerX-edge-spec.width));
  const gap=clamp(input.gap/100,0,allowedGap),x=sign*(edge+gap+spec.width/2);
  return {side:input.side,host:input.host,gap:gap*100,y,yUnits:y*100,x,z:(spec.depth[0]+spec.depth[1])/2,
    bounds:{minX:x-spec.width/2,maxX:x+spec.width/2,minY:y-spec.height/2,maxY:y+spec.height/2,minZ:spec.depth[0],maxZ:spec.depth[1]}};
}
const overlaps=(a,b)=>a.bounds.minX<b.bounds.maxX+SPACE&&a.bounds.maxX>b.bounds.minX-SPACE&&a.bounds.minY<b.bounds.maxY+SPACE&&a.bounds.maxY>b.bounds.minY-SPACE;
function nearestLegal(id,wanted,others,specs=ADDON_SPECS){
  const first=envelope(id,wanted,specs);if(!first)return null;
  if(!others.some(other=>overlaps(first,other)))return first;
  let best=null,bestCost=Infinity;
  // Search the small two-dimensional feasible region deterministically, then
  // refine nearby. Other controls stay fixed during an individual drag.
  for(const step of [.01,.002]){
    const panel=MAIN_PANELS[wanted.host],spec=specs[id],low=(panel.minY+spec.height/2)*100,high=(panel.maxY-spec.height/2)*100;
    const y0=best?best.yUnits:low,y1=best?best.yUnits:high,span=best?2:100;
    for(let y=Math.max(low,y0-span);y<=Math.min(high,y1+span)+.0001;y+=step*100){
      for(let gap=0;gap<=MAX_GAP+.0001;gap+=step*100){
        const candidate=envelope(id,{...wanted,y,gap},specs);if(!candidate||others.some(other=>overlaps(candidate,other)))continue;
        const cost=(candidate.x-first.x)**2+(candidate.y-first.y)**2;
        if(cost<bestCost){best=candidate;bestCost=cost;}
      }
    }
  }
  return best;
}
export function constrainAddon(id,proposed={},settings={}){
  if(!ADDON_SPECS[id])throw new RangeError('Unknown Oddio addon: '+id);
  const key=prefix(id),merged={...settings,...proposed};
  // Accept either a flat settings patch or unprefixed fields from a drag.
  for(const part of ['Side','Host','Gap','Y']){
    const plain=part[0].toLowerCase()+part.slice(1);
    if(Object.hasOwn(proposed,plain))merged[key+part]=proposed[plain];
  }
  const specs=getAddonSpecs(merged),current=fields(id,merged),placed=resolveAddonLayout(settings),others=IDS.filter(other=>other!==id).map(other=>placed[other]);
  const resolved=nearestLegal(id,current,others,specs)||nearestLegal(id,fields(id,settings),others,specs);
  if(!resolved)return {};
  return {[key+'Side']:resolved.side,[key+'Host']:resolved.host,[key+'Gap']:resolved.gap,[key+'Y']:resolved.yUnits};
}
export function resolveAddonLayout(settings={}){
  const resolved={},specs=getAddonSpecs(settings);
  for(const id of IDS){
    const proposed=fields(id,settings),others=Object.values(resolved);
    let placement=nearestLegal(id,proposed,others,specs);
    // Recover a corrupt stored combination as one known safe layout. Never
    // silently change a neighboring station's host or side during a drag.
    if(!placement)return Object.fromEntries(IDS.map(key=>[key,envelope(key,ADDON_SPECS[key].defaults,specs)]));
    resolved[id]=placement;
  }
  return resolved;
}
