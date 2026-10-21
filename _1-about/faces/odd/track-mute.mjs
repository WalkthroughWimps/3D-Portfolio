/** Face-local withdrawal; the center's material coordinate remains fixed. */
export const TRACK_MUTE=Object.freeze({halfSpan:.28,flatSpan:.065,depth:.042,rollerRadius:.007,rollerWidth:.069,rollerZ:.257,railZ:.291,playheadZ:.300,shoulder:.30,drumRadius:.006,drumZ:.242,contactZ:.249});
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=t=>t*t*(3-2*t);
// Short rounded knees surround a straight, tensioned ramp.
function taut(t){const knee=.08;return t<knee?t*t/(2*knee*(1-knee)):t>1-knee?1-(1-t)**2/(2*knee*(1-knee)):(t-knee/2)/(1-knee);}
export function muteOffset(x,amount=1){
  const t=clamp((TRACK_MUTE.halfSpan-Math.abs(x))/(TRACK_MUTE.halfSpan-TRACK_MUTE.flatSpan));
  return t&&amount?-TRACK_MUTE.depth*clamp(amount)*taut(t):0;
}
export function rollerConstraint(x){return 1-smooth(clamp((Math.abs(Math.abs(x)-TRACK_MUTE.shoulder)-.009)/.015));}
/** Constrain the whole cloth width above each rubber drum, including live flex. */
export function guidedMutePoint(p,amount=0){
  const readerContact=1-smooth(clamp((Math.abs(p.x)-.016)/.020));
  const contact=Math.max(rollerConstraint(p.x),readerContact),tension=clamp(amount)*(1-smooth(clamp((Math.abs(p.x)-.28)/.02)));
  p.z+=(TRACK_MUTE.contactZ-p.z)*Math.max(contact,tension);
  p.z+=muteOffset(p.x,amount);p.free*=1-Math.max(contact,tension);return p;
}
export function stepTrackMute(value,muted,dt,reduced=false){
  const target=muted?1:0,next=reduced?target:value+(target-value)*(1-Math.exp(-Math.max(0,dt)*9));
  return Math.abs(next-target)<.0001?target:next;
}

/** Additional cloth supplied by each reel; arc length is anchored at X = 0. */
export function muteArc(x,amount=1){
  const end=Math.min(Math.abs(x),TRACK_MUTE.halfSpan),steps=64,dx=end/steps;
  let length=0,prior=muteOffset(0,amount);
  for(let i=1;i<=steps;i++){const z=muteOffset(i*dx,amount);length+=Math.hypot(dx,z-prior);prior=z;}
  return Math.sign(x)*(length+Math.max(0,Math.abs(x)-TRACK_MUTE.halfSpan));
}
