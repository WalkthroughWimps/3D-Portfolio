import {canPairMove} from './arm-motion.mjs?v=editing-5';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const descriptor=c=>({id:c.id,lane:c.lane,start:c.start,in:c.in,out:c.out,rate:c.rate,reversed:c.reversed===true,weave:JSON.stringify(c.links||[]),seconds:Math.max(0,(c.out-c.in)/c.rate),name:c.name||'woven sound'});
export const ATELIER_LIMITS=Object.freeze({pending:48,history:64,maxSeconds:120});
export function createAtelierQueue({random=Math.random}={}){
  let previous=new Map(),seen=new Set(),pending=[],active=null,suspended=false,age=0,stage='unfold',jam=null,prior=null;
  let options={armSpeed:1,separateSpeeds:false,foldSpeed:1,jams:false,jamFrequency:10};
  function clear(){pending=[];active=null;prior=null;age=0;jam=null;}
  function begin(job,nextStage='unfold'){active=job;active.pass=job.pass??(job.kind==='delete'?'unpick':['move','retie'].includes(job.kind)?canPairMove(job)?'paired':'unpick':job.kind==='preview'?'paired':'sew');stage=nextStage;age=0;jam=null;active.willJam=active.forcedJam??(options.jams&&random()<options.jamFrequency/100?1+Math.floor(random()*15):0);}
  function enqueue(kind,clip,from=null){
    pending=pending.filter(job=>!job.ids.includes(clip.id));
    const job={...clip,kind,from,to:kind==='delete'?null:clip,ids:[clip.id],units:1};
    if(kind==='delete')job.from=clip;
    if(pending.length===ATELIER_LIMITS.pending)pending.shift();
    pending.push(job);
  }
  return {
    configure(value){options={...options,...value};},
    preview(seconds,position=0,lane=0){clear();pending.push({id:'preview',ids:[],kind:'preview',lane,start:position+1.25,seconds:1,units:1,name:'arm jam demonstration',forcedJam:seconds??1+Math.floor(random()*15)});},
    unstick(){if(jam)jam.remaining=0;},
    sync(clips,{silent=false}={}){
      const next=new Map(clips.map(c=>[c.id,descriptor(c)]));
      if(!silent&&!suspended){
        for(const[id,c]of previous)if(!next.has(id))enqueue('delete',c);
        for(const[id,c]of next){const old=previous.get(id);if(!old){if(!clips.some(v=>v.id===id&&v.visualRecorded&&v.visualRecordedId===id)||seen.has(id))enqueue(seen.has(id)?'restore':'weave',c);}else if(old.lane!==c.lane||Math.abs(old.start-c.start)>.0001)enqueue('move',c,old);else if(old.in!==c.in||old.out!==c.out||old.rate!==c.rate||old.reversed!==c.reversed||old.weave!==c.weave)enqueue('retie',c,old);}
      }
      for(const id of next.keys()){seen.add(id);if(seen.size>ATELIER_LIMITS.history)seen.delete(seen.values().next().value);}
      previous=next;
    },
    update(dt,{reduced=false,blocked=false}={}){
      if(suspended||reduced){clear();return null;}if(blocked)return null;
      if(!active&&pending.length)begin(pending.shift());
      if(!active)return null;
      const seconds=active.pass==='unpick'?active.from?.seconds??active.seconds:active.seconds,step=clamp(Number.isFinite(dt)?dt:0,0,.05),duration=stage==='unfold'?2/options.armSpeed:stage==='travel'?.65/options.armSpeed:stage==='fold'?2/(options.separateSpeeds?options.foldSpeed:options.armSpeed):.6+Math.min(.6,seconds*.025);
      if(jam&&jam.remaining>0)jam.remaining=Math.max(0,jam.remaining-step);else age+=step;
      if(stage==='work'&&age>=duration*.35&&active.willJam&&!jam)jam={remaining:active.willJam,total:active.willJam,side:active.pass==='unpick'?-1:active.pass==='paired'?(random()<.5?-1:1):1};
      if(age>=duration){
        if(stage==='fold'){active=null;age=0;jam=null;prior=null;return null;}
        if(stage==='work'&&active.pass==='unpick'&&['move','retie'].includes(active.kind)){prior={...active};begin({...active,pass:'sew',forcedJam:0},'travel');return this.update(0);}
        if(stage==='work'&&pending.length){prior=active;begin(pending.shift(),'travel');return this.update(0);}
        stage=stage==='unfold'||stage==='travel'?'work':'fold';age=0;return this.update(0);
      }
      const fraction=age/duration,progress=stage==='unfold'?fraction*.28:stage==='work'?.28+fraction*.48:stage==='travel'?.28:.76+fraction*.24;
      const stuck=Boolean(jam?.remaining>0),frequency=active.kind==='delete'?28:38;
      return {...active,progress,stage,stageFraction:fraction,previous:stage==='travel'?prior:null,frequency,duration,phase:age*frequency*Math.PI*2,jammed:stuck,jamRemaining:jam?.remaining??0,jamElapsed:jam?jam.total-jam.remaining:0,jammedSide:jam?.side,repairing:stuck&&jam.total>=6&&jam.total-jam.remaining>3};
    },
    suspend(){suspended=true;clear();},resume(){suspended=false;},clear,
    get pendingJobs(){return pending.map(j=>({...j}));},
    get activeJob(){return active?{...active}:null;},
    get state(){return {active:active?{kind:active.kind,lane:active.lane,pass:active.pass,stage,jamRemaining:jam?.remaining??0}:null,pending:pending.length,suspended};}
  };
}
