import {MIN_PROGRESS,MAX_PROGRESS} from './binding-model.mjs';
export const clampPage=p=>Math.max(MIN_PROGRESS,Math.min(MAX_PROGRESS,p));
export const restingPage=p=>Math.round(clampPage(p));
// Reserve unmodified scrolling for OrbitControls dolly, even over printed pages.
export const isPageWheel=e=>e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey;
export function draggedPage(start,delta,direction){
  return clampPage(Math.max(Math.floor(start)-(direction<0?1:0),Math.min(Math.ceil(start)+(direction>0?1:0),start+delta)));
}
// A pointer/range owns fractional progress until released. Wheel bursts have a
// short grace period; after that every target is an actual resting spread.
export class PageTurnInput{
  target=-1;owner=null;deadline=0;
  begin(owner){this.owner=owner;this.deadline=0;}
  set(value){this.target=clampPage(value);}
  release(){this.owner=null;this.deadline=0;this.target=restingPage(this.target);}
  reset(value=-1){this.owner=null;this.deadline=0;this.set(value);}
  turn(direction){this.reset(restingPage(this.target)+direction);}
  wheel(delta,mode,height,now){
    if(this.owner)return;
    const pixels=delta*(mode===1?16:mode===2?height:1);
    this.set(this.target+Math.max(-1,Math.min(1,pixels/360)));
    this.deadline=now+180;
  }
  settle(now){if(this.owner)return false;if(this.deadline&&now<this.deadline)return true;this.release();return false;}
}
