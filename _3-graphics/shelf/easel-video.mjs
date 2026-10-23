import * as THREE from 'three';

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

export function createEaselVideo({mesh,src,controls,video,invalidate=()=>{},notify=()=>{},requestAudio=async()=>false}){
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
 on(muteButton,'click',async()=>{const enabling=!audio.allowed;if(enabling){if(!await requestAudio())return;audio.allowed=true;}if(audio.muted){notify('Unmute audio in General settings to hear the easel video.');return;}userMuted=enabling?false:!video.muted;audioState();});
 on(seek,'input',()=>{if(Number.isFinite(video.duration)){video.currentTime=Math.max(0,Math.min(video.duration,Number(seek.value)));ui();}});
 video.playsInline=true;video.preload='metadata';audioState();ui();
 return {
  prepare(){active=true;presented=false;ticket++;userMuted=false;controls.hidden=true;if(!video.getAttribute('src')){video.src=src;video.load();}audioState();},
  async start(){if(!active)return;presented=true;controls.hidden=false;await play();},
  leave(){active=presented=false;ticket++;video.pause();if(Number.isFinite(video.duration))video.currentTime=0;if(frame!==null)video.cancelVideoFrameCallback?.(frame);frame=null;mesh.material=original;controls.hidden=true;ui();invalidate();},
  syncAudio(value){audio={...audio,...value};audioState();},
  suspend(){suspended=active&&!video.paused;video.pause();},
  resume(){if(suspended&&active){suspended=false;void play();}},
  get needsFrames(){return active&&presented&&!video.paused&&!video.requestVideoFrameCallback;},
  diagnostics(){return {active,presented,paused:video.paused,time:video.currentTime,duration:Number.isFinite(video.duration)?video.duration:null,muted:video.muted,readyState:video.readyState,letterbox:scale.toArray(),posterRestored:mesh.material===original};},
  dispose(){this.leave();disposed=true;bindings.forEach(stop=>stop());video.removeAttribute('src');video.load();texture.dispose();material.dispose();}
 };
}
