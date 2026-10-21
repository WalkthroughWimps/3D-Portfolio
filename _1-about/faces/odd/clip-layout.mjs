/** Reversible placement links never alter source trims or PCM. */
export const clipDuration=c=>(c.out-c.in)/c.rate;
export const clipEnd=c=>c.start+clipDuration(c);
export const overlaps=(a,b)=>a.lane===b.lane&&a.start<clipEnd(b)-.001&&clipEnd(a)>b.start+.001;
export const cloneClip=c=>({...c,gain:c.gain??1,reversed:c.reversed===true,links:(c.links||[]).map(l=>({...l}))});
export const sourceTimeAt=(c,time)=>c.reversed===true?c.out-(time-c.start)*c.rate:c.in+(time-c.start)*c.rate;
export function trimToWindow(c,start,end){const a=sourceTimeAt(c,start),b=sourceTimeAt(c,end);return {...c,start,in:Math.min(a,b),out:Math.max(a,b)};}
export function validClip(c){return (c.gain===undefined||Number.isFinite(c.gain)&&c.gain>=0&&c.gain<=1)&&(c.reversed===undefined||typeof c.reversed==='boolean')&&Number.isFinite(c.start)&&c.start>=-60&&c.start<=120&&Number.isInteger(c.lane)&&c.lane>=0&&c.lane<4&&Number.isFinite(c.in)&&Number.isFinite(c.out)&&c.in>=0&&c.out>c.in&&c.out<=c.buffer.duration+.001&&Number.isFinite(c.rate)&&c.rate>=.5&&c.rate<=2;}
export function linkMode(a,b){return a.links?.find(l=>l.peer===b.id)?.mode;}
export function cleanLinks(clips){for(const c of clips)c.links=(c.links||[]).filter(l=>{const p=clips.find(v=>v.id===l.peer);return p&&overlaps(c,p)&&['clip','blend'].includes(l.mode)&&p.links?.some(k=>k.peer===c.id&&k.mode===l.mode);});return clips;}
export function visibleInterval(c,clips,{playable=true}={}){
  let start=c.start,end=clipEnd(c);
  for(const link of c.links||[]){const other=clips.find(p=>p.id===link.peer);if(link.mode!=='clip'||!other||!overlaps(c,other))continue;const cut=(Math.max(c.start,other.start)+Math.min(clipEnd(c),clipEnd(other)))/2,first=c.start<other.start||c.start===other.start&&c.id<other.id;if(first)end=Math.min(end,cut);else start=Math.max(start,cut);}
  if(playable){start=Math.max(0,start);end=Math.min(60,end);}
  end=Math.max(start,end);return {start,end,in:sourceTimeAt(c,start),out:sourceTimeAt(c,end)};
}
export function validateLayout(clips){
  if(clips.length>48||!clips.every(validClip)||new Set(clips.map(c=>c.id)).size!==clips.length)return false;
  for(const c of clips){const seen=new Set();for(const l of c.links||[]){const p=clips.find(v=>v.id===l.peer);if(!p||p===c||seen.has(l.peer)||!['clip','blend'].includes(l.mode)||linkMode(p,c)!==l.mode||!overlaps(c,p))return false;seen.add(l.peer);}
    const blend=(c.links||[]).filter(l=>l.mode==='blend');if(blend.length){if(blend.length!==1||c.links.length!==1)return false;const peer=clips.find(v=>v.id===blend[0].peer);if(peer.links.length!==1)return false;const span={...c,start:Math.min(c.start,peer.start),in:0,out:Math.max(clipEnd(c),clipEnd(peer))-Math.min(c.start,peer.start),rate:1};if(clips.some(v=>v!==c&&v!==peer&&overlaps(span,v)))return false;}
  }
  for(let i=0;i<clips.length;i++)for(let j=i+1;j<clips.length;j++)if(overlaps(clips[i],clips[j])&&!linkMode(clips[i],clips[j]))return false;
  return true;
}
export function closestSlot(clips,candidate){const length=clipDuration(candidate),starts=[0,...clips.filter(c=>c.lane===candidate.lane).flatMap(c=>[clipEnd(c),c.start-length])].filter(s=>s>=0&&s+length<=60+.001).sort((a,b)=>Math.abs(a-candidate.start)-Math.abs(b-candidate.start)||a-b);for(const start of starts){const c={...candidate,start,links:[]};if(!clips.some(v=>overlaps(c,v)))return start;}return null;}
const link=(a,b,mode)=>{a.links=[...(a.links||[]).filter(l=>l.peer!==b.id),{peer:b.id,mode}];b.links=[...(b.links||[]).filter(l=>l.peer!==a.id),{peer:a.id,mode}];};
export function placementPlan(clips,id,patch,{copy=false,strategy=null,newId='placement-copy'}={}){
  const original=clips.find(c=>c.id===id);if(!original)throw Error('Select a clip first.');if(copy&&clips.length>=48)throw Error('The 48-clip rack is full.');
  const candidate={...cloneClip(original),...patch,id:copy?newId:id,links:[]};if(!validClip(candidate))throw Error('Keep source trims valid and place the clip between −60 and 120 seconds.');
  const next=clips.filter(c=>copy||c.id!==id).map(cloneClip);if(!copy)for(const c of next)c.links=c.links.filter(l=>l.peer!==id);
  let conflicts=next.filter(c=>overlaps(c,candidate));
  // A pair occupies its complete union; a third clip cannot enter either member.
  const blockedPair=next.some(c=>{const peer=next.find(p=>p.id===c.links?.find(l=>l.mode==='blend')?.peer);return peer&&overlaps(candidate,{...c,start:Math.min(c.start,peer.start),in:0,out:Math.max(clipEnd(c),clipEnd(peer))-Math.min(c.start,peer.start),rate:1});});
  if(blockedPair&&!conflicts.length)conflicts=next.filter(c=>c.lane===candidate.lane&&c.links.some(l=>l.mode==='blend'));
  if(conflicts.length&&!strategy)return {conflict:true,candidate,conflicts,canBlend:conflicts.length===1&&!blockedPair&&!conflicts[0].links.some(l=>l.mode==='blend'),canSwap:!copy&&conflicts.length===1};
  if(conflicts.length){
    if(strategy==='replace'){
      const origins=new Map(next.map(c=>[c.id,c.id]));
      for(const c of conflicts){
        const index=next.indexOf(c),left=Math.max(0,candidate.start-c.start),right=Math.max(0,clipEnd(c)-clipEnd(candidate));
        next.splice(index,1);
        if(left>.001)next.push({...trimToWindow(c,c.start,c.start+left),links:[]});
        if(right>.001){const after={...trimToWindow(c,clipEnd(candidate),clipEnd(c)),id:`${c.id}-after-${candidate.id}`,links:[]};origins.set(after.id,c.id);next.push(after);}
      }
      for(const c of next)c.links=[];
      for(let i=0;i<next.length;i++)for(let j=i+1;j<next.length;j++){const a=clips.find(c=>c.id===origins.get(next[i].id)),b=clips.find(c=>c.id===origins.get(next[j].id)),mode=a&&b?linkMode(a,b):null;if(mode&&overlaps(next[i],next[j]))link(next[i],next[j],mode);}
    }
    else if(strategy==='clip'||strategy==='blend'){if(blockedPair)throw Error('A blend is limited to two clips. Move it apart before adding another.');if(strategy==='blend'&&conflicts.length!==1)throw Error('Choose exactly two clips to blend.');for(const c of conflicts){if(strategy==='blend'&&c.links.length)throw Error('Separate existing fitted clips before blending.');link(candidate,c,strategy);}}
    else if(strategy==='swap'){if(copy||conflicts.length!==1)throw Error('Swap needs one moved clip and one target.');const other=conflicts[0],start=other.start;other.start=original.start;other.lane=original.lane;candidate.start=start;candidate.lane=patch.lane??original.lane;}
    else if(strategy==='nearest'){const start=closestSlot(next,candidate);if(start===null)throw Error('No empty space on this voice is long enough.');candidate.start=start;}
    else if(['right','left','both'].includes(strategy)){
      const peers=next.filter(c=>c.lane===candidate.lane).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));let left=[],right=[];
      if(strategy==='right')right=peers.filter(c=>clipEnd(c)>candidate.start+.001);else if(strategy==='left')left=peers.filter(c=>c.start<clipEnd(candidate)-.001);else{const center=(candidate.start+clipEnd(candidate))/2;left=peers.filter(c=>(c.start+clipEnd(c))/2<center);right=peers.filter(c=>!left.includes(c));}
      let edge=candidate.start;for(const c of left.reverse()){if(clipEnd(c)>edge){c.start=edge-clipDuration(c);}edge=c.start;}
      edge=clipEnd(candidate);for(const c of right){if(c.start<edge)c.start=edge;edge=clipEnd(c);}
      if([...left,...right].some(c=>c.start<0||clipEnd(c)>60+.001))throw Error('That direction runs out of playable tape. Choose another resolution.');
    }else throw Error('Choose how to resolve the overlap.');
  }
  next.push(candidate);cleanLinks(next);if(!validateLayout(next))throw Error('That choice would collide with another clip or blend. Choose another resolution.');return {conflict:false,clips:next,candidate};
}
