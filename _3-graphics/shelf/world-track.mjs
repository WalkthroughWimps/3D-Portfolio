import {clamp,slerp} from './marker-player-model.mjs';
const tangent=(a,b)=>a*b<=0?0:2*a*b/(a+b);
export function sampleWorldTrack(data,values,frame,part){
  const f=clamp(frame-data.firstFrame,0,data.lastFrame-data.firstFrame),lo=Math.floor(f),hi=Math.min(data.lastFrame-data.firstFrame,lo+1),t=f-lo,t2=t*t,t3=t2*t;
  const v=(f,k)=>values[clamp(f,0,data.lastFrame-data.firstFrame)*data.stride+part*10+k],sample=[];
  for(const k of [0,1,2,7,8,9]){const a=v(lo,k),b=v(hi,k),d=b-a;sample[k]=(2*t3-3*t2+1)*a+(t3-2*t2+t)*tangent(a-v(lo-1,k),d)+(-2*t3+3*t2)*b+(t3-t2)*tangent(d,v(hi+1,k)-b);}
  sample.splice(3,4,...slerp([3,4,5,6].map(k=>v(lo,k)),[3,4,5,6].map(k=>v(hi,k)),t));return sample;
}
