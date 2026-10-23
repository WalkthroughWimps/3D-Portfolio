export function selectionInterval(markers,layout,grade,returning=false){
  if(!['grid','spread'].includes(layout)||!Number.isInteger(grade)||grade<1||grade>6)throw new RangeError('Unknown book/layout');
  const family=layout==='spread'?(returning?'spread_deselect':'spread_select'):(returning?'grid_zoomout':'grid_zoomin');
  const name=`${family}_g${grade}${layout==='grid'?'_p1':''}`;
  const interval=markers.find(m=>m.name===name);
  if(!interval||interval.endFrame<=interval.frame)throw new Error(`Missing source action ${name}`);
  return interval;
}
export function actionInventory(markers){
  const groups=new Map();
  for(const m of markers){
    const family=m.name.replace(/_g\d+/g,'_gN').replace(/_p\d+/g,'_pN');
    const g=groups.get(family)||{family,count:0,first:m.frame,last:m.endFrame};g.count++;g.last=m.endFrame;groups.set(family,g);
  }
  return [...groups.values()];
}
export function shelvingIntervals(layout){
  // 6429 is the end bookmark of G6's focused close, not a neutral grid.
  // Use the authored all-book grid gather, avoiding a bridge through enlarged G6.
  if(layout==='grid')return [[177,258],[6436,6467]];
  if(layout==='spread')return [[314,258],[6436,6467]];
  throw new RangeError('A book return requires grid or spread');
}
export function takeOutIntervals(layout){
  if(!['spread','grid'].includes(layout))throw new RangeError('Unknown overview');
  return [[6468,6501],[258,layout==='grid'?177:314]];
}
export function bookClickIntent(state,hitId,selected){
  if(!hitId?.startsWith('book-'))return 'none';
  if(state==='shelf')return 'take-set';
  if(state==='book'&&hitId===selected)return 'page';
  if(['spread','grid','book'].includes(state))return 'choose-book';
  return 'none';
}
