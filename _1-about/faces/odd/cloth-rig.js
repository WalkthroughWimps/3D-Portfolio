import {RETRO_COLORS,RETRO,controlLane,tint,contrastGain} from './theme.mjs?v=contrast-glows-1';
import {blendWindow,stableBlendAppearance} from './clip-appearance.mjs?v=contrast-glows-1';
import * as THREE from 'three';
import {RIBBON,GUIDE,FOLDERS,REEL_FRAMES,laneHeight,laneDepth,ribbonPoint,reelRadii,reelAngle,createRibbonFlex,foldedOffset,folderChannelProfile} from './ribbon-path.mjs?v=addon-layout-2';
import {createTapeFolders} from './tape-folders.js?v=addon-layout-2';
import {createTapeGuides} from './tape-guides.js?v=addon-layout-2';
import {PANEL} from './mechanism-layout.mjs';
import {resolveAddonLayout} from './addon-layout.mjs?v=constructor-1';
import {duration,LIMITS,sourceSeconds} from './audio-engine.mjs?v=transport-ticks-1';
import {drawFabric,FABRIC_TIME} from './fabric-texture.js?v=transport-ticks-1';
import {createStructuralFrame} from './structural-frame.js?v=addon-layout-2';
import {createMechanicalAtelier} from './mechanical-atelier.js?v=contrast-glows-1';
import {ARM_LAYOUT} from './arm-motion.mjs?v=editing-5';
import {createAnalogInstruments,createTrackMeters} from './analog-instruments.js?v=contrast-glows-1';
import {createShuttleControls,createTransportControls} from './shuttle-controls.js?v=contrast-glows-1';
import {stepMagneticArrow} from './selector-motion.mjs?v=editing-5';
import {createTrackMute,createSelectorRail} from './mute-mechanism.js?v=contrast-glows-1';
import {guidedMutePoint,muteArc,TRACK_MUTE} from './track-mute.mjs?v=conveyor-1';
import {pocketedPanelGeometry} from './panel-housing.mjs?v=editing-5';

