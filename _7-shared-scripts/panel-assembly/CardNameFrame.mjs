import * as THREE from 'three';

const SIZE=512;
const printable=material=>/ (front|back) print$/i.test(material?.name||'');
const bound=(v,min,max,otherwise)=>Number.isFinite(Number(v))?THREE.MathUtils.clamp(Number(v),min,max):otherwise;
const colorOr=(value,fallback)=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const titleOr=(value,fallback)=>typeof value==='string'&&value.trim()&&value.length<=100?value.trim().replace(/\s+/g,' '):fallback;
const modeOr=(value,fallback)=>value==='text'||value==='image'?value:fallback;
function textColor(base){const color=new THREE.Color(base);const luminance=.2126*color.r+.7152*color.g+.0722*color.b;return luminance>.179?'#000000':'#ffffff';}
function fitLines(ctx,title,maxWidth,maxHeight){const words=title.split(/\s+/).filter(Boolean),font='600';
  for(let size=64;size>=10;size--){ctx.font=`${font} ${size}px "Segoe UI", Arial, sans-serif`;const lines=[];let current='';
    for(const word of words){const candidate=current?`${current} ${word}`:word;if(ctx.measureText(candidate).width<=maxWidth){current=candidate;continue;}if(current)lines.push(current);current=word;if(ctx.measureText(word).width>maxWidth){current='';for(const char of word){const next=current+char;if(ctx.measureText(next).width>maxWidth&&current){lines.push(current);current=char;}else current=next;}}}
    if(current)lines.push(current);if(lines.length*size*1.12<=maxHeight&&lines.every(line=>ctx.measureText(line).width<=maxWidth))return{lines,size};
  }
  ctx.font=`${font} 10px "Segoe UI", Arial, sans-serif`;return{lines:[title],size:10};
}
function squircle(ctx,x,y,w,r){const q=Math.min(r,w/2),z=x+w;ctx.beginPath();ctx.moveTo(x+q,y);ctx.lineTo(z-q,y);ctx.quadraticCurveTo(z,y,z,y+q);ctx.lineTo(z,y+w-q);ctx.quadraticCurveTo(z,y+w,z-q,y+w);ctx.lineTo(x+q,y+w);ctx.quadraticCurveTo(x,y+w,x,y+w-q);ctx.lineTo(x,y+q);ctx.quadraticCurveTo(x,y,x+q,y);ctx.closePath();}
function materialFor(record){const list=Array.isArray(record.mesh.material)?record.mesh.material:[record.mesh.material];const index=list.findIndex(printable);if(index<0||!list[index].map)throw new Error(`Missing card print on ${record.mesh.name}`);return{list,index,material:list[index]};}
function sampleColor(image){try{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d');c.drawImage(image,0,0,1,1);const p=c.getImageData(0,0,1,1).data;return`#${[0,1,2].map(i=>Math.round(p[i]*.6+12).toString(16).padStart(2,'0')).join('')}`;}catch{return'#283443';}}
function loadImage(data){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Artwork image could not be decoded'));image.src=data;});}
function canvasTexture(canvas,source){const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=source.colorSpace;texture.flipY=source.flipY;texture.wrapS=source.wrapS;texture.wrapT=source.wrapT;texture.magFilter=source.magFilter;texture.minFilter=source.minFilter;texture.anisotropy=source.anisotropy;texture.needsUpdate=true;return texture;}
function uvSpan(base){let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;for(let i=0;i<base.length;i+=2){u0=Math.min(u0,base[i]);u1=Math.max(u1,base[i]);v0=Math.min(v0,base[i+1]);v1=Math.max(v1,base[i+1]);}return Math.min(u1-u0,v1-v0);}
const surpriseColors=['#254d67','#65426e','#40614c','#785236','#3b507e','#70454b'];
function drawPlaceholder(ctx,x,y,w,variant){
  ctx.fillStyle=surpriseColors[variant];ctx.fillRect(x,y,w,w);ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=w*.025;
  for(let i=-3;i<6;i++){ctx.beginPath();ctx.moveTo(x+i*w*.28,y);ctx.lineTo(x+(i+3)*w*.28,y+w);ctx.stroke();}
  ctx.beginPath();ctx.arc(SIZE/2,SIZE/2,w*.29,0,Math.PI*2);ctx.fillStyle='rgba(8,17,30,.72)';ctx.fill();ctx.strokeStyle='#e7e5d2';ctx.lineWidth=w*.013;ctx.stroke();
  ctx.fillStyle='#f5f1d8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${w*.40}px "Segoe UI",sans-serif`;ctx.fillText('?',SIZE/2,SIZE/2-w*.01);
  ctx.font=`600 ${w*.075}px "Segoe UI",sans-serif`;ctx.fillText(String(variant+1).padStart(2,'0'),SIZE/2,y+w*.9);
}

/** Slot-bound print canvases: content changes without moving any authored card mesh or pivot. */
export class CardNameFrame{
  constructor({motion,graphics}){
    this.motion=motion;this.graphics=graphics;this.entries=new Map();this.content=new Map();this.order=[];this.disposed=false;this.contrastGain=1;
    for(const [id,pair] of graphics.prints){const panel=motion.panels.get(id);if(!panel?.record.geometry)continue;
      const faces={};for(const side of ['front','back']){const record=pair[side],{list,index,material:original}=materialFor(record),source=original.map,image=source.source?.data||source.image;
        if(!image?.width||!image?.height)throw new Error(`Undecoded card art: ${id}/${side}`);
        const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const texture=canvasTexture(canvas,source),mirrored=texture.clone(),material=new THREE.MeshBasicMaterial({map:texture,color:0xffffff,side:original.side,toneMapped:false});material.name=original.name;material.map=texture;material.needsUpdate=true;
        texture.center.set(.5,.5);mirrored.center.set(.5,.5);mirrored.repeat.x=-1;
        const originalBinding=record.mesh.material;record.mesh.material=Array.isArray(originalBinding)?list.map((m,i)=>i===index?material:m):material;
        faces[side]={record,canvas,ctx:canvas.getContext('2d',{alpha:false}),texture,mirrored,material,originalBinding,sourceImage:image,span:uvSpan(record.base)};}
      const title=panel.record.appName||id.replace(/^panel-/,'').replaceAll('-',' ');
      const edges=[];for(const mesh of panel.meshes){const source=mesh.material,materials=Array.isArray(source)?source:[source],index=materials.findIndex(m=>/ edge$/i.test(m?.name||''));if(index<0)continue;const material=materials[index].clone();mesh.material=Array.isArray(source)?materials.map((m,i)=>i===index?material:m):material;edges.push({mesh,source,material});}
      this.content.set(id,{id,title,defaultTitle:title,iconMode:'image',nameMode:'text',iconImage:faces.front.sourceImage,nameImage:faces.back.sourceImage,originalIconImage:faces.front.sourceImage,originalNameImage:faces.back.sourceImage,iconData:null,nameData:null,frontColor:sampleColor(faces.front.sourceImage),backColor:sampleColor(faces.back.sourceImage),edgeColor:'#283443',linkedColors:true,iconScale:/adobe/i.test(title)?.68:.78,nameScale:.94,padding:.04});
      this.entries.set(id,{id,panel,faces,edges,contentId:id,lastWeight:NaN,dirty:true});this.order.push(id);
    }
    if(this.entries.size!==motion.manifest.squarePanels.length)throw new Error('Incomplete artwork frame registry');
    // Physical slots are ordered as the viewer sees them: top to bottom, then left to right.
    this.order.sort((a,b)=>{const pa=this.entries.get(a).panel.record.pivotWorld,pb=this.entries.get(b).panel.record.pivotWorld;return Math.abs(pa[2]-pb[2])>.01?pb[2]-pa[2]:pa[0]-pb[0];});
    const center=this.order[10],media=[...this.content.values()].find(c=>c.title==='Adobe Media Encoder')?.id;
    if(center&&media&&center!==media){this.entries.get(center).contentId=media;this.entries.get(media).contentId=center;}
    this.update();
  }
  getState(){return{schemaVersion:1,order:this.order.map(id=>this.entries.get(id).contentId),slots:this.order.map((slotId,index)=>({index,slotId,x:this.entries.get(slotId).panel.record.pivotWorld[0],y:this.entries.get(slotId).panel.record.pivotWorld[2],contentId:this.entries.get(slotId).contentId})),content:Object.fromEntries([...this.content].map(([id,c])=>[id,{title:c.title,iconMode:c.iconMode,nameMode:c.nameMode,iconData:c.iconData,nameData:c.nameData,frontColor:c.frontColor,backColor:c.backColor,edgeColor:c.edgeColor,linkedColors:c.linkedColors,iconScale:c.iconScale,nameScale:c.nameScale,padding:c.padding}]))};}
  async setState(state){if(!state||state.schemaVersion!==1||!Array.isArray(state.order)||state.order.length!==this.order.length||new Set(state.order).size!==this.order.length||state.order.some(id=>!this.content.has(id)))throw new TypeError('Invalid card arrangement');
    if(JSON.stringify(state).length>20e6)throw new RangeError('Card artwork exceeds the 20 MB portable limit');
    const prepared=[];for(const [id,options]of Object.entries(state.content||{})){if(!this.content.has(id))continue;for(const side of ['icon','name']){const data=options?.[`${side}Data`];if(data!==null&&data!==undefined){if(typeof data!=='string'||data.length>4e6||!/^data:image\/(png|jpeg|webp);base64,/i.test(data))throw new TypeError(`Invalid ${side} image for ${id}`);prepared.push([id,side,data,await loadImage(data)]);}}}
    for(const [id,options]of Object.entries(state.content||{}))if(this.content.has(id)){const c=this.content.get(id);if(options?.title===undefined)c.title=c.defaultTitle;this.setContentOptions(id,options,false);if(options?.iconMode===undefined)c.iconMode='image';if(options?.nameMode===undefined)c.nameMode=options?.nameData?'image':'text';}
    for(const [id,side,data,image]of prepared){const c=this.content.get(id);c[`${side}Data`]=data;c[`${side}Image`]=image;}
    for(const [id,options]of Object.entries(state.content||{}))if(this.content.has(id))for(const side of ['icon','name'])if(options?.[`${side}Data`]===null){const c=this.content.get(id);c[`${side}Data`]=null;c[`${side}Image`]=c[side==='icon'?'originalIconImage':'originalNameImage'];}
    state.order.forEach((contentId,i)=>{this.entries.get(this.order[i]).contentId=contentId;});this.invalidate();this.update();
  }
  setContentOptions(id,options={},redraw=true){const c=this.content.get(id);if(!c)return false;
    const before=[c.title,c.iconMode,c.nameMode,c.linkedColors,c.frontColor,c.backColor,c.edgeColor,c.iconScale,c.nameScale,c.padding];
    c.title=titleOr(options.title,c.title);c.iconMode=modeOr(options.iconMode,c.iconMode);c.nameMode=modeOr(options.nameMode,c.nameMode);
    c.linkedColors=options.linkedColors===undefined?c.linkedColors:Boolean(options.linkedColors);
    c.frontColor=colorOr(options.frontColor,c.frontColor);c.backColor=colorOr(options.backColor,c.backColor);c.edgeColor=colorOr(options.edgeColor,c.edgeColor);
    c.iconScale=bound(options.iconScale,.3,1.2,c.iconScale);c.nameScale=bound(options.nameScale,.3,1.2,c.nameScale);c.padding=bound(options.padding,0,.16,c.padding);
    if(c.linkedColors)c.backColor=c.frontColor;
    const changed=before.some((value,i)=>value!==[c.title,c.iconMode,c.nameMode,c.linkedColors,c.frontColor,c.backColor,c.edgeColor,c.iconScale,c.nameScale,c.padding][i]);
    if(redraw&&changed){this.invalidate(id);this.update();}return changed;
  }
  async setImage(id,side,data){const c=this.content.get(id);if(!c||!['icon','name'].includes(side))throw new TypeError('Unknown card image');
    if(typeof data!=='string'||data.length>4e6||!/^data:image\/(png|jpeg|webp);base64,/i.test(data))throw new TypeError('Invalid raster data URL');
    const image=await loadImage(data);c[`${side}Data`]=data;c[`${side}Image`]=image;c[`${side}Mode`]='image';this.invalidate(id);this.update();
  }
  removeImage(id,side){const c=this.content.get(id);if(!c||!['icon','name'].includes(side))throw new TypeError('Unknown card image');c[`${side}Data`]=null;c[`${side}Image`]=c[side==='icon'?'originalIconImage':'originalNameImage'];c[`${side}Mode`]='text';this.invalidate(id);this.update();}
  showPlaceholder(id,variant,now=performance.now(),{side='back',cycle=false}={}){const entry=this.entries.get(id);if(!entry||this.disposed)return false;entry.placeholder={variant:Math.max(0,Math.min(5,Math.floor(variant))),side,cycle,until:cycle?Infinity:now+5000};entry.dirty=true;this.update(now);return true;}
  clearPlaceholder(id){const entry=this.entries.get(id);if(!entry?.placeholder)return;entry.placeholder=null;entry.dirty=true;this.update();}
  clearPlaceholders(){for(const entry of this.entries.values())if(entry.placeholder){entry.placeholder=null;entry.dirty=true;}this.update();}
  swapSlots(a,b){const x=this.entries.get(a),y=this.entries.get(b);if(!x||!y)return false;[x.contentId,y.contentId]=[y.contentId,x.contentId];x.dirty=y.dirty=true;this.update();return true;}
  setOrder(order){if(!Array.isArray(order)||order.length!==this.order.length||new Set(order).size!==this.order.length||order.some(id=>!this.content.has(id)))throw new TypeError('Invalid card order');order.forEach((contentId,i)=>{const e=this.entries.get(this.order[i]);e.contentId=contentId;e.dirty=true;});this.update();}
  invalidate(contentId){for(const entry of this.entries.values())if(!contentId||entry.contentId===contentId)entry.dirty=true;}
  setContrastGain(gain){const next=Number.isFinite(gain)?Math.max(0,Math.min(2,gain)):1;if(Math.abs(next-this.contrastGain)<1e-5)return;this.contrastGain=next;this.invalidate();this.update();}
  draw(entry,side){const face=entry.faces[side],c=this.content.get(entry.contentId),{ctx,texture}=face;
    const g=entry.panel.record.geometry,current=g.clickedSize[0]-2*g.narrowRimClicked;
    const target=(g.clickedSize[0]-2*g.narrowRimClicked)*(.97-c.padding),w=SIZE*face.span*target/current;
    face.lastWorldSide=w/(SIZE*face.span)*current;
    const radius=w*g.clickedCornerRadius/g.clickedSize[0],x=(SIZE-w)/2,y=x;
    const base=side==='front'?c.frontColor:c.linkedColors?c.frontColor:c.backColor;
    ctx.clearRect(0,0,SIZE,SIZE);ctx.fillStyle=new THREE.Color(base).multiplyScalar(.72).getStyle();ctx.fillRect(0,0,SIZE,SIZE);
    ctx.save();squircle(ctx,x,y,w,radius);ctx.clip();ctx.fillStyle=base;ctx.fillRect(x,y,w,w);
    const key=side==='front'?'icon':'name',image=c[`${key}Image`],scale=c[`${key}Scale`];
    if(entry.placeholder?.side===side)drawPlaceholder(ctx,x,y,w,entry.placeholder.variant);
    else if(c[`${key}Mode`]==='image'&&image&&(key==='icon'||c.nameData)){const iw=w*scale,ih=iw*(image.height/image.width),drawW=ih>w*.95?iw*w*.95/ih:iw,drawH=ih>w*.95?w*.95:ih;
      ctx.drawImage(image,SIZE/2-drawW/2,SIZE/2-drawH/2,drawW,drawH);
    }else{const inset=Math.max(18,w*.12),maxWidth=w-2*inset,maxHeight=w-2*inset,{lines,size}=fitLines(ctx,c.title,maxWidth,maxHeight);
      ctx.fillStyle=textColor(base);ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${size}px "Segoe UI", Arial, sans-serif`;const lineHeight=size*1.12,start=SIZE/2-(lines.length-1)*lineHeight/2;
      lines.forEach((line,i)=>ctx.fillText(line,SIZE/2,start+i*lineHeight,maxWidth));}
    ctx.restore();
    squircle(ctx,x+.7,y+.7,w-1.4,radius);ctx.strokeStyle=`rgba(255,255,255,${Math.min(1,.26*this.contrastGain)})`;ctx.lineWidth=1.5;ctx.stroke();texture.needsUpdate=true;face.mirrored.needsUpdate=true;
  }
  update(now=performance.now()){if(this.disposed)return false;let changed=false;
    for(const entry of this.entries.values()){if(entry.placeholder&&(now>=entry.placeholder.until||entry.placeholder.cycle&&!this.motion.active.get(entry.id)?.surprise&&!this.motion.queue.get(entry.id)?.surprise)){entry.placeholder=null;entry.dirty=true;}const morph=entry.panel.morphs[0],index=morph?.morphTargetDictionary?.Clicked,weight=THREE.MathUtils.clamp(morph?.morphTargetInfluences?.[index]??0,0,1);
      if(!entry.dirty&&Math.abs(weight-entry.lastWeight)<1/1024)continue;
      const dirty=entry.dirty;entry.lastWeight=weight;entry.dirty=false;
      // Keep art canvases static during morphing. Texture transforms compensate
      // for the changing footprint without re-uploading 42 canvases per frame.
      const g=entry.panel.record.geometry,reference=g.clickedSize[0]-2*g.narrowRimClicked,current=THREE.MathUtils.lerp(g.neutralSize[0]-2*g.narrowRimNeutral,reference,weight),repeat=current/reference;
      for(const side of ['front','back']){const face=entry.faces[side];if(dirty)this.draw(entry,side);face.texture.repeat.set(repeat,repeat);face.mirrored.repeat.set(-repeat,repeat);}
      const c=this.content.get(entry.contentId);for(const edge of entry.edges)edge.material.color.set(c.linkedColors?c.frontColor:c.edgeColor);
      this.graphics.setArtwork(entry.id,{iconFront:entry.faces.front.texture,iconBack:entry.faces.front.mirrored,nameFront:entry.faces.back.texture,nameBack:entry.faces.back.mirrored});changed=true;
    }return changed;
  }
  getStats(){return{framedCards:this.entries.size,disposed:this.disposed};}
  getWorldSizes(id){const entry=this.entries.get(id);return entry?{front:entry.faces.front.lastWorldSide,back:entry.faces.back.lastWorldSide}:null;}
  dispose(){if(this.disposed)return;this.disposed=true;for(const entry of this.entries.values()){for(const face of Object.values(entry.faces)){face.record.mesh.material=face.originalBinding;face.material.dispose();face.texture.dispose();face.mirrored.dispose();}for(const edge of entry.edges){edge.mesh.material=edge.source;edge.material.dispose();}}this.entries.clear();this.content.clear();}
}

const ACTIONS=['set-all-unclicked','set-all-clicked','show-names-or-icons','toggle-clicked'];
/** Two tiny prints per corner follow the card's authored depth and action mapping. */
export class CornerActionArtwork{
  constructor({motion,manifest,getCornerActions,onChange=()=>{}}){this.motion=motion;this.getCornerActions=getCornerActions;this.onChange=onChange;this.planes=[];this.materials=new Set();this.textures=new Map();this.disposed=false;
    const geometry=new THREE.PlaneGeometry(.09,.09);this.geometry=geometry;
    for(const record of manifest.perimeterPanels.filter(p=>p.kind==='curved_corner')){const panel=motion.panels.get(record.panelId),body=panel?.meshes?.[0];if(!body)continue;
      body.updateWorldMatrix(true,false);
      const carriageToBody=new THREE.Matrix4().copy(body.matrixWorld).invert().multiply(motion.rig.deployNode.matrixWorld);
      const hinge=motion._axis(panel,'N').transformDirection(carriageToBody);
      const position=body.geometry.getAttribute('position'),normal=body.geometry.getAttribute('normal');let cx=0,cy=0,count=0;
      for(let i=0;i<position.count;i++)if(normal.getZ(i)>.9&&position.getZ(i)>.009){cx+=position.getX(i);cy+=position.getY(i);count++;}
      cx=count?cx/count:0;cy=count?cy/count:0;
      for(const side of [1,-1]){const material=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.FrontSide,color:0xffffff,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
        const plane=new THREE.Mesh(geometry,material);plane.name=`${record.panelId} ${side>0?'front':'back'} action print`;plane.position.set(cx,cy,side*.0107);
        // Undo the authored half-turn at the back print, so both icons land
        // with the same up/right directions after this corner's hinge flips.
        if(side<0)plane.quaternion.setFromAxisAngle(hinge,-Math.PI);
        body.add(plane);this.planes.push({id:record.panelId,plane,material,action:null});this.materials.add(material);}
    }
    for(const action of ACTIONS){const image=new Image();image.onload=()=>{if(this.disposed||!image.naturalWidth||!image.naturalHeight)return;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;const ctx=source.getContext('2d');ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,source.width,source.height).data;let left=source.width,top=source.height,right=-1,bottom=-1;
      for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]>4){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
      if(right<left)return;const width=right-left+1,height=bottom-top+1,scale=248/Math.max(width,height),w=width*scale,h=height*scale;
      canvas.getContext('2d').drawImage(source,left,top,width,height,(256-w)/2,(256-h)/2,w,h);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;this.textures.set(action,texture);this.update(true);onChange();};image.src=new URL(`./icons/skills-actions/${action}.png`,import.meta.url).href;}
  }
  update(force=false){if(this.disposed)return;const actions=this.getCornerActions();for(const p of this.planes){const action=actions[p.id],texture=this.textures.get(action);if(!texture)continue;if(force||p.action!==action){p.action=action;p.material.map=texture;p.material.needsUpdate=true;}}}
  getStats(){return{planes:this.planes.length,loaded:this.textures.size};}
  dispose(){if(this.disposed)return;this.disposed=true;for(const p of this.planes)p.plane.removeFromParent();for(const m of this.materials)m.dispose();for(const t of this.textures.values())t.dispose();this.geometry.dispose();}
}
