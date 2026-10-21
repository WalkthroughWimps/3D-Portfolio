import * as THREE from 'three';
import {GUIDE,RIBBON,laneHeight,folderEndX,folderChannelProfile} from './ribbon-path.mjs?v=addon-layout-2';

function wallGeometry(stations){
  const vertices=[];
  const quad=(a,b,c,d)=>{
    for(const face of [[a,b,c],[a,c,d],[c,b,a],[d,c,a]])for(const point of face)vertices.push(...point);
  };
  const corners=([x,y0,y1,z0,z1])=>[[x,y0,z0],[x,y1,z0],[x,y1,z1],[x,y0,z1]];
  const first=corners(stations[0]),last=corners(stations.at(-1));
  quad(first[0],first[1],first[2],first[3]);quad(last[3],last[2],last[1],last[0]);
  for(let j=0;j<stations.length-1;j++){
    const a=corners(stations[j]),b=corners(stations[j+1]);
    for(let i=0;i<4;i++)quad(a[i],b[i],b[(i+1)%4],a[(i+1)%4]);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}

// Four open-ended rectangular tunnels; the sloped inner walls leave a real
// wide/thin inlet and narrow/deeper outlet for each moving tape surface.
export function createTapeFolders(parent,own,metal,dark){
  const group=new THREE.Group();group.name='Four open tape folding tunnels';parent.add(group);
  const centerZ=GUIDE.centerZ-GUIDE.tapeRadius;
  for(const side of [-1,1])for(let lane=0;lane<RIBBON.lanes;lane++){
    const y=laneHeight(lane),inputX=folderEndX(side,lane,true),outputX=folderEndX(side,lane);
    const profile=folderChannelProfile(side,lane);
    const walls=[
      {name:'upper',material:metal,top:true},
      {name:'lower',material:metal,bottom:true},
      {name:'front',material:dark},
      {name:'back',material:dark}
    ];
    for(const wall of walls){
      const stations=profile.map(([fraction,half,back,front,outerHalf,outerBack,outerFront])=>{
        const x=inputX+(outputX-inputX)*fraction;
        if(wall.top)return [x,half,outerHalf,outerBack,outerFront];
        if(wall.bottom)return [x,-outerHalf,-half,outerBack,outerFront];
        if(wall.name==='front')return [x,-half,half,front,outerFront];
        return [x,-half,half,outerBack,back];
      });
      const geometry=own(wallGeometry(stations));
      const mesh=new THREE.Mesh(geometry,wall.material);mesh.position.set(0,y,centerZ);
      mesh.name=(side<0?'Left':'Right')+' lane '+(lane+1)+' folding tunnel '+wall.name;
      mesh.userData.oddTapeFolder=true;group.add(mesh);
    }
  }
  return group;
}
