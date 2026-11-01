import {Tabletop} from './tabletop-model.mjs';

export const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const TILE_SPACING=1.02;
export const PLAY_CELLS=100;
export const PLAY_LIMIT=PLAY_CELLS*TILE_SPACING;
const adjacent=(a,b)=>{
  const x=Math.abs(a[0]-b[0]),z=Math.abs(a[2]-b[2]);
  return x<.18&&Math.abs(z-TILE_SPACING)<.18||z<.18&&Math.abs(x-TILE_SPACING)<.18;
};

export class LetterTabletop extends Tabletop {
  constructor(){super({mode:'letters',board:{width:PLAY_LIMIT*2+2,height:PLAY_LIMIT*2+2},colors:[],decks:[]});}
  reset(){this.bodies=[];this.anchor=null;this.events=[];this.revision++;return this.bodies;}
  remove(id){const before=this.bodies.length;this.bodies=this.bodies.filter(b=>b.id!==id);if(this.bodies.length!==before)this.revision++;}
  vacant(p,ignore=new Set()){
    return !this.bodies.some(b=>b.placed&&!ignore.has(b.id)&&Math.abs(b.p[0]-p[0])<.9&&Math.abs(b.p[2]-p[2])<.9);
  }
  defaultPosition(){
    const placed=this.bodies.filter(b=>b.placed);
    if(!placed.length)return [0,.004,0];
    for(const b of placed)for(const [x,z] of [[1,0],[0,1],[-1,0],[0,-1]]){
      const p=[b.p[0]+x*TILE_SPACING,.004,b.p[2]+z*TILE_SPACING];
      if(Math.abs(p[0])<=PLAY_LIMIT&&Math.abs(p[2])<=PLAY_LIMIT&&this.vacant(p))return p;
    }
    return [0,.004,0];
  }
  addLetter(letter,position){
    if(!ALPHABET.includes(letter)||letter.length!==1)return null;
    return this.add({kind:'letter',letter,name:`Letter ${letter}`,placed:false,p:position||this.defaultPosition(),half:[.44,.075,.44]});
  }
  place(id,snap=true){
    const b=this.get(id);if(!b)return false;
    if(snap){b.p[0]=Math.round(b.p[0]/TILE_SPACING)*TILE_SPACING;b.p[2]=Math.round(b.p[2]/TILE_SPACING)*TILE_SPACING;}
    b.p[0]=Math.max(-PLAY_LIMIT,Math.min(PLAY_LIMIT,b.p[0]));b.p[2]=Math.max(-PLAY_LIMIT,Math.min(PLAY_LIMIT,b.p[2]));
    const others=this.bodies.filter(q=>q.placed&&q!==b);
    if(!this.vacant(b.p,new Set([id]))||!b.placed&&others.length&&!others.some(q=>adjacent(q.p,b.p)))return false;
    this.settle([b]);return true;
  }
  cluster(id){
    const first=this.get(id);if(!first)return [];
    const result=[first],seen=new Set([id]);
    for(let i=0;i<result.length;i++)for(const b of this.bodies){
      if(b.placed&&!seen.has(b.id)&&adjacent(result[i].p,b.p)){seen.add(b.id);result.push(b);}
    }
    return result;
  }
  moveCluster(members,originals,dx,dz,snap=false){
    if(snap){dx=Math.round(dx/TILE_SPACING)*TILE_SPACING;dz=Math.round(dz/TILE_SPACING)*TILE_SPACING;}
    const minX=Math.min(...originals.map(p=>p[0])),maxX=Math.max(...originals.map(p=>p[0])),minZ=Math.min(...originals.map(p=>p[2])),maxZ=Math.max(...originals.map(p=>p[2]));
    dx=Math.max(-PLAY_LIMIT-minX,Math.min(PLAY_LIMIT-maxX,dx));dz=Math.max(-PLAY_LIMIT-minZ,Math.min(PLAY_LIMIT-maxZ,dz));
    members.forEach((b,i)=>{b.p=[originals[i][0]+dx,b.p[1],originals[i][2]+dz];});
  }
  settle(members){
    for(const b of members){b.p[1]=.004;b.placed=true;this.release(b.id);this.checkpoint(b);}
    this.revision++;
  }
  finishCluster(members){
    const ids=new Set(members.map(b=>b.id));
    if(members.some(b=>!this.vacant(b.p,ids)))return false;
    this.settle(members);return true;
  }
  tidy(){
    const rows=Math.ceil(this.bodies.length/13);
    for(const [i,b] of this.bodies.entries()){
      b.p=[(i%13-6)*TILE_SPACING,.004,(Math.floor(i/13)-Math.floor((rows-1)/2))*TILE_SPACING];b.angle=0;
    }
    this.settle(this.bodies);
  }
  // Tiles stay fixed on their cells. Only explicitly grabbed clusters move.
  step(){return this.bodies.some(b=>b.held);}
}
