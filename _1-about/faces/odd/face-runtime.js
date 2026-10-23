import {applyContrastVariables} from './contrast-style.mjs?v=contrast-glows-1';
import {dragPreviewClips} from './clip-appearance.mjs?v=contrast-glows-1';
import {applyThemeVariables,themeColors} from './theme.mjs?v=contrast-glows-1';
import {TAPE_BED,snapTapePosition} from './tape-bed.mjs?v=bed-1';
import * as THREE from 'three';
import {createModelFace} from '../model-face.js';
import {createSoundDeck} from './deck.mjs?v=transport-ticks-1';
import {createClothTransport} from './cloth-rig.js?v=transport-ticks-1';
import {createFaceInput} from './face-input.js?v=constructor-1';
import {createOddioSettings} from './oddio-settings.js?v=transport-ticks-1';
import {createPanelEditor} from './panel-editor.js?v=constructor-1';
import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';

export const ODD_MOUNT=Object.freeze({center:[0,.982,0],normal:[0,1,0],right:[1,0,0],up:[0,0,-1],radius:.87});
export function createOddFace({stage,focusFace=()=>{},onInputOwnership=()=>{}}={}) {
  const binding=createModelFace({id:'odd',backingName:'back.odd'}),events=new AbortController();
  let host=null,group=null,carrier=null,rig=null,deck=null,dialog=null,launcher=null,accessible=null,stylesheet=null,controls=null,editor=null;
  let suspended=false,disposed=false,enabled=true,upright=true,reduced=false,roll=0,globalMuted=false,returnFocus=null;
  let settingsUI=null,preferences={};
  let feedback=null,feedbackTimer=null;
  const inverse=new THREE.Matrix4(),right=new THREE.Vector3();
  const faceView=new THREE.Vector3();
  function syncLaunchers(){
    if(!launcher||!accessible)return;
    if(!host||suspended||!enabled){launcher.hidden=accessible.hidden=true;return;}
    const local=host.cube.worldToLocal(host.camera.getWorldPosition(faceView));
    const focused=local.y>Math.max(Math.abs(local.x),Math.abs(local.z))*.9;
    launcher.hidden=accessible.hidden=!focused;
  }
  function focus(){focusFace(ODD_MOUNT);host?.canvas.focus({preventScroll:true});}
  function initialize(){
    if(deck)return;
    stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=new URL('./deck.css?v=contrast-glows-1',import.meta.url).href;document.head.append(stylesheet);
    feedback=document.createElement('section');feedback.className='odd-feedback';feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    feedback.innerHTML='<progress aria-label="Loading clip"></progress><span data-feedback-text></span><output data-feedback-time></output><button data-feedback-cancel>Cancel loading</button><button data-feedback-dismiss aria-label="Dismiss Oddio message">×</button>';
    feedback.querySelector('[data-feedback-cancel]').addEventListener('click',()=>deck?.engine.cancelLoad(),{signal:events.signal});
    feedback.querySelector('[data-feedback-dismiss]').addEventListener('click',()=>{feedback.hidden=true;},{signal:events.signal});
    dialog=document.createElement('dialog');dialog.className='odd-dialog';dialog.setAttribute('aria-label','Optional accessible sound controls');
    deck=createSoundDeck({hostDriven:true,onClose:close,onStatus:showStatus,onChange:()=>{if(deck&&rig)rig.syncClips(deck.engine.clips);}});dialog.append(deck.root);deck.engine.setSiteMuted(globalMuted);
    launcher=document.createElement('button');launcher.className='odd-launcher';launcher.type='button';launcher.textContent='Oddio';launcher.addEventListener('click',focus,{signal:events.signal});
    accessible=document.createElement('button');accessible.className='odd-accessible-launcher';accessible.type='button';accessible.textContent='Accessible controls';accessible.setAttribute('aria-haspopup','dialog');accessible.addEventListener('click',openConsole,{signal:events.signal});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();},{signal:events.signal});
    const parent=stage||host.canvas.parentElement;parent.append(dialog,launcher,accessible,feedback);editor=createPanelEditor(parent);
    settingsUI=createOddioSettings({onLayoutPreview:value=>rig?.configure(value?{...preferences,...value}:preferences),preview:seconds=>{if(!rig||suspended)return;focus();rig.previewJam(seconds,deck.position,deck.lane);},onChange:value=>{preferences=value;rig?.configure(value);document.querySelectorAll('.odd-launcher,.odd-accessible-launcher,.odd-panel-entry,.odd-feedback,.odd-overlap-dialog').forEach(node=>{applyThemeVariables(node,themeColors(value));applyContrastVariables(node,value.contrast);});}});
  }
  function showStatus(text,kind){
    if(!feedback||!host||suspended)return;
    const loading=kind==='loading',wasLoading=feedback.dataset.kind==='loading';
    if(!loading&&kind!=='error'&&!wasLoading)return;
    clearTimeout(feedbackTimer);feedback.hidden=false;feedback.dataset.kind=kind;feedback.querySelector('[data-feedback-text]').textContent=text;
    feedback.querySelector('progress').hidden=!loading;feedback.querySelector('[data-feedback-cancel]').hidden=!loading;feedback.querySelector('[data-feedback-time]').textContent='';
    if(!loading&&kind!=='error')feedbackTimer=setTimeout(()=>{feedback.hidden=true;},6000);
  }
  function openConsole(){if(disposed||suspended||!dialog||dialog.open)return;editor.close();focusFace(ODD_MOUNT);returnFocus=document.activeElement;deck.resume();dialog.showModal();deck.root.querySelector('[data-control="volume"]').focus();}
  function close(){if(!dialog)return;dialog.close();returnFocus?.focus?.({preventScroll:true});}
  function endGesture(){controls?.cancel();editor?.close();settingsUI?.cancelLayout();}
  function detach(){
    endGesture();controls?.dispose();controls=null;if(dialog?.open)close();deck?.suspend();if(launcher)launcher.hidden=true;if(accessible)accessible.hidden=true;if(feedback)feedback.hidden=true;clearTimeout(feedbackTimer);
    rig?.dispose();rig=null;group?.removeFromParent();host=group=carrier=null;binding.detach();
  }
  function attach(context){
    if(host)detach();binding.attach(context);host=context;suspended=false;initialize();launcher.hidden=accessible.hidden=true;deck.resume();
    group=new THREE.Group();group.name='Odd physical folded-cloth machine mount';group.position.fromArray(ODD_MOUNT.center);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...ODD_MOUNT.right),new THREE.Vector3(...ODD_MOUNT.up),new THREE.Vector3(...ODD_MOUNT.normal)));
    carrier=new THREE.Group();group.add(carrier);context.cube.add(group);rig=createClothTransport(carrier,{statorParent:group,maxTextureSize:context.renderer.capabilities.maxTextureSize});rig.configure(preferences);rig.syncClips(deck.engine.clips,{silent:true});
    controls=createFaceInput({context,rig,deck,perform,onInputOwnership});
    if(new URLSearchParams(location.search).get('face')==='odd')queueMicrotask(()=>{if(host&&!disposed&&!suspended)focusFace(ODD_MOUNT);});
  }
  function numericEditor(key){
    const c=deck.engine.clips.find(c=>c.id===deck.selected),dial=['gain','tone','echo','rate'].includes(key);
    if(deck.locked||!c&&['name','start','in','out','rate','gain'].includes(key))return;
    const openNumber=(id,config,prefix='',suffix='')=>editor.open({...config,onChange:selection=>rig?.setNumericEdit(id,{...selection,prefix,suffix,offset:prefix.split('\n').at(-1).length}),onClose:()=>rig?.setNumericEdit(id,null)});
    if(key==='name'){editor.open({title:'Tape label',value:c.name,type:'text',point:[0,-.414,.285],apply:value=>deck.editSelected({name:value||'Untitled strip'})});return;}
    if(key==='seek'){openNumber(key,{title:'Tape position · seconds',value:Math.round(deck.position*10)/10,min:TAPE_BED.min,max:TAPE_BED.max,step:.1,point:[0,.505,.29],apply:value=>{deck.engine.seek(value);return true;}},'POSITION\n','s');return;}
    if(key==='volume'){openNumber(key,{title:'PAGE VOLUME · %',value:Math.round(deck.engine.volume*100),min:0,max:200,step:1,point:[.34,-.265,.285],apply:value=>{deck.setVolume(value/100);return true;}},'','%');return;}
    if(dial){const field=deck.root.querySelector('[data-control="'+key+'"]'),i=['gain','tone','echo','rate'].indexOf(key),scale=key==='tone'?.001:key==='rate'?1:100,units=key==='tone'?'kHz':key==='rate'?'×':'%';openNumber(key,{title:field.getAttribute('aria-label')+' · '+units,value:Number((Number(field.value)*scale).toFixed(4)),min:Number(field.min)*scale,max:Number(field.max)*scale,step:Number(field.step)*scale,point:[(i-1.5)*.14,-.575,.285],apply:value=>{deck.setControl(key,value/scale);return true;}},key.toUpperCase()+'\n',key==='tone'?'k':key==='rate'?'x':'%');return;}
    openNumber(key,{title:{start:'Clip start · seconds',in:'Trim in · seconds',out:'Trim out · seconds'}[key],value:Number(c[key].toFixed(2)),min:key==='start'?-60:0,max:key==='start'?120:c.buffer.duration,point:[(['start','in','out'].indexOf(key)-1)*.18,-.64,.285],apply:value=>deck.editSelected({[key]:value})},key.toUpperCase()+'\n','');
  }
  function perform(action){
    if(action==='unstick'){rig.unstick();return;}
    if(action.startsWith('wind:')){if(!deck.locked)deck.engine.seek(snapTapePosition(deck.engine.targetPosition+Number(action.split(':')[1])));return;}
    if(action==='focus'){focus();return;}if(action==='console'){openConsole();return;}
    if(action==='mode'){rig.setMode(rig.mode==='mix'?'edit':'mix');return;}
    if(action==='selected'){rig.setMode('edit');return;}
    if(action==='reverse-clip'){deck.root.querySelector('[data-action="reverse-clip"]')?.click();return;}
    if(action==='seek'||action==='name'||action==='volume-value'){numericEditor(action==='volume-value'?'volume':action);return;}
    if(action==='volume-mute'){deck.root.querySelector('[data-action="output"]')?.click();return;}
    if(action==='sewing'){const store=getSharedSettings();store.patch({'about.odd.sewingAnimations':store.get().about.odd.sewingAnimations===false});return;}
    if(action.startsWith('lane:')){deck.selectLane(+action.split(':')[1]);return;}
    if(action.startsWith('lane-max:')){if(deck.locked)return;const lane=Number(action.split(':')[1]),range=rig.meterRanges[lane];if(!range)return;editor.open({title:'VOICE 0'+(lane+1)+' MAX LEVEL · %',value:Math.round(deck.engine.lanes[lane].gain*100),min:0,max:100,step:1,point:[range.x,(range.minY+range.maxY)/2,range.z],apply:value=>{deck.engine.setLane(lane,{gain:value/100});return true;},onChange:selection=>rig?.setNumericEdit(action,{...selection,prefix:'VOICE 0'+(lane+1)+' MAX\n',suffix:'%',offset:0}),onClose:()=>rig?.setNumericEdit(action,null)});return;}
    if(action.startsWith('assign:')){deck.editSelected({lane:+action.split(':')[1]});return;}
    if(action.startsWith('dial:')||action.startsWith('field:')){numericEditor(action.split(':')[1]);return;}
    if(action==='loop'){deck.engine.loop=!deck.engine.loop;return;}
    if(action.startsWith('mute:')){const lane=+action.split(':')[1];if(Number.isInteger(lane)&&lane>=0&&lane<4){const muted=!deck.engine.lanes[lane].muted;deck.engine.setLane(lane,{muted});deck.message('Voice '+(lane+1)+(muted?' muted. Cloth withdrawn from the reader.':' on. Cloth returned to the reader.'));}return;}
    if(action==='mute'){const lane=deck.lane;deck.engine.setLane(lane,{muted:!deck.engine.lanes[lane].muted});return;}
    deck.resume();deck.root.querySelector('[data-action="'+action+'"]')?.click();
  }
  return {id:binding.id,backingName:binding.backingName,get backing(){return binding.backing;},get components(){return binding.components;},get runtime(){return deck;},get gestureActive(){return Boolean(controls?.active);},get mechanism(){return rig;},attach,detach,endGesture,
    update(dt){
      if(!host||suspended||disposed)return;syncLaunchers();controls.tick(dt);deck.tick();rig.syncClips(deck.engine.clips);
      if(deck.engine.loading&&!feedback.hidden){const text=Math.floor((performance.now()-deck.engine.loading.startedAt)/1000)+'s',node=feedback.querySelector('[data-feedback-time]');if(node.textContent!==text)node.textContent=text;}
      if(upright){inverse.copy(group.matrixWorld).invert();right.setFromMatrixColumn(host.camera.matrixWorld,0).transformDirection(inverse);if(right.x*right.x+right.y*right.y>.01){const angle=Math.atan2(right.y,right.x),delta=Math.atan2(Math.sin(angle-roll),Math.cos(angle-roll));if(!controls.active&&!editor.active)roll+=reduced?delta:Math.max(-dt*2.6,Math.min(dt*2.6,delta*(1-Math.exp(-dt*7))));}}else roll=0;
      carrier.rotation.z=roll;carrier.updateWorldMatrix(false,true);
      const engine=deck.engine,preview=controls.preview;let clips=engine.clips;
      if(preview?.edge)deck.previewRate(preview.stretch?preview.clip.rate:null);
      if(preview)clips=dragPreviewClips(clips,preview);
      const counter=controls.fieldPreview;if(counter)clips=clips.map(c=>c.id===deck.selected?{...c,[counter.key]:counter.value}:c);
      rig.update(dt,{position:deck.position,moving:engine.playing||engine.recording||engine.winding,reduced,clips,lane:preview?.clip.lane??deck.lane,volume:engine.volume,level:engine.getLevel(),laneLevels:engine.getLaneLevels(),hoverLane:controls.hoverLane,hoverMainMeter:controls.hoverMainMeter,lanes:engine.lanes,selected:deck.selected,statusText:deck.status,muted:engine.muted,siteMuted:engine.siteMuted,loop:engine.loop,recording:engine.recording,pending:engine.pending,playing:engine.playing,direction:engine.winding?engine.windingDirection:engine.playbackPending?0:engine.direction,preview,hoverEdge:controls.hoverEdge,capture:engine.capturePreview,interactionActive:controls.active||editor.active||deck.locked});
      editor.update(host.camera,rig.group,host.canvas.getBoundingClientRect());
    },
    applySettings(snapshot){enabled=snapshot.about?.odd?.enabled!==false;if(group)group.visible=enabled;rig?.setEnabled(enabled&&!suspended);syncLaunchers();upright=snapshot.cube?.uprightFaces!==false;reduced=Boolean(snapshot.accessibility?.reducedMotion);globalMuted=Boolean(snapshot.audio?.muted);if(deck){deck.root.classList.toggle('odd-reduced-motion',reduced);deck.engine.setSiteMuted(globalMuted);}},
    suspend(){suspended=true;syncLaunchers();rig?.suspend();endGesture();if(controls)controls.enabled=false;deck?.suspend();if(feedback)feedback.hidden=true;clearTimeout(feedbackTimer);if(dialog?.open)close();},resume(){suspended=false;rig?.resume();if(controls)controls.enabled=true;if(host)deck?.resume();},
    dispose(){if(disposed)return;detach();disposed=true;events.abort();settingsUI?.dispose();editor?.dispose();deck?.dispose();dialog?.remove();launcher?.remove();accessible?.remove();feedback?.remove();stylesheet?.remove();binding.dispose();}
  };
}
