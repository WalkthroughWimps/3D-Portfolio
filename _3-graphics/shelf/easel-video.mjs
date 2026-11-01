import * as THREE from 'three';
import {showVideoKeyboardShortcuts} from '../../_7-shared-scripts/shared-video-controls.js';

// UV corners, rather than the exported normals, identify the picture's upright
// face. The Blender easel has a negative-scale parent in its source hierarchy.
export function easelFrame(mesh,aspect,{fov=35,fillX=.84,fillY=.76}={}){
 mesh.updateWorldMatrix(true,false);const positions=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
 const corner=(x,y)=>{let best=Infinity,point=new THREE.Vector3();for(let i=0;i<uv.count;i++){const d=(uv.getX(i)-x)**2+(uv.getY(i)-y)**2;if(d<best){best=d;point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);}}return point;};
 const bottom=corner(0,0),right=corner(1,0),top=corner(0,1),u=right.clone().sub(bottom),v=top.clone().sub(bottom),target=bottom.clone().addScaledVector(u,.5).addScaledVector(v,.5),normal=new THREE.Vector3().crossVectors(u,v).normalize(),up=v.clone().normalize();
 const distance=Math.max(u.length()/(2*Math.tan(fov*Math.PI/360)*aspect*fillX),v.length()/(2*Math.tan(fov*Math.PI/360)*fillY));
 return {target,position:target.clone().addScaledVector(normal,distance),normal,up,width:u.length(),height:v.length()};
}

export function easelVideoPolicy(graphics={}){return {rotate:graphics.videoRotation===true,zoom:graphics.videoZoom===true};}

