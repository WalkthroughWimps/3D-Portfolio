import {getSettingsArchive} from './SettingsArchive.mjs';
import {defaultRippleOptions} from './PanelRipple.mjs';
import {attachPrecisionSlider} from './precision-slider.mjs';
import {skillsBaseline} from './SkillsBaseline.mjs';
import {mountSettingsContextMenu} from './SettingsContextMenu.mjs';

export const screenshotBaseline=Object.fromEntries(['minThickness','maxThickness','widthVariation','minLaunchAngle','maxLaunchAngle','launchSpeed','aimSpeed','motionSpeed','intensity','glow','launchRandomness','spacingVariation','phaseVariation','motionVariation','aimWander','seed','centerRole','rimFade','arcsEnabled','particlesEnabled'].map(key=>[key,skillsBaseline.field[key]]));
const fields={
  Filaments:['strandCount','animatePaths','minThickness','maxThickness','widthVariation','minLaunchAngle','maxLaunchAngle','launchSpeed','aimSpeed','motionSpeed','intensity','glow','launchRandomness','aimWander','phaseVariation','motionVariation','seed','envelopeRatio','maxSegments','excursionsEnabled','excursionAmplitude','centerRole','rimFade'],
  Color:['palettePreset','colorMode','colorA','colorB','colorC','paletteCounts','directionColorsEnabled','directionColors'],
  Bursts:['arcsEnabled','arcFrequency','arcIntensity','arcSize','arcLifetime','arcSpread'],
  Particles:['particlesEnabled','particleFrequency','particleBrightness','particleSize','particleLifetime','particleSpeed','particleMaxTravel'],
  Cards:['showSidePanels','sideCardColor','cornerCardColor','neutralCardThickness','clickedCardThickness','clickedCardOffset'],
  Structure:['showAxles','capProfile','axleDiameter','squareJut','diagonalJut','stubLengthFactor','matchDiagonal']
};
const select=(data,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]]));
fields.Frame=fields.Structure;

const presets={
  Skills:{
    'Captured look':{field:screenshotBaseline,ripple:{...defaultRippleOptions},review:{strength:.025,displayGain:60}},
    'Subtle showcase':{field:{...screenshotBaseline,minThickness:.0007,maxThickness:.0015,glow:.35,arcFrequency:.6,particleFrequency:1},ripple:{flipCoupling:.8,damping:.3,maxDisplacement:.0008},review:{strength:.015,displayGain:60}},
    Technical:{field:{...screenshotBaseline,minThickness:.0004,maxThickness:.0009,glow:.15,launchSpeed:.05,aimSpeed:.025,arcsEnabled:false,particlesEnabled:false},ripple:{flipCoupling:.6,damping:.4,maxDisplacement:.0006},review:{strength:.01,displayGain:60}},
    Expressive:{field:{...screenshotBaseline,glow:.65,launchSpeed:.2,aimSpeed:.12,arcFrequency:2,particleFrequency:4},ripple:{frequency:1.25,coupling:1.1,impulseVelocity:.03,flipCoupling:10,damping:.12,maxDisplacement:.006},review:{strength:.04,displayGain:60}}
  },
  Filaments:{'Captured look':{field:screenshotBaseline},'Quiet twin':{field:{...screenshotBaseline,minThickness:.0006,maxThickness:.0012,launchSpeed:.05,aimSpeed:.02,glow:.25}},'Fine electric':{field:{...screenshotBaseline,minThickness:.00035,maxThickness:.00085,launchSpeed:.1,aimSpeed:.05,glow:.4}},'Restless electric':{field:{...screenshotBaseline,launchSpeed:.25,aimSpeed:.2,aimWander:.8}}},
  Lattice:{Gentle:{ripple:{frequency:2,coupling:.8,damping:.3,flipCoupling:.8,maxDisplacement:.0008},review:{strength:.015,displayGain:60}},Elastic:{ripple:{frequency:1.0,coupling:1.1,damping:.12,impulseVelocity:.03,flipCoupling:10,maxDisplacement:.025},review:{strength:.025,displayGain:60}},Diagnostic:{review:{strength:.025,displayGain:180}}},
  Bursts:{Quiet:{field:{arcsEnabled:true,arcFrequency:.5,arcIntensity:.4,arcSize:.005,arcLifetime:.15,arcSpread:.003}},Electric:{field:{arcsEnabled:true,arcFrequency:2,arcIntensity:.7,arcSize:.012,arcLifetime:.12,arcSpread:.006}},Off:{field:{arcsEnabled:false}}},
  Particles:{Sparse:{field:{particlesEnabled:true,particleFrequency:1,particleBrightness:.5,particleSize:2,particleLifetime:.35,particleSpeed:.01,particleMaxTravel:.004}},Dust:{field:{particlesEnabled:true,particleFrequency:4,particleBrightness:.35,particleSize:1.5,particleLifetime:.6,particleSpeed:.008,particleMaxTravel:.006}},Off:{field:{particlesEnabled:false}}}
};

