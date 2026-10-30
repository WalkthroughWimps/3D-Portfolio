(() => {
  const assets = {}, assetPromises = {}, stats = {}; let generation = 0, activePromise = Promise.resolve(null), activeKey = null;
  const status = {requested:0,completed:0,commits:0,discarded:0,error:null,last:null,cacheEntries:0};
  async function decode(name, url) {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(img.height / img.width * 512);
    const ctx = c.getContext('2d', {willReadFrequently:true}); ctx.drawImage(img,0,0,c.width,c.height);
    const d = ctx.getImageData(0,0,c.width,c.height); let x0=c.width,y0=c.height,x1=0,y1=0,opaque=0,transparent=0,partial=0,edgeDark=0,darkMaxAlpha=0;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,a=d.data[i+3];if(a>32){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}if(a===0)transparent++;else if(a===255)opaque++;else {partial++;if(Math.max(d.data[i],d.data[i+1],d.data[i+2])<20){edgeDark++;darkMaxAlpha=Math.max(darkMaxAlpha,a);}}}
    stats[name]={width:img.width,height:img.height,transparentFraction:transparent/(c.width*c.height),partialPixels:partial,partialDarkPixels:edgeDark,darkMaxAlpha,corners:[0,c.width-1,(c.height-1)*c.width,c.width*c.height-1].map(i=>d.data[i*4+3]),bounds:{x0,y0,x1,y1}};
    assets[name]={canvas:c,data:d,bounds:{x0,y0,x1,y1}};
  }
  const assetPaths=Object.fromEntries(Object.entries(window.CakeToppingVisuals).map(([id,v])=>[id==='strawberry'?'berry':id,'assets/images/'+v.image]));
  function ensureAssets(){
    const selection=resolvedDecorations(),names=['berry','rosette',selection.topperA,selection.topperB].filter(name=>assetPaths[name]&&!window.CAKE_MATERIAL_CATALOG?.byId[name]);
    return Promise.all([...new Set(names)].map(name=>{
      if(!assetPromises[name])assetPromises[name]=decode(name,assetPaths[name]).catch(error=>{delete assetPromises[name];throw error;});
      return assetPromises[name];
    })).then(()=>{status.cacheEntries=Object.keys(assets).length;});
  }
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function resolvedDecorations() {
    const d = storedState.decorations || {};
    const result = window.CakeDecorationSettings?.resolve ? CakeDecorationSettings.resolve(d) : d.topper === 'strawberryRosette' || !d.topper ? { topperA: 'strawberry', topperB: 'rosette', topperAScale: d.topperScale || 1, topperBScale: d.topperScale || 1, topperPattern: 'cluster' }
      : { topperA: d.topper, topperB: 'none', topperAScale: d.topperScale || 1, topperBScale: 1, topperPattern: 'cluster' };
    const supported = id => id==='none' || !!window.CakeToppingVisuals[id] || !!window.CAKE_MATERIAL_CATALOG?.byId[id];
    const legacyUnknown = !('topperA' in d) && !supported(d.topper);
    return { ...result, topperA: legacyUnknown ? 'strawberry' : supported(result.topperA) ? result.topperA : 'strawberry', topperB: legacyUnknown ? 'rosette' : supported(result.topperB) ? result.topperB : 'none' };
  }
  function layout() {
    const d = resolvedDecorations(), slots = [{ slot: 'A', id: d.topperA, scale: d.topperAScale }, { slot: 'B', id: d.topperB, scale: d.topperBScale }]
      .filter(item => item.id && item.id !== 'none');
    const editor=document.querySelector('#desktop-editor'),editorBox=editor?.getBoundingClientRect();
    const editorVisible=editorBox && editorBox.width>40 && editorBox.left>innerWidth*.4 && editorBox.left<innerWidth-20 && getComputedStyle(editor).visibility!=='hidden' && getComputedStyle(editor).display!=='none';
    const visibleWidth=editorVisible?editorBox.left:innerWidth,centerShift=(visibleWidth-innerWidth)/2;
    const gap = d.topperPattern === 'line' ? 28 : 8;
    const nominal = slots.map(item => {
      const material = window.CAKE_MATERIAL_CATALOG?.byId[item.id];
      const width = material ? window.CAKE_MATERIAL_CATALOG.topperNominalWidth(material,d.candyColors?.length||3)
        : item.id==='fondantRibbon'?180:108;
      return width;
    });
    if (d.topperPattern === 'line' && slots.length) {
      const total = visibleWidth - 32, slotWidth = (total - (slots.length - 1) * gap) / slots.length;
      let cursor = -total / 2 + centerShift;
      slots.forEach((item,index) => {
        item.width = slotWidth; item.factor = Math.min(item.scale,slotWidth/nominal[index]);
        item.center = cursor + slotWidth / 2; cursor += slotWidth + gap;
      });
      return { slots,total,fit:Math.min(...slots.map(item=>item.factor/item.scale)),pattern:d.topperPattern,visibleWidth,centerShift };
    }
    const scaledNominal = nominal.map((width,index)=>width*slots[index].scale);
    const nominalTotal = scaledNominal.reduce((sum, width) => sum + width, 0) + Math.max(0, slots.length - 1) * gap;
    const fit = Math.min(1, (visibleWidth - 32) / Math.max(1, nominalTotal));
    const total = nominalTotal * fit; let cursor = -total / 2 + centerShift;
    slots.forEach((item, index) => { item.width = scaledNominal[index] * fit; item.center = cursor + item.width / 2; item.factor = item.scale * fit; cursor += item.width + gap * fit; });
    return { slots, total, fit, pattern: d.topperPattern, visibleWidth, centerShift };
  }
  function topperScale() {
    const raw=resolvedDecorations().topperAScale,value=Number(raw);
    return raw===null||raw===undefined||raw===''||!Number.isFinite(value)?1:clamp(value,.5,2);
  }
  function rgb(css){const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=css;x.fillRect(0,0,1,1);return [...x.getImageData(0,0,1,1).data.slice(0,3)];}
  function renderCustomSlots(token, seated) {
    const band=document.querySelector('.frosting-band-one'), source=band.querySelector('.icing-contact-canvas'), geometry=CakeContactRenderer.edgeGeometry(band), arrangement=layout();
    band.querySelector('.garnish-seat-canvas')?.remove();
    source?.style.removeProperty('visibility'); source?.removeAttribute('data-garnish-hidden');
    const topAvailable=Math.max(24,parseFloat(getComputedStyle(band).top)-3), maxHeight=Math.min(94,topAvailable), pad=28;
    const canvas=document.createElement('canvas');canvas.className='cake-garnish-canvas';canvas.dataset.garnishGeneration=String(token);
    canvas.width=geometry.width;canvas.height=Math.ceil(maxHeight+pad);
    canvas.style.cssText=`left:0;top:-${maxHeight}px;width:${geometry.width}px;height:${canvas.height}px`;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),seatField=new Float32Array(geometry.width),reports=[];
    const icing=rgb(getComputedStyle(document.documentElement).getPropertyValue('--icing'));
    for(const slot of arrangement.slots){
      const profile=window.CakeToppingVisuals[slot.id];
      if(!profile||window.CAKE_MATERIAL_CATALOG?.byId[slot.id])continue;
      const asset=assets[slot.id==='strawberry'?'berry':slot.id];if(!asset)continue;const bounds=asset.bounds;
      const ratio=(bounds.y1-bounds.y0+1)/(bounds.x1-bounds.x0+1)*profile.heightScale;
      const width=Math.max(1,Math.round(Math.min(slot.width*.9,profile.width*slot.factor*1.5,maxHeight/ratio))),height=Math.max(1,Math.round(width*ratio));
      const left=Math.round(geometry.width/2+slot.center-width/2),edge=geometry.topAt(left+width/2);
      const depth=!seated?0:profile.cutFace?Math.max(2,Math.round(height*.08)):
        (slot.id==='fondantDisc'||slot.id==='fondantRibbon')?Math.max(1,Math.round(height*.035)):0;
      const top=Math.round(maxHeight-height+edge+depth),piece=document.createElement('canvas');piece.width=width;piece.height=height;
      const pc=piece.getContext('2d',{willReadFrequently:true});pc.drawImage(asset.canvas,bounds.x0,bounds.y0,bounds.x1-bounds.x0+1,bounds.y1-bounds.y0+1,0,0,width,height);
      const data=pc.getImageData(0,0,width,height),pixels=data.data;
      if(['rosette','pipedDollop','pipedRuffle'].includes(slot.id))for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4;if(pixels[i+3]<8)continue;
        const lum=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2],v=clamp((lum-210)/255,-.38,.18);
        for(let k=0;k<3;k++)pixels[i+k]=clamp(icing[k]*(1+v*1.3)+(255-icing[k])*Math.max(0,v)*.52,0,255);
      } else {
        const bottom=new Int16Array(width).fill(-1);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>24)bottom[x]=y;
        for(let x=0;x<width;x++){
          const gx=left+x;if(gx<0||gx>=seatField.length||bottom[x]<0)continue;
          const fruitBottom=top-maxHeight+bottom[x];
          seatField[gx]=Math.max(seatField[gx],clamp(fruitBottom-geometry.topAt(gx)-1,0,depth+1));
        }
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const gx=left+x,front=geometry.topAt(gx)+(seatField[gx]||0),localY=top-maxHeight+y;
          if(localY>front+.5)pixels[(y*width+x)*4+3]=0;
        }
      }
      pc.putImageData(data,0,0);ctx.drawImage(piece,left,top);
      reports.push({name:slot.id,slot:slot.slot,depth,width,height,center:geometry.toViewport(left+width/2,edge)});
    }
    const seatedSource=seated?CakeContactRenderer.createSeatedSurface(band,seatField,'garnish-seat-canvas'):null;
    if(token!==generation){status.discarded++;return null;}
    document.querySelector('.top-garnish').hidden=true;
    band.querySelector('.cake-garnish-canvas')?.remove();band.querySelector('.garnish-charcoal')?.remove();
    if(seatedSource&&source){source.style.visibility='hidden';source.dataset.garnishHidden='true';band.append(seatedSource);}
    const backdrop=document.createElement('div'),backHeight=innerHeight*2,edgeGeometry=CakeContactRenderer.edgeGeometry(band),points=[];
    for(let x=0;x<geometry.width;x+=8)points.push(`${x}px ${backHeight+edgeGeometry.topAt(x)}px`);
    backdrop.className='garnish-charcoal';backdrop.dataset.garnishGeneration=String(token);
    backdrop.style.cssText=`top:${-backHeight}px;height:${backHeight+28}px;clip-path:polygon(0 0,100% 0,100% ${backHeight}px,${points.reverse().join(',')})`;
    band.prepend(backdrop);band.append(canvas);
    return {seated:!!seatedSource,layout:arrangement,reports,icing,scrollWidth:document.documentElement.scrollWidth};
  }
  async function render({seated=true}={}){
    const token=++generation;await ensureAssets();await CakeContactRenderer.whenIdle();if(token!==generation){status.discarded++;return null;}
    const selection=resolvedDecorations();
    if (document.body.dataset.mode === 'preview' || selection.topperA !== 'strawberry' || selection.topperB !== 'rosette' || selection.topperPattern !== 'cluster' || selection.topperAScale !== selection.topperBScale)
      return renderCustomSlots(token,seated);
    const band=document.querySelector('.frosting-band-one');
    band.querySelector('.garnish-seat-canvas')?.remove();
    band.querySelector('.icing-contact-canvas[data-garnish-hidden]')?.style.removeProperty('visibility');
    band.querySelector('.icing-contact-canvas[data-garnish-hidden]')?.removeAttribute('data-garnish-hidden');
    const source=band.querySelector('.icing-contact-canvas'),berry=assets.berry,rosette=assets.rosette;
    const baseHeight=Math.min(80,innerHeight*(document.body.dataset.mode==='preview'?.25:.105)),bandTop=parseFloat(getComputedStyle(band).top);
    const requestedScale=topperScale(),effectiveScale=Math.min(requestedScale,Math.max(.5,(bandTop-2)/baseHeight));
    const height=Math.round(baseHeight*effectiveScale),berryW=Math.round(height*(berry.bounds.x1-berry.bounds.x0+1)/(berry.bounds.y1-berry.bounds.y0+1)),rosetteW=Math.round(height*(rosette.bounds.x1-rosette.bounds.x0+1)/(rosette.bounds.y1-rosette.bounds.y0+1)),gap=Math.round(8*effectiveScale),width=berryW+rosetteW+gap;
    const geometry=CakeContactRenderer.edgeGeometry(band),centerShift=layout().centerShift,groupX=Math.round(band.offsetWidth/2+centerShift-width/2),berryX=groupX,rosetteX=groupX+berryW+gap;
    const berryEdge=geometry.topAt(berryX+berryW/2),rosetteEdge=geometry.topAt(rosetteX+rosetteW/2),berrySeat=Math.max(3,Math.round(height*.14));
    // The rosette bottom meets the native edge. Only the berry descends into a
    // shallow pocket, so the two cutouts need independent vertical origins.
    const originEdge=Math.min(rosetteEdge,berryEdge+berrySeat),berryY=berryEdge+berrySeat-originEdge,rosetteY=rosetteEdge-originEdge,groupTop=originEdge-height;
    const c=document.createElement('canvas');c.className='cake-garnish-canvas';c.dataset.garnishGeneration=String(token);c.width=width;c.height=Math.ceil(height+Math.max(berryY,rosetteY)+2);c.style.cssText=`left:calc(50% + ${centerShift}px);top:${groupTop}px;transform:translateX(-50%);width:${width}px;height:${c.height}px`;
    const ctx=c.getContext('2d',{willReadFrequently:true}),icing=rgb(getComputedStyle(document.documentElement).getPropertyValue('--icing')),reports=[],seatField=new Float32Array(band.offsetWidth);
    const showBerrySeat=selection.topperA==='strawberry'&&selection.topperB==='rosette';
    function cutout(asset,w){const temp=document.createElement('canvas');temp.width=w;temp.height=height;const t=temp.getContext('2d',{willReadFrequently:true}),b=asset.bounds;t.drawImage(asset.canvas,b.x0,b.y0,b.x1-b.x0+1,b.y1-b.y0+1,0,0,w,height);return{temp,t,data:t.getImageData(0,0,w,height)};}
    const berryCut=cutout(berry,berryW),berryPixels=berryCut.data.data,bottomByColumn=new Int16Array(berryW).fill(-1);
    let berryOriginalAlpha=0,berryConcealedAlpha=0;
    for(let y=0;y<height;y++)for(let x=0;x<berryW;x++){const alpha=berryPixels[(y*berryW+x)*4+3];berryOriginalAlpha+=alpha/255;if(alpha>24)bottomByColumn[x]=y;}
    const rawSeat=new Float32Array(berryW);
    if(showBerrySeat)for(let x=0;x<berryW;x++){
      const last=bottomByColumn[x],gx=berryX+x;if(last<0||gx<0||gx>=seatField.length)continue;
      // The alpha silhouette supplies each column's lower outline. Side
      // columns naturally return to the unchanged icing as the fruit rounds.
      const fruitBottom=groupTop+berryY+last;
      rawSeat[x]=clamp(fruitBottom-geometry.topAt(gx)-1.5,0,berrySeat+1);
    }
    if(showBerrySeat)for(let x=0;x<berryW;x++){
      const gx=berryX+x;if(gx<0||gx>=seatField.length)continue;
      let sum=0,weight=0;for(let dx=-2;dx<=2;dx++){const xx=x+dx;if(xx<0||xx>=berryW)continue;const w=3-Math.abs(dx);sum+=rawSeat[xx]*w;weight+=w;}
      seatField[gx]=sum/weight;
    }
    for(let y=0;y<height;y++)for(let x=0;x<berryW;x++){
      const i=(y*berryW+x)*4,alpha=berryPixels[i+3];if(!alpha||!showBerrySeat||!seated)continue;
      const gx=berryX+x,localY=groupTop+berryY+y,frontEdge=geometry.topAt(gx)+(seatField[gx]||0);
      if(localY>frontEdge+.5){berryConcealedAlpha+=alpha/255;berryPixels[i+3]=0;}
    }
    berryCut.t.putImageData(berryCut.data,0,0);ctx.drawImage(berryCut.temp,0,berryY);
    reports.push({name:'berry',depth:berrySeat,originalAlpha:berryOriginalAlpha,concealedAlpha:berryConcealedAlpha,concealedFraction:berryConcealedAlpha/berryOriginalAlpha,retainedAlphaFraction:1-berryConcealedAlpha/berryOriginalAlpha,seatDepth:{left:seatField[berryX+Math.round(berryW*.08)],center:seatField[berryX+Math.round(berryW*.5)],right:seatField[berryX+Math.round(berryW*.92)],max:Math.max(...seatField.slice(berryX,berryX+berryW))},placementY:berryY});
    const rosetteCut=cutout(rosette,rosetteW),rosettePixels=rosetteCut.data.data;let shadeMin=255,shadeMax=0,shadeSum=0,rosetteAlpha=0,shadeCount=0;
    for(let y=0;y<height;y++)for(let x=0;x<rosetteW;x++){
      const i=(y*rosetteW+x)*4,alpha=rosettePixels[i+3];if(!alpha)continue;rosetteAlpha+=alpha/255;
      const l=.2126*rosettePixels[i]+.7152*rosettePixels[i+1]+.0722*rosettePixels[i+2],v=clamp((l-210)/255,-.38,.18),shadow=1+v*1.3,highlight=Math.max(0,v)*.52,seam=y>=height-2?(.3*(y-height+3)/2):0;
      for(let k=0;k<3;k++)rosettePixels[i+k]=clamp((icing[k]*shadow+(255-icing[k])*highlight)*(1-seam)+icing[k]*seam,0,255);
      const lum=.2126*rosettePixels[i]+.7152*rosettePixels[i+1]+.0722*rosettePixels[i+2];shadeMin=Math.min(shadeMin,lum);shadeMax=Math.max(shadeMax,lum);shadeSum+=lum;shadeCount++;
    }
    rosetteCut.t.putImageData(rosetteCut.data,0,0);ctx.drawImage(rosetteCut.temp,berryW+gap,rosetteY);
    reports.push({name:'rosette',depth:0,originalAlpha:rosetteAlpha,concealedAlpha:0,concealedFraction:0,retainedAlphaFraction:1,placementY:rosetteY,shade:{min:shadeMin,max:shadeMax,mean:shadeSum/shadeCount}});
    const seatedSource=showBerrySeat?CakeContactRenderer.createSeatedSurface(band,seatField,'garnish-seat-canvas'):null;
    if(seatedSource&&source){
      // A one-pixel irregular front seam from the actual icing surface hides
      // the berry's cutout edge without painting across the fruit interior.
      for(let gx=berryX;gx<berryX+berryW;gx++)if(seatField[gx]>.5)
        ctx.drawImage(seatedSource,gx,0,1,seatedSource.height,gx-groupX,-groupTop-geometry.pad-.6,1,seatedSource.height);
    }
    if(token!==generation){status.discarded++;return null;}document.querySelector('.top-garnish').hidden=true;band.querySelector('.cake-garnish-canvas')?.remove();band.querySelector('.garnish-charcoal')?.remove();
    if(seatedSource){source.style.visibility='hidden';source.dataset.garnishHidden='true';band.append(seatedSource);}
    const backdrop=document.createElement('div'),backHeight=innerHeight*2,edge=source?.getContext('2d').getImageData(0,0,source.width,57).data,points=[];
    const backdropGeometry=seatedSource?CakeContactRenderer.edgeGeometry(band):geometry;
    for(let x=0;x<band.offsetWidth;x+=8)points.push(`${x}px ${backHeight+backdropGeometry.topAt(x)}px`);
    backdrop.className='garnish-charcoal';backdrop.dataset.garnishGeneration=String(token);backdrop.style.cssText=`top:${-backHeight}px;height:${backHeight+28}px;clip-path:polygon(0 0,100% 0,100% ${backHeight}px,${points.reverse().join(',')})`;band.prepend(backdrop);band.append(c);
    const m=new DOMMatrix(getComputedStyle(band).transform),bw=band.offsetWidth,bh=band.offsetHeight,originY=parseFloat(getComputedStyle(band).top);const project=(x,y)=>{const dx=x-bw/2,dy=y-bh/2;return{x:innerWidth/2+m.a*dx+m.c*dy,y:originY+bh/2+m.b*dx+m.d*dy};};
    const left=bw/2+centerShift-width/2,metrics={seated,width,height,requestedScale,effectiveScale,icing,reports,placement:{berry:{x:berryX,width:berryW,y:berryY,seat:berrySeat},rosette:{x:rosetteX,width:rosetteW,y:rosetteY,seat:0},gap},frame:{topLeft:project(left,groupTop),topRight:project(left+width,groupTop),baseLeft:project(left,geometry.topAt(left)),baseRight:project(left+width,geometry.topAt(left+width))},scrollWidth:document.documentElement.scrollWidth};return metrics;
  }
  function request(){const root=getComputedStyle(document.documentElement),band=document.querySelector('.frosting-band-one'),key=JSON.stringify([innerWidth,innerHeight,layout(),root.getPropertyValue('--icing'),getComputedStyle(band).transform,band.querySelector('.icing-contact-canvas')?.dataset.contactGeneration]);if(key===activeKey)return activePromise;activeKey=key;const requestId=++status.requested;status.error=null;const started=performance.now();activePromise=render().then(metrics=>{if(requestId!==status.requested)return null;status.completed=requestId;if(metrics){status.last={...metrics,elapsedMs:performance.now()-started};status.commits++;document.documentElement.dataset.garnishStatus='ready';}return metrics;}).catch(error=>{if(requestId!==status.requested)return null;status.completed=requestId;status.error=error.message;activeKey=null;document.querySelector('.top-garnish').hidden=false;document.querySelector('.cake-garnish-canvas')?.remove();document.querySelector('.garnish-charcoal')?.remove();document.querySelector('.garnish-seat-canvas')?.remove();document.querySelector('.icing-contact-canvas[data-garnish-hidden]')?.style.removeProperty('visibility');document.querySelector('.icing-contact-canvas[data-garnish-hidden]')?.removeAttribute('data-garnish-hidden');document.documentElement.dataset.garnishStatus='fallback';return null;});return activePromise;}
  function cancel(){generation++;status.requested++;status.completed=status.requested;activeKey=null;}
  function dispose(){cancel();document.querySelector('.cake-garnish-canvas')?.remove();document.querySelector('.garnish-charcoal')?.remove();document.querySelector('.garnish-seat-canvas')?.remove();document.querySelector('.icing-contact-canvas[data-garnish-hidden]')?.style.removeProperty('visibility');document.querySelector('.icing-contact-canvas[data-garnish-hidden]')?.removeAttribute('data-garnish-hidden');document.querySelector('.top-garnish').hidden=false;}
  async function whenIdle(){let pending;do{pending=activePromise;await pending;}while(pending!==activePromise);return status.last;}
  window.CakeGarnishRenderer={request,whenIdle,status,cancel,dispose,stats,layout};
  addEventListener('pagehide',dispose);
})();
