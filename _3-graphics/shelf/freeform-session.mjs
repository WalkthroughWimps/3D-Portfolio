// Card ownership only. No route, vehicle, score, objective or turn rules run here.
export const VEHICLES=[['001','Bicycle'],['002','Taxi'],['003','Bus'],['004','Hot air balloon'],['005','Motorcycle'],['006','Train'],['007','Helicopter'],['008','Ship'],['009','Airplane'],['010','Thief'],['011','Superman'],['012','Iron Man']].map(([id,name])=>({id,name}));
export const artKey=card=>card?.split('~')[0];
export const vehicleFor=card=>VEHICLES.find(v=>`vehicles:${v.id}`===artKey(card));
export const landmarkLetter=card=>String.fromCharCode(64+Number(artKey(card)?.split(':')[1]));
export class FreeformSession {
  constructor(table,map,{players=2,copies=4}={}){this.table=table;this.map=map;this.revision=0;this.setup(players,copies);}
  touch(){this.revision++;this.table.revision++;}
  setup(count=2,copies=this.copies??4){
    this.copies=copies;this.table.reset();this.active=0;this.effects=[];this.targets=[];this.pending=null;this.phase='freeform';this.nodes=new Map();this.remaining=0;this.discard=[];
    this.players=Array.from({length:Math.max(1,Math.min(6,Math.floor(count)||1))},(_,i)=>({name:`Player ${i+1}`,hand:[],score:[],body:this.table.bodies[i]?.id}));
    this.table.bodies.filter(b=>b.kind==='meeple').forEach((b,i)=>{b.inactive=false;b.p=[-this.map.width/2-.65,.004,-this.map.height/2+.5+i*.58];b.home=[...b.p];});
    this.vehicleDeck=this.table.bodies.find(b=>b.family==='vehicles');this.landmarkDeck=this.table.bodies.find(b=>b.family==='landmarks');
    if(this.vehicleDeck){this.vehicleDeck.cards=VEHICLES.flatMap(v=>Array.from({length:typeof copies==='number'?copies:copies[v.id]??0},(_,i)=>`vehicles:${v.id}~${i}`));this.vehicleDeck.p=[this.map.width/2+.65,.004,-.65];this.vehicleDeck.home=[...this.vehicleDeck.p];this.vehicleDeck.role='supply';}
    if(this.landmarkDeck){this.landmarkDeck.p=[this.map.width/2+.65,.004,.65];this.landmarkDeck.home=[...this.landmarkDeck.p];this.landmarkDeck.role='supply';}
    this.message='Freeform table · move any piece, draw cards and switch hands. No game rules are enforced.';this.touch();
  }
  get player(){return this.players[this.active];}
  allowed(){return [];}
  next(){this.active=(this.active+1)%this.players.length;this.message=`${this.player.name}'s hand`;this.touch();return true;}
  setPlayerCount(count){
    count=Math.max(1,Math.min(6,Math.floor(count)||1));
    while(this.players.length>count){const p=this.players.pop();for(const card of p.hand){const family=artKey(card).split(':')[0];let deck=this.table.bodies.find(b=>b.kind==='cards'&&b.family===family);if(!deck)deck=this.table.add({kind:'cards',name:'Returned cards',family,cards:[],faceUp:false,p:[this.map.width/2+.65,.004,0],half:[.42,.015,.42]});deck.cards.push(card);}}
    while(this.players.length<count)this.players.push({name:`Player ${this.players.length+1}`,hand:[],score:[],body:this.table.bodies[this.players.length]?.id});
    this.active=Math.min(this.active,count-1);this.touch();
  }
  returnToHand(id){const b=this.table.get(id);if(b?.kind!=='cards')return false;this.player.hand.push(...b.cards);this.table.bodies.splice(this.table.bodies.indexOf(b),1);this.touch();return true;}
  physicalFromHand(card,p){const i=this.player.hand.indexOf(card);if(i<0)return null;this.player.hand.splice(i,1);const deck=this.table.bodies.find(b=>b.kind==='cards'&&b.family===artKey(card).split(':')[0]);const b=this.table.packet(deck||{name:'Cards',family:artKey(card).split(':')[0],half:[.42,.015,.42]},[card],p);b.faceUp=true;this.touch();return b;}
  allCards(){return [...this.table.bodies.filter(b=>b.kind==='cards').flatMap(b=>b.cards),...this.players.flatMap(p=>p.hand)];}
}
