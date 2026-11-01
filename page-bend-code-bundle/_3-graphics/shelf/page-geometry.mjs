// Pure, testable sheet geometry. No Blender evaluation or animation clips.
export const WIDTH = 1.42;
export const HEIGHT = 2;
export const SHEETS = 9;
export const THICKNESS = .007;
export const STEP = .0085;
export const COVER_THICKNESS = .022;
export const BACK_COVER_Y = .026;
export const BASE = BACK_COVER_Y + COVER_THICKNESS/2 + .004 + THICKNESS/2;
export const STACK_BOTTOM = BASE - THICKNESS/2;
export const STACK_TOP = BASE + (SHEETS-1)*STEP + THICKNESS/2;
export const FRONT_CLOSED_Y = STACK_TOP + .006 + COVER_THICKNESS/2;
export const BINDING_CENTER_Y = (FRONT_CLOSED_Y+BACK_COVER_Y)/2;
export const BINDING_RADIUS = (FRONT_CLOSED_Y-BACK_COVER_Y)/2;

export function createSheetData({width = WIDTH, height = HEIGHT, nx = 32, nz = 4, thickness = THICKNESS} = {}) {
  const perSide = (nx + 1) * (nz + 1);
  const boundary=[];
  for(let i=0;i<=nx;i++)boundary.push([i,0]);
  for(let j=1;j<=nz;j++)boundary.push([nx,j]);
  for(let i=nx-1;i>=0;i--)boundary.push([i,nz]);
  for(let j=nz-1;j>0;j--)boundary.push([0,j]);
  boundary.push(boundary[0]);
  const edgeBase=perSide*2;
  const count = edgeBase + boundary.length*2;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = [];
  const groups = [];
  for (let side = 0; side < 2; side++) {
    const start = indices.length;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const v = side * perSide + j * (nx + 1) + i;
      uvs[v * 2] = side ? 1 - i / nx : i / nx;
      uvs[v * 2 + 1] = j / nz;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = side * perSide + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (!side) indices.push(a,b,c,b,d,c); else indices.push(a,c,b,b,c,d);
    }
    groups.push({start, count: indices.length - start, materialIndex: side});
  }
  const start = indices.length;
  // Separate side-wall vertices give thick edges their own outward normals.
  // They are persistent too: no new triangles or vertices are made during turns.
  let perimeter=0;
  for(let k=0;k<boundary.length;k++){
    if(k)perimeter+=Math.hypot((boundary[k][0]-boundary[k-1][0])*width/nx,(boundary[k][1]-boundary[k-1][1])*height/nz);
    for(let side=0;side<2;side++){
      const v=edgeBase+k*2+side;
      uvs[v*2]=perimeter/(2*(width+height));uvs[v*2+1]=side;
    }
    if(k<boundary.length-1){const a=edgeBase+k*2,b=a+2;indices.push(a,a+1,b,b,a+1,b+1);}
  }
  groups.push({start,count:indices.length-start,materialIndex:2});
  const data = {width,height,nx,nz,thickness,perSide,edgeBase,boundary,positions,normals,uvs,indices:new Uint16Array(indices),groups,curve:new Float64Array((nx+1)*3)};
  poseSheet(data, {turn:0, y:0});
  return data;
}

export function poseSheet(data, {turn=0, bend = .8, y = 0, rootX = 0, rigid = false, profile=null, thicknessAt=null, warp=null}) {
  const {nx,nz,width,height,positions,normals,perSide,thickness,curve} = data;
  const a = Math.PI * Math.max(0, Math.min(1, turn));
  const curl = rigid ? 0 : .82 * bend * Math.sin(a);
  const step = width / nx;
  let x = rootX;
  let lift = y;
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    let theta = a + curl * (1 - 2 * u);
    if(profile){const p=profile(u);x=p.x;lift=p.y;theta=p.angle;}
    else if (i) {
      const midpointAngle = a + curl * (1 - 2 * (i - .5) / nx);
      // Integrate the tangent, not a displacement offset: every neutral-axis
      // segment remains exactly width/nx long, including halfway through a turn.
      x += step * Math.cos(midpointAngle);
      lift += step * Math.sin(midpointAngle);
    }
    curve[i*3] = x; curve[i*3+1] = lift; curve[i*3+2] = theta;
    const normalX = -Math.sin(theta), normalY = Math.cos(theta);
    for (let side = 0; side < 2; side++) for (let j = 0; j <= nz; j++) {
      const sign = side ? -1 : 1;
      const v = side*perSide + j*(nx+1) + i;
      const localThickness=thicknessAt?thicknessAt(u):thickness;
      positions[v*3] = x + normalX * localThickness / 2 * sign;
      positions[v*3+1] = lift + normalY * localThickness / 2 * sign;
      positions[v*3+2] = height/2 - j/nz*height;
      normals[v*3] = sign*normalX; normals[v*3+1] = sign*normalY; normals[v*3+2] = 0;
    }
  }
  for(let k=0;k<data.boundary.length;k++){
    const [i,j]=data.boundary[k];
    const theta=curve[i*3+2];
    const tangentSign=i===nx?1:i===0?-1:0;
    const zSign=j===0?1:j===nz?-1:0;
    const length=Math.hypot(tangentSign,zSign);
    for(let side=0;side<2;side++){
      const source=side*perSide+j*(nx+1)+i,v=data.edgeBase+k*2+side;
      positions[v*3]=positions[source*3];positions[v*3+1]=positions[source*3+1];positions[v*3+2]=positions[source*3+2];
      normals[v*3]=tangentSign*Math.cos(theta)/length;
      normals[v*3+1]=tangentSign*Math.sin(theta)/length;
      normals[v*3+2]=zSign/length;
    }
  }
  if(warp){
    for(let v=0;v<positions.length/3;v++){
      const p=warp(positions[v*3],positions[v*3+1]),c=Math.cos(p.rotation),s=Math.sin(p.rotation);
      positions[v*3]=p.x;positions[v*3+1]=p.y;
      const x=normals[v*3],y=normals[v*3+1];normals[v*3]=c*x-s*y;normals[v*3+1]=s*x+c*y;
    }
    for(let i=0;i<=nx;i++){const p=warp(curve[i*3],curve[i*3+1]);curve[i*3]=p.x;curve[i*3+1]=p.y;curve[i*3+2]+=p.rotation;}
  }
  return data;
}

export function sheetPose(index, progress, bend) {
  const turn = Math.max(0, Math.min(1, progress - index));
  const right = BASE + (SHEETS-1-index)*STEP;
  const left = BASE + index*STEP;
  const radius=(right-left)/2,a=turn*Math.PI;
  return {turn, bend, rootX:-radius*Math.sin(a), y:(right+left)/2+radius*Math.cos(a)};
}

export function measureSheet(data) {
  let length=0, minY=Infinity, finite=true;
  for (let i=0;i<=data.nx;i++) {
    const x=data.curve[i*3], y=data.curve[i*3+1];
    if (i) length += Math.hypot(x-data.curve[(i-1)*3],y-data.curve[(i-1)*3+1]);
    minY=Math.min(minY,y);
  }
  for (const value of data.positions) finite &&= Number.isFinite(value);
  return {vertices:data.positions.length/3,triangles:data.indices.length/3,length,widthError:Math.abs(length-data.width),minY,finite};
}
