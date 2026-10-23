// Small tabletop sandbox. Board coordinates are X/Z; Y is height above it.
export const HOLD_MS=650;
export const STICKS={helicopter:{length:3.25,width:.44,notch:.165,color:'#d0a52e'},balloon:{length:3.25*.55,width:.44,notch:.165,color:'#d99036'}};
export const CARD_THICKNESS=.005;
export const bodyHeight=b=>b.kind==='cards'?Math.max(1,b.cards.length)*CARD_THICKNESS:b.half[1]*2;
export function supportHeight(b){const [x,z]=b.tilt||[0,0],h=bodyHeight(b)/2;return Math.abs(Math.sin(z)*Math.cos(x))*b.half[0]+Math.abs(Math.cos(z)*Math.cos(x))*h+Math.abs(Math.sin(x))*b.half[2];}
export function outsideTable(p,board){return !p.every(Number.isFinite)||p[1]<0||p[1]>Math.max(board.width,board.height)*2||Math.abs(p[0])>board.width*1.5||Math.abs(p[2])>board.height*1.5;}
export class Tabletop {
  constructor(data,{random=Math.random}={}){this.data=data;this.board=data.board;this.random=random;this.serial=0;this.bodies=[];this.events=[];this.revision=0;this.reset();}
  add(body){body.id=`object-${++this.serial}`;body.v=[0,0,0];body.tilt=[0,0];body.angular=[0,0];body.angle=body.angle||0;body.spin=0;body.held=false;body.home=[...body.p];body.homeAngle=body.angle;this.bodies.push(body);this.revision++;return body;}
  reset(){this.bodies=[];this.serial=0;this.anchor=null;this.events=[];
    const w=this.board.width,h=this.board.height;
    if(this.data.mode!=='manor')this.data.colors.forEach((c,i)=>this.add({kind:'meeple',name:c.material.replace('Meeple','')+' meeple',color:c.color,p:[-w*.24+i*.3,.004,-h*.10],half:[.135,.15,.053]}));
    if(this.data.mode!=='manor')for(const [i,[key,s]] of Object.entries(STICKS).entries())this.add({kind:'stick',vehicle:key,name:key==='helicopter'?'Helicopter stick':'Hot air balloon stick',p:[w*.04,.008,h*(.38+i*.075)],half:[s.length/2,.014,s.width/2],length:s.length,angle:0});
    this.data.decks.forEach((d,i)=>this.add({kind:'cards',name:d.label,family:d.id,cards:d.cards.map(id=>`${d.id}:${id}`),faceUp:false,p:[-w*.42,.004,h*(i===0?.35:.07)],half:[.42,.015,.42]}));
    for(let i=0;i<6;i++)this.add({kind:'stand',character:i+1,name:`Character stand ${i+1}`,color:['#9a4658','#bf8447','#6b917b','#4f7caa','#8062a0','#cbab4f'][i],p:[-w*.4+i*.48,.004,h/2+.55],half:[.25,.45,.25]});
    if(this.data.mode==='manor')for(let i=0;i<2;i++)this.add({kind:'dice',name:`D8 ${i+1}`,color:i?'#bd7947':'#754e86',value:1,p:[w/2+.7,.004,-.4+i*.7],half:[.25,.25/Math.sqrt(3),.25]});
    this.revision++;return this.bodies;
  }
  get(id){return this.bodies.find(b=>b.id===id);}
  packet(body,cards,p){return this.add({kind:'cards',name:body.name,family:body.family,cards,faceUp:body.faceUp,p,half:[...body.half]});}
  draw(id,count=1,faceDown=false){const b=this.get(id);if(b?.kind!=='cards')return [];const n=Math.min(b.cards.length,Math.max(1,Math.floor(count)||1)),result=[];
    for(let i=0;i<n;i++){const hand=this.bodies.filter(q=>q.kind==='cards'&&q.cards.length===1&&q.faceUp).length;
      // A compact hand area stays within the board's reset perimeter.
      const card=this.packet(b,b.cards.splice(0,1),[-2.8+(hand%7)*.93,.004,this.board.height/2+.78+Math.floor(hand/7)*1.08]);card.faceUp=!faceDown;result.push(card);}
    if(!b.cards.length)this.bodies.splice(this.bodies.indexOf(b),1);this.revision++;return result;
  }
  cut(id){const b=this.get(id);if(b?.kind!=='cards'||b.cards.length<2)return null;
    const half=b.cards.splice(0,Math.floor(b.cards.length/2));this.revision++;
    return this.packet(b,half,[b.p[0]+.9,b.p[1],b.p[2]]);
  }
  shuffle(id){const b=this.get(id);if(b?.kind!=='cards')return false;
    for(let i=b.cards.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[b.cards[i],b.cards[j]]=[b.cards[j],b.cards[i]];}this.revision++;return true;
  }
  gather(id){const target=this.get(id);if(target?.kind!=='cards')return null;
    // Target packet first, then remaining packets in creation order. No shuffle.
    const others=this.bodies.filter(b=>b!==target&&b.kind==='cards'&&b.family===target.family);
    for(const b of others){target.cards.push(...b.cards);this.bodies.splice(this.bodies.indexOf(b),1);}
    target.v.fill(0);target.faceUp=false;this.revision++;return target;
  }
  flip(id){const b=this.get(id);if(b?.kind==='cards'){b.faceUp=!b.faceUp;b.cards.reverse();this.revision++;}}
  insert(cardId,deckId,{random=true,side='top'}={}){const card=this.get(cardId),deck=this.get(deckId);if(!card||!deck||card===deck||card.kind!=='cards'||deck.kind!=='cards'||card.cards.length!==1||card.family!==deck.family)return false;const index=random?Math.floor(this.random()*(deck.cards.length+1)):side==='bottom'?deck.cards.length:0;deck.cards.splice(index,0,...card.cards);card.faceUp=deck.faceUp;this.bodies.splice(this.bodies.indexOf(card),1);this.revision++;return index;}
  resetBody(b){b.p=[...b.home];b.angle=b.homeAngle;b.v.fill(0);b.tilt=[0,0];b.angular=[0,0];b.spin=0;b.held=false;b.roll=null;b.rest=null;b.value=b.kind==='dice'?1:b.value;if(this.anchor?.stick===b.id||this.anchor?.piece===b.id)this.anchor=null;this.events.push(`${b.name} returned to its last safe position.`);this.events=this.events.slice(-5);this.revision++;}
  grab(id){const b=this.get(id);if(!b)return null;b.v.fill(0);b.spin=0;b.tilt=[0,0];b.angular=[0,0];b.held=true;return b;}
  release(id,velocity=[0,0,0]){const b=this.get(id);if(!b)return;b.held=false;b.v=velocity.map(v=>Math.max(-65,Math.min(65,v)));if(this.anchor?.stick===id)b.v.fill(0);}
  checkpoint(b){if(!outsideTable(b.p,this.board)){b.home=[...b.p];b.home[1]=.004;b.homeAngle=b.angle;}}
  pin(stickId,pieceId){const stick=this.get(stickId),piece=this.get(pieceId);if(stick?.kind!=='stick'||piece?.kind!=='meeple')return false;
    this.anchor={stick:stickId,piece:pieceId};stick.p=[piece.p[0],.012,piece.p[2]];stick.v.fill(0);return true;
  }
  unpin(){this.anchor=null;}
  footprint(b){const offset=b.kind==='stick'?(b.length+.18)/2:0,c=Math.cos(b.angle),s=Math.sin(b.angle),[tx,tz]=b.tilt||[0,0],hy=bodyHeight(b)/2,hx=Math.abs(Math.cos(tz))*b.half[0]+Math.abs(Math.sin(tz))*hy,hz=Math.abs(Math.sin(tx)*Math.sin(tz))*b.half[0]+Math.abs(Math.sin(tx)*Math.cos(tz))*hy+Math.abs(Math.cos(tx))*b.half[2];return {x:b.p[0]+offset*c,z:b.p[2]-offset*s,hx:b.kind==='stick'?(b.length-.18)/2:hx,hz,c,s};}
  separate(a,b){if(a.sweeping||b.sweeping||a.inactive||b.inactive)return;if(this.anchor&&[a.id,b.id].includes(this.anchor.stick)&&[a.id,b.id].includes(this.anchor.piece))return;
    const heightA=supportHeight(a),heightB=supportHeight(b);if(Math.abs(a.p[1]+heightA-b.p[1]-heightB)>heightA+heightB+.005)return;
    const A=this.footprint(a),B=this.footprint(b),dx=B.x-A.x,dz=B.z-A.z;let depth=Infinity,normal;
    for(const [x,z] of [[A.c,-A.s],[A.s,A.c],[B.c,-B.s],[B.s,B.c]]){
      const rA=A.hx*Math.abs(x*A.c-z*A.s)+A.hz*Math.abs(x*A.s+z*A.c),rB=B.hx*Math.abs(x*B.c-z*B.s)+B.hz*Math.abs(x*B.s+z*B.c),dot=dx*x+dz*z,overlap=rA+rB-Math.abs(dot);
      if(overlap<=0)return;if(overlap<depth){depth=overlap;const sign=dot<0?-1:1;normal=[x*sign,z*sign];}}
    const fixed=q=>q.held||this.anchor?.stick===q.id,mass=q=>q.kind==='cards'?Math.max(1,q.cards.length)*.02:q.kind==='stick'?.1:.15,total=mass(a)+mass(b),wa=fixed(a)?0:fixed(b)?1:mass(b)/total,wb=fixed(b)?0:fixed(a)?1:mass(a)/total;if(!wa&&!wb)return;
    a.p[0]-=normal[0]*(depth+.00001)*wa;a.p[2]-=normal[1]*(depth+.00001)*wa;b.p[0]+=normal[0]*(depth+.00001)*wb;b.p[2]+=normal[1]*(depth+.00001)*wb;
    const relative=(b.v[0]-a.v[0])*normal[0]+(b.v[2]-a.v[2])*normal[1];if(relative<0){const impulse=-relative*1.12;a.v[0]-=normal[0]*impulse*wa;a.v[2]-=normal[1]*impulse*wa;b.v[0]+=normal[0]*impulse*wb;b.v[2]+=normal[1]*impulse*wb;
      if(impulse>2.8)for(const [q,weight,sign] of [[a,wa,-1],[b,wb,1]])if(['meeple','stand'].includes(q.kind)&&weight){q.angular[0]+=normal[1]*impulse*.8*sign;q.angular[1]-=normal[0]*impulse*.8*sign;}}
  }
  step(seconds){const steps=Math.max(1,Math.ceil(Math.min(.1,seconds)*120)),dt=Math.min(.1,seconds)/steps;let moving=false;
    for(let k=0;k<steps;k++){
      if(this.anchor){const s=this.get(this.anchor.stick),p=this.get(this.anchor.piece);if(s&&p){s.p[0]=p.p[0];s.p[2]=p.p[2];}else this.anchor=null;}
      for(const b of this.bodies){if(outsideTable(b.p,this.board)){this.resetBody(b);continue;}if(b.held)continue;
        if(b.p[1]>.004||b.v[1]>0)b.v[1]-=12*dt;
        b.p=b.p.map((v,i)=>v+b.v[i]*dt);b.angle+=b.spin*dt;
        if(b.p[1]<.004){b.p[1]=.004;b.v[1]=Math.abs(b.v[1])>.45?-b.v[1]*.22:0;}
        const speed=Math.hypot(b.v[0],b.v[2]);const damping=b.p[1]<=.005?Math.max(0,speed-(5.8+10/(1+speed*speed))*dt)/(speed||1):Math.exp(-.65*dt);b.v[0]*=damping;b.v[2]*=damping;b.spin*=Math.exp(-8*dt);
        if(['meeple','stand'].includes(b.kind))for(let axis=0;axis<2;axis++){const angle=b.tilt[axis],target=Math.abs(angle)<.7?0:Math.sign(angle)*Math.PI/2;b.angular[axis]+=((target-angle)*30-b.angular[axis]*7)*dt;b.tilt[axis]+=b.angular[axis]*dt;if(Math.abs(b.tilt[axis]-target)<.001&&Math.abs(b.angular[axis])<.008){b.tilt[axis]=target;b.angular[axis]=0;}}
        if(Math.hypot(...b.v)<.015)b.v.fill(0);if(outsideTable(b.p,this.board))this.resetBody(b);
      }
      for(let pass=0;pass<3;pass++)for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++)this.separate(this.bodies[i],this.bodies[j]);
    }
    if(this.anchor){const s=this.get(this.anchor.stick),p=this.get(this.anchor.piece);if(s&&p){s.p[0]=p.p[0];s.p[2]=p.p[2];}}
    for(const b of this.bodies){if(outsideTable(b.p,this.board))this.resetBody(b);moving ||= b.held||Math.hypot(...b.v)>.001||Math.hypot(...b.angular)>.001||Math.abs(b.spin)>.001;}
    return moving;
  }
}



