import * as THREE from 'three';

const AXES=['H','V','D+','D-'];
const DYNAMIC_TRACE_ATTRIBUTES=['position','segmentTangent','along','flowXY','flowDistance'];
const STYLES=['minThickness','maxThickness','widthVariation','entryAngle','angleVariation','reflectionDensity','motionSpeed','intensity','glow','launchRandomness','spacingVariation','phaseVariation','motionVariation','minLaunchAngle','maxLaunchAngle','launchSpeed','aimSpeed','aimWander'];
const LIMITS={strandCount:[1,8],currentStrand:[0,7],minThickness:[.0001,.003],maxThickness:[.0001,.004],widthVariation:[0,1],entryAngle:[-180,180],angleVariation:[0,90],reflectionDensity:[2,100],maxSegments:[4,96],envelopeRatio:[.3,1.6],axleDiameter:[.006,.014],motionSpeed:[0,6],rimFade:[0,1],flowRadius:[.1,2],intensity:[0,2],glow:[0,1.5],launchRandomness:[0,1],spacingVariation:[0,1],phaseVariation:[0,1],motionVariation:[0,1],arcFrequency:[0,20],arcIntensity:[0,2],arcLifetime:[.04,2],arcSpread:[0,.03],arcSize:[.001,.04],particleFrequency:[0,40],particleBrightness:[0,2],particleSize:[1,16],particleSpeed:[0,.2],particleLifetime:[.05,3],particleMaxTravel:[0,.04],excursionAmplitude:[0,.03],minLaunchAngle:[0,75],maxLaunchAngle:[0,75],launchSpeed:[0,2],aimSpeed:[0,2],aimWander:[0,1],seed:[1,1000000]};
const COLORS={red:'#f46465',blue:'#65baff',green:'#78ed91'};
const PALETTES=['red','blue','green','red-blue','rgb','custom'];
const BOOLS=['enabled','arcsEnabled','particlesEnabled','reducedMotion','paused','xrayReview','directionColorsEnabled','excursionsEnabled','animatePaths'];
export const defaultReflectedOptions=Object.freeze({strandCount:5,currentStrand:0,editTarget:'all',minThickness:.00035,maxThickness:.00085,widthVariation:.32,entryAngle:18,angleVariation:17,reflectionDensity:58,maxSegments:96,envelopeRatio:1,axleDiameter:.01,motionSpeed:.05,centerRole:'terminus',rimFade:.7,flowRadius:.94,intensity:.63,glow:.23,launchRandomness:.8,spacingVariation:.45,phaseVariation:1,motionVariation:.2,minLaunchAngle:7,maxLaunchAngle:32,launchSpeed:.2,aimSpeed:.12,aimWander:.65,animatePaths:true,palettePreset:'custom',paletteCounts:{red:3,blue:2,green:0},colorA:'#f46465',colorB:'#65baff',colorC:'#78ed91',colorMode:'per-strand',strandOverrides:[],directionColorsEnabled:false,directionColors:{H:null,V:null,'D+':null,'D-':null},enabled:true,arcsEnabled:false,arcFrequency:.65,arcIntensity:.45,arcLifetime:.26,arcSpread:.007,arcSize:.015,particlesEnabled:false,particleFrequency:1.4,particleBrightness:.5,particleSize:3.5,particleSpeed:.035,particleLifetime:.42,particleMaxTravel:.012,excursionsEnabled:false,excursionAmplitude:.006,reducedMotion:false,paused:false,xrayReview:false,seed:113});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const hex=(x,fallback=null)=>typeof x==='string'&&/^#[0-9a-f]{6}$/i.test(x)?x.toLowerCase():fallback;
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const random=n=>{const x=Math.sin(n*127.1+78.233)*43758.5453;return x-Math.floor(x)};
function smoothNoise(t,seed){const i=Math.floor(t),f=t-i,u=f*f*f*(f*(f*6-15)+10);return (random(seed+i*37)*(1-u)+random(seed+(i+1)*37)*u)*2-1;}
const keyOf=(axis,index)=>`${axis}:${index}`;
const color3=h=>new THREE.Color(h);
function defaultCounts(preset,n){if(preset==='blue')return{red:0,blue:n,green:0};if(preset==='green')return{red:0,blue:0,green:n};if(preset==='red-blue')return{red:Math.ceil(n/2),blue:Math.floor(n/2),green:0};if(preset==='rgb'){const red=Math.ceil(n/3),blue=Math.ceil((n-red)/2);return{red,blue,green:n-red-blue};}return{red:n,blue:0,green:0};}
function normalizeCounts(input,n){const c={red:0,blue:0,green:0};for(const k of Object.keys(c))c[k]=clamp(Math.floor(Number(input?.[k])||0),0,n);let sum=c.red+c.blue+c.green;for(const k of ['red','blue','green']){if(sum<n){c[k]+=n-sum;sum=n;}if(sum>n){const drop=Math.min(c[k],sum-n);c[k]-=drop;sum-=drop;}}return c;}
function pool(capacity,points){const count=capacity*(points?1:2),position=new Float32Array(count*3),alpha=new Float32Array(count),size=new Float32Array(count),color=new Float32Array(count*3);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('alpha',new THREE.BufferAttribute(alpha,1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('pointSize',new THREE.BufferAttribute(size,1).setUsage(THREE.DynamicDrawUsage));g.setAttribute('color',new THREE.BufferAttribute(color,3).setUsage(THREE.DynamicDrawUsage));g.setDrawRange(0,0);const m=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uBrightness:{value:.5}},vertexShader:`attribute float alpha;attribute float pointSize;attribute vec3 color;varying float vAlpha;varying vec3 vColor;void main(){vAlpha=alpha;vColor=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=max(1.,pointSize);}`,fragmentShader:`uniform float uBrightness;varying float vAlpha;varying vec3 vColor;void main(){${points?'float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float mask=1.-smoothstep(.25,1.,r);':'float mask=1.;'}gl_FragColor=vec4(vColor,clamp(vAlpha*uBrightness*mask,0.,1.));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});const mesh=points?new THREE.Points(g,m):new THREE.LineSegments(g,m);mesh.frustumCulled=false;return{mesh,position,alpha,size,color,entries:Array.from({length:capacity},()=>({life:0,at:[0,0,0],rgb:[0,0,0]})),capacity,points,active:0};}
function ribbonMaterial(halo){return new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:halo?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{uTime:{value:0},uHalo:{value:halo?1:0},uReduced:{value:0},uFlowSign:{value:1},uRimFade:{value:.7},uFlowRadius:{value:.94},uContrast:{value:1}},vertexShader:`attribute vec3 segmentTangent;attribute float sideSign;attribute vec2 flowXY;attribute float flowDistance;attribute vec3 widthStyle;attribute float speed;attribute float intensity;attribute float glow;attribute vec3 baseColor;attribute vec3 altColor;attribute vec3 thirdColor;attribute float phaseOffset;
uniform float uTime,uHalo,uReduced,uFlowSign,uRimFade,uFlowRadius;
varying float vSide,vIntensity,vGlow,vSpeed,vPhaseOffset;varying vec2 vFlowXY;varying float vFlowDistance;varying vec3 vBase,vAlt,vThird;
void main(){float widthMin=widthStyle.x,widthMax=widthStyle.y,widthVar=widthStyle.z;vSide=sideSign;vIntensity=intensity;vGlow=glow;vSpeed=speed;vPhaseOffset=phaseOffset;vFlowXY=flowXY;vFlowDistance=flowDistance;vBase=baseColor;vAlt=altColor;vThird=thirdColor;float phase=abs(flowDistance)*48.+uFlowSign*uTime*speed*(1.-uReduced)*48.+phaseOffset;vec3 axis=normalize(mat3(modelMatrix)*segmentTangent);vec3 center=(modelMatrix*vec4(position,1.)).xyz;vec3 toEye=normalize(cameraPosition-center);vec3 raw=cross(axis,toEye);vec3 fallback=normalize(cross(axis,abs(axis.z)>.9?vec3(0.,1.,0.):vec3(0.,0.,1.)));vec3 facing=length(raw)<.0001?fallback:normalize(raw);float width=mix(widthMin,widthMax,.5+.5*sin(phase))*mix(1.,.78+.22*sin(phase*1.3),widthVar);width*=uHalo>.5?3.6:1.;center+=facing*sideSign*width*.5;gl_Position=projectionMatrix*viewMatrix*vec4(center,1.);}`,fragmentShader:`uniform float uTime,uHalo,uReduced,uFlowSign,uRimFade,uFlowRadius,uContrast;varying float vSide,vIntensity,vGlow,vSpeed,vPhaseOffset;varying vec2 vFlowXY;varying float vFlowDistance;varying vec3 vBase,vAlt,vThird;void main(){float radius=length(vFlowXY);float phase=abs(vFlowDistance)*48.+uFlowSign*uTime*vSpeed*(1.-uReduced)*48.+vPhaseOffset;float rim=1.-.78*uRimFade*(1.-smoothstep(0.,uFlowRadius,radius));float blend=.5+.5*sin(phase*.77);vec3 color=mix(vBase,vAlt,smoothstep(.08,.8,blend));color=mix(color,vThird,smoothstep(.62,1.,blend)*.7);float edge=1.-smoothstep(.1,1.,abs(vSide));float pulse=.88+.12*sin(phase*1.37);float alpha=clamp(vIntensity*rim*pulse*edge*(uHalo>.5?vGlow*.18:1.25)*uContrast,0.,1.);gl_FragColor=vec4(color,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});}

/** Analytic ray/circle hits in the 2-D cross-section, followed by specular reflection. */
export function traceCylindricalReflection(length,radius,{entryAngle=0,angleVariation=0,reflectionDensity=36,maxSegments=64,seed=1,strand=0,launchRandomness=0,spacingVariation=0,minLaunchAngle,maxLaunchAngle,launchX,launchY,launchHeading,launchAngle,buffer}={}){
  if(!Number.isFinite(length)||length<=0||!Number.isFinite(radius)||radius<=0)throw new RangeError('Invalid channel');
  maxSegments=Math.round(clamp(Number.isFinite(maxSegments)?maxSegments:64,4,96));
  launchRandomness=clamp(Number.isFinite(launchRandomness)?launchRandomness:0,0,1);
  spacingVariation=clamp(Number.isFinite(spacingVariation)?spacingVariation:0,0,1);
  const angle=Number.isFinite(launchHeading)?launchHeading:(entryAngle+(random(seed*37+strand*11)-.5)*2*angleVariation+strand*137.5+(random(seed*97+strand*23)-.5)*360*launchRandomness)*Math.PI/180;
  const offsetAngle=angle+1.1+launchRandomness*(random(seed*19+strand*47)-.5)*Math.PI*2;
  const offsetRadius=radius*(.08*(1-launchRandomness)+.94*launchRandomness*Math.sqrt(random(seed*53+strand*29)));
  let s=0,ux=Number.isFinite(launchX)?launchX:offsetRadius*Math.cos(offsetAngle),uy=Number.isFinite(launchY)?launchY:offsetRadius*Math.sin(offsetAngle);
  const dx=Math.cos(angle),dy=Math.sin(angle),impact=Math.abs(ux*dy-uy*dx);
  const chord=2*Math.sqrt(Math.max(radius*radius-impact*impact,radius*radius*.01));
  const baseDensity=Math.min(reflectionDensity,(maxSegments-1)/length/(1+.75*spacingVariation));
  const variedDensity=baseDensity*(1+(random(seed*71+strand*89)-.5)*1.5*spacingVariation);
  const density=Math.max(.01,Math.min(variedDensity,(maxSegments-1)/length));
  const useAngles=Number.isFinite(minLaunchAngle)&&Number.isFinite(maxLaunchAngle);
  const lo=clamp(Math.min(minLaunchAngle,maxLaunchAngle)||0,0,75),hi=clamp(Math.max(minLaunchAngle,maxLaunchAngle)||0,0,75);
  const desiredAngle=Number.isFinite(launchAngle)?clamp(launchAngle,0,75):lo+(hi-lo)*random(seed*83+strand*61);
  const requestedSlope=useAngles||Number.isFinite(launchAngle)?Math.tan(desiredAngle*Math.PI/180):chord*density;
  const slope=Math.max(1e-9,Math.min(requestedSlope,chord*(maxSegments-1)/length));
  let vx=slope*dx,vy=slope*dy;
  const points=buffer?buffer.points:[],eps=1e-8;let count=1;
  const first=buffer?buffer.slots[0]:{s:0,u:[0,0]};first.s=0;first.u[0]=ux;first.u[1]=uy;points[0]=first;
  for(let k=0;k<maxSegments&&s<length-eps;k++){
    const a=vx*vx+vy*vy,b=2*(ux*vx+uy*vy),c=ux*ux+uy*uy-radius*radius;
    const discr=Math.max(0,b*b-4*a*c),root=(-b+Math.sqrt(discr))/(2*a);
    const travel=Math.min(length-s,root>eps?root:length-s);
    s+=travel;ux+=vx*travel;uy+=vy*travel;
    if(s<length-eps){const mag=Math.hypot(ux,uy)||1,nx=ux/mag,ny=uy/mag;ux=nx*radius;uy=ny*radius;const vn=vx*nx+vy*ny;vx-=2*vn*nx;vy-=2*vn*ny;}
    const q=buffer?buffer.slots[count]:{s:0,u:[0,0]};q.s=s;q.u[0]=ux;q.u[1]=uy;points[count++]=q;
  }
  points.length=count;
  if(points.at(-1).s<length-1e-6)throw new Error('Reflection segment budget exhausted');
  return points;
}

export class ReflectedFilamentField extends THREE.Group{
  constructor(paths=[],options={}){super();this.name='ReflectedFilamentField';this.contrastGain=1;this.options={...defaultReflectedOptions,paletteCounts:{...defaultReflectedOptions.paletteCounts},directionColors:{...defaultReflectedOptions.directionColors},strandOverrides:[]};this.paths=[];this.clockTime=0;this.pathTime=0;this.pathUpdateTotal=0;this.lastElapsed=null;this.arcCarry=0;this.particleCarry=0;this.serial=0;this._tmpColor=new THREE.Color();this.coreMaterial=ribbonMaterial(false);this.haloMaterial=ribbonMaterial(true);this.arcs=pool(96,false);this.particles=pool(160,true);this.add(this.arcs.mesh,this.particles.mesh);this.setPaths(paths);this.setOptions(options);}
  setContrastGain(gain){this.contrastGain=clamp(Number.isFinite(gain)?gain:1,0,2);for(const material of [this.coreMaterial,this.haloMaterial])material.uniforms.uContrast.value=this.contrastGain;this.arcs.mesh.material.uniforms.uBrightness.value=this.options.arcIntensity*this.contrastGain;this.particles.mesh.material.uniforms.uBrightness.value=this.options.particleBrightness*this.contrastGain;return this;}
  setPaths(paths,{axleDiameter=this.options.axleDiameter}={}){if(!Array.isArray(paths))throw new TypeError('paths array required');this.options.axleDiameter=clamp(Number.isFinite(axleDiameter)?axleDiameter:this.options.axleDiameter,.006,.014);const ids=new Set();this.paths=Object.freeze(paths.map((p,i)=>{if(!finite(p.start)||!finite(p.end)||!AXES.includes(p.axis))throw new TypeError(`Invalid path ${i}`);const length=Math.hypot(...p.end.map((v,j)=>v-p.start[j]));if(length<.006)throw new RangeError(`Short path ${i}`);const id=String(p.id??i);if(ids.has(id))throw new Error(`Duplicate path ${id}`);ids.add(id);return Object.freeze({id,axis:p.axis,start:Object.freeze([...p.start]),end:Object.freeze([...p.end]),length,gapWindows:Object.freeze((p.gapWindows||[]).map(w=>Object.freeze([...w])))});}));this.gapSites=Object.freeze(this.paths.flatMap((p,index)=>p.gapWindows.map(w=>Object.freeze({index,a:w[0],b:w[1]}))));this.latticeStart=new Float32Array(this.paths.length*3);this.latticeEnd=new Float32Array(this.paths.length*3);for(const p of [this.arcs,this.particles]){for(const e of p.entries)e.life=0;p.active=0;p.mesh.geometry.setDrawRange(0,0);}this.rebuildGeometry();return this;}
  setEditTarget(target){if(target!=='all'&&(!Number.isInteger(target)||target<0||target>=this.options.strandCount))throw new RangeError('edit target');this.options.editTarget=target;this.options.currentStrand=target==='all'?this.options.currentStrand:target;return this;}
  setOptions(partial={}){if(!partial||typeof partial!=='object')throw new TypeError('options object');
    if(Object.hasOwn(partial,'renewPaths')||Object.hasOwn(partial,'burstRate')||Object.hasOwn(partial,'burstVariation')){
      partial={...partial};if(!Object.hasOwn(partial,'animatePaths')&&Object.hasOwn(partial,'renewPaths'))partial.animatePaths=partial.renewPaths;
      if(!Object.hasOwn(partial,'aimSpeed')&&Number.isFinite(partial.burstRate))partial.aimSpeed=partial.burstRate/28;
      if(!Object.hasOwn(partial,'aimWander')&&Number.isFinite(partial.burstVariation))partial.aimWander=partial.burstVariation;
    }
    const o=this.options;
    if(Object.hasOwn(partial,'editTarget'))this.setEditTarget(partial.editTarget);
    const target=o.editTarget;
    for(const [key,value] of Object.entries(partial)){
      if(key==='editTarget')continue;
      if(STYLES.includes(key)&&target!=='all'){
        if(!Number.isFinite(value))continue;const [lo,hi]=LIMITS[key];const all=[...o.strandOverrides];all[target]={...(all[target]||{}),[key]:clamp(value,lo,hi)};o.strandOverrides=all;continue;
      }
      if(Object.hasOwn(LIMITS,key)){if(!Number.isFinite(value))continue;const [lo,hi]=LIMITS[key];o[key]=key==='strandCount'||key==='maxSegments'||key==='seed'||key==='currentStrand'?Math.round(clamp(value,lo,hi)):clamp(value,lo,hi);if(STYLES.includes(key)&&target==='all')o.strandOverrides=o.strandOverrides.map(entry=>{if(!entry)return entry;const copy={...entry};delete copy[key];return copy;});}
      else if(BOOLS.includes(key))o[key]=Boolean(value);
      else if(key==='palettePreset'&&PALETTES.includes(value)){o.palettePreset=value;if(value!=='custom')o.paletteCounts=defaultCounts(value,o.strandCount);}
      else if(key==='paletteCounts')o.paletteCounts=normalizeCounts(value,o.strandCount);
      else if(key==='directionColors'&&value&&typeof value==='object'){for(const axis of AXES)if(Object.hasOwn(value,axis))o.directionColors[axis]=value[axis]===null?null:hex(value[axis],o.directionColors[axis]);}
      else if(['colorA','colorB','colorC'].includes(key))o[key]=hex(value,o[key]);
      else if(key==='colorMode'&&['single','per-strand','flowing'].includes(value))o.colorMode=value;
      else if(key==='centerRole'&&['terminus','origin'].includes(value))o.centerRole=value;
    }
    if(Array.isArray(partial.strandOverrides))o.strandOverrides=partial.strandOverrides.slice(0,8).map(x=>this.sanitizeStrandOverride(x));
    this.normalizeLaunchAngles(partial);
    o.currentStrand=clamp(o.currentStrand,0,o.strandCount-1);if(o.editTarget!=='all'&&o.editTarget>=o.strandCount)o.editTarget='all';
    if(o.paletteCounts.red+o.paletteCounts.blue+o.paletteCounts.green!==o.strandCount)o.paletteCounts=defaultCounts(o.palettePreset,o.strandCount);
    if(o.minThickness>o.maxThickness)o.maxThickness=o.minThickness;
    if(partial.palettePreset==='rgb'&&!Object.hasOwn(partial,'colorMode'))o.colorMode='flowing';
    this.visible=o.enabled;this.arcs.mesh.visible=o.arcsEnabled&&!o.reducedMotion;this.particles.mesh.visible=o.particlesEnabled&&!o.reducedMotion;
    const depth=!o.xrayReview;for(const m of [this.coreMaterial,this.haloMaterial,this.arcs.mesh.material,this.particles.mesh.material])if(m.depthTest!==depth){m.depthTest=depth;m.needsUpdate=true;}
    this.coreMaterial.uniforms.uReduced.value=o.reducedMotion?1:0;this.haloMaterial.uniforms.uReduced.value=o.reducedMotion?1:0;
    for(const m of [this.coreMaterial,this.haloMaterial]){m.uniforms.uFlowSign.value=o.centerRole==='origin'?-1:1;m.uniforms.uRimFade.value=o.rimFade;m.uniforms.uFlowRadius.value=o.flowRadius;}
    this.arcs.mesh.material.uniforms.uBrightness.value=o.arcIntensity*this.contrastGain;this.particles.mesh.material.uniforms.uBrightness.value=o.particleBrightness*this.contrastGain;
    this.refreshGeometry();return this;
  }
  normalizeLaunchAngles(partial){
    const o=this.options;
    const normalize=(holder,fallback)=>{
      const lo=holder.minLaunchAngle??fallback.minLaunchAngle,hi=holder.maxLaunchAngle??fallback.maxLaunchAngle;
      if(lo<=hi)return;
      if(Object.hasOwn(partial,'maxLaunchAngle')&&!Object.hasOwn(partial,'minLaunchAngle'))holder.minLaunchAngle=hi;
      else holder.maxLaunchAngle=lo;
    };
    normalize(o,o);for(const entry of o.strandOverrides)if(entry)normalize(entry,o);
  }
  sanitizeStrandOverride(x){if(!x||typeof x!=='object')return{};const result={};for(const key of STYLES)if(Number.isFinite(x[key]))result[key]=clamp(x[key],...LIMITS[key]);if(!Number.isFinite(x.aimSpeed)&&Number.isFinite(x.burstRate))result.aimSpeed=clamp(x.burstRate/28,...LIMITS.aimSpeed);if(!Number.isFinite(x.aimWander)&&Number.isFinite(x.burstVariation))result.aimWander=clamp(x.burstVariation,...LIMITS.aimWander);if(hex(x.color))result.color=hex(x.color);return result;}
  setStrandOptions(index,partial){if(!Number.isInteger(index)||index<0||index>=this.options.strandCount)throw new RangeError('strand index');const copy=[...this.options.strandOverrides];copy[index]={...(copy[index]||{}),...this.sanitizeStrandOverride(partial)};this.options.strandOverrides=copy;this.normalizeLaunchAngles(partial);this.refreshGeometry();return this;}
  shapeSignature(){
    const o=this.options;
    return JSON.stringify([o.strandCount,o.maxSegments,o.envelopeRatio,o.axleDiameter,o.seed,
      Array.from({length:o.strandCount},(_,index)=>{const s=o.strandOverrides[index]||{};
        return ['maxThickness','entryAngle','angleVariation','reflectionDensity','launchRandomness','spacingVariation','minLaunchAngle','maxLaunchAngle','launchSpeed','aimSpeed','aimWander'].map(k=>s[k]??o[k]);})]);
  }
  appearanceSignature(){
    const o=this.options;
    return JSON.stringify([STYLES.map(k=>o[k]),o.colorMode,o.palettePreset,o.paletteCounts,
      o.colorA,o.colorB,o.colorC,o.directionColorsEnabled,o.directionColors,o.strandOverrides]);
  }
  refreshGeometry(){
    if(!this.geometry||this._shapeSignature!==this.shapeSignature())this.rebuildGeometry();
    else if(this._appearanceSignature!==this.appearanceSignature())this.refreshAppearance();
  }
  randomizedMotion(eff,strandIndex){
    // One phase and speed per strand across all channels keeps crossings aligned.
    const seed=this.options.seed*13+strandIndex*53;
    return {phase:random(seed+17)*Math.PI*2*eff.phaseVariation,
      speed:eff.motionSpeed*(1+(random(seed+31)*2-1)*eff.motionVariation*.6)};
  }
  refreshAppearance(){
    const o=this.options,attributes=this.geometry.attributes;
    const colors=Object.fromEntries(AXES.map(axis=>[axis,Array.from({length:o.strandCount},(_,i)=>{
      const eff=this.getEffectiveStrandOptions(axis,i),flow=o.colorMode==='flowing'&&eff.colorSource==='palette';
      return {eff,base:color3(eff.color),alt:color3(flow&&(o.palettePreset==='rgb'||o.palettePreset==='red-blue')?o.colorB:eff.color),
        third:color3(flow?(o.palettePreset==='rgb'?o.colorC:o.palettePreset==='red-blue'?'#d55c94':eff.color):eff.color)};
    })]));
    for(const state of this.rayStates||[])state.eff=colors[this.paths[state.pi].axis][state.si].eff;
    const motion=Object.fromEntries(AXES.map(axis=>[axis,Array.from({length:o.strandCount},(_,si)=>this.randomizedMotion(colors[axis][si].eff,si))]));
    for(let v=0;v<this.vertexAlong.length;v++){
      const pi=this.vertexPathIndex[v],si=this.vertexStrandIndex[v];
      const style=colors[this.paths[pi].axis][si],e=style.eff,j=v*3;
      attributes.widthStyle.array[j]=e.minThickness;attributes.widthStyle.array[j+1]=e.maxThickness;
      attributes.widthStyle.array[j+2]=e.widthVariation;attributes.speed.array[v]=motion[this.paths[pi].axis][si].speed;
      attributes.phaseOffset.array[v]=motion[this.paths[pi].axis][si].phase;
      attributes.intensity.array[v]=e.intensity;attributes.glow.array[v]=e.glow;
      const base=attributes.baseColor.array,alt=attributes.altColor.array,third=attributes.thirdColor.array;
      base[j]=style.base.r;base[j+1]=style.base.g;base[j+2]=style.base.b;
      alt[j]=style.alt.r;alt[j+1]=style.alt.g;alt[j+2]=style.alt.b;
      third[j]=style.third.r;third[j+1]=style.third.g;third[j+2]=style.third.b;
    }
    for(const key of ['widthStyle','speed','phaseOffset','intensity','glow','baseColor','altColor','thirdColor'])attributes[key].needsUpdate=true;
    this._appearanceSignature=this.appearanceSignature();
  }
  getEffectiveStrandOptions(axis,index){if(!AXES.includes(axis)||!Number.isInteger(index)||index<0||index>=this.options.strandCount)throw new RangeError('axis or index');const o=this.options,over=o.strandOverrides[index]||{},base={};for(const key of STYLES)base[key]=over[key]??o[key];base.minThickness=Math.min(base.minThickness,base.maxThickness);base.color=this.getStrandColor(axis,index);base.colorSource=over.color?'strand':o.directionColorsEnabled&&o.directionColors[axis]?'direction':'palette';return base;}
  getStrandColor(axis,index){const o=this.options,over=o.strandOverrides[index]||{};if(over.color)return over.color;if(o.directionColorsEnabled&&o.directionColors[axis])return o.directionColors[axis];const c=this.paletteAssignment(o.colorMode==='single'?0:index);return c==='red'?o.colorA:c==='blue'?o.colorB:o.colorC;}
  paletteAssignment(index){const c=this.options.paletteCounts;return index<c.red?'red':index<c.red+c.blue?'blue':'green';}
  getSelectedFilament(axis='H'){if(!AXES.includes(axis))throw new RangeError('axis');const selected=this.options.editTarget==='all'?Array.from({length:this.options.strandCount},(_,i)=>i):[this.options.editTarget];return{editTarget:this.options.editTarget,axis,strands:selected.map(index=>({index,...this.getEffectiveStrandOptions(axis,index)}))};}
  getSettings(){const o=this.options;return{schemaVersion:2,options:{...o,paletteCounts:{...o.paletteCounts},directionColors:{...o.directionColors},strandOverrides:o.strandOverrides.map(x=>({...x}))}};}
  exportSettings(){return JSON.stringify(this.getSettings(),null,2);}
  importSettings(input){const data=typeof input==='string'?JSON.parse(input):input;if(!data||typeof data!=='object')throw new TypeError('settings');if(data.schemaVersion===2){const saved={...(data.options||{})},target=saved.editTarget;delete saved.editTarget;this.setEditTarget('all');this.setOptions(saved);if(target==='all'||Number.isInteger(target)&&target>=0&&target<this.options.strandCount)this.setEditTarget(target);}else{const old=data.options||data;const mapped={...old},target=mapped.editTarget;delete mapped.editTarget;if(Number.isFinite(old.envelopeRadius))mapped.envelopeRatio=clamp(old.envelopeRadius/(old.axleDiameter||.01)*2,.3,1.6);if(Number.isFinite(old.wavering))mapped.angleVariation=clamp(old.wavering/.00015,0,90);this.setEditTarget('all');this.setOptions(mapped);if(target==='all'||Number.isInteger(target)&&target>=0&&target<this.options.strandCount)this.setEditTarget(target);}return this;}
  setLatticeDisplacements(startOffsets,endOffsets){const n=this.paths.length*3;if(!startOffsets||!endOffsets||startOffsets.length!==n||endOffsets.length!==n)throw new RangeError('Need 3 offsets per path endpoint');for(let i=0;i<n;i++){const a=Number(startOffsets[i]),b=Number(endOffsets[i]);if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a)>.05||Math.abs(b)>.05)throw new RangeError('Unbounded lattice offset');this.latticeStart[i]=a;this.latticeEnd[i]=b;}this.applyLatticeDisplacements();return this;}
  clearLatticeDisplacements(){this.latticeStart.fill(0);this.latticeEnd.fill(0);this.applyLatticeDisplacements();return this;}
  applyLatticeDisplacements(){if(!this.geometry)return;const a=this.geometry.attributes.position.array,rest=this.restPositions,t=this.vertexAlong,ids=this.vertexPathIndex;for(let v=0;v<t.length;v++){const i=ids[v]*3,j=v*3,u=t[v];a[j]=rest[j]+this.latticeStart[i]*(1-u)+this.latticeEnd[i]*u;a[j+1]=rest[j+1]+this.latticeStart[i+1]*(1-u)+this.latticeEnd[i+1]*u;a[j+2]=rest[j+2]+this.latticeStart[i+2]*(1-u)+this.latticeEnd[i+2]*u;}this.geometry.attributes.position.clearUpdateRanges();this.geometry.attributes.position.addUpdateRange(0,a.length);this.geometry.attributes.position.needsUpdate=true;this.geometry.computeBoundingSphere();}
  sampleLaunch(state,time){
    const e=state.eff,seed=this.options.seed+state.pi*131+state.si*67;
    const rate=1+(random(seed+41)*2-1)*e.motionVariation*.7;
    const orbitT=time*e.launchSpeed*rate,aimT=time*e.aimSpeed*rate;
    const orbit=state.orbitPhase+Math.PI*2*orbitT*state.orbitSign+e.aimWander*1.2*smoothNoise(orbitT*.73,seed+17);
    const radial=clamp((.08*(1-e.launchRandomness)+e.launchRandomness*(.25+.65*random(seed+53)))*(1+.13*e.aimWander*smoothNoise(orbitT*.91,seed+29)),0,.94);
    const q=state.traceOptions;
    q.launchX=state.tube*radial*Math.cos(orbit);q.launchY=state.tube*radial*Math.sin(orbit);
    q.launchHeading=state.aimPhase+Math.PI*2*aimT*state.aimSign+e.aimWander*2.7*smoothNoise(aimT*1.37,seed+71);
    q.launchAngle=e.minLaunchAngle+(e.maxLaunchAngle-e.minLaunchAngle)*(.5+.5*smoothNoise(aimT*.91,seed+83));
  }
  makeTrace(state){
    // Transport one persistent, bounded bounced pattern. Re-aiming a complete
    // ray at its source creates a lever: its distant end sweeps faster. Here
    // every axial sample reads the same travelling spatial signal instead.
    const e=state.eff,seed=this.options.seed+state.pi*131+state.si*67,length=this.paths[state.pi].length;
    if(!state.pattern){
      const count=128,x=new Float64Array(count+1),y=new Float64Array(count+1),z=new Float64Array(count+1);
      let angle=e.entryAngle*Math.PI/180+state.orbitPhase*e.launchRandomness;
      for(let i=0;i<count;i++){
        if(i)angle+=state.orbitSign*(Math.PI*.73+e.aimWander*e.launchRandomness*(random(seed+i*19)-.5)*2.1);
        x[i]=state.tube*Math.cos(angle);y[i]=state.tube*Math.sin(angle);
      }
      x[count]=x[0];y[count]=y[0];
      const minimumStep=length/Math.max(1,this.options.maxSegments-4);
      for(let i=0;i<count;i++){
        const variety=.5+(random(seed+i*31+53)-.5)*e.spacingVariation;
        const launchAngle=Math.max(.25,e.minLaunchAngle+(e.maxLaunchAngle-e.minLaunchAngle)*variety)*Math.PI/180;
        const chord=Math.hypot(x[i+1]-x[i],y[i+1]-y[i]);
        z[i+1]=z[i]+Math.max(minimumStep,chord/Math.tan(launchAngle));
      }
      state.pattern={x,y,z,count,period:z[count]};
    }
    const pattern=state.pattern,period=pattern.period,points=state.evidence.points,slots=state.traceOptions.buffer.slots;
    const motionSeed=this.options.seed*13+state.si*53;
    const rate=1+(random(motionSeed+31)*2-1)*e.motionVariation*.6;
    const flow=this.options.centerRole==='origin'?-1:1;
    const phase=this.pathTime*e.launchSpeed*.25*rate*flow+random(seed+71)*period;
    const rotation=state.aimPhase+this.pathTime*e.aimSpeed*Math.PI*2*state.aimSign*rate;
    const c=Math.cos(rotation),s=Math.sin(rotation),path=this.paths[state.pi];
    const center=-(path.start[0]*state.axis.x+path.start[1]*state.axis.y);
    let used=0,interval=0,localCoordinate=0;
    const emit=(at,q)=>{
      const local=((q%period)+period)%period,z=pattern.z;let lo=0,hi=pattern.count;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(z[mid]<=local)lo=mid;else hi=mid;}
      const u=(local-z[lo])/(z[lo+1]-z[lo]),x=pattern.x[lo]+(pattern.x[lo+1]-pattern.x[lo])*u,y=pattern.y[lo]+(pattern.y[lo+1]-pattern.y[lo])*u;
      const point=slots[used];point.s=at;point.u[0]=c*x-s*y;point.u[1]=s*x+c*y;points[used++]=point;
      interval=lo;localCoordinate=local;
    };
    const span=(start,end,sign)=>{
      let at=start,q=Math.abs(start-center)+phase;
      if(!used)emit(at,q);
      else {localCoordinate=((q%period)+period)%period;interval=0;while(interval+1<pattern.count&&pattern.z[interval+1]<=localCoordinate)interval++;}
      while(at<end-1e-10&&used<this.options.maxSegments){
        const distance=sign>0?pattern.z[interval+1]-localCoordinate:localCoordinate-pattern.z[interval];
        // At a reflection, move to the previous interval when travelling backwards.
        if(distance<1e-9){interval=(interval+(sign>0?1:pattern.count-1))%pattern.count;localCoordinate=pattern.z[interval+(sign>0?0:1)];continue;}
        const step=Math.min(end-at,distance);at+=step;q+=sign*step;emit(at,q);
        if(sign<0&&Math.abs(localCoordinate-pattern.z[interval])<1e-9){interval=(interval+pattern.count-1)%pattern.count;localCoordinate=pattern.z[interval+1];}
      }
      if(at<end-1e-10)emit(end,Math.abs(end-center)+phase);
    };
    if(center>0&&center<length){span(0,center,-1);span(center,length,1);}
    else span(0,length,center>=length?-1:1);
    points.length=used;
    const a=points[0],b=points[1]||a,q=state.traceOptions;
    q.launchX=a.u[0];q.launchY=a.u[1];q.launchHeading=Math.atan2(b.u[1]-a.u[1],b.u[0]-a.u[0]);
    q.launchAngle=Math.atan2(Math.hypot(b.u[0]-a.u[0],b.u[1]-a.u[1]),Math.max(1e-12,b.s-a.s))*180/Math.PI;
    return state.evidence;
  }
  // Fixed slots per channel/strand: unused segments are degenerate, so moving rays never
  // allocate GPU geometry, create meshes, change indices, or add draw calls.
  rebuildGeometry(){
    if(!this.paths)return;
    if(this.core){this.remove(this.core,this.halo);this.geometry.dispose();}
    const o=this.options,budget=o.maxSegments,traceCount=this.paths.length*o.strandCount,count=traceCount*budget*4;
    const g=new THREE.BufferGeometry(),put=(name,size)=>{const a=new THREE.BufferAttribute(new Float32Array(count*size),size).setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,a);return a.array;};
    const positions=put('position',3),tangents=put('segmentTangent',3),sides=put('sideSign',1),alongs=put('along',1);
    put('flowXY',2);put('flowDistance',1);
    put('widthStyle',3);
    for(const key of ['speed','phaseOffset','intensity','glow'])put(key,1);
    for(const key of ['baseColor','altColor','thirdColor'])put(key,3);
    const indices=count>65535?new Uint32Array(traceCount*budget*6):new Uint16Array(traceCount*budget*6);
    this.geometry=g;this.restPositions=new Float32Array(count*3);this.vertexAlong=alongs;
    this.vertexPathIndex=new Uint16Array(count);this.vertexStrandIndex=new Uint8Array(count);this.reflectionInfo=[];this.rayStates=[];
    for(let pi=0;pi<this.paths.length;pi++){
      const p=this.paths[pi],axis=new THREE.Vector3(...p.end).sub(new THREE.Vector3(...p.start)).normalize();
      const e1=new THREE.Vector3(-axis.y,axis.x,0).normalize(),e2=new THREE.Vector3(0,0,1);
      for(let si=0;si<o.strandCount;si++){
        const ti=pi*o.strandCount+si,first=ti*budget*4,eff=this.getEffectiveStrandOptions(p.axis,si),seed=o.seed+pi*131+si*67;
        const tube=Math.max(o.axleDiameter*o.envelopeRatio*.5-eff.maxThickness*.6,.0002);
        const buffer={slots:Array.from({length:budget+1},()=>({s:0,u:[0,0]})),points:[]};
        const traceOptions={maxSegments:budget,buffer};
        const evidence={pathId:p.id,axis:p.axis,strand:si,points:buffer.points,radius:tube,launch:traceOptions};
        const state={pi,si,first,axis,e1,e2,eff,tube,traceOptions,evidence,orbitPhase:random(seed+3)*Math.PI*2,aimPhase:eff.entryAngle*Math.PI/180+random(seed+7)*Math.PI*2,orbitSign:random(seed+11)<.5?-1:1,aimSign:random(seed+13)<.5?-1:1};
        this.rayStates.push(state);this.reflectionInfo.push(this.makeTrace(state));
        for(let k=0;k<budget;k++){
          const v=first+k*4,idx=(ti*budget+k)*6;indices.set([v,v+1,v+2,v+1,v+3,v+2],idx);
          for(let j=0;j<4;j++){this.vertexPathIndex[v+j]=pi;this.vertexStrandIndex[v+j]=si;sides[v+j]=j%2===0?-1:1;}
        }
        this.writeTrace(state,this.reflectionInfo[ti]);
      }
    }
    g.setIndex(new THREE.BufferAttribute(indices,1));g.computeBoundingSphere();
    this.refreshAppearance();
    this.core=new THREE.Mesh(g,this.coreMaterial);this.halo=new THREE.Mesh(g,this.haloMaterial);
    this.core.frustumCulled=false;this.halo.frustumCulled=false;this.core.name='Reflected filament core';this.halo.name='Reflected filament halo';this.add(this.halo,this.core);
    this._shapeSignature=this.shapeSignature();this._appearanceSignature=this.appearanceSignature();
  }
  writeTrace(state,trace){
    const {pi,first,axis,e1,e2}=state,p=this.paths[pi],a=this.geometry.attributes;
    const pos=a.position.array,rest=this.restPositions,tan=a.segmentTangent.array,along=a.along.array,flowXY=a.flowXY.array,flowDistance=a.flowDistance.array;
    const start=pi*3,points=trace.points,last=points.length-1;
    const sx=p.start[0],sy=p.start[1],sz=p.start[2],ax=axis.x,ay=axis.y,az=axis.z,bx=e1.x,by=e1.y,bz=e1.z,cx=e2.x,cy=e2.y,cz=e2.z;
    const lx=this.latticeStart[start],ly=this.latticeStart[start+1],lz=this.latticeStart[start+2],dx=this.latticeEnd[start]-lx,dy=this.latticeEnd[start+1]-ly,dz=this.latticeEnd[start+2]-lz;
    for(let k=0;k<this.options.maxSegments;k++){
      const aa=points[Math.min(k,last)],bb=points[Math.min(k+1,last)],v=first+k*4;
      const px=sx+ax*aa.s+bx*aa.u[0]+cx*aa.u[1],py=sy+ay*aa.s+by*aa.u[0]+cy*aa.u[1],pz=sz+az*aa.s+bz*aa.u[0]+cz*aa.u[1];
      const qx=sx+ax*bb.s+bx*bb.u[0]+cx*bb.u[1],qy=sy+ay*bb.s+by*bb.u[0]+cy*bb.u[1],qz=sz+az*bb.s+bz*bb.u[0]+cz*bb.u[1];
      const tx=k<last?qx-px:ax,ty=k<last?qy-py:ay,tz=k<last?qz-pz:az;
      for(let j=0;j<4;j++){
        const u=(j<2?aa.s:bb.s)/p.length,w=(v+j)*3,x=j<2?px:qx,y=j<2?py:qy,z=j<2?pz:qz;
        rest[w]=x;rest[w+1]=y;rest[w+2]=z;pos[w]=x+lx+dx*u;pos[w+1]=y+ly+dy*u;pos[w+2]=z+lz+dz*u;
        tan[w]=tx;tan[w+1]=ty;tan[w+2]=tz;along[v+j]=u;
        // Radial distance controls fade only. Signed distance along the lane gives
        // a constant phase gradient/speed, even on off-center diagonal channels.
        flowDistance[v+j]=sx*ax+sy*ay+(j<2?aa.s:bb.s);
        flowXY[(v+j)*2]=sx+ax*(j<2?aa.s:bb.s);flowXY[(v+j)*2+1]=sy+ay*(j<2?aa.s:bb.s);
      }
    }
  }
  animateRayPaths(){
    let changed=false;
    for(const state of this.rayStates){
      if(state.eff.launchSpeed===0&&state.eff.aimSpeed===0)continue;
      this.makeTrace(state);this.writeTrace(state,state.evidence);this.pathUpdateTotal++;
      changed=true;
    }
    if(!changed)return;
    // One contiguous range per attribute keeps upload calls bounded at any strand count.
    for(const key of DYNAMIC_TRACE_ATTRIBUTES){const a=this.geometry.attributes[key];a.clearUpdateRanges();a.addUpdateRange(0,a.array.length);a.needsUpdate=true;}
  }
  spawn(p){if(!this.paths.length)return;const e=p.entries.find(x=>x.life<=0);if(!e)return;const i=this.serial++,site=this.gapSites.length?this.gapSites[Math.floor(random(i*9+3)*this.gapSites.length)]:null,path=site?this.paths[site.index]:this.paths[Math.floor(random(i*9+3)*this.paths.length)],t=site?(site.a+site.b)/2:.1+random(i*7+5)*.8,si=Math.floor(random(i*5+2)*this.options.strandCount);e.at[0]=path.start[0]+(path.end[0]-path.start[0])*t;e.at[1]=path.start[1]+(path.end[1]-path.start[1])*t;e.at[2]=path.start[2]+(path.end[2]-path.start[2])*t;e.path=path;e.strand=si;this._tmpColor.set(this.getStrandColor(path.axis,si));e.rgb[0]=this._tmpColor.r;e.rgb[1]=this._tmpColor.g;e.rgb[2]=this._tmpColor.b;e.life=p.points?this.options.particleLifetime:this.options.arcLifetime;e.maxLife=e.life;e.seed=i;e.sign=random(i*13)>.5?1:-1;}
  update(elapsedSeconds,camera){if(!Number.isFinite(elapsedSeconds))return this;if(this.lastElapsed===null)this.lastElapsed=elapsedSeconds;let dt=clamp(elapsedSeconds-this.lastElapsed,0,.1);this.lastElapsed=elapsedSeconds;const o=this.options;if(o.paused||!o.enabled)dt=0;this.clockTime+=dt;if(dt>0&&!o.reducedMotion&&o.animatePaths){this.pathTime+=dt;this.animateRayPaths();}this.coreMaterial.uniforms.uTime.value=this.clockTime;this.haloMaterial.uniforms.uTime.value=this.clockTime;if(dt>0&&!o.reducedMotion){if(o.arcsEnabled){this.arcCarry+=dt*o.arcFrequency;while(this.arcCarry>=1){this.spawn(this.arcs);this.arcCarry--;}}if(o.particlesEnabled){this.particleCarry+=dt*o.particleFrequency;while(this.particleCarry>=1){this.spawn(this.particles);this.particleCarry--;}}}
    for(const p of [this.arcs,this.particles]){let active=0;for(const e of p.entries){if(e.life<=0)continue;e.life=Math.max(0,e.life-dt);if(e.life<=0)continue;const age=1-e.life/e.maxLife,fade=Math.sin(Math.PI*age),angle=e.seed*2.4,radial=(p.points?o.particleMaxTravel:o.arcSpread)*(p.points?age:.4+age*.6)*(o.excursionsEnabled?1+o.excursionAmplitude/.03:1),step=active*(p.points?3:6),travel=p.points?age*o.particleSpeed*e.maxLife*e.sign/e.path.length:0;p.position[step]=e.at[0]+Math.cos(angle)*radial+(e.path.end[0]-e.path.start[0])*travel;p.position[step+1]=e.at[1]+Math.sin(angle)*radial+(e.path.end[1]-e.path.start[1])*travel;p.position[step+2]=e.at[2]+Math.sin(angle*1.7)*radial*.45+(e.path.end[2]-e.path.start[2])*travel;if(!p.points){const l=o.arcSize*(.6+.4*random(e.seed*9));p.position[step+3]=p.position[step]+Math.cos(angle+1.4)*l;p.position[step+4]=p.position[step+1]+Math.sin(angle+1.4)*l;p.position[step+5]=p.position[step+2]+l*.2;}for(let q=0;q<(p.points?1:2);q++){const idx=active*(p.points?1:2)+q;p.alpha[idx]=fade*(p.points?.45:.6);p.size[idx]=p.points?o.particleSize:1;p.color[idx*3]=e.rgb[0];p.color[idx*3+1]=e.rgb[1];p.color[idx*3+2]=e.rgb[2];}active++;}p.active=active;p.mesh.geometry.setDrawRange(0,active*(p.points?1:2));for(const k of ['position','alpha','pointSize','color'])p.mesh.geometry.attributes[k].needsUpdate=true;}return this;
  }
  getStats(){return{pathCount:this.paths.length,strandCount:this.options.strandCount,totalFilaments:this.paths.length*this.options.strandCount,gapSites:this.gapSites.length,pathUpdateTotal:this.pathUpdateTotal,pathTime:this.pathTime,allocatedSegments:this.paths.length*this.options.strandCount*this.options.maxSegments,reflectionSegments:this.reflectionInfo.reduce((n,x)=>n+x.points.length-1,0),maxFieldDrawCalls:this.visible?2+(this.arcs.mesh.visible?1:0)+(this.particles.mesh.visible?1:0):0,activeArcs:this.arcs.active,activeParticles:this.particles.active,arcCapacity:this.arcs.capacity,particleCapacity:this.particles.capacity,restPathsImmutable:this.paths.every(Object.isFrozen),editTarget:this.options.editTarget};}
  getReflectionEvidence(){return this.reflectionInfo.map(x=>({pathId:x.pathId,axis:x.axis,strand:x.strand,launch:{x:x.launch.launchX,y:x.launch.launchY,heading:x.launch.launchHeading,angle:x.launch.launchAngle},radius:x.radius,points:x.points.map(p=>({s:p.s,u:[...p.u]}))}));}
  dispose(){this.geometry.dispose();this.coreMaterial.dispose();this.haloMaterial.dispose();for(const p of [this.arcs,this.particles]){p.mesh.geometry.dispose();p.mesh.material.dispose();}this.clear();}
}
