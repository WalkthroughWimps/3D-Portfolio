const KEY='site.settings.archive.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(id);
const faceOwners={
  about:['about.glass','about.fish.constructor','about.fish.audio','about.fish.rings'],
  refs:['about.refs.sketch'],skills:['about.skills'],notes:[],clock:[],odd:[]
};
const facePath=(face,path)=>path.startsWith(`about.${face}.`);
const inFace=(face,id,item)=>item.page==='about'&&(id==='preferences.about'&&item.value&&typeof item.value==='object'&&!Array.isArray(item.value)&&Object.keys(item.value).every(path=>facePath(face,path))||faceOwners[face]?.includes(id));

/** Explicit setting owners only; portable across pages without copying arbitrary storage. */
export function createSettingsArchive({storage}={}){
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  const owners=new Map();let cached={},lastPersistence={ok:true,message:''};
  try{const parsed=JSON.parse(storage?.getItem(KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))cached=parsed;}catch{}
  const persist=()=>{try{if(!storage)throw new Error('Local storage is unavailable');storage.setItem(KEY,JSON.stringify(cached));lastPersistence={ok:true,message:'Saved locally'};return true;}catch(error){lastPersistence={ok:false,message:`Local save failed: ${error?.message||error}. Export Skills JSON to keep these changes.`};return false;}};
  function capture(id){const owner=owners.get(id);if(owner)cached[id]={page:owner.page,value:clone(owner.read())};persist();return cached[id]?.value;}
  function captureMany(ids){
    let captured=false;
    for(const id of new Set(ids)){
      const owner=owners.get(id);
      if(!owner)continue;
      cached[id]={page:owner.page,value:clone(owner.read())};
      captured=true;
    }
    if(captured)persist();
    return captured;
  }
  function register(id,{page,read,apply,validate=()=>true,restore=true}){
    if(!validId(id)||!validId(page)||typeof read!=='function'||typeof apply!=='function')throw new TypeError('Invalid setting owner');
    const owner={page,read,apply,validate};owners.set(id,owner);
    if(restore&&cached[id]?.page===page){const value=clone(cached[id].value);if(validate(value)!==false)try{Promise.resolve(apply(value)).then(()=>capture(id),()=>{});}catch{}}
    else capture(id);
    return()=>{capture(id);owners.delete(id);};
  }
  function exportSettings({kind='site',page,id,includeGeneral=false}={}){
    captureMany(owners.keys());
    if(!['site','page','section','face'].includes(kind)||kind==='face'&&(!Object.hasOwn(faceOwners,id)||page!=='about'))throw new TypeError('Invalid settings scope');
    const values=Object.fromEntries(Object.entries(cached).flatMap(([key,item])=>{
      if(kind==='face'){
        if(key==='preferences.about'){
          const value=Object.fromEntries(Object.entries(item.value||{}).filter(([path])=>facePath(id,path)));
          return Object.keys(value).length?[[key,{page:'about',value}]]:[];
        }
        return inFace(id,key,item)?[[key,item]]:[];
      }
      return kind==='site'||kind==='page'&&(item.page===page||includeGeneral&&item.page==='general')||kind==='section'&&key===id?[[key,item]]:[];
    }));
    return {kind:'site-settings-archive',schemaVersion:1,scope:{kind,...(page?{page}:{}),...(id?{id}:{}),...(includeGeneral?{includeGeneral:true}:{})},values:clone(values)};
  }
  async function importSettings(payload){const data=typeof payload==='string'?JSON.parse(payload):payload;
    if(data?.kind!=='site-settings-archive'||data.schemaVersion!==1||!data.values||Array.isArray(data.values))throw new TypeError('Unsupported settings archive');
    const entries=Object.entries(data.values);if(entries.length>100)throw new RangeError('Too many settings sections');
    const scope=data.scope;
    if(!scope||!['site','page','section','face'].includes(scope.kind)||scope.kind==='face'&&(scope.page!=='about'||!Object.hasOwn(faceOwners,scope.id)))throw new TypeError('Invalid settings scope');
    for(const [id,item]of entries){if(!validId(id)||!validId(item?.page)||!Object.hasOwn(item,'value'))throw new TypeError('Invalid settings section');
      if(scope.kind==='page'&&item.page!==scope.page&&!(scope.includeGeneral&&item.page==='general')||scope.kind==='section'&&id!==scope.id||scope.kind==='face'&&!inFace(scope.id,id,item))throw new TypeError('Settings outside declared scope');
      const owner=owners.get(id);if(owner&&(owner.page!==item.page||owner.validate(clone(item.value))===false))throw new TypeError(`Invalid settings for ${id}`);}
    const previous=new Map(entries.map(([id])=>[id,owners.has(id)?clone(owners.get(id).read()):null]));
    try{for(const [id,item]of entries)await owners.get(id)?.apply(clone(item.value));}
    catch(error){for(const [id,value]of previous)if(value!==null)try{await owners.get(id)?.apply(value);}catch{}throw error;}
    for(const [id,item]of entries){
      if(owners.has(id))cached[id]={page:item.page,value:clone(owners.get(id).read())};
      else if(scope.kind==='face'&&id==='preferences.about'&&cached[id]?.page==='about')cached[id]={page:'about',value:{...cached[id].value,...clone(item.value)}};
      else cached[id]=clone(item);
    }persist();
    return{applied:entries.filter(([id])=>owners.has(id)).length,pending:entries.filter(([id])=>!owners.has(id)).length};
  }
  return{register,capture,captureMany,exportSettings,importSettings,getPersistenceStatus:()=>({...lastPersistence}),has:id=>Object.hasOwn(cached,id),get:id=>cached[id]?clone(cached[id].value):null};
}
export function getSettingsArchive(){return globalThis.__siteSettingsArchiveV1??=createSettingsArchive();}
export function downloadSettings(data,name='settings.json'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
