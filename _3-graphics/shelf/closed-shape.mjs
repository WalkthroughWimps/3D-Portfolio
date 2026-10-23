// The existing connected binding, evaluated once for a closed, inexpensive book.
import {createSheetData,poseSheet,WIDTH,HEIGHT} from './page-geometry.mjs';
import {bindingModel,DEFAULT_BINDING} from './binding-model.mjs';
export function closedShape(settings={}){
  const model=bindingModel(-1,{...DEFAULT_BINDING,...settings}),parts=[];
  for(const [name,nx,pose] of [['front',8,model.cover('front',8)],['back',8,model.cover('back',8)],
    ['spine',20,model.spine()],['block',8,model.proxy(8)]]){
    const data=createSheetData({width:pose.width??WIDTH,height:pose.height??HEIGHT,thickness:pose.thickness,nx,nz:1});poseSheet(data,pose);parts.push({name,data});
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const {data} of parts)for(let i=0;i<data.positions.length;i++){const a=i%3;min[a]=Math.min(min[a],data.positions[i]);max[a]=Math.max(max[a],data.positions[i]);}
  const size=max.map((v,i)=>v-min[i]),center=max.map((v,i)=>(v+min[i])/2);
  for(const {data} of parts)for(let i=0;i<data.positions.length;i++)data.positions[i]-=center[i%3];
  return {parts,size,center,triangles:parts.reduce((n,p)=>n+p.data.indices.length/3,0)};
}
export const BOOK_SIZE=Object.freeze(closedShape().size);