presets.Cards={
  'Slim cards':{rig:{neutralCardThickness:.015,clickedCardThickness:.03,clickedCardOffset:0}},
  'Captured depth':{rig:{neutralCardThickness:.02,clickedCardThickness:.052,clickedCardOffset:0}},
  'Raised buttons':{rig:{neutralCardThickness:.02,clickedCardThickness:.065,clickedCardOffset:.008}}
};
presets.Frame={
  'Visible juts':{rig:{showAxles:true,capProfile:'pointed',squareJut:.006,diagonalJut:.006,matchDiagonal:true}},
  'Clean lattice':{rig:{showAxles:false}},
  'Flat tips':{rig:{showAxles:true,capProfile:'flat',squareJut:.004,diagonalJut:.004,matchDiagonal:true}}
};

presets.Beanbags={};
presets.Interaction={'Hover half-turns':{motion:{pointerEntry:true}},'Click controls':{motion:{pointerEntry:false}}};
presets.Color={'Red and blue':{field:{palettePreset:'red-blue',paletteCounts:{red:3,blue:2,green:0},directionColorsEnabled:false}},'Single blue':{field:{palettePreset:'blue',colorMode:'single',colorA:'#65baff'}}};
presets.Lattice.Balanced={ripple:{...defaultRippleOptions},review:{influenceCards:true,strength:.025,displayGain:60}};
const currentTab=name=>({Motion:'Interaction',Structure:'Frame'}[name]||name);
const cleanUI=value=>value&&typeof value==='object'?value:{};
export function mountSkillsSettings({app,nav,holder,read,apply,refresh,getTab,setGain}){
  const archive=getSettingsArchive();let loading=false,timer=0;
  let ui={selected:{},customPresets:{}};
  const toolbar=document.createElement('div');toolbar.className='settings-preset-dock';
  const status=document.createElement('p');status.className='settings-transfer-status';status.setAttribute('role','status');
  nav.after(toolbar);toolbar.after(status);
  const say=text=>{status.textContent=text;};
  function persist(){if(!loading){archive.capture('about.skills');const result=archive.getPersistenceStatus();if(!result.ok)say(result.message);return result;}return{ok:true};}
  function restoreUI(value){
    const data=cleanUI(value),next={selected:{...cleanUI(data.selected)},customPresets:{}};
    if(next.selected.Interaction==='Hover quarter-turns')next.selected.Interaction='Hover half-turns';
    for(const [tab,items]of Object.entries(cleanUI(data.customPresets))){if(!Object.hasOwn(presets,tab))continue;next.customPresets[tab]=Object.create(null);for(const [name,value]of Object.entries(cleanUI(items))){if(!name.trim()||name.length>25||!value||typeof value!=='object')throw new TypeError('Invalid preset: names must contain 1–25 characters');next.customPresets[tab][name]=value;}}ui=next;
  }
  async function applyBundle(data){loading=true;try{await apply(data);if(data.settingsUI)restoreUI(data.settingsUI);refresh();renderPickers();if(app.rig.lastOptionAdjustment)say(app.rig.lastOptionAdjustment);}finally{loading=false;}}
  const previous=archive.get('about.skills'),hadSaved=archive.has('about.skills');restoreUI(previous?.settingsUI);
  if(!hadSaved){app.field.setEditTarget('all').setOptions(structuredClone(skillsBaseline.field));app.rig.setOptions(skillsBaseline.rig);app.rebuildPathsFromRig();for(const id of skillsBaseline.clicked){app.motion.setClicked(id,true,{immediate:true});app.motion.setDisplayFlipped(id,true);}app.pendingPulses.clear();app.ripple.clear();app.ripple.setOptions(defaultRippleOptions);app.setRippleReview({influenceCards:true,clickToPulse:false,strength:.025});setGain(60);app.input?.setPointerEntry(true);ui.selected={Skills:'Captured look',Cards:'Captured depth',Interaction:'Hover half-turns',Filaments:'Captured look',Lattice:'Balanced',Frame:'Visible juts',Bursts:'Off',Particles:'Off',Color:'Red and blue'};}
  const unregister=archive.register('about.skills',{page:'about',read,apply:applyBundle,validate:data=>Boolean(data&&[3,4,5,6].includes(data.schemaVersion)&&data.field)});
  if(!previous||!Number.isFinite(previous.behaviorRevision)||previous.behaviorRevision<2){app.ripple.setOptions({...defaultRippleOptions,enabled:true});app.setRippleReview({influenceCards:true});app.motion.setRippleTiltOptions({tiltEnabled:true,tiltResponse:.85});}
  else if(previous.behaviorRevision===2&&Math.abs(previous.ripple?.maxDisplacement-.002)<1e-10)app.ripple.setOptions({maxDisplacement:defaultRippleOptions.maxDisplacement});
  if(previous&&previous.behaviorRevision<4){if(previous.rig?.options?.cornerCardColor==='#265787')app.rig.setOptions({cornerCardColor:'#968316'});app.ripple.clear().setOptions({...defaultRippleOptions,enabled:previous.ripple?.enabled!==false});app.motion.setRippleTiltOptions({tiltEnabled:previous.motion?.tiltEnabled!==false,tiltResponse:1});}
  function section(tab){const saved=read();let payload;
    if(fields[tab]){const group=['Cards','Structure','Frame'].includes(tab)?'rig':'field',value=select(group==='rig'?saved.rig.options:saved.field.options,fields[tab]);
      if(tab==='Filaments')value.strandOverrides=saved.field.options.strandOverrides?.map(({color,...rest})=>rest);
      if(tab==='Color')value.strandColors=saved.field.options.strandOverrides?.map(o=>o?.color??null);
      if(tab==='Cards')value.cards=saved.cards;
      payload={kind:'skills-section',schemaVersion:2,section:tab,group,value};
    }else if(tab==='Beanbags')payload={kind:'skills-section',schemaVersion:2,section:tab,group:'beanbags',value:saved.beanbags||{}};
    else payload={kind:'skills-section',schemaVersion:2,section:tab,group:['Motion','Interaction'].includes(tab)?'motion':'lattice',value:['Motion','Interaction'].includes(tab)?{...saved.motion,deployment:saved.rig.deployment}:{ripple:saved.ripple,review:saved.preview.rippleReview,tiltEnabled:saved.motion.tiltEnabled,tiltResponse:saved.motion.tiltResponse}};
    return{...payload,presets:ui.customPresets[tab]||{},selectedPreset:ui.selected[tab]||''};
  }
  async function importSection(data){if(data?.kind!=='skills-section'||![1,2].includes(data.schemaVersion)||!Object.hasOwn(presets,currentTab(data.section))&&!Object.hasOwn(fields,data.section))throw new TypeError('Unsupported Skills section');
    const tab=currentTab(data.section),value=data.value;if(!value||typeof value!=='object')throw new TypeError('Invalid section values');
    if(fields[tab]){const allowed=select(value,fields[tab]);if(['Cards','Frame'].includes(tab)){app.rig.setOptions(allowed);app.rebuildPathsFromRig();}
      else{const target=app.field.options.editTarget;app.field.setEditTarget('all').setOptions(allowed);
        if(tab==='Filaments'&&Array.isArray(value.strandOverrides)){const old=app.field.options.strandOverrides;app.field.setOptions({strandOverrides:value.strandOverrides.map((o,i)=>({...o,...(old[i]?.color?{color:old[i].color}:{})}))});}
        if(tab==='Color'&&Array.isArray(value.strandColors)){const old=app.field.options.strandOverrides;app.field.setOptions({strandOverrides:Array.from({length:app.field.options.strandCount},(_,i)=>{const o={...old[i]};delete o.color;if(value.strandColors[i])o.color=value.strandColors[i];return o;})});}
        app.field.setEditTarget(target==='all'||target<app.field.options.strandCount?target:'all');}}
    else if(tab==='Beanbags'){const saved=read();saved.beanbags={...saved.beanbags,...value};await applyBundle(saved);}
    else if(tab==='Interaction'){const saved=read();saved.motion={...saved.motion,...value};if(Number.isFinite(value.deployment))saved.rig.deployment=value.deployment;await applyBundle(saved);}
    else{app.ripple.clear().setOptions(value.ripple||{});app.setRippleReview({...value.review,active:getTab()==='Lattice'});if(Number.isFinite(value.review?.displayGain))setGain(value.review.displayGain);app.motion.setRippleTiltOptions(value);}
    if(tab==='Cards'&&value.cards)await app.nameFrames.setState(value.cards);
    if(data.presets){restoreUI({...ui,customPresets:{...ui.customPresets,[tab]:data.presets}});}ui.selected[tab]=data.selectedPreset||'';
    refresh();renderPickers();persist();
  }
  async function applyPreset(tab,name){const custom=ui.customPresets[tab]?.[name];
    if(custom){if(tab==='Skills')await applyBundle({...custom,settingsUI:ui});else await importSection({...custom,presets:ui.customPresets[tab],selectedPreset:name});}
    else{const preset=presets[tab]?.[name];if(!preset)return;
      if(preset.field){const target=app.field.options.editTarget;app.field.setEditTarget('all').setOptions(tab==='Skills'?preset.field:select(preset.field,fields[tab]||Object.keys(preset.field)));app.field.setEditTarget(target);}
      if(preset.rig){app.rig.setOptions(preset.rig);app.rebuildPathsFromRig();}if(preset.ripple)app.ripple.clear().setOptions(preset.ripple);
      if(preset.review){app.setRippleReview(preset.review);if(preset.review.displayGain)setGain(preset.review.displayGain);}
      if(preset.motion?.pointerEntry!==undefined)app.input?.setPointerEntry(preset.motion.pointerEntry);
    }
    ui.selected[tab]=name;refresh();renderPickers();persist();say(`Applied ${name}.`);
  }
  const pickers=new Map();
  function addPicker(tab){const label=document.createElement('label');label.className='settings-preset';label.dataset.presetTab=tab;const text=document.createElement('span');text.textContent=tab==='Skills'?'Skills preset':`${tab} preset`;const slot=document.createElement('span');slot.className='settings-preset-slot';label.append(text,slot);toolbar.append(label);pickers.set(tab,{label,slot});}
  addPicker('Skills');for(const panel of holder.querySelectorAll('[data-panel]'))addPicker(panel.dataset.panel);
  function renderPickers(){for(const [tab,{label,slot}]of pickers){label.hidden=tab!=='Skills'&&tab!==getTab();const picker=document.createElement('select');picker.dataset.preset=tab;picker.setAttribute('aria-label',`${tab} preset`);picker.add(new Option('Custom',''));for(const name of [...new Set([...Object.keys(presets[tab]||{}),...Object.keys(ui.customPresets[tab]||{})])])picker.add(new Option(name,name));picker.add(new Option('Add preset','__add__'));picker.value=ui.selected[tab]||'';slot.replaceChildren(picker);
      picker.onchange=()=>{if(picker.value!=='__add__'){applyPreset(tab,picker.value).catch(e=>say(e.message));return;}const input=document.createElement('input');input.type='text';input.maxLength=25;input.setAttribute('aria-label','New preset name');input.placeholder='Preset name';slot.replaceChildren(input);input.focus();let done=false;const finish=save=>{if(done)return;done=true;const name=input.value.trim();if(save&&name){if(Object.hasOwn(presets[tab]||{},name)){say('Choose a different preset name.');renderPickers();return;}const snapshot=tab==='Skills'?structuredClone(read()):section(tab);delete snapshot.settingsUI;delete snapshot.presets;delete snapshot.selectedPreset;(ui.customPresets[tab]??={})[name]=snapshot;ui.selected[tab]=name;persist();say(`Saved ${name}.`);}renderPickers();};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}};input.onblur=()=>finish(Boolean(input.value.trim()));};}}
  function subsection(element){const tab=element.closest('[data-panel]')?.dataset.panel||getTab(),saved=read(),groups={};
    const sources={field:saved.field.options,rig:saved.rig.options,ripple:saved.ripple,motion:saved.motion,motionTilt:saved.motion,rippleReview:saved.preview.rippleReview,pose:{deployment:saved.rig.deployment},beanbag:saved.beanbags||{}};
    for(const control of element.querySelectorAll('[data-group][data-key]')){const {group,key}=control.dataset;if(Object.hasOwn(sources[group]||{},key))(groups[group]??={})[key]=sources[group][key];}
    if(element.querySelector('[data-count]'))(groups.field??={}).paletteCounts=saved.field.options.paletteCounts;
    if(element.querySelector('#directionColorControls'))(groups.field??={}).directionColors=saved.field.options.directionColors;
    if(element.querySelector('#strandColor'))(groups.field??={}).strandOverrides=saved.field.options.strandOverrides;
    const artwork=element.querySelector('[data-content]'),arrangement=element.querySelector('[data-slot]'),side=element.closest('[data-art-side]')?.dataset.artSide;
    const sideContent=side?Object.fromEntries(Object.entries(saved.cards.content).map(([id,value])=>[id,select(value,[`${side}Mode`,`${side}Data`,`${side}Scale`])])):null;
    const strandKeys=['minThickness','maxThickness','widthVariation','motionSpeed','intensity','glow','launchRandomness','phaseVariation','motionVariation','minLaunchAngle','maxLaunchAngle','launchSpeed','aimSpeed','aimWander'].filter(key=>Object.hasOwn(groups.field||{},key));
    return{kind:'skills-subsection',schemaVersion:1,tab,key:element.dataset.sectionKey||element.id||element.querySelector('summary')?.textContent,groups,...(strandKeys.length?{strandState:{keys:strandKeys,overrides:saved.field.options.strandOverrides?.map(value=>select(value||{},strandKeys))||[]}}:{}),...(sideContent?{cards:{content:sideContent}}:artwork?{cards:{content:saved.cards.content}}:arrangement?{cards:{order:saved.cards.order,slots:saved.cards.slots}}:{} )};
  }
  async function importSubsection(data,element){const expected=subsection(element);if(data.kind!=='skills-subsection'||data.tab!==expected.tab||data.key!==expected.key)throw new TypeError('Choose an export of this section');const saved=read();
    for(const [group,allowed]of Object.entries(expected.groups)){const incoming=select(data.groups?.[group]||{},Object.keys(allowed));if(group==='field')Object.assign(saved.field.options,incoming);else if(group==='rig')Object.assign(saved.rig.options,incoming);else if(group==='ripple')Object.assign(saved.ripple,incoming);else if(group==='rippleReview')Object.assign(saved.preview.rippleReview,incoming);else if(group==='beanbag')saved.beanbags={...saved.beanbags,...incoming};else if(group==='pose'&&Number.isFinite(incoming.deployment))saved.rig.deployment=incoming.deployment;else Object.assign(saved.motion,incoming);}
    if(expected.strandState&&data.strandState){const keys=expected.strandState.keys,overrides=data.strandState.overrides;if(!Array.isArray(overrides))throw new TypeError('Invalid filament overrides');saved.field.options.strandOverrides=saved.field.options.strandOverrides.map((old,index)=>{const next={...old};for(const key of keys)delete next[key];return{...next,...select(overrides[index]||{},keys)};});}
    if(expected.cards&&data.cards){const patch=select(data.cards,Object.keys(expected.cards));if(patch.content){const content={...saved.cards.content};for(const [id,allowed]of Object.entries(expected.cards.content||{}))if(patch.content[id])content[id]={...content[id],...select(patch.content[id],Object.keys(allowed))};patch.content=content;}saved.cards={...saved.cards,...patch};}await applyBundle(saved);persist();
  }
  const root=nav.parentElement;
  const context=mountSettingsContextMenu(root,target=>{const element=target.closest('.settings-fold,details'),heading=element?.querySelector(':scope > h2,:scope > h3,:scope > h4,:scope > summary');if(element&&heading&&holder.contains(element))return{label:heading.textContent,filename:'skills-section.json',read:()=>subsection(element),apply:data=>importSubsection(data,element)};
    const button=target.closest('[data-tab]');if(button&&nav.contains(button)){const tab=button.dataset.tab;return{label:tab,filename:`skills-${tab.toLowerCase()}.json`,read:()=>section(tab),apply:async data=>{if(currentTab(data.section)!==tab)throw new TypeError('Choose an export of this tab');await importSection(data);}};}return null;});
  root.addEventListener('settings-transfer-status',event=>say(event.detail));
  const flush=()=>{clearTimeout(timer);persist();};globalThis.addEventListener('pagehide',flush);
  const onEdit=event=>{if(event.target.closest('.settings-preset-dock'))return;const tab=event.target.closest('[data-panel]')?.dataset.panel;if(tab&&event.type!=='click'){ui.selected[tab]='';ui.selected.Skills='';renderPickers();}clearTimeout(timer);timer=setTimeout(persist,150);};holder.addEventListener('input',onEdit);holder.addEventListener('change',onEdit);
  const unsubscribe=app.motion.subscribe(()=>{clearTimeout(timer);timer=setTimeout(persist,250);});
  const detach=[...holder.querySelectorAll('input[type="range"]')].map(input=>attachPrecisionSlider(input));
  renderPickers();refresh();queueMicrotask(persist);
  return{archive,section,importSection,applyPreset,persist,readBundle:read,applyBundle,getState:()=>structuredClone(ui),restoreUI,tabChanged:renderPickers,dispose(){context.dispose();globalThis.removeEventListener('pagehide',flush);clearTimeout(timer);persist();unregister();unsubscribe();for(const stop of detach)stop();holder.removeEventListener('input',onEdit);holder.removeEventListener('change',onEdit);toolbar.remove();status.remove();}};
}
