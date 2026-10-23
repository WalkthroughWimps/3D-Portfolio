// One transform for the bounded wall and every object remaining on its shelf.
// Presence is 1 at home and 0 after retreat. The CSS background is unrelated.
export function roomRetreat(presence,pivot=[0,0,0]){
 const scale=Math.max(0,Math.min(1,presence)),away=1-scale,distance=60*away*away/Math.max(scale,.04);
 return {scale,visible:scale>.0001,distance,position:pivot.map((v,i)=>v*away-(i===2?distance:0))};
}
export const FRONT_SHELF_POLICY=Object.freeze({minAzimuthAngle:0,maxAzimuthAngle:0,minPolarAngle:Math.PI/2,maxPolarAngle:Math.PI/2,minDistance:5,maxDistance:100,enablePan:false});
