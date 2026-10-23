// Pointer Events emit pointerdown only for the first mouse button. A right
// click while LMB is already holding an object needs the mouse button events.
export function installHeldMouseChord({element,getGesture,onRightDown,onRightUp,onLeftUp}){
 let heldRight=null;
 const down=e=>{const gesture=getGesture();if(e.button!==2||!gesture)return;e.preventDefault();e.stopImmediatePropagation();heldRight=gesture;onRightDown(e,gesture);};
 const up=e=>{
  if(e.button===2&&heldRight){const gesture=heldRight;heldRight=null;e.preventDefault();e.stopImmediatePropagation();onRightUp(e,gesture);}
  else if(e.button===0&&getGesture())onLeftUp(e,getGesture());
 };
 const cancel=()=>heldRight=null;
 element.addEventListener('mousedown',down,{capture:true});element.addEventListener('mouseup',up,{capture:true});element.addEventListener('pointercancel',cancel,{capture:true});
 return {cancel,dispose(){element.removeEventListener('mousedown',down,{capture:true});element.removeEventListener('mouseup',up,{capture:true});element.removeEventListener('pointercancel',cancel,{capture:true});}};
}
