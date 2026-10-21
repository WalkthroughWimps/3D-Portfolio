const SUPPORT2=.5*.5;
const finite=v=>Number.isFinite(v);

function gridAxis(values){
  const sorted=values.filter(finite).sort((a,b)=>a-b),result=[];
  for(const value of sorted)if(!result.length||value-result.at(-1)>1e-10)result.push(value);
  const dense=[result[0]];
  for(let i=1;i<result.length;i++){
    const start=result[i-1],end=result[i],count=Math.ceil((end-start)/.06);
    for(let k=1;k<count;k++)dense.push(start+(end-start)*k/count);
    dense.push(end);
  }
  return new Float64Array(dense);
}

/** Reuses field buffers while bending each reflected ray about a shared face-local height grid. */
export class RippleFieldCoupler {
  constructor(field,ripple){this.field=field;this.ripple=ripple;this.pathsRef=null;this.geometry=null;
    this.capRevision=-1;this.wasActive=false;this.updateCount=0;this.lastUpdateMs=0;
    this.secondaryRest=[new Float32Array(field.arcs.position.length),new Float32Array(field.particles.position.length)];
    this.captureSecondaryRest();this._rebuild();}
  captureSecondaryRest(){this.secondaryRest[0].set(this.field.arcs.position);this.secondaryRest[1].set(this.field.particles.position);}
  _rebuild(){
    const {field,ripple}=this;
    const sameGeometry=this.geometry===field.geometry;
    this.pathsRef=field.paths;this.capRevision=ripple.capRevision;
    const x=[-1.1,1.1,...ripple.x,...ripple.capX],y=[-1.1,1.1,...ripple.y,...ripple.capY];
    for(const path of field.paths){x.push(path.start[0],path.end[0]);y.push(path.start[1],path.end[1]);}
    this.gridX=gridAxis(x);this.gridY=gridAxis(y);
    const nx=this.gridX.length,ny=this.gridY.length,count=nx*ny;
    const offsets=[0],indices=[],weights=[],slopeDX=[],slopeDY=[],nodes=ripple.x.length,caps=ripple.capX.length;
    for(let yi=0;yi<ny;yi++)for(let xi=0;xi<nx;xi++){
      const px=this.gridX[xi],py=this.gridY[yi];
      let exact=-1,denominator=1;
      const begin=indices.length;
      for(let j=0;j<nodes+caps;j++){
        const isNode=j<nodes,jx=isNode?ripple.x[j]:ripple.capX[j-nodes],jy=isNode?ripple.y[j]:ripple.capY[j-nodes];
        const d2=(px-jx)**2+(py-jy)**2;
        if(d2<1e-16){exact=j;break;}
        if(d2>=SUPPORT2)continue;
        const taper=1-d2/SUPPORT2,w=taper*taper/d2;
        denominator+=w;
        const owner=isNode?(j<ripple.count?j:-1):ripple.capOwner[j-nodes];
        if(owner>=0){indices.push(owner);weights.push(w);slopeDX.push(jx-ripple.x[owner]);slopeDY.push(jy-ripple.y[owner]);}
      }
      if(exact>=0){indices.length=begin;weights.length=begin;slopeDX.length=begin;slopeDY.length=begin;
        const owner=exact<nodes?(exact<ripple.count?exact:-1):ripple.capOwner[exact-nodes];
        if(owner>=0){const jx=exact<nodes?ripple.x[exact]:ripple.capX[exact-nodes],jy=exact<nodes?ripple.y[exact]:ripple.capY[exact-nodes];indices.push(owner);weights.push(1);slopeDX.push(jx-ripple.x[owner]);slopeDY.push(jy-ripple.y[owner]);}}
      else for(let k=begin;k<weights.length;k++)weights[k]/=denominator;
      offsets.push(indices.length);
    }
    this.offsets=new Uint32Array(offsets);this.indices=new Uint8Array(indices);this.weights=new Float32Array(weights);
    this.slopeDX=new Float32Array(slopeDX);this.slopeDY=new Float32Array(slopeDY);
    this.values=new Float32Array(count);this.geometry=field.geometry;
    // A cap-only rebuild can coincide with clear(); retain the dirty flag so
    // the next update writes exact rest buffers on the same geometry.
    this.wasActive=this.wasActive&&sameGeometry;
  }
  _lower(axis,value){let lo=0,hi=axis.length-1;
    if(value<=axis[0])return 0;if(value>=axis[hi])return hi-1;
    while(hi-lo>1){const middle=(lo+hi)>>1;if(axis[middle]<=value)lo=middle;else hi=middle;}
    return lo;
  }
  sample(x,y){const xs=this.gridX,ys=this.gridY,xi=this._lower(xs,x),yi=this._lower(ys,y),nx=xs.length;
    const tx=Math.max(0,Math.min(1,(x-xs[xi])/(xs[xi+1]-xs[xi]))),ty=Math.max(0,Math.min(1,(y-ys[yi])/(ys[yi+1]-ys[yi])));
    const row=yi*nx+xi,v=this.values;
    return (v[row]*(1-tx)+v[row+1]*tx)*(1-ty)+(v[row+nx]*(1-tx)+v[row+nx+1]*tx)*ty;
  }
  update(){
    const started=performance.now(),{field,ripple}=this;
    if(this.pathsRef!==field.paths||this.capRevision!==ripple.capRevision||this.geometry!==field.geometry)this._rebuild();
    const active=!ripple.sleeping;
    if(!active&&!this.wasActive)return false;
    if(active){
      const v=this.values,h=ripple.height,sx=ripple.slopeX,sy=ripple.slopeY;
      for(let i=0;i<v.length;i++){
        let sum=0;for(let k=this.offsets[i];k<this.offsets[i+1];k++){
          const owner=this.indices[k];sum+=this.weights[k]*Math.max(-.006,Math.min(.006,h[owner]+sx[owner]*this.slopeDX[k]+sy[owner]*this.slopeDY[k]));
        }
        v[i]=sum;
      }
    }else this.values.fill(0);
    const position=field.geometry.attributes.position,tangent=field.geometry.attributes.segmentTangent;
    const pos=position.array,tan=tangent.array,rest=field.restPositions,alongs=field.vertexAlong;
    const startOffsets=field.latticeStart,endOffsets=field.latticeEnd;
    for(const state of field.rayStates){
      const path=field.paths[state.pi],sx=path.start[0],sy=path.start[1],dx=path.end[0]-sx,dy=path.end[1]-sy;
      const offset=state.pi*3,lz=startOffsets[offset+2],dz=endOffsets[offset+2]-lz;
      for(let k=0;k<field.options.maxSegments;k++){
        const v=state.first+k*4,a=alongs[v],b=alongs[v+2];
        const ha=active?this.sample(sx+dx*a,sy+dy*a):0,hb=active?this.sample(sx+dx*b,sy+dy*b):0;
        for(let j=0;j<4;j++){
          const index=(v+j)*3,u=j<2?a:b;
          pos[index+2]=rest[index+2]+lz+dz*u+(j<2?ha:hb);
          const points=state.evidence.points;
          tan[index+2]=(k<points.length-1?rest[(v+2)*3+2]-rest[v*3+2]:state.axis.z)+hb-ha;
        }
      }
    }
    for(let poolIndex=0;poolIndex<2;poolIndex++){
      const pool=poolIndex?field.particles:field.arcs,base=this.secondaryRest[poolIndex],array=pool.position;
      const count=pool.active*(poolIndex?1:2);
      for(let i=0;i<count;i++){
        const j=i*3;
        array[j+2]=base[j+2]+(active?this.sample(base[j],base[j+1]):0);
      }
      if(count)pool.mesh.geometry.attributes.position.needsUpdate=true;
    }
    position.clearUpdateRanges();position.addUpdateRange(0,pos.length);position.needsUpdate=true;
    tangent.clearUpdateRanges();tangent.addUpdateRange(0,tan.length);tangent.needsUpdate=true;
    this.wasActive=active;this.updateCount++;this.lastUpdateMs=performance.now()-started;
    return true;
  }
  getStats(){return{grid:[this.gridX.length,this.gridY.length],gridPoints:this.values.length,
    sparseWeights:this.weights.length,updates:this.updateCount,lastUpdateMs:this.lastUpdateMs,
    geometryReused:this.geometry===this.field.geometry};}
  dispose(){this.values.fill(0);this.wasActive=true;this.ripple.clear();this.update();this.geometry=null;}
}
