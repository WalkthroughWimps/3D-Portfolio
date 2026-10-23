import {createMarkerSampler,separateBooks,supportOnShelf,clamp,rotate,dot,add,sub} from './marker-player-model.mjs';

export function boundsAt(table,index,thickness){
  const slot=thickness<=1?0:1,a=table.table[index][slot],b=table.table[index][slot+1];
  const t=clamp((thickness-table.thicknesses[slot])/(table.thicknesses[slot+1]-table.thicknesses[slot]));
  // Cover the small nonlinear change in the sewn binding between thickness samples.
  const padding=.003;
  return {min:a.slice(0,3).map((v,k)=>v+(b[k]-v)*t-padding),max:a.slice(3).map((v,k)=>v+(b[k+3]-v)*t+padding)};
}

// Resolve the complete authored timeline before playback. Contact normals turn
// continuously around edges, then positions relax with look-ahead. Scrubbing reads this same
// track in either direction; there is no render-history-dependent correction.
export function buildClearanceTrack(meta,values,boundsTable,boundsIndex,settings,notify=()=>{}){
  const sampler=createMarkerSampler(meta,values),count=(meta.lastFrame-meta.firstFrame)/meta.step+1;
  const offsets=new Float32Array(count*18),planes=new Float32Array(count*15*4),pairs=[];
  const centers=new Float32Array(count*18),halfSizes=new Float32Array(count*18),boxAxes=new Float32Array(count*54);
  const shelfLimits=new Float32Array(count*6).fill(-Infinity);
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)pairs.push([i,j]);
  const bounds=boundsTable.table.map((_,i)=>boundsAt(boundsTable,i,settings.thickness));
  for(let tick=0;tick<count;tick++){
    const state=sampler.frame(meta.firstFrame+tick*meta.step,settings),raw=state.poses.map(p=>p.position.slice());
    state.poses.forEach((p,i)=>{
      const b=p.localBounds=bounds[boundsIndex[tick*6+i]],s=p.scaleVector,at=tick*18+i*3;
      centers.set(add(p.position,rotate(b.min.map((v,k)=>(v+b.max[k])/2*s[k]),p.quaternion)),at);
      halfSizes.set(b.min.map((v,k)=>(b.max[k]-v)/2*s[k]),at);
      [[1,0,0],[0,1,0],[0,0,1]].forEach((v,k)=>boxAxes.set(rotate(v,p.quaternion),tick*54+i*9+k*3));
    });
    const support=state.poses.map(p=>({...p,position:p.position.slice()}));supportOnShelf(support,meta.firstFrame+tick*meta.step);
    support.forEach((p,i)=>{if(p.position[1]>raw[i][1])shelfLimits[tick*6+i]=p.position[1]-raw[i][1];});
    const resolved=separateBooks(state.poses,{planes:true});
    for(let i=0;i<6;i++)for(let k=0;k<3;k++)offsets[tick*18+i*3+k]=state.poses[i].position[k]-raw[i][k];
    for(let pair=0;pair<15;pair++){
      const c=resolved.constraints[pair],at=(tick*15+pair)*4;
      planes.set(c.normal,at);
      planes[at+3]=c.distance+.0008;
    }
    if(tick%4000===0)notify({stage:'contacts',fraction:tick/count});
  }
  const originalPlanes=planes.slice(),radius=12;
  for(let tick=0;tick<count;tick++)for(let pair=0;pair<15;pair++){
    // The fast grid-to-stack interval also needs continuous contact normals.
    // Keeping its raw frame-wise axes allowed books to cross between samples.
    const [i,j]=pairs[pair],at=(tick*15+pair)*4,mean=[0,0,0];let weight=0;
    for(let d=-radius;d<=radius;d++){
      const t=clamp(tick+d,0,count-1),p=(t*15+pair)*4,w=radius+1-Math.abs(d);weight+=w;
      for(let k=0;k<3;k++){const axis=t*54+i*9+k*3;mean[k]+=(originalPlanes[p]*boxAxes[axis]+originalPlanes[p+1]*boxAxes[axis+1]+originalPlanes[p+2]*boxAxes[axis+2])*w;}
    }
    if(weight<1e-8){planes.set(originalPlanes.subarray(at,at+4),at);continue;}
    for(let k=0;k<3;k++)mean[k]/=weight;
    const localMean=mean.slice();mean.fill(0);
    for(let k=0;k<3;k++)for(let component=0;component<3;component++)mean[component]+=localMean[k]*boxAxes[tick*54+i*9+k*3+component];
    const length=Math.hypot(...mean),a=tick*18+i*3,b=tick*18+j*3;
    const delta=[0,1,2].map(k=>centers[a+k]-centers[b+k]);
    const thin=Array.from(boxAxes.subarray(tick*54+i*9+3,tick*54+i*9+6));
    let guide=sub(delta,thin.map(v=>v*dot(delta,thin))),guideLength=Math.hypot(...guide);
    if(guideLength<.00001){guide=Array.from(boxAxes.subarray(tick*54+i*9,tick*54+i*9+3));guideLength=Math.hypot(...guide);}
    const normal=mean.map((v,k)=>v+guide[k]/guideLength*Math.max(0,.65-length)*3),normalLength=Math.hypot(...normal)||1;
    for(let k=0;k<3;k++)normal[k]/=normalLength;
    planes.set(normal,at);
    let extent=0;
    for(const book of [i,j])for(let k=0;k<3;k++){
      const p=tick*54+book*9+k*3;
      extent+=halfSizes[tick*18+book*3+k]*Math.abs(normal[0]*boxAxes[p]+normal[1]*boxAxes[p+1]+normal[2]*boxAxes[p+2]);
    }
    planes[at+3]=extent+.0012-dot(delta,normal);
  }
  const scratch=new Float32Array(offsets.length),fidelity=.0008,iterations=420;
  for(let iteration=0;iteration<iterations;iteration++){
    for(let tick=0;tick<count;tick++)for(let k=0;k<18;k++){
      const at=tick*18+k,prev=Math.max(0,tick-1)*18+k,next=Math.min(count-1,tick+1)*18+k;
      scratch[at]=(offsets[prev]+offsets[next])*.5*(1-fidelity);
    }
    offsets.set(scratch);
    for(let tick=1;tick<count;tick++){
      const a=(tick-1)*18,b=tick*18;let length=0;
      for(let k=0;k<18;k++)length+=(offsets[b+k]-offsets[a+k])**2;
      length=Math.sqrt(length);
      if(length>.025)for(let k=0;k<18;k++){const delta=(offsets[b+k]-offsets[a+k])*(1-.025/length)*.5;offsets[a+k]+=delta;offsets[b+k]-=delta;}
    }
    for(let tick=1;tick<count-1;tick++){
      const a=(tick-1)*18,b=tick*18,c=(tick+1)*18;let length=0;
      for(let k=0;k<18;k++)length+=(offsets[a+k]-2*offsets[b+k]+offsets[c+k])**2;
      length=Math.sqrt(length);
      if(length>.008)for(let k=0;k<18;k++){const delta=(offsets[a+k]-2*offsets[b+k]+offsets[c+k])*(1-.008/length)/6;offsets[a+k]-=delta;offsets[b+k]+=delta*2;offsets[c+k]-=delta;}
    }
    for(let tick=0;tick<count;tick++)for(let pass=0;pass<8;pass++){
      for(let i=0;i<6;i++)offsets[tick*18+i*3+1]=Math.max(offsets[tick*18+i*3+1],shelfLimits[tick*6+i]);
      for(let pair=0;pair<15;pair++){
      const [i,j]=pairs[pair],a=tick*18+i*3,b=tick*18+j*3,p=(tick*15+pair)*4;
      const need=planes[p+3]-(planes[p]*(offsets[a]-offsets[b])+planes[p+1]*(offsets[a+1]-offsets[b+1])+planes[p+2]*(offsets[a+2]-offsets[b+2]));
      if(need>0)for(let k=0;k<3;k++){const delta=planes[p+k]*need*.5;offsets[a+k]+=delta;offsets[b+k]-=delta;}
      }
    }
    if(iteration%60===0)notify({stage:'smoothing',fraction:iteration/iterations});
  }
  // Finish the small constraint residual to geometric tolerance, including
  // contacts coupled through a stack and the shelf's support plane.
  for(let tick=0;tick<count;tick++)for(let pass=0;pass<180;pass++){
    let residual=0;
    for(let i=0;i<6;i++){const at=tick*18+i*3+1,need=shelfLimits[tick*6+i]-offsets[at];if(need>0){offsets[at]+=need;residual=Math.max(residual,need);}}
    for(let pair=0;pair<15;pair++){
      const [i,j]=pairs[pair],a=tick*18+i*3,b=tick*18+j*3,p=(tick*15+pair)*4;
      const need=planes[p+3]-(planes[p]*(offsets[a]-offsets[b])+planes[p+1]*(offsets[a+1]-offsets[b+1])+planes[p+2]*(offsets[a+2]-offsets[b+2]));
      if(need>0){residual=Math.max(residual,need);for(let k=0;k<3;k++){const delta=planes[p+k]*need*.5;offsets[a+k]+=delta;offsets[b+k]-=delta;}}
    }
    if(residual<1e-7)break;
  }
  let maxResidual=0;
  for(let tick=0;tick<count;tick++)for(let pair=0;pair<15;pair++){
    const [i,j]=pairs[pair],a=tick*18+i*3,b=tick*18+j*3,p=(tick*15+pair)*4;
    maxResidual=Math.max(maxResidual,planes[p+3]-(planes[p]*(offsets[a]-offsets[b])+planes[p+1]*(offsets[a+1]-offsets[b+1])+planes[p+2]*(offsets[a+2]-offsets[b+2])));
  }
  notify({stage:'complete',maxResidual});
  if(maxResidual>.00005)throw Error('This setting did not converge to a clear contact path. Try a nearby alignment or thickness.');
  return offsets;
}

export function applyClearanceTrack(poses,frame,track,meta){
  const index=clamp((frame-meta.firstFrame)/meta.step,0,track.length/18-1),lo=Math.floor(index),hi=Math.min(lo+1,track.length/18-1),t=index-lo;
  let maxCorrection=0;
  for(let i=0;i<6;i++){let length=0;for(let k=0;k<3;k++){const a=lo*18+i*3+k,b=hi*18+i*3+k,v=track[a]+(track[b]-track[a])*t;poses[i].position[k]+=v;length+=v*v;}maxCorrection=Math.max(maxCorrection,Math.sqrt(length));}
  return {poses,maxCorrection};
}
