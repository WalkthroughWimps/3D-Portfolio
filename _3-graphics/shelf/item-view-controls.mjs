import {installStartPageStyleMouseControls,installStandardGlbMouseControls,createPanAwareCenterProjection} from '../../_7-shared-scripts/shared-glb-mouse-controls.js';
// Use the shared implementations. The right-button adapter leaves middle-click
// object focus to the Start-page helper, avoiding two competing double-clicks.
export function installItemViewControls(options){
 const {controls,camera,domElement}=options,bindings=new Map();
 let focus,defaultPose=null,pointer=null,lastClick=null;
 // Opt-in page reset semantics. Shared controls on other pages stay unchanged.
 const resetDown=e=>{if(!options.onResetView||![1,2].includes(e.button)||!controls.enabled||options.canInteract?.()===false)return;pointer={button:e.button,x:e.clientX,y:e.clientY,at:performance.now(),moved:0};};
 const resetMove=e=>{if(pointer){pointer.moved+=Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y);pointer.x=e.clientX;pointer.y=e.clientY;}};
 const resetUp=e=>{
  const p=pointer;pointer=null;if(!options.onResetView||!p||p.button!==e.button||options.canInteract?.()===false)return;
  const now=performance.now();if(now-p.at>240||p.moved+Math.hypot(e.clientX-p.x,e.clientY-p.y)>6){lastClick=null;return;}
  if(lastClick?.button===e.button&&now-lastClick.at<=320){lastClick=null;queueMicrotask(()=>{focus.cancelFocusAnimation();controls.enablePan=false;options.onResetView(e.button===1?'pan':'rotation');});}
  else lastClick={button:e.button,at:now};
 };
 const resetCancel=()=>{pointer=lastClick=null;};
 domElement.addEventListener('pointerdown',resetDown,{capture:true});domElement.addEventListener('pointermove',resetMove,{capture:true});domElement.addEventListener('pointerup',resetUp,{capture:true});
 domElement.addEventListener('pointercancel',resetCancel,{capture:true});
 const rightOnly={addEventListener(type,fn,opts){const wrapped=e=>{if((type==='pointerdown'||type==='pointerup')&&e.button!==2)return;fn(e);};bindings.set(fn,wrapped);domElement.addEventListener(type,wrapped,opts);},removeEventListener(type,fn,opts){domElement.removeEventListener(type,bindings.get(fn)||fn,opts);bindings.delete(fn);}};
 focus=installStartPageStyleMouseControls({...options,getDefaultFocusPoint:options.onResetView?()=>null:options.getDefaultFocusPoint});const standard=options.onResetView?null:installStandardGlbMouseControls({controls,domElement:rightOnly,canInteract:options.canInteract}),projection=createPanAwareCenterProjection(camera);
 return {...focus,captureDefaultPose:()=>{defaultPose=controls.target.clone();standard?.captureDefaultPose();},isPanned:()=>options.getDefaultView?controls.target.distanceToSquared(new controls.target.constructor().fromArray(options.getDefaultView().target))>1e-8:standard?.isPanned()||!!defaultPose&&controls.target.distanceToSquared(defaultPose)>1e-8,projection,
  clear(){pointer=lastClick=null;focus.cancelFocusAnimation();controls.enablePan=false;const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;camera.up.set(0,1,0);camera.clearViewOffset();},
  dispose(){focus.dispose();standard?.dispose();domElement.removeEventListener('pointerdown',resetDown,{capture:true});domElement.removeEventListener('pointermove',resetMove,{capture:true});domElement.removeEventListener('pointerup',resetUp,{capture:true});domElement.removeEventListener('pointercancel',resetCancel,{capture:true});}
 };
}
