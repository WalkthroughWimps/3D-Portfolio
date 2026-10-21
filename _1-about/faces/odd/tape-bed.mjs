export const TAPE_BED=Object.freeze({start:0,end:60,view:15,min:-7.5,max:67.5,snap:.18});
export const clampTapePosition=value=>Math.max(TAPE_BED.min,Math.min(TAPE_BED.max,Number.isFinite(value)?value:0));
export function snapTapePosition(value,tolerance=TAPE_BED.snap){
  const position=clampTapePosition(value);
  for(const edge of[TAPE_BED.start,TAPE_BED.end])if(Math.abs(position-edge)<=tolerance)return edge;
  return position;
}
export const heldWindDistance=(seconds,step)=>seconds<=.22?0:Math.sign(step)*(Math.abs(step)===5?12:3)*(seconds-.22);
