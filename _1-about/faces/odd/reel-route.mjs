const TAU=Math.PI*2;
const positiveAngle=angle=>(angle%TAU+TAU)%TAU;

// A common forward tangent from the fixed exit guide circle to the reel's
// projected winding ellipse. The reel stays in its own tilted axial plane.
export function solveReelRoute({side,laneY,radius,axial,reelCenter,frameAngle,frameLift,reelLift,rearZ,guideX=.61,guideRadius=.028}){
  const c=Math.cos(frameAngle),s=Math.sin(frameAngle),O={x:side*guideX,y:laneY-side*guideRadius,z:rearZ};
  const A={x:side*guideX,y:laneY,z:rearZ};
  const cx=reelCenter[0]+s*axial,cy=reelCenter[1];
  const at=theta=>{
    const cos=Math.cos(theta),sin=Math.sin(theta),T={x:cx+c*radius*cos,y:cy+radius*sin,z:reelLift+frameLift-s*radius*cos+c*axial};
    const dx=-c*radius*sin,dy=radius*cos,dz=s*radius*sin,length=Math.hypot(dx,dy);
    const tangent={x:dx/length,y:dy/length,z:dz/length},normal={x:tangent.y,y:-tangent.x};
    const B={x:O.x+guideRadius*normal.x,y:O.y+guideRadius*normal.y,z:rearZ};
    const error=(T.x-O.x)*normal.x+(T.y-O.y)*normal.y-guideRadius;
    const lineLength=(T.x-B.x)*tangent.x+(T.y-B.y)*tangent.y;
    const startNormal={x:0,y:side};
    const turn=positiveAngle(Math.atan2(startNormal.x*normal.y-startNormal.y*normal.x,startNormal.x*normal.x+startNormal.y*normal.y));
    return {theta,T,B,normal,tangent,dzPerXY:dz/length,error,lineLength,turn};
  };
  const roots=[];let before=at(0);
  for(let i=1;i<=96;i++){
    const end=i*TAU/96,after=at(end);
    if(before.error*after.error<=0){
      let lo=(i-1)*TAU/96,hi=end,leftError=before.error;
      for(let j=0;j<36;j++){const mid=(lo+hi)/2,value=at(mid).error;if(leftError*value<=0)hi=mid;else{lo=mid;leftError=value;}}
      roots.push(at((lo+hi)/2));
    }
    before=after;
  }
  const contact=roots.find(root=>root.lineLength>0&&root.turn>0&&root.turn<Math.PI/2);
  if(!contact)throw new Error('No short forward reel tangent for lane');
  return {...contact,O,A,side,laneY,radius,axial,guideRadius,guideX,frameAngle,frameLift,reelLift,reelCenter};
}

export function guideArcPoint(plan,f){
  const angle=Math.atan2(plan.side,0)+plan.turn*f;
  return {x:plan.O.x+plan.guideRadius*Math.cos(angle),y:plan.O.y+plan.guideRadius*Math.sin(angle),z:plan.O.z};
}

export function tangentRunPoint(plan,f){
  const x=plan.B.x+(plan.T.x-plan.B.x)*f,y=plan.B.y+(plan.T.y-plan.B.y)*f;
  const s=Math.sin(plan.frameAngle),c=Math.cos(plan.frameAngle);
  const planeB=plan.reelLift+plan.frameLift+(plan.axial-s*(plan.B.x-plan.reelCenter[0]))/c;
  const planeZ=plan.reelLift+plan.frameLift+(plan.axial-s*(x-plan.reelCenter[0]))/c;
  return {x,y,z:planeZ-(planeB-plan.B.z)*(1-f)**1.2};
}
