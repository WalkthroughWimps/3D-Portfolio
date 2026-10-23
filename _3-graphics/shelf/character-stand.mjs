import * as THREE from 'three';
import {loadTokenSettings,outlinedArtwork,characterSettings} from './token-settings.mjs';
export function createCharacterStand({color='#744c87',character=1,own=r=>r}={}){
 const root=new THREE.Group(),plastic=own(new THREE.MeshStandardMaterial({color,roughness:.7})),disc=new THREE.Mesh(own(new THREE.CylinderGeometry(.23,.25,.045,32)),plastic);disc.position.y=-.43;disc.castShadow=disc.receiveShadow=true;root.add(disc);
 // Two raised rails leave a real slot through the center, with a card seated in it.
 for(const z of [-.035,.035]){const rail=new THREE.Mesh(own(new THREE.BoxGeometry(.31,.075,.036)),plastic);rail.position.set(0,-.38,z);rail.castShadow=true;root.add(rail);}
 const card=new THREE.Mesh(own(new THREE.BoxGeometry(.42,.67,.009)),own(new THREE.MeshStandardMaterial({color:'#f8e4c4',roughness:.92})));card.position.y=-.035;card.castShadow=true;root.add(card);
 const artMat=own(new THREE.MeshBasicMaterial({transparent:true,side:THREE.DoubleSide,alphaTest:.015})),art=new THREE.Mesh(own(new THREE.PlaneGeometry(.46,.72)),artMat);art.position.set(0,-.025,.006);root.add(art);let texture=null,ticket=0;
 async function update(settings=loadTokenSettings()){
  settings=characterSettings(settings,character);const revision=++ticket;art.position.y=-.37+.72*settings.scale/2;art.scale.setScalar(settings.scale);artMat.opacity=settings.opacity;art.visible=!!settings.artwork;card.visible=!settings.artwork;
  if(!settings.artwork){texture?.dispose();texture=null;artMat.map=null;return;}
  try{const image=new Image();image.src=settings.artwork;await image.decode();if(revision!==ticket)return;const next=new THREE.CanvasTexture(outlinedArtwork(image,settings));next.colorSpace=THREE.SRGBColorSpace;next.anisotropy=4;texture?.dispose();texture=next;artMat.map=next;artMat.needsUpdate=true;}catch{art.visible=false;card.visible=true;}
 }
 return {root,update,dispose(){ticket++;texture?.dispose();}};
}
