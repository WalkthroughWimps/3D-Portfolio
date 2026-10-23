import * as THREE from 'three';

export function resetPose(camera,target,home,mode='all'){
 const destination=new THREE.Vector3().fromArray(home.target),position=new THREE.Vector3().fromArray(home.position),homeDelta=position.clone().sub(destination),distance=homeDelta.length();
 if(mode==='pan')position.copy(destination).add(camera.position.clone().sub(target).normalize().multiplyScalar(distance));
 if(mode==='rotation'){destination.copy(target);position.copy(destination).add(homeDelta);}
 return {position,target:destination};
}
// Orbit between directions rather than interpolating through the object.
export function arcCamera(from,fromTarget,to,toTarget,t){
 const a=from.clone().sub(fromTarget),b=to.clone().sub(toTarget),q=new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(),b.clone().normalize()),rotation=new THREE.Quaternion().slerp(q,t),target=fromTarget.clone().lerp(toTarget,t);
 return {target,position:target.clone().add(a.normalize().applyQuaternion(rotation).multiplyScalar(THREE.MathUtils.lerp(from.distanceTo(fromTarget),b.length(),t)))};
}
export function shelfView(bounds,aspect,{fillY=.94,wide=false}={}){
 const size=bounds.getSize(new THREE.Vector3()),target=bounds.getCenter(new THREE.Vector3()),tan=Math.tan(35*Math.PI/360);
 const distance=wide?Math.max(size.y/(2*tan*.72),size.x/(2*tan*aspect*.9))+size.z/2:size.y/(2*tan*fillY)+size.z/2;
 return {target,position:target.clone().add(new THREE.Vector3(0,0,distance))};
}
