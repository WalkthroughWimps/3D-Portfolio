import * as THREE from 'three';
import {createAtelierQueue} from './atelier-queue.mjs?v=clip-reverse-2';
import {ARM_LAYOUT,armPose,clothFeed,solveArm,workStations,ease} from './arm-motion.mjs?v=editing-5';
import {contrastGain} from './theme.mjs?v=contrast-glows-1';

const Y=new THREE.Vector3(0,1,0);
export function createMechanicalAtelier(parent,own,metal,dark){
  let colors=['#b86c48','#72988b','#c2a05c','#9886a0'],appearance={particles:true,particleDensity:90,particleLife:1,particleSize:1,particleWind:1,particleSpread:1,highlightColor:'#d9f5ff',contrast:.5};
  const queue=createAtelierQueue(),root=new THREE.Group();root.name='Oddio needle and unpicker atelier';parent.add(root);
  const copper=own(new THREE.MeshStandardMaterial({color:'#a66b42',metalness:.75,roughness:.32}));
  const ceramic=own(new THREE.MeshStandardMaterial({color:'#e6d6ae',roughness:.55}));
  const cupMaterial=own(metal.clone());cupMaterial.side=THREE.DoubleSide;
  const rodGeometry=own(new THREE.CylinderGeometry(1,1,1,10)),ballGeometry=own(new THREE.SphereGeometry(1,12,8));
  const add=(geometry,material,name,group=root)=>{const m=new THREE.Mesh(geometry,material);m.name=name;group.add(m);return m;};
  const cylinder=(r,h,material,name,group=root)=>add(own(new THREE.CylinderGeometry(r,r,h,24)),material,name,group);
  function rod(m,a,b,r){const d=b.clone().sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Y,d.clone().normalize());m.scale.set(r,Math.max(.00001,d.length()),r);}
  const arms=[];
  for(const side of[-1,1]){
    const group=new THREE.Group();group.name=side>0?'Upper needle arm':'Lower thread-removal arm';root.add(group);
    const linkPairs=[0,1,2,3].map((_,i)=>[0,1].map(()=>add(rodGeometry,i?metal:dark,['Fixed shoulder riser','Upper arm rail','Forearm rail','Tool arm rail'][i],group)));
    const joints=Array.from({length:5},(_,i)=>{const m=add(ballGeometry,i?metal:copper,'Arm hinge '+i,group);m.scale.setScalar(i===0?.018:.0045);return m;});
    const cups=Array.from({length:4},()=>{const m=add(own(new THREE.SphereGeometry(.006,16,8,0,Math.PI*2,Math.PI/2,Math.PI/5)),cupMaterial,'Rotating shallow ball cup',group);return m;});
    const shaft=add(rodGeometry,metal,side>0?'Threaded sewing needle':'Thread-remover shaft',group);
    const tip=add(own(new THREE.ConeGeometry(.0015,.010,10)),metal,side>0?'Needle point':'Seam-remover blade',group);
    const forks=side<0?[-1,1].map(sign=>{const m=add(rodGeometry,metal,'Unpicker fork',group);m.userData.sign=sign;return m;}):[];
    const eye=add(own(new THREE.TorusGeometry(.002,.0005,6,14)),side>0?ceramic:copper,side>0?'Needle thread eye':'Unpicker safety bead',group);
    group.traverse(m=>{if(m.isMesh)m.userData.oddAction='unstick';});
    arms.push({side,group,linkPairs,joints,cups,shaft,tip,forks,eye});
  }
  const feederX=.355,feederY=.258;
  const feederMount=cylinder(.006,.004,metal,'Yarn feeder panel anchor');feederMount.rotation.x=Math.PI/2;feederMount.position.set(feederX,feederY,.268);
  const feederStem=cylinder(.0025,.062,metal,'Yarn feeder upright');feederStem.rotation.x=Math.PI/2;feederStem.position.set(feederX,feederY,.300);
  const spool=cylinder(.009,.016,ceramic,'Needle thread bobbin');spool.rotation.x=Math.PI/2;spool.position.set(feederX,feederY,.311);
  for(const z of[.301,.321]){const rim=add(own(new THREE.TorusGeometry(.011,.0012,8,24)),metal,'Thread bobbin rim');rim.position.set(feederX,feederY,z);}
  const feedPlate=cylinder(.019,.006,dark,'Five-yarn circular feed plate');feedPlate.rotation.x=Math.PI/2;feedPlate.position.set(feederX,feederY,.327);
  const yarnColors=['#e1cfa3','#413c2c','#89c7cb','#62385a',appearance.highlightColor],threads=yarnColors.map((color,i)=>{const angle=i*Math.PI*2/5,start=new THREE.Vector3(feederX+Math.sin(angle)*.013,feederY+Math.cos(angle)*.013,.331),hole=add(own(new THREE.TorusGeometry(.0025,.0008,8,16)),metal,'Yarn feed hole '+(i+1));hole.position.copy(start);const core=cylinder(.0014,.003,dark,'Open yarn eyelet '+(i+1));core.rotation.x=Math.PI/2;core.position.copy(start).setZ(.330);const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(33*3),3).setUsage(THREE.DynamicDrawUsage));const material=own(new THREE.LineBasicMaterial({color,toneMapped:false,transparent:true,opacity:i===4?1:.85})),line=new THREE.Line(geometry,material);line.name='Continuous needle yarn '+(i+1);line.frustumCulled=false;root.add(line);return {start,geometry,material,line};});
  const maxParticles=256,particles=Array.from({length:maxParticles},()=>({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,angle:0,color:new THREE.Color()})),particleGeometry=own(new THREE.BufferGeometry());
  particleGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(maxParticles*12),3).setUsage(THREE.DynamicDrawUsage));particleGeometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(maxParticles*12),3).setUsage(THREE.DynamicDrawUsage));
  const particleMaterial=own(new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8,depthWrite:false})),scatter=new THREE.LineSegments(particleGeometry,particleMaterial);scatter.name='Cut thread drifting particles';scatter.frustumCulled=false;root.add(scatter);
  let label='',job=null,feed={position:0,fraction:1,working:false},poses=[],emission=0,cursor=0,surfaceSampler=null;
  function actorPoses(current){
    const stations=workStations(current),remove=current?.pass==='unpick'||current?.pass==='paired',write=current?.pass==='sew'||current?.pass==='paired';
    const result=arms.map(arm=>{
      const side=arm.side,active=Boolean(current)&&(side>0?write:remove),lane=side>0?current?.lane??0:current?.from?.lane??current?.lane??0;
      const station=side>0?stations.write:stations.remove;
      const pose=armPose(side,lane,current?.progress??0,{x:station,active,phase:current?.phase??0,working:feed.working&&!current?.jammed,surface:surfaceSampler?.(station,lane)});
      if(current?.stage==='travel'&&current.previous){
        const priorStations=workStations(current.previous),priorLane=side>0?current.previous.lane:current.previous.from?.lane??current.previous.lane;
        const priorStation=side>0?priorStations.write:priorStations.remove;
        const from=armPose(side,priorLane,.5,{x:priorStation,active:side>0?['sew','paired'].includes(current.previous.pass):['unpick','paired'].includes(current.previous.pass),surface:surfaceSampler?.(priorStation,priorLane)}),t=current.stageFraction,move=ease((t-.25)/.5),lift=ease(t/.25),lower=ease((t-.75)/.25);
        if(!from.reach&&pose.reach){
          Object.assign(pose,armPose(side,lane,t*.28,{x:station,surface:surfaceSampler?.(station,lane)}));
        }else if(from.reach&&!pose.reach){
          Object.assign(pose,armPose(side,priorLane,.76+t*.24,{x:priorStation,surface:surfaceSampler?.(priorStation,priorLane)}));
        }else if(from.reach&&pose.reach){const target=from.wrist.map((v,i)=>v+(pose.wrist[i]-v)*move);pose.extension=from.extension+(pose.extension-from.extension)*move;pose.toolDirection=new THREE.Vector3(...from.toolDirection).lerp(new THREE.Vector3(...pose.toolDirection),move).normalize().toArray();target[2]=(from.wrist[2]+(ARM_LAYOUT.travelZ-from.wrist[2])*lift)*(1-lower)+pose.wrist[2]*lower;Object.assign(pose,solveArm(pose.base,target,side,[],{extension:pose.extension,toolDirection:pose.toolDirection,preferredElbow:[side*.22,pose.work[1],.52]}));pose.work=from.work.map((v,i)=>v+(pose.work[i]-v)*move);}
      }
      return pose;
    });
    return result;
  }
  function poseArm(arm,pose){
    const points=[pose.base,pose.shoulder,pose.elbow,pose.knuckle,pose.wrist].map(p=>new THREE.Vector3(...p)),wrist=points[4],direction=new THREE.Vector3(...pose.toolDirection),tip=wrist.clone().addScaledVector(direction,ARM_LAYOUT.toolLength);
    for(let i=0;i<4;i++){const a=points[i],b=points[i+1],d=b.clone().sub(a),frame=new THREE.Quaternion().setFromUnitVectors(Y,d.clone().normalize()),offset=new THREE.Vector3(1,0,0).applyQuaternion(frame).multiplyScalar(.0027);arm.linkPairs[i].forEach((m,j)=>rod(m,a.clone().addScaledVector(offset,j?1:-1),b.clone().addScaledVector(offset,j?1:-1),.0018));}
    points.forEach((p,i)=>arm.joints[i].position.copy(p));
    arm.cups.forEach((cup,i)=>{const axis=points[i+1].clone().sub(points[i]).normalize();cup.quaternion.setFromUnitVectors(Y,axis);cup.position.copy(points[i+1]).addScaledVector(axis,-.003);});
    rod(arm.shaft,wrist.clone().addScaledVector(direction,.006),tip.clone().addScaledVector(direction,-.007),.0012);arm.tip.quaternion.setFromUnitVectors(Y,direction);arm.tip.position.copy(tip).addScaledVector(direction,-.005);arm.eye.position.copy(tip).addScaledVector(direction,-.014);
    arm.forks.forEach(m=>{const sideways=new THREE.Vector3(1,0,0).cross(direction).normalize();if(sideways.lengthSq()<.1)sideways.set(0,1,0);const a=tip.clone().addScaledVector(direction,-.012).addScaledVector(sideways,m.userData.sign*.002),b=tip.clone().addScaledVector(direction,-.002).addScaledVector(sideways,m.userData.sign*.003);rod(m,a,b,.0008);});
    return tip;
  }
  function particleStep(dt,origin,emit,reduced,lane){
    if(reduced||!appearance.particles){particles.forEach(p=>p.life=0);scatter.visible=false;return;}
    if(emit){const blended=job?.from?.weave?.includes('"blend"');emission+=dt*appearance.particleDensity;while(emission>=1){emission--;const p=particles[cursor++%maxParticles],q=Math.random();Object.assign(p,{life:1,max:appearance.particleLife*(.7+Math.random()*.6),x:origin[0],y:origin[1],z:.266,vx:(Math.random()-.35)*.13*appearance.particleSpread,vy:(Math.random()-.5)*.10*appearance.particleSpread,vz:.09+Math.random()*.08,angle:Math.random()*Math.PI*2});p.life=p.max;p.color.set(q<.78?(blended?'#89c7cb':'#eee6d5'):q<.96?(blended?'#62385a':'#282c29'):colors[lane]);}}
    const a=particleGeometry.attributes.position,c=particleGeometry.attributes.color,strength=contrastGain(appearance.contrast);let count=0;
    for(let i=0;i<particles.length;i++){const p=particles[i];if(p.life>0){p.life=Math.max(0,p.life-dt);p.vx+=dt*.045*appearance.particleWind;p.vy-=dt*.035;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.angle+=dt*3;if(p.z<.314)p.y=Math.max(-.145,Math.min(.145,p.y));count++;}const fade=p.life/p.max,len=.007*fade*appearance.particleSize;for(let k=0;k<4;k++){const u=k===0?-.5:k===3?.5:0,index=i*4+k;a.setXYZ(index,p.x+Math.cos(p.angle)*len*u,p.y+Math.sin(p.angle)*len*u+(k===1||k===2?.0015*fade:0),p.life>0?p.z:-1);c.setXYZ(index,p.color.r*fade*strength,p.color.g*fade*strength,p.color.b*fade*strength);}}
    a.needsUpdate=c.needsUpdate=true;scatter.visible=count>0;
  }
  let workBlocked=false;
  function update(dt,{position=0,reduced=false,blocked=false,capture=null}={}){
    workBlocked=blocked||Boolean(capture);
    if(appearance.sewingAnimations===false){queue.clear();job=null;feed=clothFeed(null,position);return feed;}
    if(capture&&!reduced){
      const elapsed=capture.preparing?capture.prepareSeconds:(capture.armed?2:0)+capture.seconds,opening=Math.min(1,elapsed/2);
      job={id:capture.id,ids:[],kind:'record',pass:'sew',lane:capture.lane,start:capture.start,seconds:elapsed,name:'live recording',stage:opening<1?'unfold':'work',progress:opening<1?opening*.28:.52,stageFraction:opening,phase:elapsed*38*Math.PI*2,frequency:38,live:true};
      feed={position,fraction:1,removeFraction:1,writeFraction:1,working:opening>=1,arrival:1,stations:{write:.12,remove:-.12},base:capture.start};
    }else{job=queue.update(dt,{reduced,blocked});feed=clothFeed(job,position);}
    return feed;
  }
  function renderSurface(sample,dt,reduced){
    surfaceSampler=sample;poses=actorPoses(job);label='';
    if(job?.jammed&&job.repairing){
      const stuck=poses[arms.findIndex(a=>a.side===job.jammedSide)],helper=poses[arms.findIndex(a=>a.side!==job.jammedSide)],t=ease(Math.max(0,Math.min(1,job.jamElapsed-3,job.jamRemaining)));
      if(!helper.reach){
        Object.assign(helper,armPose(-job.jammedSide,job.lane,t*.28,{x:-job.jammedSide*.09,surface:{y:stuck.wrist[1],z:.36}}));
      }else{
        const target=helper.wrist.map((v,i)=>v+((i===0?-job.jammedSide*.09:i===1?stuck.wrist[i]:.40)-v)*t);
        Object.assign(helper,solveArm(helper.base,target,-job.jammedSide,[],{extension:helper.extension,toolDirection:helper.toolDirection,preferredElbow:[-job.jammedSide*.22,stuck.wrist[1],.52]}));
      }
    }
    const tips=arms.map((a,i)=>poseArm(a,poses[i]));
    const top=arms[1].eye.position,strength=contrastGain(appearance.contrast);threads.forEach(({start,geometry,material},i)=>{const end=top.clone().add(new THREE.Vector3((i-2)*.0005,0,0)),curve=new THREE.CubicBezierCurve3(start,start.clone().add(new THREE.Vector3(.025,-.025,.04)),end.clone().add(new THREE.Vector3(.015,.015,.04)),end);for(let j=0;j<=32;j++){const p=curve.getPoint(j/32);geometry.attributes.position.setXYZ(j,p.x,p.y,p.z);}geometry.attributes.position.needsUpdate=true;material.color.set(i===4?appearance.highlightColor:yarnColors[i]).multiplyScalar(strength);});
    const deleting=Boolean(job&&['unpick','paired'].includes(job.pass));
    particleStep(Math.min(.05,Math.max(0,dt)),tips[0].toArray(),deleting&&feed.working&&!job.jammed,reduced,job?.from?.lane??job?.lane??0);
    if(job){label=(job.pass==='unpick'?'UNPICKING':job.pass==='paired'?'UNPICK + SEW':job.kind==='restore'?'RESTITCHING':'SEWING')+' / '+job.name.slice(0,25);if(job.jammed)label=(job.repairing?'HELPING A STUCK ARM':'ARM STUCK / TAP TO FREE')+' / '+Math.ceil(job.jamRemaining)+'s';}
  }
  function park(){job=null;poses=actorPoses(null);arms.forEach((a,i)=>poseArm(a,poses[i]));label='';}
  park();
  return {root,update,renderSurface,configure(settings){queue.configure(settings);appearance={...appearance,...settings};if(appearance.sewingAnimations===false){queue.clear();particles.forEach(p=>p.life=0);scatter.visible=false;feed=clothFeed(null,feed.position);park();}colors=colors.map((c,i)=>settings['color'+(i+1)]||c);},preview:(s,p,l)=>{if(appearance.sewingAnimations!==false)queue.preview(s,p,l);},unstick:()=>queue.unstick(),get targets(){return arms.map(a=>a.group);},park,cancel(){queue.clear();park();},sync:(clips,options)=>queue.sync(clips,{...options,silent:appearance.sewingAnimations===false||options?.silent===true}),get clipJob(){return job;},get pendingJobs(){return workBlocked&&queue.activeJob?[queue.activeJob,...queue.pendingJobs]:queue.pendingJobs;},get feed(){return feed;},get state(){return {...queue.state,label,visible:Boolean(job),stationSeconds:ARM_LAYOUT.stationSeconds,feedPosition:feed.position,arms:poses,particles:particles.filter(p=>p.life>0).length};},get label(){return label;},get clearTabs(){return Boolean(job?.kind==='move'&&job.pass==='paired'&&workStations(job).remove>-.105);},suspend(){queue.suspend();particles.forEach(p=>p.life=0);scatter.visible=false;park();},resume(){queue.resume();root.visible=true;},setEnabled(enabled){if(enabled)queue.resume();else{queue.suspend();park();}},dispose(){queue.suspend();root.removeFromParent();}};
}