export function createEaselVideo({mesh,src,controls,video,invalidate=()=>{},notify=()=>{},requestAudio=async()=>false,canInteract=()=>true}){
 const original=mesh.material,slot=mesh.geometry.groups.find(g=>g.count>0)?.materialIndex??0,texture=new THREE.VideoTexture(video),scale=new THREE.Vector2(1,1);
 texture.colorSpace=THREE.SRGBColorSpace;texture.name='The Great Race easel video';
 const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,toneMapped:false});
 material.onBeforeCompile=shader=>{shader.uniforms.easelScale={value:scale};shader.fragmentShader='uniform vec2 easelScale;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec2 easelUv=(vMapUv-0.5)*easelScale+0.5;
 if(easelUv.x<0.0||easelUv.x>1.0||easelUv.y<0.0||easelUv.y>1.0){diffuseColor.rgb=vec3(0.015);}else{
${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv','easelUv')}
}`);};
 material.customProgramCacheKey=()=> 'easel-video-letterbox-v1';
 const picture=original.slice();picture[slot]=material;
 let active=false,presented=false,disposed=false,ticket=0,frame=null,userMuted=false,suspended=false,audio={allowed:false,muted:false,volume:.25};
 const bindings=[],on=(node,type,fn)=>{node.addEventListener(type,fn);bindings.push(()=>node.removeEventListener(type,fn));},playButton=controls.querySelector('[data-video-play]'),muteButton=controls.querySelector('[data-video-mute]'),seek=controls.querySelector('[data-video-seek]'),time=controls.querySelector('[data-video-time]');
 const rates=[.5,.75,1,1.25,1.5,2];let rateIndex=rates.indexOf(1);
 const speedButton=document.createElement('button'),helpButton=document.createElement('button');
 speedButton.type=helpButton.type='button';speedButton.setAttribute('aria-label','Cycle playback speed');
 helpButton.textContent='Shortcuts';controls.insertBefore(speedButton,seek.parentElement);controls.insertBefore(helpButton,seek.parentElement);
 function setRate(index){rateIndex=Math.max(0,Math.min(rates.length-1,index));video.playbackRate=rates[rateIndex];speedButton.textContent=`${rates[rateIndex]}×`;}
 function seekTo(value){if(!Number.isFinite(video.duration))return;video.currentTime=Math.max(0,Math.min(video.duration,value));ui();}
 const stamp=s=>Number.isFinite(s)?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'0:00';
 function audioState(){video.muted=userMuted||!audio.allowed||audio.muted;video.volume=Math.max(0,Math.min(1,audio.volume));muteButton.textContent=video.muted?'Sound off':'Sound on';muteButton.setAttribute('aria-pressed',String(!video.muted));}
 function ui(){playButton.textContent=video.paused?(video.ended?'Replay':'Play'):'Pause';seek.max=Number.isFinite(video.duration)?video.duration:1;seek.value=video.currentTime||0;seek.disabled=!Number.isFinite(video.duration);time.textContent=`${stamp(video.currentTime)} / ${stamp(video.duration)}`;invalidate();}
 function frameTick(){frame=null;if(!active||!presented||video.paused||disposed)return;invalidate();if(video.requestVideoFrameCallback)frame=video.requestVideoFrameCallback(frameTick);}
 function showFrame(){if(active&&presented){mesh.material=picture;invalidate();}if(frame===null&&video.requestVideoFrameCallback)frame=video.requestVideoFrameCallback(frameTick);ui();}
 function metadata(){const size=easelFrame(mesh,1),ratio=size.width/size.height/(video.videoWidth/video.videoHeight||16/9);scale.set(Math.max(1,ratio),Math.max(1,1/ratio));ui();invalidate();}
 async function play(){if(!active||!presented||disposed)return;const request=ticket;try{await video.play();}catch(error){if(request!==ticket||!active)return;if(error.name==='NotAllowedError'&&!video.muted){userMuted=true;audioState();try{await video.play();}catch{notify('Press Play to start the easel video.');}}else notify('Press Play to start the easel video.');}if(request!==ticket||!active)video.pause();ui();}
 on(video,'loadedmetadata',metadata);on(video,'loadeddata',()=>{if(!video.paused)showFrame();});on(video,'playing',showFrame);on(video,'seeked',()=>{if(active&&presented&&video.readyState>=2)showFrame();});for(const event of ['pause','ended','timeupdate','durationchange'])on(video,event,ui);
 on(video,'error',()=>{if(active)notify('The easel video could not load. Return to the shelf and try again.');});
 on(playButton,'click',()=>{if(video.paused){if(video.ended)video.currentTime=0;void play();}else video.pause();});
 async function toggleMute(){const enabling=!audio.allowed;if(enabling){if(!await requestAudio())return;audio.allowed=true;}if(audio.muted){notify('Unmute audio in General settings to hear the easel video.');return;}userMuted=enabling?false:!video.muted;audioState();}
 on(muteButton,'click',toggleMute);
 on(speedButton,'click',()=>setRate((rateIndex+1)%rates.length));
 on(helpButton,'click',()=>showVideoKeyboardShortcuts({playerView:false}));
 on(seek,'input',()=>{if(Number.isFinite(video.duration)){video.currentTime=Math.max(0,Math.min(video.duration,Number(seek.value)));ui();}});
 on(document,'keydown',event=>{
  if(!active||!presented||suspended||disposed||!canInteract()||event.defaultPrevented||event.isComposing||event.ctrlKey||event.altKey||event.metaKey||
   document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')||event.target?.closest?.('input, textarea, select, [contenteditable], [role="textbox"]'))return;
  const key=(event.key||'').toLowerCase(),shift=event.shiftKey;
  if(key===' '&&event.target?.closest?.('button, a, [role="button"]'))return;
  const handled=()=>event.preventDefault();
  if(shift&&(key==='?'||event.code==='Slash')){handled();showVideoKeyboardShortcuts({playerView:false});return;}
  if(key===' '||key==='k'){handled();if(video.paused){if(video.ended)seekTo(0);void play();}else video.pause();return;}
  if(key==='m'){handled();void toggleMute();return;}
  if(key==='j'||key==='l'||key==='arrowleft'||key==='arrowright'){handled();seekTo(video.currentTime+({j:-10,l:10,arrowleft:-5,arrowright:5})[key]);return;}
  if(key==='home'||key==='end'){handled();seekTo(key==='home'?0:video.duration);return;}
  if(key==='arrowup'||key==='arrowdown'){handled();audio.volume=Math.max(0,Math.min(1,audio.volume+(key==='arrowup'?.05:-.05)));audioState();return;}
  if(shift&&(key==='<'||key===','||event.code==='Comma')){handled();setRate(rateIndex-1);return;}
  if(shift&&(key==='>'||key==='.'||event.code==='Period')){handled();setRate(rateIndex+1);return;}
  if(!shift&&video.paused&&(key===','||event.code==='Comma'||key==='.'||event.code==='Period')){handled();seekTo(video.currentTime+((key===','||event.code==='Comma')?-1:1)/30);return;}
  if(/^[0-9]$/.test(key)){handled();seekTo(video.duration*Number(key)/10);}
 });
 video.playsInline=true;video.preload='metadata';setRate(rateIndex);audioState();ui();
 return {
  prepare(){active=true;presented=false;suspended=false;ticket++;userMuted=false;controls.hidden=true;if(!video.getAttribute('src')){video.src=src;video.load();}audioState();},
  async start(){if(!active)return;presented=true;controls.hidden=false;await play();},
  leave(){active=presented=suspended=false;ticket++;video.pause();if(Number.isFinite(video.duration))video.currentTime=0;if(frame!==null)video.cancelVideoFrameCallback?.(frame);frame=null;mesh.material=original;controls.hidden=true;ui();invalidate();},
  syncAudio(value){audio={...audio,...value};audioState();},
  suspend(){suspended=active&&!video.paused;video.pause();},
  resume(){if(suspended&&active){suspended=false;void play();}},
  get needsFrames(){return active&&presented&&!video.paused&&!video.requestVideoFrameCallback;},
  diagnostics(){return {active,presented,paused:video.paused,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null,muted:video.muted,readyState:video.readyState,letterbox:scale.toArray(),posterRestored:mesh.material===original};},
  dispose(){this.leave();disposed=true;bindings.forEach(stop=>stop());speedButton.remove();helpButton.remove();video.removeAttribute('src');video.load();texture.dispose();material.dispose();}
 };
}
