// Optical placement in the original panel drawing's coordinates. The angled
// keys keep their ink inside the sloping edge while using the available width.
const FRAMES=Object.freeze([
  Object.freeze({x:29.42,y:25.27,width:30,height:24}),
  Object.freeze({x:68.4,y:25.27,width:28,height:24}),
  Object.freeze({x:29.42,y:60.76,width:30,height:24}),
  Object.freeze({x:75,y:60.76,width:38,height:24})
]);
export function windIconFrame(index,action){return action?.startsWith('wind:')?FRAMES[index]??null:null;}
