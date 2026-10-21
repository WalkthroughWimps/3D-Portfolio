/** Arrow clicks retain tenths; secondary clicks move by one whole multiplier. */
export function stepInnerSpeed(value,direction,coarse=false){
  const current=Number.isFinite(Number(value))?Number(value):1;
  return Math.round(Math.max(.2,Math.min(5,current+(direction<0?-1:1)*(coarse?1:.1)))*10)/10;
}
