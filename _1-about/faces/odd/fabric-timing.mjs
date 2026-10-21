export const FABRIC_TIMING={start:-60,span:180,subdivision:.2};
export const FABRIC_TIMING_LEVELS=[
  {seconds:30,color:'#d7bda0',glow:.3},
  {seconds:10,color:'#c5a7c8',glow:.3},
  {seconds:5,color:'#a8c9b1',glow:.3},
  {seconds:1,color:'#9ebfc8',glow:.3},
  {seconds:.2,color:null,glow:.15},
];
export function classifyFabricTime(time,tickSpacingMs=200){
  for(const level of FABRIC_TIMING_LEVELS.slice(0,-1)){const step=level.seconds,index=Math.round(time/step);if(Math.abs(time-index*step)<1e-7)return {...level,index,time:index*step};}
  const step=tickSpacingMs/1000,index=Math.round(time/step);
  if(Math.abs(time-index*step)<1e-7)return {seconds:step,color:null,glow:.15,index,time:index*step};
  return null;
}
export function fabricTimingRows(start,end,tickSpacingMs=200){
  const spacing=Number.isFinite(tickSpacingMs)?Math.max(50,Math.min(1000,Math.round(tickSpacingMs))):200;
  const valleys=new Set();
  for(let ms=Math.ceil(start*1000/spacing)*spacing;ms<end*1000;ms+=spacing)valleys.add(ms);
  for(let ms=Math.ceil(start)*1000;ms<end*1000;ms+=1000)valleys.add(ms);
  const sorted=[...valleys].sort((a,b)=>a-b),rows=[];
  for(let i=0;i<sorted.length;i++){
    const ms=sorted[i];rows.push({time:ms/1000,mark:classifyFabricTime(ms/1000,spacing)});
    rows.push({time:(ms+(sorted[i+1]??end*1000))/2000,mark:null});
  }
  return rows;
}
