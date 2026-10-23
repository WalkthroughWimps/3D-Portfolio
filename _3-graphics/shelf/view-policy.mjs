export function rotationPolicy(isolated=false){
  return isolated?{minAzimuthAngle:-Infinity,maxAzimuthAngle:Infinity,minPolarAngle:0,maxPolarAngle:Math.PI,enablePan:false}:
    {minAzimuthAngle:-Math.PI/9,maxAzimuthAngle:Math.PI/9,minPolarAngle:Math.PI/2-Math.PI/8,maxPolarAngle:Math.PI/2+Math.PI/36,enablePan:false};
}
export function shelfRotationPolicy(enabled=false){
 const horizontal=enabled?Math.PI/9:0,vertical=enabled?Math.PI/22.5:0;
 return {minAzimuthAngle:enabled?-horizontal:0,maxAzimuthAngle:horizontal,minPolarAngle:Math.PI/2-vertical,maxPolarAngle:Math.PI/2+vertical,enablePan:false};
}
