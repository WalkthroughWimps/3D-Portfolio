// Pure, bounded configuration shared by the editor and the Three.js pods.
export const POD_ACTIONS=Object.freeze(['play','reverse','stop','record','wind:1','wind:5','wind:-1','wind:-5','bell','loop','output','upload','undo','redo','console','audition','split','join','reverse-clip']);
export const POD_ICONS=Object.freeze(['auto','play','reverse','stop','record','wind:1','wind:5','wind:-1','wind:-5','bell','loop','output','upload','undo','redo','console','audition','split','join','reverse-clip']);
export const POD_DEFAULTS=Object.freeze({transport:Object.freeze(['play','stop','record','reverse']),shuttle:Object.freeze(['wind:1','wind:5','wind:-1','wind:-5'])});
const COLOR=/^#[0-9a-f]{6}$/i;
const IMAGE=/^data:image\/(?:png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
export function validPodImage(value){
  if(typeof value!=='string'||value.length>44000)return false;
  const match=IMAGE.exec(value);if(!match)return false;
  let data;try{data=atob(match[1]);}catch{return false;}
  if(!data.length||data.length>32768)return false;
  const byte=i=>data.charCodeAt(i),four=i=>data.slice(i,i+4),le=i=>byte(i)|(byte(i+1)<<8)|(byte(i+2)<<16)|(byte(i+3)<<24),be=i=>((byte(i)*0x1000000)+(byte(i+1)<<16)+(byte(i+2)<<8)+byte(i+3))>>>0;
  let width=0,height=0;
  if(value.startsWith('data:image/png;')){
    if(data.length<33||data.slice(0,8)!=='\x89PNG\r\n\x1a\n'||be(8)!==13||four(12)!=='IHDR')return false;
    width=be(16);height=be(20);
  }else{
    if(data.length<30||four(0)!=='RIFF'||four(8)!=='WEBP'||le(4)!==data.length-8)return false;
    const format=four(12),size=le(16);if(size<5||20+size>data.length)return false;
    if(format==='VP8X'&&size>=10){width=1+byte(24)+(byte(25)<<8)+(byte(26)<<16);height=1+byte(27)+(byte(28)<<8)+(byte(29)<<16);}
    else if(format==='VP8L'&&byte(20)===0x2f){width=1+byte(21)+((byte(22)&0x3f)<<8);height=1+(byte(22)>>6)+(byte(23)<<2)+((byte(24)&0x0f)<<10);}
    else if(format==='VP8 '&&size>=10&&byte(23)===0x9d&&byte(24)===1&&byte(25)===0x2a){width=(byte(26)|(byte(27)<<8))&0x3fff;height=(byte(28)|(byte(29)<<8))&0x3fff;}
    else return false;
  }
  return width>0&&height>0&&width<=128&&height<=128;
}
export function defaultPodConfig(kind){return POD_DEFAULTS[kind].map(action=>({action,color:'',icon:'auto',image:''}));}
export function normalizePodConfig(kind,value){
  const fallback=defaultPodConfig(kind);let raw=value;
  if(typeof value==='string'){if(value.length>180000)return fallback;try{raw=JSON.parse(value);}catch{return fallback;}}
  if(!Array.isArray(raw)||raw.length!==4)return fallback;
  const used=new Set();return raw.map((entry,index)=>{
    const action=POD_ACTIONS.includes(entry?.action)&&!used.has(entry.action)?entry.action:fallback[index].action;
    used.add(action);
    return {action,color:COLOR.test(entry?.color)?entry.color.toLowerCase():'',icon:POD_ICONS.includes(entry?.icon)?entry.icon:'auto',image:validPodImage(entry?.image)?entry.image:''};
  }).map((entry,index,items)=>{
    if(items.findIndex(other=>other.action===entry.action)!==index){const free=POD_ACTIONS.find(action=>!items.some(other=>other.action===action));return {...entry,action:free};}
    return entry;
  });
}
export function encodePodConfig(kind,value){return JSON.stringify(normalizePodConfig(kind,value));}
export function assignPodAction(kind,value,index,action){const slots=normalizePodConfig(kind,value);if(index<0||index>3||!POD_ACTIONS.includes(action))return slots;const other=slots.findIndex((slot,i)=>i!==index&&slot.action===action);if(other>=0)slots[other].action=slots[index].action;slots[index].action=action;return slots;}
export function swapPodSlots(kind,value,a,b){const slots=normalizePodConfig(kind,value);if(a<0||a>3||b<0||b>3)return slots;[slots[a],slots[b]]=[slots[b],slots[a]];return slots;}
