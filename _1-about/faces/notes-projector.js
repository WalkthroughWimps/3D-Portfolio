import * as THREE from 'three';

/** A shielded optical head on the Notes arm; its image borrows the live glass texture. */
export function createNotesProjector(parent, cube, face) {
  const group = new THREE.Group(); group.name = 'Notes shielded projector'; parent.add(group);
  const resources = new Set(), own = value => { resources.add(value); return value; };
  const metal = own(new THREE.MeshStandardMaterial({color:0x263844,metalness:.7,roughness:.35}));
  const brass = own(new THREE.MeshStandardMaterial({color:0xbba578,metalness:.65,roughness:.35}));
  function mesh(geometry,material,name,x) { const node = new THREE.Mesh(own(geometry),material); node.name = name; node.position.x = x; group.add(node); return node; }
  mesh(new THREE.CylinderGeometry(.015,.015,.095,12),brass,'Notes projector control arm',-.383).rotation.z = Math.PI/2;
  mesh(new THREE.CylinderGeometry(.042,.035,.075,24),metal,'Recessed optical barrel',-.439).rotation.z = Math.PI/2;
  const lensMaterial = own(new THREE.MeshBasicMaterial({color:0x89bfd0,transparent:true,opacity:.5,toneMapped:true}));
  mesh(new THREE.CircleGeometry(.025,32),lensMaterial,'Soft blue projector lens',-.478).rotation.y = -Math.PI/2;
  const haloMaterial = own(new THREE.MeshBasicMaterial({color:0x8ed6de,transparent:true,opacity:.24,depthWrite:false}));
  const halo = mesh(new THREE.TorusGeometry(.038,.003,6,48),haloMaterial,'Projector side light',-.459); halo.rotation.y = Math.PI/2;
  const beamMaterial = own(new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{},vertexShader:'varying vec3 n,v; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n,v;void main(){float edge=pow(1.-abs(dot(normalize(n),normalize(v))),2.);gl_FragColor=vec4(.36,.64,.72,.008+.025*edge);}'}));
  const beam = mesh(new THREE.CylinderGeometry(.885,.025,.488,64,1,true),beamMaterial,'Notes optical cone to third glass ring',-.722); beam.rotation.z = Math.PI/2;
  const profile = [], point = new THREE.Vector3(); cube.updateWorldMatrix(true,true);
  const inverse = cube.matrixWorld.clone().invert(), samples = [];
  face.backing?.traverse(node => { if (!node.isMesh) return; const transform = inverse.clone().multiply(node.matrixWorld), p = node.geometry.attributes.position;
    for (let i=0;i<p.count;i++) { point.fromBufferAttribute(p,i).applyMatrix4(transform); const r=Math.hypot(point.y,point.z); if (r<.4) samples.push({r,x:point.x}); }
  });
  samples.sort((a,b)=>a.r-b.r);
  for (const sample of samples) { const last=profile.at(-1); if(last&&sample.r-last.r<.003)last.x=Math.max(last.x,sample.x);else profile.push({...sample}); }
  const depth=r=>{const i=profile.findIndex(p=>p.r>=r);if(i<=0)return(profile[Math.max(0,i)]?.x??-.53)+.002;const a=profile[i-1],b=profile[i];return THREE.MathUtils.lerp(a.x,b.x,(r-a.r)/(b.r-a.r))+.002;};
  const positions=[],uv=[],indices=[];
  for(let row=0;row<=16;row++)for(let col=0;col<=64;col++){const r=.23*row/16,a=col*Math.PI/32,y=Math.sin(a)*r,z=Math.cos(a)*r;positions.push(depth(r),y,z);uv.push(.5+z/.46,.5+y/.46);if(row<16&&col<64){const i=row*65+col;indices.push(i,i+65,i+1,i+1,i+65,i+66);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  const imageMaterial=own(new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{image:{value:null},roll:{value:0}},vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 p;uniform sampler2D image;uniform float roll;void main(){vec2 q=p-.5;float c=cos(roll),s=sin(roll);q=mat2(c,-s,s,c)*q;vec4 ink=texture2D(image,.5+q*.992);float edge=1.-smoothstep(.47,.5,length(q));gl_FragColor=vec4(ink.rgb*.72,ink.a*.8*edge);}'}));
  const image=mesh(geometry,imageMaterial,'Notes live curved backing projection',0);
  const glassCenter = new THREE.Vector3();
  let snapshot={};
  return {group,update(){const source=face.runtime?.projectionSource,notes=snapshot.about?.notes||{};group.visible=notes.enabled!==false;const active=notes.projector!==false;halo.visible=active;haloMaterial.opacity=active ? .24 : 0;lensMaterial.opacity=active ? .5 : .12;beam.visible=active&&!face.backing?.visible;image.visible=active&&notes.backingProjection!==false&&Boolean(face.backing?.visible&&source);if(source){
    imageMaterial.uniforms.image.value=source.texture;imageMaterial.uniforms.roll.value=source.carrier.rotation.z;
    source.carrier.getWorldPosition(glassCenter);parent.worldToLocal(glassCenter);
    const length=Math.max(.01,-.478-glassCenter.x),radius=source.radius/.885;
    beam.position.x=(glassCenter.x-.478)/2;beam.scale.set(radius,length/.488,radius);
  }},applySettings(next){snapshot=next;},dispose(){group.removeFromParent();resources.forEach(resource=>resource.dispose());resources.clear();}};
}
