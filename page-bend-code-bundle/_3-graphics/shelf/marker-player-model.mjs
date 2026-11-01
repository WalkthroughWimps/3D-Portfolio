import {BOOK_SIZE} from './closed-shape.mjs';
export const SOURCE_SCALE=BOOK_SIZE[2]/(1.44*2.61408091);
export const MAX_IMPERFECTION=4;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const axis=(i,a)=>{const q=[0,0,0,Math.cos(a/2)];q[i]=Math.sin(a/2);return q;};
export const rotate=(v,q)=>mul(mul(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]).slice(0,3);
export const slerp=(a,b,t)=>{
  let d=dot(a,b);if(d<0){b=b.map(v=>-v);d=-d;}
  let q;if(d>.9995)q=a.map((v,i)=>v+(b[i]-v)*t);else{const angle=Math.acos(clamp(d,-1,1)),s=Math.sin(angle);q=a.map((v,i)=>(v*Math.sin((1-t)*angle)+b[i]*Math.sin(t*angle))/s);}
  const length=Math.hypot(...q)||1;return q.map(v=>v/length);
};
const sourceBasis=[.5,-.5,-.5,.5],sourceCenter=[0,-.5,.0225],referenceScale=2.61408091;
export function sourcePageTurns(progress,pageTime){
  // Port of Book.018 Math.005/.025/.001/.022/.017: global time is
  // progress * (1 + (pageCount + 1) * pageTime), offset by index*pageTime.
  const t=clamp(progress/100)*(1+10*pageTime);
  return Array.from({length:11},(_,i)=>clamp(t-i*pageTime));
}
export function createMarkerSampler(metadata,values){
  if(!(values instanceof Float32Array)||values.length*4!==metadata.bytes)throw Error('Motion sample data is incomplete');
  const raw=(frame,offset)=>{
    const f=(clamp(frame,metadata.firstFrame,metadata.lastFrame)-metadata.firstFrame)/metadata.step;
    const lo=Math.floor(f),hi=Math.min(lo+1,(metadata.lastFrame-metadata.firstFrame)/metadata.step),t=f-lo;
    const a=lo*metadata.floatsPerSample+offset,b=hi*metadata.floatsPerSample+offset;
    const result=Array.from({length:offset===78?10:13},(_,i)=>values[a+i]+(values[b+i]-values[a+i])*t);
    result.splice(3,4,...slerp(Array.from(values.subarray(a+3,a+7)),Array.from(values.subarray(b+3,b+7)),t));return result;
  };
  function frame(number,{imperfection=1,thickness=1}={}){
    imperfection=clamp(imperfection,0,MAX_IMPERFECTION);
    const poses=Array.from({length:6},(_,i)=>{
      const p=raw(number,i*13),q=p.slice(3,7),scale=Math.max(0,(p[7]+p[8]+p[9])/3/referenceScale);
      const center=rotate(sourceCenter.map((v,j)=>v*p[7+j]),q);
      const position=p.slice(0,3).map((v,j)=>(v+center[j])*SOURCE_SCALE);
      const baseQuaternion=mul(q,sourceBasis);
      // Static differences in alignment, not an added wobble or bounce track.
      const delta=rotate([.045*imperfection*Math.sin(i*2.4+.3)*scale,0,.04*imperfection*Math.sin(i*1.7+.5)*scale],baseQuaternion);
      const quaternion=mul(baseQuaternion,mul(axis(1,.11*imperfection*Math.sin(i*2.1+.4)),mul(axis(0,.008*imperfection*Math.sin(i*1.3)),axis(2,.007*imperfection*Math.cos(i*1.9)))));
      const turns=sourcePageTurns(p[10],p[11]),progress=turns[0]<1?turns[0]-1:turns[10]>0?9+turns[10]:turns.slice(1,10).reduce((n,t)=>n+t,0);
      return {grade:i+1,position:add(position,delta),basePosition:position,quaternion,baseQuaternion,scale,scaleVector:[p[8],p[9],p[7]].map(v=>v/referenceScale),sourceProgress:p[10],progress,turns,pageTime:p[11],flipStrength:p[12],thickness};
    });
    const p=raw(number,78);
    return {frame:number,poses,shelf:{position:p.slice(0,3).map(v=>v*SOURCE_SCALE),quaternion:p.slice(3,7),scale:p.slice(7,10)}};
  }
  return {metadata,raw,frame};
}
export function corners(pose){
  const bb=pose.localBounds||{min:BOOK_SIZE.map(v=>-v/2),max:BOOK_SIZE.map(v=>v/2)};
  const result=[];
  for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)result.push(add(pose.position,rotate([bb[x?'max':'min'][0],bb[y?'max':'min'][1],bb[z?'max':'min'][2]].map((v,i)=>v*(pose.scaleVector?.[i]??pose.scale)),pose.quaternion)));
  return result;
}
export function worldBounds(pose){const points=corners(pose);return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i])))};}
export function projectedBounds(pose,axes){const points=corners(pose);return axes.map(a=>{const p=points.map(v=>dot(v,a));return [Math.min(...p),Math.max(...p)];});}
export function separateBooks(poses,{planes=false}={}){
  const before=poses.map(p=>p.position.slice());
  const boxes=poses.map(p=>{
    const b=p.localBounds||{min:BOOK_SIZE.map(v=>-v/2),max:BOOK_SIZE.map(v=>v/2)},s=p.scaleVector||[p.scale,p.scale,p.scale];
    return {offset:rotate(b.min.map((v,i)=>(v+b.max[i])/2*s[i]),p.quaternion),half:b.min.map((v,i)=>(b.max[i]-v)/2*s[i]),axes:[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v,p.quaternion))};
  });
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const pairs=[];
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){
    const a=boxes[i],b=boxes[j],axes=[...a.axes,...b.axes,...a.axes.flatMap(v=>b.axes.map(w=>cross(v,w)))].filter(v=>Math.hypot(...v)>1e-6).map(v=>{const n=Math.hypot(...v);return v.map(x=>x/n);});
    pairs.push({i,j,axes,radii:axes.map(n=>a.half.reduce((r,h,k)=>r+h*Math.abs(dot(a.axes[k],n)),0)+b.half.reduce((r,h,k)=>r+h*Math.abs(dot(b.axes[k],n)),0))});
  }
  for(let pass=0;pass<60;pass++){
    let moved=0;
    for(const {i,j,axes,radii} of pairs){
      if(poses[i].scale<1e-6||poses[j].scale<1e-6)continue;
      const d=sub(add(poses[i].position,boxes[i].offset),add(poses[j].position,boxes[j].offset));
      let depth=Infinity,normal;
      for(let k=0;k<axes.length;k++){
        const distance=dot(d,axes[k]),overlap=radii[k]-Math.abs(distance)+.0004;
        if(overlap<=0){depth=0;break;}
        if(overlap<depth){depth=overlap;normal=axes[k].map(v=>v*(distance>=0?1:-1));}
      }
      if(depth>1e-9&&normal){const wi=poses[i].pinned?0:1,wj=poses[j].pinned?0:1,total=wi+wj;if(!total)continue;const shift=normal.map(v=>v*depth/total);poses[i].position=add(poses[i].position,shift.map(v=>v*wi));poses[j].position=sub(poses[j].position,shift.map(v=>v*wj));moved=Math.max(moved,depth);}
    }
    if(moved<1e-8)break;
  }
  const constraints=planes?pairs.map(({i,j,axes,radii})=>{
    const d=sub(add(poses[i].position,boxes[i].offset),add(poses[j].position,boxes[j].offset));
    let depth=Infinity,n=[0,0,1],kMin=0;
    for(let k=0;k<axes.length;k++){const v=dot(d,axes[k]),overlap=radii[k]-Math.abs(v);if(overlap<depth){depth=overlap;kMin=k;n=axes[k].map(x=>x*(v>=0?1:-1));}}
    const raw=sub(add(before[i],boxes[i].offset),add(before[j],boxes[j].offset));
    return {i,j,normal:n,distance:radii[kMin]+.0004-dot(raw,n)};
  }):null;
  return {poses,constraints,maxCorrection:Math.max(...poses.map((p,i)=>Math.hypot(...sub(p.position,before[i]))))};
}
export function supportOnShelf(poses,frame){
  if(frame<6436||frame>6501)return;
  const normal=rotate([0,1,0],poses[5].quaternion);if(Math.abs(normal[0])<.94)return;
  const lo=[-3.9186678,-.0360703,.2942191].map(v=>v*SOURCE_SCALE),hi=[-.6932264,.072971,1.3846324].map(v=>v*SOURCE_SCALE);
  for(const p of poses){const b=worldBounds(p);if(b.max[0]>lo[0]&&b.min[0]<hi[0]&&b.max[2]>lo[2]&&b.min[2]<hi[2])p.position[1]+=Math.max(0,hi[1]+.0003-b.min[1]);}
}
