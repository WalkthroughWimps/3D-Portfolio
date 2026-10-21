import * as THREE from 'three';
import {getSharedSettings} from '../_7-shared-scripts/core/settings.js';
import {getLightScaleForValue} from '../_7-shared-scripts/scene-lighting-sync.js';

/** Theme colors and Start's intentional-highlight contrast curve. */
export function bindAboutAppearance(model,lights){
  const materials=new Set();model.traverse(node=>{for(const material of [node.material].flat().filter(Boolean))materials.add(material);});
  const lightBases=lights.map(light=>[light,light.intensity]);
  function apply(snapshot=getSharedSettings().get()){
    const css=getComputedStyle(document.documentElement);
    const color=(name,fallback)=>{const value=css.getPropertyValue(name).trim();return new THREE.Color(/^#[\da-f]{8}$/i.test(value)?value.slice(0,7):value||fallback);};
    const red=color('--red-secondary','#7e0909').lerp(new THREE.Color('#7e0909'),.45);
    const blue=color('--blue-secondary','#11416e').lerp(new THREE.Color('#11416e'),.45);
    const accent=blue.clone().lerp(new THREE.Color('#74d3f8'),.75);
    const contrast=THREE.MathUtils.clamp(snapshot.start?.contrast??.5,0,1),ease=contrast*contrast*(3-2*contrast);
    const brightness=THREE.MathUtils.clamp(snapshot.start?.brightness??1,0,1);
    const lightScale=getLightScaleForValue(.005+.995*brightness)*(1+2.15*Math.pow(brightness,1.35));
    for(const [light,base]of lightBases)light.intensity=base*lightScale/2.9925;
    for(const material of materials){
      if(material.name==='red')material.color.copy(red);
      else if(material.name==='blue')material.color.copy(blue);
      else if(/cube highlights|bevel highlight/i.test(material.name)){
        material.color.copy(accent);material.emissive?.copy(accent);material.emissiveIntensity=.08+(2.4-.08)*ease;
        material.roughness=.35;material.metalness=.15;
      }
    }
  }
  const stop=getSharedSettings().subscribe(apply,{immediate:true});
  const observer=new MutationObserver(()=>apply());observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme','style']});
  const scheme=matchMedia('(prefers-color-scheme: dark)'),onScheme=()=>apply();scheme.addEventListener('change',onScheme);
  return{apply,dispose(){stop();observer.disconnect();scheme.removeEventListener('change',onScheme);}};
}