export function createClothTransport(parent,{statorParent=null,maxTextureSize=16384}={}){
  const COLORS=[...RETRO_COLORS];let appearance={highlightColor:'#d9f5ff',contrast:.5,stackBlends:true};
  const group=new THREE.Group();group.name='Odd recessed fabric transport';group.position.z=RIBBON.recess;parent.add(group);
  const resources=new Set(),targets=[],ribbons=[],reels=[],knobs=[],plaques=[],armFlaps=[],tangent=new THREE.Vector3(),widthVector=new THREE.Vector3(),foldNormal=new THREE.Vector3();
  const modes={mix:[],edit:[]},plaqueSupports=new WeakMap();let panelMode="mix";const mode=(mesh,key)=>{modes[key].push(mesh);if(plaqueSupports.has(mesh))modes[key].push(plaqueSupports.get(mesh));return mesh;};
  const own=value=>{resources.add(value);return value;};
  const metal=own(new THREE.MeshStandardMaterial({color:RETRO.brass,metalness:.65,roughness:.32}));
  const dark=own(new THREE.MeshStandardMaterial({color:RETRO.housing,metalness:.2,roughness:.6}));
  const cream=own(new THREE.MeshStandardMaterial({color:RETRO.paper,metalness:.1,roughness:.65,emissive:'#8e805a',emissiveIntensity:.12}));
  function box(name,x,y,z,width,height,depth,material,action){
    const mesh=new THREE.Mesh(own(new THREE.BoxGeometry(width,height,depth)),material);mesh.position.set(x,y,z);mesh.name=name;group.add(mesh);
    if(action){mesh.userData.oddAction=action;targets.push(mesh);}return mesh;
  }
  const marking=own(new THREE.MeshBasicMaterial({color:RETRO.letter}));
  function paintPlaque(mesh,label){
    const face=mesh.userData.plaqueFace,canvas=face.map.image,glow=face.emissiveMap.image,action=mesh.userData.oddAction,index=controlLane(action),display=action==='focus'||action==='name'||action==='mode'||action?.startsWith('field:'),bg=display?RETRO.housing:tint(COLORS[index],mesh.userData.pressed?-.06:-.35);
    face.emissiveIntensity=.35*contrastGain(appearance.contrast);mesh.userData.plaqueBody.color.set(tint(bg,-.24));const signature=JSON.stringify([label,bg,mesh.userData.textAlignX,mesh.userData.numericEdit]);if(mesh.userData.plaquePaint===signature)return;mesh.userData.plaquePaint=signature;mesh.userData.retroText=label;mesh.userData.paletteLane=index;
    const edit=mesh.userData.numericEdit,lines=label.split('\n');
    // Identical glyph rasterization keeps diffuse ink and emissive ink registered.
    for(const [image,lit]of [[canvas,false],[glow,true]]){
      const ctx=image.getContext('2d');ctx.fillStyle=lit?'#000':bg;ctx.fillRect(0,0,image.width,image.height);
      ctx.strokeStyle=lit?'#584737':RETRO.brass;ctx.lineWidth=3;ctx.strokeRect(4,4,image.width-8,image.height-8);
      ctx.fillStyle=RETRO.letter;ctx.textAlign='center';ctx.textBaseline='middle';
      const family=label==='ODDIO'?'Georgia':'Arial, sans-serif',available=image.width-32;
      let size=Math.floor(image.height*(label==='ODDIO'?.77:lines.length>1?.33:.58));
      ctx.font=`600 ${size}px ${family}`;
      const measured=Math.max(...lines.map(line=>ctx.measureText(line).width));
      if(measured>available){size=Math.floor(size*available/measured);ctx.font=`600 ${size}px ${family}`;}
      lines.forEach((line,i)=>{
        const x=image.width*(mesh.userData.textAlignX??.5),y=image.height*(i+.5)/lines.length;
        if(edit&&i===lines.length-1){
          const prefix=line.slice(0,edit.offset),digits=edit.value,suffix=line.slice(edit.offset+digits.length);
          const full=prefix+digits+suffix,base=x-ctx.measureText(full).width/2;
          if(edit.start!==edit.end){
            const a=base+ctx.measureText(prefix+digits.slice(0,edit.start)).width,b=base+ctx.measureText(prefix+digits.slice(0,edit.end)).width;
            ctx.fillStyle=lit?'#b8d9d0':'#188b91';ctx.fillRect(a,y-size*.53,Math.max(2,b-a),size*1.06);ctx.fillStyle=lit?'#fff0c9':'#fff0c9';
          }else{
            const caret=base+ctx.measureText(prefix+digits.slice(0,edit.start)).width;
            ctx.fillStyle=lit?'#b8d9d0':'#188b91';ctx.fillRect(caret,y-size*.56,Math.max(2,size*.035),size*1.12);ctx.fillStyle=RETRO.letter;
          }
          ctx.fillText(full,x,y);
        }else ctx.fillText(line,x,y);
      });
    }
    face.map.needsUpdate=face.emissiveMap.needsUpdate=true;

  }
  function plaque(label,x,y,z,width,height,_bg,_fg,action='open'){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.max(64,Math.round(768*height/width));
    const texture=own(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const glow=document.createElement('canvas');glow.width=canvas.width;glow.height=canvas.height;const glowTexture=own(new THREE.CanvasTexture(glow));glowTexture.colorSpace=THREE.SRGBColorSpace;glowTexture.anisotropy=4;
    const material=own(new THREE.MeshStandardMaterial({map:texture,emissiveMap:glowTexture,emissive:'#fff',emissiveIntensity:.6,roughness:.42,metalness:.08}));
    let support=null;
    if(Math.abs(y)>.19&&Math.abs(x)<.405&&z>=.25){const rear=z-.006;support=box('Panel-mounted plaque support',x,y,(.240+rear)/2,width-.006,height-.006,rear-.240,dark);}
    const body=own(new THREE.MeshStandardMaterial({color:RETRO.housing,roughness:.5,metalness:.08}));
    const mesh=box(label,x,y,z,width,height,.012,[body,material],action),indices=mesh.geometry.index.array;
    // One plain shell draw and one front print draw; no lettering on the sides/back.
    mesh.geometry.setIndex([...indices.slice(0,24),...indices.slice(30),...indices.slice(24,30)]);mesh.geometry.clearGroups();mesh.geometry.addGroup(0,30,0);mesh.geometry.addGroup(30,6,1);
    mesh.userData.plaqueBody=body;mesh.userData.plaqueFace=material;if(support)plaqueSupports.set(mesh,support);plaques.push(mesh);paintPlaque(mesh,label);return mesh;
  }
  function cap(sign){
    const makeShape=pocketRadius=>{const shape=new THREE.Shape(),half=sign>0?.40:.49,radius=.82,lip=sign>0?half:.40;shape.moveTo(-lip,sign*.19);
    const x=sign*ARM_LAYOUT.baseX,y=sign*ARM_LAYOUT.restY,angle=Math.asin(.006/pocketRadius),width=Math.sqrt(pocketRadius*pocketRadius-.006**2);shape.lineTo(x-width,sign*.19);for(let i=1;i<=32;i++){const a=sign>0?Math.PI-angle-(Math.PI-2*angle)*i/32:-Math.PI+angle+(Math.PI-2*angle)*i/32;shape.lineTo(x+Math.cos(a)*pocketRadius,y+Math.sin(a)*pocketRadius);}
    shape.lineTo(lip,sign*.19);
    if(sign<0)shape.lineTo(half,-.38);
    for(let i=0;i<=48;i++){const x=half-2*half*i/48;shape.lineTo(x,sign*Math.sqrt(radius*radius-x*x));}
    if(sign<0)shape.lineTo(-half,-.38);shape.closePath();
    if(sign<0)for(const side of [-1,1])for(let col=-4;col<=4;col++){
      const dx=col*.019,radius=.083,halfHeight=Math.sqrt(radius*radius-dx*dx),x=side*.38+dx,y=-.58,w=.009;
      const hole=new THREE.Path();hole.moveTo(x-w/2,y-halfHeight+w/2);hole.lineTo(x-w/2,y+halfHeight-w/2);hole.absarc(x,y+halfHeight-w/2,w/2,Math.PI,0,true);hole.lineTo(x+w/2,y-halfHeight+w/2);hole.absarc(x,y-halfHeight+w/2,w/2,0,-Math.PI,true);hole.closePath();shape.holes.push(hole);
    }
    if(sign>0){const hole=new THREE.Path();hole.moveTo(-.190,.442);hole.lineTo(.190,.442);hole.lineTo(.190,.568);hole.lineTo(-.190,.568);hole.closePath();shape.holes.push(hole);}
    const relief=new THREE.Path();relief.moveTo(sign*.286,sign*.192);relief.lineTo(sign*.336,sign*.192);relief.lineTo(sign*.336,sign*.229);relief.lineTo(sign*.286,sign*.229);relief.closePath();shape.holes.push(relief);
    return shape;};
    const geometry=own(pocketedPanelGeometry(makeShape,{depth:PANEL.thickness,center:[sign*ARM_LAYOUT.baseX,sign*ARM_LAYOUT.restY,.016],radius:.0185}));
    const mesh=new THREE.Mesh(geometry,cream);mesh.position.z=PANEL.rear;mesh.name=sign>0?'Curved upper control cover':'Curved lower control cover';mesh.userData.oddAction='open';targets.push(mesh);group.add(mesh);
    const hinge=new THREE.Group();hinge.name=sign>0?'Upper arm clearance flap hinge':'Lower arm clearance flap hinge';hinge.position.set(sign*.311,sign*.229,PANEL.front+.002);group.add(hinge);
    const leaf=new THREE.Mesh(own(new THREE.BoxGeometry(.050,.037,.003)),cream);leaf.name=sign>0?'Upper arm clearance leaf':'Lower arm clearance leaf';leaf.position.y=-sign*.0185;hinge.add(leaf);
    const pin=new THREE.Mesh(own(new THREE.CylinderGeometry(.0025,.0025,.054,12)),metal);pin.name='Arm clearance flap pin';pin.rotation.z=Math.PI/2;pin.position.set(0,0,-.001);hinge.add(pin);
    armFlaps.push({side:sign,hinge});
  }
  const power=createStructuralFrame(group,own,metal,dark,{statorParent});
  const clearDivider=own(new THREE.MeshStandardMaterial({color:'#d9d4b8',transparent:true,opacity:.15,roughness:.4,side:THREE.DoubleSide,depthWrite:false}));
  const coilGeometry=own(new THREE.CylinderGeometry(1,1,RIBBON.foldedWidth,72));
  // Corrugated end faces expose the layers of wound wool instead of smooth solid caps.
  const capGeometry=own(new THREE.RingGeometry(.02,1,64,48)),capPositions=capGeometry.attributes.position;
  for(let i=0;i<capPositions.count;i++){const r=Math.hypot(capPositions.getX(i),capPositions.getY(i));capPositions.setZ(i,.00025+.0008*(.5+.5*Math.cos((r-.02)/.98*Math.PI*48)));}capGeometry.computeVertexNormals();
  const windingCanvas=document.createElement('canvas');windingCanvas.width=windingCanvas.height=256;
  const windingContext=windingCanvas.getContext('2d');windingContext.fillStyle='#b9b7a9';windingContext.fillRect(0,0,256,256);
  for(let r=4;r<128;r+=5){windingContext.beginPath();windingContext.arc(128,128,r,0,Math.PI*2);windingContext.strokeStyle='#575b51';windingContext.lineWidth=1.6;windingContext.stroke();windingContext.beginPath();windingContext.arc(128,128,r+1.7,0,Math.PI*2);windingContext.strokeStyle='#f4ebd0';windingContext.lineWidth=1;windingContext.stroke();}
  const windingTexture=own(new THREE.CanvasTexture(windingCanvas));windingTexture.colorSpace=THREE.SRGBColorSpace;windingTexture.anisotropy=4;
  for(const [index,center] of [RIBBON.takeup,RIBBON.supply].entries()){
    const spec=index?REEL_FRAMES.supply:REEL_FRAMES.takeup,reelFrame=new THREE.Group();reelFrame.name=index?'Splayed supply reel frame':'Splayed take-up reel frame';reelFrame.position.set(center[0],center[1],RIBBON.reelLift+spec.lift);reelFrame.rotation.y=spec.angle;group.add(reelFrame);
    const axle=new THREE.Mesh(own(new THREE.CylinderGeometry(.024,.024,.208,24)),metal);axle.rotation.x=Math.PI/2;axle.position.set(0,0,.086);axle.name='Bearing-seated fixed reel spindle';reelFrame.add(axle);
    const rotor=new THREE.Group();rotor.name=index?'Lower-right supply reel':'Upper-left take-up reel';reelFrame.add(rotor);
    for(const [z,radius]of [[.030,RIBBON.flangeRadius],[.194,RIBBON.frontWheelRadius]]){
      const ring=new THREE.Mesh(own(new THREE.RingGeometry(radius-.015,radius,64)),metal);ring.position.z=z;ring.name='Reduced reel guide wheel';rotor.add(ring);
      const edge=new THREE.Mesh(own(new THREE.TorusGeometry(radius-.002,.0025,6,64)),metal);edge.position.z=z;rotor.add(edge);
      const hub=new THREE.Mesh(own(new THREE.CylinderGeometry(.027,.027,.008,24)),metal);hub.rotation.x=Math.PI/2;hub.position.z=z;rotor.add(hub);
      for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;const spoke=new THREE.Mesh(own(new THREE.BoxGeometry(.009,radius-.026,.004)),metal);spoke.position.set(Math.sin(angle)*(radius+.026)/2,Math.cos(angle)*(radius+.026)/2,z);spoke.rotation.z=-angle;rotor.add(spoke);}
    }
    for(let i=0;i<=4;i++){const z=.0405+i*.037,disc=new THREE.Mesh(own(new THREE.RingGeometry(.098,RIBBON.dividerRadius,64)),clearDivider);disc.name='Clear cloth-lane reel divider';disc.position.z=z;rotor.add(disc);const edge=new THREE.Mesh(own(new THREE.TorusGeometry(RIBBON.dividerRadius,.0015,6,64)),metal);edge.name='Thin divider rim';edge.position.z=z;rotor.add(edge);}
    const coils=Array.from({length:4},(_,lane)=>{
      const material=own(new THREE.MeshStandardMaterial({color:COLORS[lane],roughness:.96}));
      const coil=new THREE.Mesh(coilGeometry,material);coil.rotation.x=Math.PI/2;coil.position.z=laneDepth(lane,!index);rotor.add(coil);
      const capMaterial=own(new THREE.MeshStandardMaterial({color:COLORS[lane],map:windingTexture,roughness:.9}));coil.userData.windingMaterial=capMaterial;
      for(const side of [-1,1]){const cap=new THREE.Mesh(capGeometry,capMaterial);cap.name='Raised wound wool layers';cap.rotation.x=-side*Math.PI/2;cap.position.y=side*(RIBBON.foldedWidth/2+.0001);coil.add(cap);}return coil;
    });
    reels.push({index,rotor,coils});
  }
  const normalPixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,over=(Math.floor(x/4)+Math.floor(y/4))%2;normalPixels[i]=128+Math.round(30*Math.cos(x*Math.PI/2)*(over?1:.4));normalPixels[i+1]=128+Math.round(30*Math.cos(y*Math.PI/2)*(over?.4:1));normalPixels[i+2]=250;normalPixels[i+3]=255;}
  const normal=own(new THREE.DataTexture(normalPixels,128,128));normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(2,35);normal.needsUpdate=true;
  reels.forEach(reel=>reel.coils.forEach(coil=>{coil.material.normalMap=normal;coil.material.normalScale.set(.13,.13);}));
  const rows=RIBBON.rows,columns=RIBBON.columns;
  for(let lane=0;lane<4;lane++){
    const geometry=own(new THREE.BufferGeometry()),positions=new Float32Array((rows+1)*(columns+1)*3),uvs=new Float32Array((rows+1)*(columns+1)*2),indices=[];
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){const a=row*(columns+1)+col,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=4096;
    const texture=own(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=Math.max(4096,Math.min(16384,maxTextureSize));const glowTexture=own(new THREE.CanvasTexture(glowCanvas));glowTexture.colorSpace=THREE.SRGBColorSpace;glowTexture.anisotropy=4;
    const material=own(new THREE.MeshPhysicalMaterial({map:texture,emissiveMap:glowTexture,normalMap:normal,normalScale:new THREE.Vector2(.22,.22),roughness:.94,sheen:.8,sheenRoughness:.9,sheenColor:new THREE.Color('#e2d1aa'),side:THREE.DoubleSide,emissive:'#fff',emissiveIntensity:.08}));
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Flexible horizontal fabric voice '+(lane+1);mesh.frustumCulled=false;mesh.userData.oddAction='lane:'+lane;mesh.userData.oddRibbon=true;targets.push(mesh);group.add(mesh);
    ribbons.push({geometry,canvas,texture,glowCanvas,glowTexture,material,flex:createRibbonFlex(),lane,signature:'uninitialized',arc:new Float32Array(rows+1),surfaceArc:new Float32Array((rows+1)*(columns+1)),samples:[]});
  }
  const edgeMaterial=own(new THREE.MeshBasicMaterial({color:'#d9f5ff',transparent:true,opacity:1,depthTest:false}));
  const edgeHandle=box('Hovered clip edge drag bar',0,0,RIBBON.frontDepth+.008,.006,RIBBON.width,.003,edgeMaterial);
  edgeHandle.renderOrder=12;edgeHandle.visible=false;
  // Flat tape wraps around these drums before returning behind the bed to fold.
  // End-mounted bearings leave the rear tangent completely open across all four lanes.
  for(const side of [-1,1]){
    const x=side*RIBBON.guideX,axle=new THREE.Mesh(own(new THREE.CylinderGeometry(.0035,.0035,.348,16)),metal);
    axle.name='Continuous end guide axle';axle.position.set(x,0,GUIDE.centerZ);group.add(axle);
    for(let lane=0;lane<4;lane++){
      const roller=new THREE.Mesh(own(new THREE.CylinderGeometry(GUIDE.radius,GUIDE.radius,.071,32)),metal);
      roller.name=(side<0?'Left':'Right')+' half-turn tape roller '+(lane+1);roller.userData.oddEndGuide=true;roller.position.set(x,laneHeight(lane),GUIDE.centerZ);group.add(roller);
    }
    for(const end of [-1,1]){
      box('End guide bearing seat',x,end*.174,GUIDE.centerZ-.022,.024,.016,.056,dark);
      const rimX=side*Math.sqrt(.851**2-.174**2);
      box('Rim-mounted end guide tie',(x+rimX)/2,end*.174,.211,Math.abs(rimX-x)+.018,.014,.024,dark);
    }
  }
  createTapeFolders(group,own,metal,dark);
  const tapeGuides=createTapeGuides(group,own,metal,dark);
  // The folder bank hangs from the end-roller bearings, outside both reel envelopes.
  for(const side of [-1,1]){
    const outerRear=GUIDE.centerZ-GUIDE.tapeRadius-FOLDERS.outerBack,railZ=outerRear-.012,railX=side*.706,rail=new THREE.Mesh(own(new THREE.CylinderGeometry(.003,.003,.348,12)),metal);
    rail.name='Outer folder bank mounting rail';rail.userData.oddReelSupport=true;rail.position.set(railX,0,railZ);group.add(rail);
    for(let lane=0;lane<4;lane++){
      const center=side*FOLDERS.centers[lane],profile=folderChannelProfile(side,lane),back=GUIDE.centerZ-GUIDE.tapeRadius+profile[Math.floor(profile.length/2)][5],mount=box('Outer folder housing rear attachment',(railX+center)/2,laneHeight(lane),railZ,Math.abs(railX-center)+.006,.005,.005,dark);mount.userData.oddReelSupport=true;
      const post=new THREE.Mesh(own(new THREE.CylinderGeometry(.0025,.0025,back-railZ+.001,10)),metal);post.rotation.x=Math.PI/2;post.position.set(center,laneHeight(lane),(back+railZ)/2);post.name='Connected folder shell rear standoff';post.userData.oddReelSupport=true;group.add(post);
    }
    for(const end of[-1,1]){
      const start=new THREE.Vector3(railX,end*.174,railZ),finish=new THREE.Vector3(side*RIBBON.guideX,end*.174,.205),delta=finish.clone().sub(start);
      const tie=new THREE.Mesh(own(new THREE.CylinderGeometry(.003,.003,delta.length(),12)),metal);tie.name='Folder bank to outer bearing brace';tie.userData.oddReelSupport=true;tie.position.copy(start).add(finish).multiplyScalar(.5);tie.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(tie);
    }
  }
  cap(1);cap(-1);
  const setArmFlaps=poses=>{for(const flap of armFlaps){const pose=poses?.[flap.side>0?1:0];flap.hinge.rotation.x=-flap.side*(pose?.flapOpen??0)*1.25;}};
  const hardwareStart=group.children.length;
  plaque('ODDIO',-.065,.72,.255,.42,.075,'#d9cda9','#263b30','focus');
  const remaining=plaque('48 LEFT',.265,.72,.255,.15,.064,'#263b30','#ddcea3','focus');
  const status=plaque('FEED AUDIO OR PRINT A BELL',0,.625,.255,.67,.035,'#263b30','#ddcea3','focus');
  const clipReverse=plaque('REV',.285,.505,.255,.10,.070,'#263b30','#ddcea3','reverse-clip');
  const clockEdit=plaque('',0,.505,.28,.34,.10,'#263b30','#ddcea3','seek');
  clockEdit.visible=false;if(plaqueSupports.has(clockEdit))plaqueSupports.get(clockEdit).visible=false;
  const names=[['◀','reverse'],['PLAY','play'],['STOP','stop'],['REC','record'],['FEED','upload']];
  const keys={};names.forEach(([label,action],i)=>{keys[action]=plaque(label,(i-2)*.158,.348,.255,.14,.076,action==='record'?'#b95130':'#d9cda9',action==='record'?'#f1dbb3':'#263b30',action);});
  [['LOOP','loop'],['SEW','sewing'],['BELL','bell'],['2D','console']].forEach(([label,action],i)=>{keys[action]=plaque(label,(i-1.5)*.17,.273,.255,.15,.055,'#263b30','#ddcea3',action);});
  const volumeMute=plaque('VOL',-.34,-.265,.255,.12,.055,'#d9cda9','#263b30','volume-mute');
  box('Page volume horizontal rail',0,-.265,.255,.43,.018,.013,dark,'volume-slide');
  box('Panel-seated volume rail bed',0,-.265,.247,.43,.018,.015,dark);
  const volumeFader=box('Page volume slider',0,-.265,.271,.052,.06,.028,dark,'volume-slide');
  const volumeMarker=box('Volume fader center mark',0,-.265,.287,.005,.038,.003,marking,'volume-slide');
  const volumeOutput=plaque('100%',.34,-.265,.255,.13,.055,'#263b30','#ddcea3','volume-value');
  const invisible=own(new THREE.MeshBasicMaterial({visible:false}));box('Page volume touch surface',0,-.265,.295,.43,.09,.002,invisible,'volume-slide');
  const modeLabel=plaque('VOICE 01 / MIX > EDIT',0,-.357,.255,.49,.05,'#263b30','#ddcea3','mode');
  const clipLabel=plaque('SELECT A WOVEN CLIP',0,-.414,.255,.53,.035,'#d9cda9','#263b30','name');
  ['GAIN','TONE','ECHO','RATE'].forEach((label,i)=>{
    const x=(i-1.5)*.14,y=-.49,key=['gain','tone','echo','rate'][i];
    const valueLabel=plaque(label,x,-.575,.255,.12,.05,'#263b30','#ddcea3','dial:'+key);
    const knobMaterial=own(new THREE.MeshStandardMaterial({color:COLORS[i],roughness:.36,metalness:.15})),knob=new THREE.Mesh(own(new THREE.CylinderGeometry(.048,.051,.028,32)),knobMaterial);knob.name='Enamel voice dial '+(i+1);knob.userData.paletteLane=i;knob.rotation.x=Math.PI/2;knob.position.set(x,y,.269);knob.userData.oddAction='dial:'+key;targets.push(knob);group.add(knob);
    const collar=new THREE.Mesh(own(new THREE.CylinderGeometry(.051,.051,.018,24)),metal);collar.rotation.x=Math.PI/2;collar.position.set(x,y,.249);group.add(collar);
    const needle=box('Dial pointer',x,y+.028,.2845,.005,.024,.003,marking);knobs.push({knob,needle,x,y,key,valueLabel,label});
  });
  const counters={};['start','in','out'].forEach((key,i)=>{counters[key]=mode(plaque(key.toUpperCase(),(i-1)*.18,-.64,.255,.16,.055,'#263b30','#ddcea3','field:'+key),'edit');});
  mode(plaque('DRAG DIALS / TAP FOR A VALUE',0,-.68,.255,.50,.037,'#263b30','#ddcea3','focus'),'mix');
  [['HEAR','audition'],['COPY','copy'],['CUT','remove'],['UNDO','undo']].forEach(([label,action],i)=>mode(plaque(label,(i-1.5)*.14,-.715,.255,.12,.05,'#d9cda9','#263b30',action),'edit'));
  group.children.slice(hardwareStart).forEach(mesh=>{mesh.position.z+=.024;});
  const instruments=createAnalogInstruments(group,own,metal,dark,cream,targets);
  const trackMeters=createTrackMeters(group,own,metal,dark,targets);
  const shuttle=createShuttleControls(group,own,metal,dark,plaque,targets);
  const transportKeys=createTransportControls(group,own,metal,dark,plaque);
  box('Central playback line',0,0,TRACK_MUTE.playheadZ,.008,.365,.008,metal,'seek');
  const selectors=[],selectorColors=['#173654','#144a43','#63501c','#4b2b5f'];
  for(let lane=0;lane<4;lane++){
    const hinge=new THREE.Group();hinge.name='Voice '+(lane+1)+' hinged selector';hinge.position.set(-.010,laneHeight(lane),.278);group.add(hinge);
    const barrel=new THREE.Mesh(own(new THREE.CylinderGeometry(.010,.010,.034,12)),metal);barrel.position.x=.004;hinge.add(barrel);
    const neck=new THREE.Mesh(own(new THREE.BoxGeometry(.014,.017,.006)),dark);neck.position.set(-.008,0,0);hinge.add(neck);
    const key=plaque('0'+(lane+1),0,0,0,.064,.043,selectorColors[lane],'#f5df9b','lane:'+lane);group.remove(key);hinge.add(key);key.position.set(-.037,0,.004);
    const lensMaterial=own(new THREE.MeshStandardMaterial({color:COLORS[lane],emissive:COLORS[lane],emissiveIntensity:.3,roughness:.25}));
    const lens=new THREE.Mesh(own(new THREE.SphereGeometry(.006,12,8)),lensMaterial);lens.scale.z=.5;lens.position.set(-.014,0,.013);lens.userData.oddAction='lane:'+lane;targets.push(lens);hinge.add(lens);selectors.push({hinge,lens,key});
  }
  const destinationColors=['#304e78','#59416e','#763e50','#245d60'],laneKeys=[];
  createSelectorRail(group,own,metal,-1);
  for(let lane=0;lane<4;lane++){
    const hinge=new THREE.Group();hinge.name='Move clip to voice '+(lane+1);hinge.position.set(-.700,laneHeight(lane),.279);group.add(hinge);
    const key=plaque('0'+(lane+1),0,0,0,.078,.045,destinationColors[lane],'#fff2c9','assign:'+lane);group.remove(key);hinge.add(key);key.position.set(.043,0,.004);
    key.userData.textAlignX=.27;paintPlaque(key,'0'+(lane+1));
    const arrow=new THREE.Group();arrow.name='Magnetic direction arrow';arrow.position.set(.065,0,.013);hinge.add(arrow);const material=own(new THREE.MeshStandardMaterial({color:'#e8fbef',emissive:'#9bded8',emissiveIntensity:.35,roughness:.4}));
    for(const[x,y,rotation,length]of[[-.002,0,0,.025],[.005,.004,-Math.PI/4,.012],[.005,-.004,Math.PI/4,.012]]){const part=new THREE.Mesh(own(new THREE.BoxGeometry(length,.0025,.002)),material);part.position.set(x,y,0);part.rotation.z=rotation;part.userData.oddAction='assign:'+lane;arrow.add(part);targets.push(part);}
    const barrel=new THREE.Mesh(own(new THREE.CylinderGeometry(.005,.005,.029,12)),metal);barrel.name='Destination tab hinge';hinge.add(barrel);
    laneKeys.push({hinge,key,arrow,material,spring:{angle:0,velocity:0}});
  }
  const trackMute=createTrackMute(group,own,metal,dark,plaque,targets);
  const atelier=createMechanicalAtelier(group,own,metal,dark);
  let priorClips=new Map();const removedClips=new Map();
  function ghostOf(clip){
    // Retain only a tiny visual envelope for unsewing, never another PCM buffer.
    const data=new Float32Array(256),source=clip.buffer.getChannelData(0),span=clip.out-clip.in;
    for(let i=0;i<data.length;i++){const fraction=clip.reversed?1-(i+1)/data.length:i/data.length,a=Math.floor((clip.in+fraction*span)*clip.buffer.sampleRate),b=Math.min(source.length,Math.ceil((clip.in+(fraction+1/data.length)*span)*clip.buffer.sampleRate));for(let j=a;j<b;j+=Math.max(1,Math.floor((b-a)/16)))data[i]=Math.max(data[i],Math.abs(source[j]));}
    return {...clip,blendRange:(()=>{const r=blendWindow(clip,[...priorClips.values()]);return r?{start:r.start,end:r.end}:null;})(),blendSide:(()=>{const r=blendWindow(clip,[...priorClips.values()]);return r?.peer&&clip.id>r.peer.id?1:0;})(),blended:clip.links?.some(l=>l.mode==='blend'),in:0,out:span,reversed:false,buffer:{duration:span,sampleRate:data.length/span,getChannelData:()=>data}};
  }
  function syncClips(clips,options){
    const next=new Map(clips.map(c=>[c.id,{...c}]));
    for(const [id,c]of priorClips){const n=next.get(id);if(!n||n.start!==c.start||n.lane!==c.lane||n.in!==c.in||n.out!==c.out||n.rate!==c.rate||n.reversed!==c.reversed||JSON.stringify(n.links||[])!==JSON.stringify(c.links||[])){removedClips.set(id,ghostOf(c));if(removedClips.size>32)removedClips.delete(removedClips.keys().next().value);}}
    priorClips=next;atelier.sync(clips,options);
  }
  let enabled=true,paused=false,heldTapePosition=null;
  let previousPosition=NaN,previousVolume=-1,disposed=false,tabLift=0,lastReduced=false;
  let editedMesh=null,editedDisplay=null;
  const numericMesh=key=>key==='volume'?volumeOutput:key==='seek'?clockEdit:key.startsWith('lane-max:')?status:key==='start'||key==='in'||key==='out'?counters[key]:knobs.find(item=>item.key===key)?.valueLabel;
  function setNumericEdit(key,state){
    const target=numericMesh(key);
    if(editedMesh&&(!state||editedMesh!==target)){
      delete editedMesh.userData.numericEdit;editedMesh.userData.display=editedDisplay;paintPlaque(editedMesh,editedDisplay);
      if(editedMesh===clockEdit)clockEdit.visible=false;
      editedMesh=null;editedDisplay=null;
    }
    if(!state)return;
    const mesh=target;
    if(!mesh)return;
    if(mesh!==editedMesh)editedDisplay=mesh.userData.display??mesh.userData.retroText;
    editedMesh=mesh;mesh.userData.numericEdit=state;mesh.userData.display=null;paintPlaque(mesh,state.prefix+state.value+state.suffix);
    if(mesh===clockEdit)clockEdit.visible=true;
  }
  function setDisplay(mesh,label,foreground='#ddcea3'){
    if(mesh.userData.numericEdit){const edit=mesh.userData.numericEdit;label=edit.prefix+edit.value+edit.suffix;}
    if(mesh.userData.display===label&&!mesh.userData.numericEdit)return;mesh.userData.display=label;
    if(mesh.userData.setDisplay){mesh.userData.setDisplay(label,foreground);return;}
    paintPlaque(mesh,label);
  }
  function setMode(value){panelMode=value==='edit'?'edit':'mix';for(const [key,meshes]of Object.entries(modes))meshes.forEach(mesh=>{mesh.visible=key===panelMode;});}
  function update(dt,{position=0,moving=false,reduced=false,clips=[],lane=0,volume=1,level=0,laneLevels=[],hoverLane=-1,hoverMainMeter=false,lanes=[],selected=null,statusText="",muted=false,siteMuted=false,loop=false,recording=false,pending=false,playing=false,direction=1,preview=null,hoverEdge=null,capture=null,interactionActive=false}={}){
    if(disposed)return;lastReduced=reduced;const audioPosition=position,feed=atelier.update(dt,{position,reduced,blocked:interactionActive||moving,capture});if(interactionActive&&heldTapePosition!==null)position=heldTapePosition;else{heldTapePosition=null;position=feed.position;}
    const radii=reelRadii(position),manufacturing=atelier.clipJob,muteChanged=trackMute.update(dt,lanes,reduced,position,appearance.contrast);
    
    tapeGuides.update(position);
    const extra=trackMute.amounts.map(amount=>muteArc(TRACK_MUTE.halfSpan,amount)-TRACK_MUTE.halfSpan),average=extra.reduce((a,b)=>a+b,0)/4;
    reels.forEach(reel=>{const radius=reel.index?radii.supply:radii.takeup,sign=reel.index?-1:1;reel.coils.forEach((coil,i)=>{const r=Math.sqrt(Math.max(RIBBON.coreRadius**2,radius**2-.004*extra[i]));coil.scale.set(r,1,r);coil.rotation.y=sign*(extra[i]-average)/Math.max(radius,.1);});reel.rotor.rotation.z=reelAngle(position,!reel.index)+sign*average/Math.max(radius,.1);});
    for(const ribbon of ribbons){
      let ownClips=clips.filter(c=>c.lane===ribbon.lane).map(c=>stableBlendAppearance(c,clips));
      if(capture?.lane===ribbon.lane&&capture.seconds>=.1){
        const seconds=Math.floor(capture.seconds*10)/10,data=capture.peaks?.length?capture.peaks.slice(0,Math.max(1,Math.ceil(seconds*8))):new Float32Array([.025]);
        ownClips.push({id:capture.id,name:'Recording…',lane:capture.lane,start:capture.start,in:0,out:seconds,rate:1,links:[],visualManufacture:true,recordingPreview:true,buffer:{duration:seconds,sampleRate:data.length/seconds,getChannelData:()=>data}});
      }
      const queued=atelier.pendingJobs;
      const activeIds=new Set(manufacturing?.ids||[]),pendingWrites=new Set(queued.filter(j=>j.kind!=='delete').flatMap(j=>j.ids));ownClips=ownClips.filter(c=>c.visualGhost||Boolean(c.preview)||activeIds.has(c.id)||!pendingWrites.has(c.id));
      for(const pending of queued){if(!['delete','move','retie'].includes(pending.kind))continue;for(const id of pending.ids){if(activeIds.has(id))continue;const ghost=removedClips.get(id);if(ghost?.lane===ribbon.lane)ownClips.push({...ghost,id:id+':waiting',links:[],visualManufacture:true});}}
      if(manufacturing){
        const removing=['delete','move','retie'].includes(manufacturing.kind),writing=manufacturing.kind!=='delete',removeFraction=feed.removeFraction??feed.fraction,writeFraction=feed.writeFraction??feed.fraction;
        if(writing)ownClips=ownClips.map(c=>activeIds.has(c.id)?{...c,blendRange:(()=>{const range=blendWindow(c,clips),shift=feed.base+(feed.stations?.write??.12)*15/(RIBBON.halfSpan*2)-c.start;return range?{start:range.start+shift,end:range.end+shift}:null;})(),blendSide:(()=>{const r=blendWindow(c,clips);return r?.peer&&c.id>r.peer.id?1:0;})(),blended:c.links?.some(l=>l.mode==='blend'),links:[],visualManufacture:true,start:feed.base+(feed.stations?.write??.12)*15/(RIBBON.halfSpan*2),in:c.reversed?c.out-(c.out-c.in)*writeFraction:c.in,out:c.reversed?c.out:c.in+(c.out-c.in)*writeFraction}:c).filter(c=>c.out-c.in>.0001);
        if(removing)for(const id of manufacturing.ids){const ghost=removedClips.get(id);if(ghost?.lane===ribbon.lane&&removeFraction<1){const consumed=(ghost.out-ghost.in)*removeFraction,at=feed.base+(feed.stations?.remove??-.12)*15/(RIBBON.halfSpan*2),start=ghost.start+(at-ghost.start)*(feed.arrival??1);ownClips.push({...ghost,id:id+':unpick',links:[],visualManufacture:true,start:start+consumed/ghost.rate,in:ghost.in+consumed});}}
      }
      const signature=ownClips.map(c=>[c.id,c.start,c.in,c.out,c.rate,c.reversed,c.name,c.preview,c.visualGhost,JSON.stringify(c.visualBand||null),c.blended,c.blendSide,JSON.stringify(c.blendRange||null),JSON.stringify(c.links||[])].join(':')).join('|')+':'+selected+':'+lane+':'+COLORS[ribbon.lane]+':'+appearance.highlightColor+':'+appearance.stackBlends+':'+appearance.tickSpacingMs+':'+Boolean(lanes[ribbon.lane]?.muted);
      if(signature!==ribbon.signature){ribbon.signature=signature;drawFabric(ribbon.canvas,ribbon.lane,ownClips,COLORS,duration,selected,{...appearance,muted:Boolean(lanes[ribbon.lane]?.muted),selectedLane:lane===ribbon.lane},ribbon.glowCanvas);ribbon.texture.needsUpdate=ribbon.glowTexture.needsUpdate=true;}
      const needShape=moving||muteChanged[ribbon.lane]||!ribbon.flex.settled||position!==previousPosition;ribbon.flex.step(dt,moving,position+ribbon.lane*.3,reduced);
      if(needShape){
        const positions=ribbon.geometry.attributes.position,uv=ribbon.geometry.attributes.uv;
        const sample=(t,flex=0)=>{const p=ribbonPoint(t,position,flex,ribbon.lane);if(t>=.30&&t<=.70)guidedMutePoint(p,trackMute.amounts[ribbon.lane]);return p;};
        for(let row=0;row<=rows;row++){
          const p=sample(row/rows,ribbon.flex.sample(row/rows));ribbon.samples[row]=p;
          const previous=ribbon.samples[row-1];ribbon.arc[row]=row?ribbon.arc[row-1]+Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z):0;
        }
        const leftRow=Math.ceil(.30*rows),rightRow=Math.floor(.70*rows),speed=RIBBON.halfSpan*2/RIBBON.secondsInView;
        const materialTime=row=>trackMute.amounts[ribbon.lane]>0?position+(ribbon.arc[row]-ribbon.arc[rows/2])/speed:ribbon.samples[row].seconds;
        for(let row=0;row<=rows;row++){
          const t=row/rows,p=ribbon.samples[row];
          const before=sample(Math.max(0,t-.0001)),after=sample(Math.min(1,t+.0001));
          tangent.set(after.x-before.x,after.y-before.y,after.z-before.z).normalize();
          widthVector.set(p.widthX||0,p.widthY,p.widthZ);widthVector.addScaledVector(tangent,-widthVector.dot(tangent)).normalize();foldNormal.crossVectors(tangent,widthVector).normalize();
          for(let col=0;col<=columns;col++){
            const u=col/columns,index=row*(columns+1)+col,folded=foldedOffset(u,p.fold),offset=folded.across;
            const curl=reduced?0:p.free*(.0018*Math.cos(u*Math.PI*2)+.0012*Math.abs(u-.5)*2*Math.sin(t*33+ribbon.lane));
            positions.setXYZ(index,p.x+widthVector.x*offset+foldNormal.x*folded.lift,p.y+widthVector.y*offset+foldNormal.y*folded.lift,p.z+widthVector.z*offset+foldNormal.z*folded.lift+curl);
          }
        }
        // A fold or reel tilt changes the path length across the tape's width.
        // Measure each rendered column so motifs retain their material spacing.
        for(let row=1;row<=rows;row++){
          for(let col=0;col<=columns;col++){
            const index=row*(columns+1)+col,previous=index-(columns+1);
            ribbon.surfaceArc[index]=ribbon.surfaceArc[previous]+Math.hypot(positions.getX(index)-positions.getX(previous),positions.getY(index)-positions.getY(previous),positions.getZ(index)-positions.getZ(previous));
          }
        }
        const leftTime=materialTime(leftRow),rightTime=materialTime(rightRow);
        for(let row=0;row<=rows;row++){
          const t=row/rows;
          const bedTime=materialTime(row);
          for(let col=0;col<=columns;col++){
            const index=row*(columns+1)+col;
            let seconds=bedTime;
            if(t<.30)seconds=leftTime-(ribbon.surfaceArc[leftRow*(columns+1)+col]-ribbon.surfaceArc[index])/speed;
            if(t>.70)seconds=rightTime+(ribbon.surfaceArc[index]-ribbon.surfaceArc[rightRow*(columns+1)+col])/speed;
            uv.setXY(index,col/columns,1-(seconds-FABRIC_TIME.start)/FABRIC_TIME.span);
          }
        }
        positions.needsUpdate=uv.needsUpdate=true;ribbon.geometry.computeVertexNormals();
      }
      ribbon.material.emissive.set('#fff');ribbon.material.emissiveIntensity=contrastGain(appearance.contrast);
    }
    atelier.renderSurface((x,lane)=>sampleSurface(x,lane,position),dt,reduced);
    edgeHandle.visible=false;
    if(hoverEdge?.clip&&hoverEdge.band){
      const edgeLane=hoverEdge.clip.lane,edgeTime=hoverEdge.time,amount=trackMute.amounts[edgeLane],left=position+(amount>0?muteArc(-RIBBON.halfSpan,amount):-RIBBON.halfSpan)*RIBBON.secondsInView/(2*RIBBON.halfSpan),right=position+(amount>0?muteArc(RIBBON.halfSpan,amount):RIBBON.halfSpan)*RIBBON.secondsInView/(2*RIBBON.halfSpan);
      if(edgeTime>=left&&edgeTime<=right){
        let lo=-RIBBON.halfSpan,hi=RIBBON.halfSpan;
        for(let i=0;i<18;i++){const mid=(lo+hi)/2,at=position+(amount>0?muteArc(mid,amount):mid)*RIBBON.secondsInView/(2*RIBBON.halfSpan);if(at<edgeTime)lo=mid;else hi=mid;}
        const x=(lo+hi)/2,surface=sampleSurface(x,edgeLane,position),band=hoverEdge.band;
        edgeHandle.position.set(surface.x,laneHeight(edgeLane)+RIBBON.width*(.5-band.top-band.height/2),surface.z+.008);
        edgeHandle.scale.y=Math.max(.25,band.height);edgeMaterial.color.set(hoverEdge.edge==='start'?'#ed483a':appearance.highlightColor).multiplyScalar(contrastGain(appearance.contrast));edgeMaterial.opacity=Math.min(1,.55+.16*contrastGain(appearance.contrast));edgeHandle.visible=true;
      }
    }
    setArmFlaps(atelier.state.arms);
    if(volume!==previousVolume){volumeFader.position.x=-.20+Math.min(2,volume)*.20;volumeMarker.position.x=volumeFader.position.x;setDisplay(volumeOutput,Math.round(volume*100)+'%');previousVolume=volume;}
    instruments.update(dt,audioPosition,level,reduced,appearance.contrast,muted||siteMuted,hoverMainMeter);
    trackMeters.update(dt,{levels:laneLevels,lanes,playing,muted,siteMuted,reduced,contrast:appearance.contrast,hoverLane});
    tabLift=reduced?(atelier.clearTabs?1:0):tabLift+((atelier.clearTabs?1:0)-tabLift)*(1-Math.exp(-Math.max(0,dt)*14));
    selectors.forEach(({hinge,lens},i)=>{const rest=i===lane?0:.18;hinge.rotation.y=rest+(Math.PI/2-rest)*tabLift;lens.material.emissiveIntensity=(i===lane?1.22:.139)*contrastGain(appearance.contrast);});
    const c=clips.find(c=>c.id===selected),settings=lanes[lane]||{};
    setDisplay(modeLabel,'VOICE 0'+(lane+1)+' / '+(panelMode==='mix'?'MIX > EDIT':'EDIT > MIX'));
    setDisplay(clipLabel,c?c.name.slice(0,36):'SELECT A WOVEN CLIP');
    const stock=clips.length>=LIMITS.clips?'RACK FULL / 48 STRIPS':clips.length+' / 48 · '+Math.round(sourceSeconds(clips))+'/120s';
    setDisplay(remaining,String(Math.max(0,LIMITS.clips-clips.length))+'\nCLIPS LEFT');
    setDisplay(status,(preview?(preview.valid?preview.edge?(preview.stretch?'STRETCH':'TRIM')+' '+preview.edge.toUpperCase()+' / '+(preview.clip.reversed?'REV ':'FWD ')+preview.clip.rate.toFixed(2)+'x / RELEASE TO SET':(preview.snapped?'SNAPPED / ':'')+'RELEASE TO '+(preview.copy?'COPY':'MOVE'):'NO ROOM / RELEASE TO CANCEL'):atelier.label||stock+' / '+(statusText||'ALT = COPY')).slice(0,80));
    const active=clips.find(c=>c.id===selected),clipReversed=Boolean(active?.reversed);clipReverse.userData.oddDisabled=!active;clipReverse.userData.pressed=clipReversed;clipReverse.position.z=PANEL.controlZ-(clipReversed?.003:0);paintPlaque(clipReverse,'REV');clipReverse.userData.plaqueFace.emissiveIntensity=(clipReversed?.65:.35)*contrastGain(appearance.contrast);
    keys.sewing.userData.pressed=appearance.sewingAnimations!==false;paintPlaque(keys.sewing,'SEW');
    volumeMute.userData.pressed=muted||siteMuted;paintPlaque(volumeMute,'VOL');
    setDisplay(keys.loop,loop?'LOOP ON':'LOOP');setDisplay(keys.record,recording?'PRINT':pending?'ALLOW MIC':'REC');
    setDisplay(keys.play,playing&&direction>0?'Ⅱ':'▶');setDisplay(keys.reverse,playing&&direction<0?'Ⅱ':'◀');const podState={playing,direction,recording,pending,loop,muted,siteMuted};shuttle.updateState(podState);transportKeys.updateState(podState);
    for(const [key,mesh]of Object.entries(counters))setDisplay(mesh,key.toUpperCase()+'\n'+(c?c[key].toFixed(2):'--'));
    laneKeys.forEach(({hinge,key,arrow,material,spring},i)=>{const current=c?.lane===i,angle=current||!c?0:i<c.lane?Math.PI/2:-Math.PI/2;arrow.rotation.z=stepMagneticArrow(spring,angle,dt,reduced);hinge.rotation.y=current?.18:-.12;material.emissiveIntensity=(current||!c?.3:.5)*contrastGain(appearance.contrast);key.userData.oddDisabled=current||!c;arrow.children.forEach(m=>m.userData.oddDisabled=current||!c);});
    knobs.forEach(item=>{const raw=item.key==='rate'?(c?.rate??1):item.key==='gain'?(c?.gain??1):settings[item.key]??0,value=item.key==='rate'?(raw-.5)/1.5:item.key==='tone'?(raw-200)/17800:raw;const angle=-Math.PI*.75+Math.min(1,value)*Math.PI*1.5;item.needle.position.set(item.x+Math.sin(angle)*.028,item.y+Math.cos(angle)*.028,.3085);item.needle.rotation.z=-angle;setDisplay(item.valueLabel,item.label+'\n'+(item.key==='tone'?(raw/1000).toFixed(1)+'k':item.key==='rate'?raw.toFixed(2)+'x':Math.round(raw*100)+'%'));});
    previousPosition=position;
  }
  function sampleSurface(x,lane,position=previousPosition){const t=.30+.40*(x+RIBBON.halfSpan)/(RIBBON.halfSpan*2),p=ribbonPoint(t,position,ribbons[lane].flex.sample(t),lane);guidedMutePoint(p,trackMute.amounts[lane]);p.z-=lastReduced?0:.0018*p.free;return p;}
  setMode("mix");update(0);
  return {group,power,setNumericEdit,configure(settings){appearance={...appearance,...settings};const layout=resolveAddonLayout(appearance);instruments.place(layout.meter);trackMeters.place(layout.trackMeters);shuttle.place(layout.shuttle);transportKeys.place(layout.transport);atelier.configure(settings);COLORS.forEach((c,i)=>{COLORS[i]=settings['color'+(i+1)]||c;selectors[i].lens.material.color.set(COLORS[i]);selectors[i].lens.material.emissive.set(COLORS[i]);reels.forEach(reel=>{reel.coils[i].material.color.set(COLORS[i]);reel.coils[i].userData.windingMaterial.color.set(COLORS[i]);});knobs[i].knob.material.color.set(COLORS[i]);});plaques.forEach(mesh=>paintPlaque(mesh,mesh.userData.retroText));marking.color.set(RETRO.letter).multiplyScalar(.55*contrastGain(appearance.contrast));cream.emissiveIntensity=.12*contrastGain(appearance.contrast);instruments.configure(COLORS,appearance);trackMeters.configure(COLORS,appearance);shuttle.configure(COLORS,appearance.contrast,appearance);transportKeys.configure(COLORS,appearance.contrast,appearance);},previewJam:(seconds,position,lane)=>atelier.preview(seconds,position,lane),unstick:()=>atelier.unstick(),get tapePosition(){return previousPosition;},holdTape(){heldTapePosition=previousPosition;atelier.park();setArmFlaps();},pauseWork(){heldTapePosition=null;atelier.park();setArmFlaps();},cancelWork(){heldTapePosition=null;atelier.cancel();setArmFlaps();},get meterRanges(){return trackMeters.maxRanges;},get meterStates(){return trackMeters.states;},get mainMeterState(){return instruments.screwState;},get podStates(){return {transport:transportKeys.getState(),shuttle:shuttle.getState()};},get targets(){return [...targets.filter(mesh=>mesh.visible&&!mesh.userData.oddDisabled),...atelier.targets];},update,setMode,syncClips,get workState(){return atelier.state;},setEnabled(value){enabled=value;if(enabled&&!paused)atelier.resume();else{atelier.suspend();setArmFlaps();}},suspend(){paused=true;heldTapePosition=null;edgeHandle.visible=false;atelier.suspend();setArmFlaps();},resume(){paused=false;if(enabled)atelier.resume();},get mode(){return panelMode;},surfaceAtX:sampleSurface,timeAtX(x,lane){return previousPosition+(trackMute.amounts[lane]>0?muteArc(x,trackMute.amounts[lane]):x)*RIBBON.secondsInView/(2*RIBBON.halfSpan);},get muteAmounts(){return trackMute.amounts.slice();},get ribbonCount(){return ribbons.length;},dispose(){if(disposed)return;disposed=true;atelier.dispose();shuttle.dispose();transportKeys.dispose();power.dispose();group.removeFromParent();priorClips.clear();removedClips.clear();resources.forEach(resource=>resource.dispose());resources.clear();targets.length=0;}};
}

