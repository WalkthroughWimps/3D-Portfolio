/** Opt-in relative slider drag. Unassigned sliders retain their native behavior. */
export function attachPrecisionSlider(input,{get=()=>Number(input.value),set=value=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}}={}){
  let finish=null;const down=event=>{
    if(event.button!==0||event.pointerType!=='mouse')return;
    event.preventDefault();finish?.();const abort=new AbortController();let value=get(),x=event.clientX,last=event.timeStamp,locked=false,pointerStamp=-Infinity;
    const min=Number(input.min)||0,max=Number(input.max)||100,step=Number(input.step)||.01;
    const end=()=>{abort.abort();input.classList.remove('is-precision-dragging');if(document.pointerLockElement===input)document.exitPointerLock?.();try{input.releasePointerCapture?.(event.pointerId);}catch{}finish=null;};finish=end;
    input.focus();input.setPointerCapture?.(event.pointerId);
    const move=e=>{if(e.type==='pointermove')pointerStamp=e.timeStamp;else if(!locked||Math.abs(e.timeStamp-pointerStamp)<2)return;const now=e.timeStamp,dt=Math.max(1,now-last),delta=locked?e.movementX:e.clientX-x;x=e.clientX;last=now;
      if(!Number.isFinite(delta))return;const speed=Math.abs(delta)/dt,gain=e.shiftKey?.12:Math.max(.2,Math.min(2.5,.2+speed));
      value=Math.max(min,Math.min(max,value+delta*(max-min)/320*gain));set(Math.max(min,Math.min(max,Math.round(value/step)*step)));};
    window.addEventListener('pointermove',move,{signal:abort.signal,capture:true});
    window.addEventListener('mousemove',move,{signal:abort.signal,capture:true});
    for(const type of ['pointerup','pointercancel','blur'])window.addEventListener(type,end,{signal:abort.signal,capture:true});
    document.addEventListener('pointerlockchange',()=>{locked=document.pointerLockElement===input;if(locked)input.classList.add('is-precision-dragging');else if(finish)end();},{signal:abort.signal});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')end();},{signal:abort.signal});
    try{input.requestPointerLock?.()?.catch?.(()=>{});}catch{}
  };
  input.addEventListener('pointerdown',down);return()=>{finish?.();input.removeEventListener('pointerdown',down);};
}
