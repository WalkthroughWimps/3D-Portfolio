import {getSettingsArchive} from '../panel-assembly/SettingsArchive.mjs';
import {getSharedSettings} from './settings.js';
import {SETTINGS_FIELDS} from './settings-schema.js';
import {mountSettingsContextMenu} from '../panel-assembly/SettingsContextMenu.mjs';

/** Each page owns its declared preferences; unloaded page sections restore on registration. */
export function mountSettingsPortability(parent,{page='start',contextRoot=parent}={}){
  const archive=getSettingsArchive(),store=getSharedSettings(),stops=[];
  const sharedAppearance=['start.contrast','start.brightness'];
  const ownerFor=path=>sharedAppearance.includes(path)?'general':path.startsWith('start.')?'start':path.startsWith('music.')?'music':path.startsWith('media.')||path.startsWith('videos.')?'videos':path.startsWith('about.')?'about':path.startsWith('graphics.')?'graphics':path.startsWith('games.')?'games':path.startsWith('docs.')?'docs':'general';
  const read=(path,object)=>path.split('.').reduce((value,key)=>value?.[key],object);
  for(const group of new Set(Object.keys(SETTINGS_FIELDS).map(ownerFor))){
    const keys=Object.keys(SETTINGS_FIELDS).filter(path=>ownerFor(path)===group),id=`preferences.${group}`;
    const validate=value=>value&&typeof value==='object'&&Object.entries(value).every(([key,v])=>(keys.includes(key)||group==='start'&&sharedAppearance.includes(key))&&(v===null&&SETTINGS_FIELDS[key].default===null||SETTINGS_FIELDS[key].parse(v)!==undefined));
    stops.push(archive.register(id,{page:group,restore:false,read:()=>Object.fromEntries(keys.map(key=>[key,read(key,store.get())])),validate,
      apply:value=>{if(!validate(value))throw new TypeError('Invalid preference values');const reset=Object.keys(value).filter(key=>value[key]===null);if(reset.length)store.reset(reset);const patch=Object.fromEntries(Object.entries(value).filter(([,v])=>v!==null));if(!store.patch(patch).ok)throw new TypeError('Cannot apply preferences');}}));
  }
  const status=document.createElement('p');status.className='settings-transfer-status';status.setAttribute('role','status');parent.append(status);
  function preferenceEntity(element,label,key){
    const pinned=[...contextRoot.querySelectorAll('[data-context-controls]')].find(node=>node.dataset.contextControls===key);
    const paths=[...new Set([element,pinned].filter(Boolean).flatMap(root=>[...root.querySelectorAll('[data-setting]')].map(control=>control.dataset.setting)))];
    const dom=[...element.querySelectorAll('input:not([data-setting]),select:not([data-setting]),textarea:not([data-setting])')].filter(control=>!['file','button','submit','reset','hidden'].includes(control.type)).map((control,index)=>[control.id||control.name||`control-${index}`,control]);
    const domValue=control=>control.type==='checkbox'||control.type==='radio'?control.checked:control.value;
    return{label,filename:`${page}-${key.replace(/[^a-z0-9]+/gi,'-')}.json`,
      read:()=>({kind:'preferences-section',schemaVersion:1,page,key,values:Object.fromEntries(paths.map(path=>[path,read(path,store.get())])),controls:Object.fromEntries(dom.map(([key,control])=>[key,domValue(control)]))}),
      apply:async data=>{if(data?.kind!=='preferences-section'||data.page!==page||data.key!==key||!data.values||typeof data.values!=='object'||Array.isArray(data.values)||Object.keys(data.values).some(path=>!paths.includes(path))||!data.controls||typeof data.controls!=='object'||Array.isArray(data.controls)||Object.keys(data.controls).some(id=>!dom.some(([key])=>key===id)))throw new TypeError('Choose an export of this section');const reset=Object.keys(data.values).filter(path=>data.values[path]===null);const patch=Object.fromEntries(Object.entries(data.values).filter(([,value])=>value!==null));if(Object.keys(patch).some(path=>!SETTINGS_FIELDS[path]||SETTINGS_FIELDS[path].parse(patch[path])===undefined))throw new TypeError('Invalid setting value');if(reset.length)store.reset(reset);if(!store.patch(patch).ok)throw new TypeError('Invalid settings');for(const [key,value]of Object.entries(data.controls||{})){const control=dom.find(([id])=>id===key)?.[1];if(control.type==='checkbox'||control.type==='radio')control.checked=Boolean(value);else if(typeof value==='string'||typeof value==='number'){if(control.tagName==='SELECT'&&![...control.options].some(option=>option.value===String(value)))continue;control.value=String(value);}control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));}}
    };
  }
  function archiveEntity(label,scope,filename){
    return{label,filename,read:()=>archive.exportSettings(scope),apply:data=>{
      if(data?.kind!=='site-settings-archive'||data.scope?.kind!==scope.kind||scope.page&&data.scope.page!==scope.page||scope.id&&data.scope.id!==scope.id||scope.kind==='page'&&data.scope.includeGeneral)throw new TypeError('Choose an export of this tab');
      return archive.importSettings(data);
    }};
  }
  // Refs owns structured plates, artwork and door arrays that cannot be read from DOM values.
  function refsSectionEntity(section,label,key){
    const owner='about.refs.sketch';
    const optionKeys=[...new Set([...section.querySelectorAll('[data-option]')].map(node=>node.dataset.option))];
    if(section.querySelector('[data-plate-select]'))optionKeys.push('plateCount','plateIndex','plates');
    if(section.querySelector('[data-door-select]'))optionKeys.push('doors');
    const keys=[...new Set(optionKeys)];
    return{label,filename:`about-refs-${key.replace(/[^a-z0-9]+/gi,'-')}.json`,
      read:()=>{const all=archive.capture(owner)||{};return{kind:'owner-section',schemaVersion:1,page:'about',key,owner,values:Object.fromEntries(keys.filter(k=>Object.hasOwn(all,k)).map(k=>[k,all[k]]))};},
      apply:data=>{if(data?.kind!=='owner-section'||data.schemaVersion!==1||data.page!=='about'||data.key!==key||data.owner!==owner||!data.values||typeof data.values!=='object'||Array.isArray(data.values)||Object.keys(data.values).some(k=>!keys.includes(k)))throw new TypeError('Choose an export of this section');
        const merged={...(archive.capture(owner)||{}),...data.values};
        return archive.importSettings({kind:'site-settings-archive',schemaVersion:1,scope:{kind:'section',id:owner},values:{[owner]:{page:'about',value:merged}}});}
    };
  }
  const context=mountSettingsContextMenu(contextRoot,target=>{
    // Nested Skills menus own their scopes; embedded shared preferences use this exporter.
    if(target.closest('[data-panel],.panel-controls-tabs')&&!target.closest('[data-shared-settings]'))return null;
    const section=target.closest('.settings-fold,details'),header=section?.querySelector(':scope > h2,:scope > h3,:scope > h4,:scope > summary');
    if(section){const key=section.dataset.sectionKey||header?.textContent||section.id;
      if(page==='about'&&section.closest('[data-context="refs"],#review-settings-context-refs,#review-constructor-context-refs')&&section.querySelector('[data-option],[data-plate-select],[data-door-select]'))return refsSectionEntity(section,header.textContent,key);
      return preferenceEntity(section,header?.textContent||key,key);
    }
    const tab=target.closest('.review-settings-tab');
    if(tab){const element=contextRoot.querySelector(`[id="${tab.getAttribute('aria-controls')}"]`);if(!element)return null;
      const id=tab.dataset.context;
      if(id==='general')return archiveEntity('General settings',{kind:'site'},'site-settings.json');
      if(page==='about'&&['about','refs','skills','notes','clock','odd'].includes(id))return archiveEntity(tab.textContent,{kind:'face',page:'about',id},`about-${id}-settings.json`);
      return archiveEntity(tab.textContent,{kind:'page',page},`${page}-settings.json`);
    }
    if(target.closest('.review-panel--right > .review-panel-toggle'))return archiveEntity(`${page} page settings`,{kind:'page',page},`${page}-settings.json`);
    return null;
  });
  contextRoot.addEventListener('settings-transfer-status',onStatus);
  function onStatus(event){status.textContent=event.detail;}
  const unsubscribe=store.subscribe((_snapshot,change)=>{
    const owners=new Set((change.changed||[]).map(path=>`preferences.${ownerFor(path)}`));
    if(owners.size)archive.captureMany(owners);
  });
  return()=>{unsubscribe();for(const stop of stops)stop();context.dispose();contextRoot.removeEventListener('settings-transfer-status',onStatus);status.remove();};
}
