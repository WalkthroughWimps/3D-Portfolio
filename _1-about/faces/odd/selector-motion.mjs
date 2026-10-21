/** A lightly damped magnetic needle; angles wrap along the shortest route. */
export function stepMagneticArrow(state,target,dt,reduced=false){
  if(reduced){state.angle=target;state.velocity=0;return state.angle;}
  const count=Math.max(1,Math.ceil(Math.min(.08,Math.max(0,dt))*120)),step=Math.min(.08,Math.max(0,dt))/count;
  for(let i=0;i<count;i++){const difference=Math.atan2(Math.sin(target-state.angle),Math.cos(target-state.angle));state.velocity+=(144*difference-8.4*state.velocity)*step;state.angle+=state.velocity*step;}
  return state.angle;
}
