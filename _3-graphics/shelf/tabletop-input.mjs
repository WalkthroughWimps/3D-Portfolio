// One mouse owner from the first button-down until every button is released.
// In particular, rotating over empty table can never acquire a card mid-drag.
export function installTabletopInput({element,ready,getHit,getDrag,startDrag,moveDrag,endDrag,cancelDrag,
  select,setCameraEnabled,tapRight,fan,gather,onPointer=()=>{},holdMs=650}) {
  let right=null,both=null,pending=null,tail=false,disposed=false;
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const point=e=>[e.clientX,e.clientY];
  const distance=(e,p)=>Math.hypot(e.clientX-p[0],e.clientY-p[1]);
  const capture=e=>{try{element.setPointerCapture(e.pointerId);}catch{/* A cancelled pointer may already be inactive. */}};
  function cancelClicks(id){if(pending&&(!id||pending.id===id)){clearTimeout(pending.timer);pending=null;}}
  function claimDouble(id){if(pending?.id===id&&performance.now()-pending.at<280){cancelClicks();return true;}return false;}
  function rightTap(id,double=false){
    if(double){tapRight(id,true);return;}
    cancelClicks();
    const record={id,at:performance.now()};
    record.timer=setTimeout(()=>{if(pending!==record||disposed)return;pending=null;tapRight(id,false);},280);
    pending=record;
  }
  function camera(){setCameraEnabled(!right?.id&&!getDrag()&&!both&&!tail);}
  function clearBoth(){if(both)clearTimeout(both.timer);both=null;}
  function beginBoth(e,first,id){
    clearBoth();
    const chord={first,id,start:point(e),fired:false,cancelled:false,double:first==='left'&&claimDouble(id)};
    if(getDrag())getDrag().chordUsed=true;
    if(right)right.chordUsed=true;
    chord.timer=setTimeout(()=>{
      if(disposed||both!==chord||chord.cancelled)return;
      chord.fired=true;cancelClicks(id);gather(id);
    },holdMs);
    both=chord;camera();
  }
  function down(e){
    if(!ready()||disposed)return;
    onPointer(e);
    if(e.button===2){
      const hit=getHit(e),id=hit?.body.kind==='cards'?hit.body.id:null;
      right={id,busy:!!hit?.busy,start:point(e),at:performance.now(),moved:false,chordUsed:false,double:id&&!hit.busy&&claimDouble(id)};
      // Cancelling pointerdown suppresses compatibility mouse events, including
      // the second button in a chord. Stop propagation, preserving those events.
      if(id){e.stopImmediatePropagation();select(id);capture(e);camera();}
      return;
    }
    if(e.button!==0||right||tail||getDrag())return;
    const hit=getHit(e);if(!hit)return;
    if(hit.busy){e.stopImmediatePropagation();select(hit.body.id);tail=true;capture(e);camera();return;}
    e.stopImmediatePropagation();select(hit.body.id);startDrag(e,hit);capture(e);camera();
  }
  function mouseDown(e){
    if(!ready()||disposed)return;
    const drag=getDrag();
    if(e.button===2&&(e.buttons&1)&&drag){stop(e);beginBoth(e,'left',drag.id);}
    else if(e.button===0&&(e.buttons&2)&&right?.id){
      stop(e);right.chordUsed=true;
      if(!right.moved&&!right.busy)beginBoth(e,'right',right.id);
    }
  }
  function move(e){
    if(!ready()||disposed)return;onPointer(e);
    if(tail){stop(e);return;}
    if(both){
      stop(e);
      if(distance(e,both.start)>6){both.cancelled=true;clearTimeout(both.timer);}
      return;
    }
    if(right){
      if(distance(e,right.start)>5)right.moved=true;
      if(right.id){stop(e);return;}
    }
    if(getDrag()){stop(e);moveDrag(e);return;}
    element.style.cursor='grab';
  }
  function release(e){
    if(disposed)return;
    if(tail){stop(e);if(!e.buttons){tail=false;camera();}return;}
    if(both){
      stop(e);const chord=both;clearBoth();
      const secondReleased=chord.first==='left'?e.button===2:e.button===0;
      if(secondReleased){
        if(!chord.cancelled&&!chord.fired){
          if(chord.first==='left')rightTap(chord.id,chord.double);
          else fan(chord.id);
        }
      }else{
        // Releasing the original owner first suppresses all tap actions.
        if(getDrag())endDrag(e,false);
        right=null;tail=!!e.buttons;
      }
      camera();return;
    }
    if(e.button===0&&getDrag()){
      stop(e);const drag=getDrag();
      endDrag(e,!drag.chordUsed);
      camera();return;
    }
    if(e.button===2&&right){
      const r=right;right=null;
      if(r.id)stop(e);
      if(r.id&&!r.busy&&!r.chordUsed&&!r.moved&&distance(e,r.start)<5&&performance.now()-r.at<500)rightTap(r.id,r.double);
      camera();
    }
  }
  function cancel(){clearBoth();cancelClicks();right=null;tail=false;cancelDrag();camera();}
  const lost=()=>{if(getDrag()||right?.id||both||tail)cancel();};
  const context=e=>e.preventDefault();
  const listeners=[['pointerdown',down],['mousedown',mouseDown],['pointermove',move],
    ['pointerup',release],['mouseup',release],['pointercancel',cancel],['lostpointercapture',lost],['contextmenu',context]];
  for(const [name,fn] of listeners)element.addEventListener(name,fn,{capture:true});
  return {
    cancel,cancelClicks,
    get state(){return {rightActive:!!right,rightOwner:right?.id||'',bothOwner:both?.id||'',gathered:!!both?.fired,tail,pending:pending?.id||''};},
    dispose(){disposed=true;cancel();for(const [name,fn] of listeners)element.removeEventListener(name,fn,{capture:true});}
  };
}
