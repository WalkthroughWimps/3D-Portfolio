const DIRECTIONS=['E','NE','N','NW','W','SW','S','SE'];

// A short continuous trail on the neutral card plane. Trim the oldest segment
// at an exact distance so event frequency cannot change the chosen heading.
export function createPointerTrail(maxLength=.18){
  const points=[];
  let length=0,lastTime=null,head=0;
  return {
    clear(){points.length=0;head=0;length=0;lastTime=null;},
    push(point,time){
      if(!point)return;
      if(lastTime!==null&&time-lastTime>160){points.length=0;head=0;length=0;}
      lastTime=time;
      const next=point.clone(),previous=points.at(-1);
      if(previous){
        const step=Math.hypot(next.x-previous.x,next.y-previous.y);
        if(step<1e-4)return;
        length+=step;
      }
      points.push(next);
      while(points.length-head>1&&length>maxLength){
        const a=points[head],b=points[head+1],segment=Math.hypot(b.x-a.x,b.y-a.y);
        const excess=length-maxLength;
        if(segment<=excess+1e-8){head++;length-=segment;}
        else{a.lerp(b,excess/segment);length=maxLength;}
      }
      if(head>64&&head*2>points.length){points.splice(0,head);head=0;}
    },
    direction(entering=false){
      if(points.length-head<2)return undefined;
      const a=points[head],b=points.at(-1),x=b.x-a.x,y=b.y-a.y;
      if(Math.hypot(x,y)<.012)return undefined;
      const sign=entering?-1:1;
      return DIRECTIONS[(Math.round(Math.atan2(y*sign,x*sign)/(Math.PI/4))+8)%8];
    },
    get length(){return length;}
  };
}

// Return every neutral-plane card footprint crossed by a pointer segment,
// including cards skipped entirely between two browser pointer events.
export function crossedPanelSlots(from,to,slots){
  if(!from||!to)return [];
  const dx=to.x-from.x,dy=to.y-from.y;
  if(Math.hypot(dx,dy)<1e-7)return [];
  const crossed=[];
  for(const slot of slots){
    const half=slot.width/2;
    let enter=0,exit=1;
    for(const [start,step,center] of [[from.x,dx,slot.center.x],[from.y,dy,slot.center.y]]){
      if(Math.abs(step)<1e-9){if(Math.abs(start-center)>half){enter=2;break;}continue;}
      const a=(center-half-start)/step,b=(center+half-start)/step;
      enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    }
    if(exit-enter>1e-6&&enter<1&&exit>0)crossed.push({slot,enter,exit});
  }
  return crossed.sort((a,b)=>a.enter-b.enter||a.exit-b.exit);
}

// Pick the nearest neutral-plane slot at a pointer position. Card mesh pose and
// geometry between the camera and face do not affect hover selection.
export function panelAtSlot(point,slots){
  if(!point)return null;
  let nearest=null,nearestDistance=Infinity;
  for(const {panel,center,width} of slots){
    const x=point.x-center.x,y=point.y-center.y;
    if(Math.abs(x)>width*.5||Math.abs(y)>width*.5)continue;
    const distance=x*x+y*y;
    if(distance<nearestDistance){nearest=panel;nearestDistance=distance;}
  }
  return nearest;
}

// Walk the selected slot under each part of a segment. Sampling between every
// slot boundary also finds cards skipped by sparse browser pointer events.
export function tracePanelSlotSegment(from,to,slots,panelAt){
  if(!from||!to||typeof panelAt!=='function')return [];
  const crossings=crossedPanelSlots(from,to,slots);
  if(!crossings.length)return [];
  const boundaries=[0,1,...crossings.flatMap(({enter,exit})=>[enter,exit])]
    .sort((a,b)=>a-b)
    .filter((value,index,values)=>index===0||value-values[index-1]>1e-7);
  const events=[];
  let active=null;
  for(let i=0;i<boundaries.length-1;i++){
    const start=boundaries[i],end=boundaries[i+1];
    if(end-start<1e-7)continue;
    const point=from.clone().lerp(to,(start+end)/2);
    const candidates=crossings.filter(({enter,exit})=>enter<(start+end)/2&&exit>(start+end)/2).map(({slot})=>slot);
    const next=panelAt(point,candidates);
    if(next===active)continue;
    if(active)events.push({type:'exit',panel:active,t:start});
    if(next)events.push({type:'enter',panel:next,t:start});
    active=next;
  }
  if(active&&boundaries.at(-1)<1-1e-7)events.push({type:'exit',panel:active,t:boundaries.at(-1)});
  return events;
}
