const KEY='site.settings.archive.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(id);

/** Explicit setting owners only; portable across pages without copying arbitrary storage. */
export function createSettingsArchive({storage}={}){
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  const owners=new Map();let cached={},lastPersistence={ok:true,message:''};
  try{const parsed=JSON.parse(storage?.getItem(KEY)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))cached=parsed;}catch{}
  const persist=()=>{try{if(!storage)throw new Error('Local storage is unavailable');storage.setItem(KEY,JSON.stringify(cached));lastPersistence={ok:true,message:'Saved locally'};return true;}catch(error){lastPersistence={ok:false,message:`Local save failed: ${error?.message||error}. Export Skills JSON to keep these changes.`};return false;}};
  function capture(id){const owner=owners.get(id);if(owner)cached[id]={page:owner.page,value:clone(owner.read())};persist();return cached[id]?.value;}
  function register(id,{page,read,apply,validate=()=>true,restore=true}){
    if(!validId(id)||!validId(page)||typeof read!=='function'||typeof apply!=='function')throw new TypeError('Invalid setting owner');
    const owner={page,read,apply,validate};owners.set(id,owner);
    if(restore&&cached[id]?.page===page){const value=clone(cached[id].value);if(validate(value)!==false)try{Promise.resolve(apply(value)).then(()=>capture(id),()=>{});}catch{}}
    else capture(id);
    return()=>{capture(id);owners.delete(id);};
  }
  function exportSettings({kind='site',page,id,includeGeneral=false}={}){
    for(const key of owners.keys())capture(key);
    if(!['site','page','section'].includes(kind))throw new TypeError('Invalid settings scope');
    const values=Object.fromEntries(Object.entries(cached).filter(([key,item])=>kind==='site'||kind==='page'&&(item.page===page||includeGeneral&&item.page==='general')||kind==='section'&&key===id));
    return {kind:'site-settings-archive',schemaVersion:1,scope:{kind,...(page?{page}:{}),...(id?{id}:{}),...(includeGeneral?{includeGeneral:true}:{})},values:clone(values)};
  }
  async function importSettings(payload){const data=typeof payload==='string'?JSON.parse(payload):payload;
    if(data?.kind!=='site-settings-archive'||data.schemaVersion!==1||!data.values||Array.isArray(data.values))throw new TypeError('Unsupported settings archive');
    const entries=Object.entries(data.values);if(entries.length>100)throw new RangeError('Too many settings sections');
    for(const [id,item]of entries){if(!validId(id)||!validId(item?.page)||!Object.hasOwn(item,'value'))throw new TypeError('Invalid settings section');
      const scope=data.scope;if(!scope||!['site','page','section'].includes(scope.kind)||scope.kind==='page'&&item.page!==scope.page&&!(scope.includeGeneral&&item.page==='general')||scope.kind==='section'&&id!==scope.id)throw new TypeError('Settings outside declared scope');
      const owner=owners.get(id);if(owner&&(owner.page!==item.page||owner.validate(clone(item.value))===false))throw new TypeError(`Invalid settings for ${id}`);}
    const previous=new Map(entries.map(([id])=>[id,owners.has(id)?clone(owners.get(id).read()):null]));
    try{for(const [id,item]of entries)await owners.get(id)?.apply(clone(item.value));}
    catch(error){for(const [id,value]of previous)if(value!==null)try{await owners.get(id)?.apply(value);}catch{}throw error;}
    for(const [id,item]of entries)cached[id]=clone(item);persist();
    return{applied:entries.filter(([id])=>owners.has(id)).length,pending:entries.filter(([id])=>!owners.has(id)).length};
  }
  return{register,capture,exportSettings,importSettings,getPersistenceStatus:()=>({...lastPersistence}),has:id=>Object.hasOwn(cached,id),get:id=>cached[id]?clone(cached[id].value):null};
}
export function getSettingsArchive(){return globalThis.__siteSettingsArchiveV1??=createSettingsArchive();}
export function downloadSettings(data,name='settings.json'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
