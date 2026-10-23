import {separateBooks} from './marker-player-model.mjs';
// Small contact repair for the presentation delta, prepared before playback.
// The original motion/contact track remains unchanged; no history-based solve
// runs in the render loop, including when a return traverses the path backward.
export function prepareFocusContacts(sample,steps=60){
  const source=Array.from({length:steps+1},(_,i)=>sample(i/steps)),mid=Array.from({length:steps},(_,i)=>sample((i+.5)/steps)),offsets=source.map(()=>Array.from({length:6},()=>[0,0,0]));
  let adjustment=0;
  const solve=i=>{
    const p=source[i].map((p,j)=>({...p,position:p.position.map((v,k)=>v+offsets[i][j][k])}));separateBooks(p);
    const next=p.map((p,j)=>p.position.map((v,k)=>v-source[i][j].position[k]));
    for(let j=0;j<6;j++)for(let k=0;k<3;k++)adjustment=Math.max(adjustment,Math.abs(next[j][k]-offsets[i][j][k]));offsets[i]=next;
  };
  const solveMid=i=>{
    const before=mid[i].map((p,j)=>({...p,position:p.position.map((v,k)=>v+(offsets[i][j][k]+offsets[i+1][j][k])*.5)})),p=before.map(p=>({...p,position:[...p.position]}));separateBooks(p);
    for(let j=0;j<6;j++)for(let k=0;k<3;k++){const correction=p[j].position[k]-before[j].position[k];adjustment=Math.max(adjustment,Math.abs(correction));if(i>0)offsets[i][j][k]+=correction*(i===steps-1?2:1);if(i+1<steps)offsets[i+1][j][k]+=correction*(i===0?2:1);}
  };
  for(let i=1;i<steps;i++)solve(i);
  for(let i=0;i<steps;i++)solveMid(i);
  if(adjustment<1e-8)return offsets;
  for(let pass=0;pass<6;pass++){
    const prior=offsets.map(p=>p.map(v=>[...v]));
    for(let i=1;i<steps;i++)for(let j=0;j<6;j++)for(let k=0;k<3;k++)offsets[i][j][k]=(prior[i-1][j][k]+2*prior[i][j][k]+prior[i+1][j][k])/4;
    for(let i=1;i<steps;i++)solve(i);
    for(let i=0;i<steps;i++)solveMid(i);
  }
  for(let pass=0;pass<48;pass++){adjustment=0;for(let i=1;i<steps;i++)solve(i);for(let i=0;i<steps;i++)solveMid(i);if(adjustment<1e-7)break;}
  return offsets;
}
export function applyFocusContacts(poses,offsets,progress){
  const f=Math.max(0,Math.min(1,progress))*(offsets.length-1),lo=Math.floor(f),hi=Math.min(lo+1,offsets.length-1),t=f-lo;
  return poses.map((p,i)=>({...p,position:p.position.map((v,k)=>v+offsets[lo][i][k]*(1-t)+offsets[hi][i][k]*t)}));
}
