import * as THREE from 'three';

// Keep the atlas budget fixed. Only the selected face has a detailed texture;
// rapid selection changes share one in-flight request and coalesce to the latest.
export function createCardDetailTexture({anisotropy=1,invalidate=()=>{}}={}) {
  const loader=new THREE.TextureLoader();
  let wanted=null,active=null,loading='',failed='',disposed=false;
  function clear(){
    if(!active)return;
    active.material.map=active.base;
    active.material.needsUpdate=true;
    active.texture.dispose();
    active=null;
  }
  function pump(){
    if(disposed||loading||!wanted||active?.key===wanted.key||failed===wanted.key)return;
    const request=wanted;
    loading=request.key;
    loader.load(request.url,texture=>{
      loading='';
      if(disposed||wanted?.key!==request.key){texture.dispose();pump();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=anisotropy;
      texture.repeat.set(4,4);
      texture.offset.set(-(request.tile%4),Math.floor(request.tile/4)-3);
      clear();
      request.material.map=texture;
      request.material.needsUpdate=true;
      active={...request,texture};
      invalidate();
    },undefined,()=>{loading='';failed=request.key;invalidate();pump();});
  }
  return {
    select(request){
      if(disposed||wanted?.key===request?.key)return;
      wanted=request||null;failed='';clear();pump();invalidate();
    },
    get state(){return {active:active?.key||'',loading,retained:active?1:0};},
    dispose(){disposed=true;wanted=null;clear();}
  };
}
