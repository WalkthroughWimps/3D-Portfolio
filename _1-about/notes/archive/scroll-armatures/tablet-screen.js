import * as THREE from 'three';
import {TABLET_SCREENS} from './scroll-tablet-model.js';

const intersect = (a,b) => ({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
const inside = (p,r) => p.x>=r.left && p.x<=r.right && p.y>=r.top && p.y<=r.bottom;
const visible = r => r.right>r.left && r.bottom>r.top;
const transparent = color => !color || color==='transparent' || color==='rgba(0, 0, 0, 0)' || color==='none';
const pixel = Math.round;

/** The DOM is the accessible control model. Only these two fixed canvases are displayed. */
export function createTabletScreens(roots) {
  const events=new AbortController(); let binding=null, active=null, editing=null, matrices=[], enabled=false, hoveredScreen=false, disposed=false;
  const screens=roots.map((root,index)=>{
    const spec=TABLET_SCREENS[index],canvas=document.createElement('canvas');
    canvas.width=spec.width*2;canvas.height=spec.height*2;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.anisotropy=4;
    root.style.width=spec.width+'px';root.style.height=spec.height+'px';root.dataset.screenResolution=canvas.width+'x'+canvas.height;
    const entry={root,canvas,texture,spec,context:canvas.getContext('2d'),records:[],dirty:true,signature:'',paintCount:0,hover:null,lastPaint:-Infinity};
    const observer=new MutationObserver(()=>{entry.dirty=true;});observer.observe(root,{subtree:true,childList:true,attributes:true,characterData:true});entry.observer=observer;
    for(const type of ['input','change','scroll','focusin','focusout'])root.addEventListener(type,()=>{entry.dirty=true;if(type.startsWith('focus'))entry.signature='';},{capture:true,signal:events.signal});
    root.addEventListener('focusin',event=>{
      if(event.target.matches('input[type="number"],input[type="text"],input:not([type])'))queueMicrotask(()=>{if(document.activeElement===event.target)edit(entry,event.target);});
      else reveal(event.target,root);
    },{signal:events.signal});
    return entry;
  });
  function reveal(element,root) {
    for(let parent=element.parentElement;parent && root.contains(parent);parent=parent.parentElement){
      if(parent.scrollHeight<=parent.clientHeight || !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))continue;
      const r=element.getBoundingClientRect(),p=parent.getBoundingClientRect();
      if(r.top<p.top)parent.scrollTop-=p.top-r.top;else if(r.bottom>p.bottom)parent.scrollTop+=r.bottom-p.bottom;
    }
  }
  function signature(entry) {
    const values=[...entry.root.querySelectorAll('input,select,progress')].map(n=>[n.value,n.checked,n.disabled].join(':')).join('|');
    const scroll=[entry.root,...entry.root.querySelectorAll('.notes-tools,.notes-gears,.notes-layers,.notes-layer-tree')].map(n=>n.scrollTop).join(',');
    return entry.root.innerHTML+values+scroll;
  }
  function paint(entry) {
    const started=performance.now();
    const {root,context:c,spec}=entry,base=root.getBoundingClientRect();entry.records=[];
    c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,spec.width,spec.height);c.fillStyle='#172830';c.fillRect(0,0,spec.width,spec.height);
    const rect=n=>{const r=n.getBoundingClientRect();return {left:pixel(r.left-base.left),top:pixel(r.top-base.top),right:pixel(r.right-base.left),bottom:pixel(r.bottom-base.top)};};
    function box(r,color,radius=0,stroke=false,width=1) {
      if(transparent(color)||!visible(r))return;c.beginPath();c.roundRect(r.left+.5,r.top+.5,Math.max(0,r.right-r.left-1),Math.max(0,r.bottom-r.top-1),Math.min(radius,(r.right-r.left)/2,(r.bottom-r.top)/2));
      if(stroke){c.strokeStyle=color;c.lineWidth=width;c.stroke();}else{c.fillStyle=color;c.fill();}
    }
    function text(node,style) {
      const value=node.textContent;if(!value.trim())return;
      const range=document.createRange(),size=parseFloat(style.fontSize)||12;
      c.font=`${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;c.fillStyle=style.color;c.textBaseline='alphabetic';
      for(const match of value.matchAll(/\S+/g)){
        range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
        const r=range.getBoundingClientRect();if(!r.width)continue;
        c.fillText(match[0],pixel(r.left-base.left),pixel(r.top-base.top+(r.height-size)/2+size*.82));
      }
    }
    function control(node,r,style) {
      const w=r.right-r.left,h=r.bottom-r.top,center=r.top+h/2;
      if(node.matches('input[type="range"]')){
        const min=+node.min||0,max=+node.max||100,t=(+node.value-min)/(max-min),x=r.left+9+(w-18)*t;
        box({left:r.left+3,right:r.right-3,top:pixel(center-2),bottom:pixel(center+2)},'#adb6bf',2);
        box({left:r.left+3,right:pixel(x),top:pixel(center-2),bottom:pixel(center+2)},'#9fe4df',2);
        c.beginPath();c.arc(pixel(x),pixel(center),8,0,Math.PI*2);c.fillStyle='#69727d';c.fill();c.strokeStyle='#f3f6f3';c.lineWidth=2;c.stroke();
      }else if(node.matches('input[type="checkbox"]')){
        box(r,node.checked?'#a3e8e4':'#263342',3);box(r,'#a9c1c7',3,true);
        if(node.checked){c.strokeStyle='#23424a';c.lineWidth=2;c.beginPath();c.moveTo(r.left+w*.2,r.top+h*.5);c.lineTo(r.left+w*.43,r.top+h*.74);c.lineTo(r.left+w*.82,r.top+h*.24);c.stroke();}
      }else if(node.tagName==='PROGRESS'){
        box(r,'#40505a',2);box({...r,right:r.left+w*node.value/(node.max||1)},'#9fe4df',2);
      }else{
        c.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;c.fillStyle=style.color;c.textBaseline='middle';
        c.save();c.beginPath();c.rect(r.left+4,r.top,w-8,h);c.clip();c.fillText(node.value,r.left+6,pixel(center));c.restore();
      }
    }
    function walk(node,clip) {
      if(node.nodeType===Node.TEXT_NODE){text(node,getComputedStyle(node.parentElement));return;}
      if(!(node instanceof Element))return;
      const style=getComputedStyle(node),r=rect(node);
      if(style.display==='none'||style.visibility==='hidden'||node.classList.contains('notes-status')||node.classList.contains('notes-native-edit'))return;
      const area=intersect(r,clip);if(!visible(area) && style.overflowY!=='visible')return;
      c.save();c.globalAlpha*=Number(style.opacity);
      if(node.matches('input:disabled') && !node.closest('.is-disabled'))c.globalAlpha*=.36;
      const radius=parseFloat(style.borderRadius)||0;
      if(node.tagName==='LEGEND')box(r,'#172830');
      box(r,node===entry.hover && node.matches('button:not(:disabled)')?'#35515d':style.backgroundColor,radius);
      if(parseFloat(style.borderTopWidth)>0)box(r,style.borderTopColor,radius,true);
      else if(parseFloat(style.borderLeftWidth)>0){c.strokeStyle=style.borderLeftColor;c.lineWidth=1;c.beginPath();c.moveTo(r.left+.5,r.top);c.lineTo(r.left+.5,r.bottom);c.stroke();}
      if(node===document.activeElement || editing?.placeholder===node)box(r,'#c9f6f4',radius,true,2);
      if(node.matches('button,input,select,.notes-layer-row,.notes-pane-row,.notes-layer-name,label:has(input[type="checkbox"])') && visible(area))entry.records.push({el:node,rect:r,clip:area});
      const clips=/(hidden|auto|scroll|clip)/.test(style.overflowX+' '+style.overflowY),childClip=clips?area:clip;
      if(clips){c.beginPath();c.rect(area.left,area.top,Math.max(0,area.right-area.left),Math.max(0,area.bottom-area.top));c.clip();}
      if(node.tagName.toLowerCase()==='svg'){
        const view=node.viewBox.baseVal;c.translate(r.left,r.top);c.scale((r.right-r.left)/view.width,(r.bottom-r.top)/view.height);c.translate(-view.x,-view.y);
        for(const path of node.querySelectorAll('path')){
          const ps=getComputedStyle(path),p=new Path2D(path.getAttribute('d'));c.lineCap=ps.strokeLinecap;c.lineJoin=ps.strokeLinejoin;
          if(!transparent(ps.fill)){c.fillStyle=ps.fill;c.fill(p);}if(!transparent(ps.stroke)){c.strokeStyle=ps.stroke;c.lineWidth=parseFloat(ps.strokeWidth)||1;c.stroke(p);}
        }
      }else if(node.matches('input,select,progress'))control(node,r,style);
      else for(const child of node.childNodes)walk(child,childClip);
      if(node.scrollHeight>node.clientHeight+1 && /(auto|scroll)/.test(style.overflowY)){
        const track={left:r.right-8,right:r.right-2,top:r.top+3,bottom:r.bottom-3},height=track.bottom-track.top;
        const thumb=Math.max(20,height*node.clientHeight/node.scrollHeight),y=track.top+(height-thumb)*node.scrollTop/(node.scrollHeight-node.clientHeight);
        box(track,'#24343e',3);box({...track,top:pixel(y),bottom:pixel(y+thumb)},'#8fa6ae',3);
        entry.records.push({el:node,rect:track,clip:intersect(track,clip),scrollbar:true});
      }
      c.restore();
    }
    walk(root,{left:0,top:0,right:spec.width,bottom:spec.height});
    entry.texture.needsUpdate=true;entry.paintCount++;entry.paintMs=performance.now()-started;
  }
  function flush(force=false) {
    if(disposed || !enabled)return;
    const now=performance.now();
    for(const entry of screens){
      if(entry.observer.takeRecords().length)entry.dirty=true;
      if(!entry.dirty || !force && now-entry.lastPaint<33)continue;
      const next=signature(entry);if(!force && next===entry.signature){entry.dirty=false;continue;}
      entry.signature=next;entry.dirty=false;entry.lastPaint=now;paint(entry);
    }
  }
  function hit(entry,p) {return [...entry.records].reverse().find(r=>inside(p,r.clip));}
  function target(record) {const n=record?.el;return n?.closest('button,input,select') || n?.querySelector?.('input[type="checkbox"]') || n;}
  function virtual(entry,p) {const r=entry.root.getBoundingClientRect();return {clientX:r.left+p.x,clientY:r.top+p.y};}
  function pointer(entry,node,type,p,event) {
    node?.dispatchEvent(new PointerEvent(type,{...virtual(entry,p),bubbles:true,cancelable:true,pointerId:event.pointerId,pointerType:event.pointerType||'mouse',button:event.button,buttons:event.buttons,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,altKey:event.altKey,metaKey:event.metaKey}));
    entry.dirty=true;
  }
  function range(entry,node,p,record) {
    const min=+node.min||0,max=+node.max||100,step=+node.step||1,r=record.rect,t=Math.max(0,Math.min(1,(p.x-r.left-9)/(r.right-r.left-18)));
    node.value=String(Math.min(max,Math.max(min,min+Math.round(t*(max-min)/step)*step)));node.dispatchEvent(new Event('input',{bubbles:true}));entry.dirty=true;
  }
  function client(index,x,y) {
    const m=matrices[index];if(!m)return {x:innerWidth/2,y:innerHeight/2};
    const w=m[3]*x+m[7]*y+1;return {x:(m[0]*x+m[4]*y+m[12])/w,y:(m[1]*x+m[5]*y+m[13])/w};
  }
  function edit(entry,node) {
    if(editing?.node===node || !enabled)return;
    endEdit();reveal(node,entry.root);
    const r=node.getBoundingClientRect(),base=entry.root.getBoundingClientRect(),point=client(screens.indexOf(entry),r.left-base.left,r.top-base.top);
    const placeholder=document.createElement('span');placeholder.className=node.className;placeholder.textContent=node.value;placeholder.style.cssText=`display:block;min-width:0;width:${r.width}px;height:${r.height}px;`;
    const originalStyle=node.getAttribute('style');node.before(placeholder);editing={node,placeholder,originalStyle,entry,events:new AbortController()};
    const initialValue=node.value;
    node.classList.add('notes-native-edit');node.style.cssText=`position:fixed!important;left:${Math.max(12,Math.min(innerWidth-Math.max(140,r.width)-12,point.x))}px!important;top:${Math.max(12,Math.min(innerHeight-44,point.y))}px!important;width:${Math.max(140,r.width)}px!important;height:32px!important;z-index:100!important;pointer-events:auto!important;background:#233740!important;color:#edf5f3!important;border:2px solid #c9f6f4!important;`;
    const update=()=>{placeholder.textContent=node.value;entry.dirty=true;};
    node.addEventListener('keydown',event=>{if(node.type!=='number'||!['Enter','Escape'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(event.key==='Escape'){node.value=initialValue;node.dispatchEvent(new Event('input',{bubbles:true}));}node.dispatchEvent(new Event('change',{bubbles:true}));node.blur();binding?.canvas.focus({preventScroll:true});},{signal:editing.events.signal});
    node.addEventListener('input',update,{signal:editing.events.signal});node.addEventListener('blur',()=>queueMicrotask(endEdit),{once:true,signal:editing.events.signal});entry.dirty=true;
  }
  function endEdit() {
    if(!editing)return;const {node,placeholder,originalStyle,entry,events:editEvents}=editing;editing=null;editEvents.abort();
    node.classList.remove('notes-native-edit');if(originalStyle===null)node.removeAttribute('style');else node.setAttribute('style',originalStyle);placeholder.remove();entry.dirty=true;
  }
  function clearHover() {hoveredScreen=false;for(const entry of screens)if(entry.hover){entry.hover=null;entry.signature='';entry.dirty=true;}}
  function cancel() {
    if(active){const old=active;active=null;pointer(old.entry,old.node,'pointercancel',old.point,{pointerId:old.id,buttons:0});if(old.node.matches('input[type="range"]'))old.node.dispatchEvent(new Event('change',{bubbles:true}));if(binding?.canvas.hasPointerCapture(old.id))binding.canvas.releasePointerCapture(old.id);binding?.onOwnership(false);}
    if(editing){editing.node.blur();endEdit();}clearHover();
  }
  function bind({canvas,pick,point,onOwnership=()=>{},onGearDrop=()=>{}}) {
    binding?.controller.abort();const controller=new AbortController(),signal=controller.signal;binding={controller,onOwnership,canvas};
    const consume=e=>{e.preventDefault();e.stopImmediatePropagation();};
    canvas.addEventListener('pointerdown',event=>{
      if(!enabled || event.button!==0)return;const p=pick(event);if(!p)return;
      if(editing){editing.node.blur();endEdit();}flush(true);
      const entry=screens[p.index],record=hit(entry,p),node=target(record);consume(event);
      if(!node || node.disabled)return;
      active={entry,record,node,index:p.index,id:event.pointerId,start:p,point:p,moved:false};canvas.setPointerCapture(event.pointerId);onOwnership(true);
      if(node.matches('input[type="range"]')){node.focus({preventScroll:true});range(entry,node,p,record);}
      else if(record.scrollbar)active.scrollStart=node.scrollTop;
      else {if(node.matches('button,input'))node.focus({preventScroll:true});else node.closest('.notes-tree-node')?.focus({preventScroll:true});pointer(entry,node,'pointerdown',p,event);}
    },{capture:true,signal});
    canvas.addEventListener('pointermove',event=>{
      if(!enabled)return;
      if(active?.id===event.pointerId){
        const a=active,p=point(a.index,event);if(!p)return;consume(event);a.point=p;a.moved ||= Math.hypot(p.x-a.start.x,p.y-a.start.y)>6;
        if(a.record.scrollbar){a.node.scrollTop=a.scrollStart+(p.y-a.start.y)*a.node.scrollHeight/a.node.clientHeight;a.entry.dirty=true;}
        else if(a.node.matches('input[type="range"]'))range(a.entry,a.node,p,a.record);
        else pointer(a.entry,a.node,'pointermove',p,event);
      }else{
        const p=pick(event);if(!p){clearHover();return;}
        consume(event);hoveredScreen=true;const entry=screens[p.index],node=target(hit(entry,p));
        for(const s of screens)if(s.hover!==(s===entry?node:null)){s.hover=s===entry?node:null;s.signature='';s.dirty=true;}canvas.style.cursor=node?.disabled?'default':node?.matches('input[type="range"]')?'ew-resize':node?'pointer':'default';
      }
    },{capture:true,signal});
    canvas.addEventListener('pointerup',event=>{
      if(active?.id!==event.pointerId)return;const a=active;active=null;consume(event);
      if(a.node.matches('input[type="range"]'))a.node.dispatchEvent(new Event('change',{bubbles:true}));
      else if(!a.record.scrollbar){
        pointer(a.entry,a.node,'pointerup',a.point,event);
        if(a.moved && a.node.matches('[data-guide],[data-roller]'))onGearDrop(event,a.node.dataset);
        else if(!a.moved){if(a.node.matches('input[type="number"],input[type="text"],input:not([type])'))edit(a.entry,a.node);else if(a.node.matches('.notes-layer-row,.notes-pane-row,.notes-layer-name'))a.node.dispatchEvent(new MouseEvent('click',{...virtual(a.entry,a.point),bubbles:true,cancelable:true,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey}));else a.node.click();}
      }
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);onOwnership(false);a.entry.dirty=true;
    },{capture:true,signal});
    for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(active?.id===event.pointerId){cancel();consume(event);}},{capture:true,signal});
    canvas.addEventListener('pointerleave',()=>{if(!active)clearHover();},{signal});
    canvas.addEventListener('dblclick',event=>{
      if(!enabled)return;const p=pick(event);if(!p)return;consume(event);const entry=screens[p.index],node=target(hit(entry,p));
      node?.dispatchEvent(new MouseEvent('dblclick',{...virtual(entry,p),bubbles:true,cancelable:true}));entry.dirty=true;
    },{capture:true,signal});
    for(const name of ['mousedown','mouseup','click','contextmenu'])canvas.addEventListener(name,event=>{if(enabled && pick(event))consume(event);},{capture:true,signal});
    canvas.addEventListener('wheel',event=>{
      if(!enabled)return;const p=pick(event);if(!p)return;consume(event);const entry=screens[p.index];
      let node=hit(entry,p)?.el || entry.root;
      while(node && entry.root.contains(node)){
        if(node.scrollHeight>node.clientHeight+1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)){node.scrollTop+=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?node.clientHeight:1);entry.dirty=true;break;}node=node.parentElement;
      }
    },{capture:true,passive:false,signal});
  }
  return {textures:screens.map(s=>s.texture),bind,flush,cancel,unbind(){cancel();binding?.controller.abort();binding=null;},
    invalidate(){screens.forEach(s=>{s.dirty=true;});},setProjection(value){matrices=value;},
    setVisible(value){if(enabled && !value)cancel();if(!enabled && value)screens.forEach(s=>{s.signature='';s.dirty=true;});enabled=value;},
    get cursor(){const node=screens.find(s=>s.hover)?.hover;return node ? node.disabled?'default':node.matches('input[type="range"]')?'ew-resize':'pointer' : hoveredScreen?'default':null;},
    get active(){return Boolean(active||editing);},get stats(){return screens.map(s=>({width:s.canvas.width,height:s.canvas.height,paintCount:s.paintCount,paintMs:s.paintMs,textureVersion:s.texture.version}));},
    dispose(){if(disposed)return;cancel();disposed=true;binding?.controller.abort();events.abort();screens.forEach(s=>{s.observer.disconnect();s.texture.dispose();s.canvas.width=s.canvas.height=0;});}
  };
}
