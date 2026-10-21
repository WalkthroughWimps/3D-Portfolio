import { reorderSlot } from './StableReorder.mjs';
const KEY='site.settings.section-expansion.v1';
const ORDER_KEY='site.settings.section-order.v1';
let serial=0;
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

/** Enhance settings headings only; control nodes and their listeners retain identity. */
export function mountCollapsibleSections(root,{scope='settings',storage}={}){
  if(storage===undefined)try{storage=globalThis.localStorage;}catch{storage=null;}
  let saved={};try{saved=JSON.parse(storage?.getItem(KEY)||'{}')||{};}catch{}
  let orders={};try{orders=JSON.parse(storage?.getItem(ORDER_KEY)||'{}')||{};}catch{}
  const controller=new AbortController(),records=[];
  const persist=()=>{try{storage?.setItem(KEY,JSON.stringify(saved));}catch{}};
  function set(record,expanded){
    record.button.setAttribute('aria-expanded',String(expanded));record.body.hidden=!expanded;
    saved[record.key]=expanded;persist();
  }
  function enhance(container,tab){
    const nodes=[...container.childNodes];
    if(!nodes.some(node=>node.nodeType===1&&/^H[2-4]$/.test(node.tagName)))return;
    const stack=[],counts=new Map();
    for(const node of nodes){
      if(node.nodeType===1&&/^H[2-4]$/.test(node.tagName)&&!node.querySelector('button')){
        const level=Number(node.tagName[1]);while(stack.length&&stack.at(-1).level>=level)stack.pop();
        const parent=stack.at(-1)?.body||container,section=document.createElement('section'),body=document.createElement('div'),button=document.createElement('button');
        const title=node.textContent.trim(),base=slug(title),index=counts.get(base)||0;counts.set(base,index+1);
        const key=`${scope}:${tab}:${base}:${index}`;
        section.className='settings-fold';section.dataset.sectionKey=key;section.dataset.sectionLevel=String(level);body.className='settings-fold-body';body.id=`settings-fold-${++serial}`;
        button.type='button';button.className='settings-fold-heading';button.textContent=title;button.setAttribute('aria-label',title);button.setAttribute('aria-controls',body.id);
        button.draggable=false;button.title='Click: collapse · Middle-click: toggle all · Drag: reorder · Right-click: import/export · Alt+↑/↓: move';
        const originalHeading=[...node.childNodes];node.replaceChildren(button);section.append(node,body);parent.append(section);
        const record={key,tab,body,button,heading:node,section,originalHeading};records.push(record);set(record,saved[key]!==false);
        button.addEventListener('click',()=>{if(!suppressClick)set(record,body.hidden);},{signal:controller.signal});
        button.addEventListener('pointerdown',event=>{if(event.button===1){event.preventDefault();toggleTab(record.tab);}},{signal:controller.signal});
        button.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();},{signal:controller.signal});
        stack.push({level,body});
      }else if(stack.length)stack.at(-1).body.append(node);
    }
  }
  const tabs=[...root.querySelectorAll('[data-panel]')];
  function enhanceTree(tab,name){
    const containers=[tab,...tab.querySelectorAll('*')].filter(node=>[...node.children].some(child=>/^H[2-4]$/.test(child.tagName)));
    for(const container of containers)enhance(container,name);
  }
  if(tabs.length)for(const tab of tabs)enhanceTree(tab,tab.dataset.panel);
  else enhanceTree(root,root.id||'general');
  // Existing <details> keep native semantics; middle-click follows the same tab rule.
  for(const details of root.querySelectorAll('details')){
    const summary=details.querySelector(':scope > summary');if(!summary)continue;
    const tab=details.closest('[data-panel]')?.dataset.panel||root.id||'general';
    const key=`${scope}:${tab}:details:${slug(summary.textContent)}`;
    details.dataset.sectionKey=key;summary.draggable=false;summary.title='Drag: reorder · Right-click: import/export · Alt+↑/↓: move';
    if(Object.hasOwn(saved,key))details.open=saved[key];
    details.addEventListener('toggle',()=>{saved[key]=details.open;persist();},{signal:controller.signal});
    summary.addEventListener('pointerdown',event=>{if(event.button!==1)return;event.preventDefault();toggleTab(tab);},{signal:controller.signal});
    summary.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();},{signal:controller.signal});
  }
  function toggleTab(tab,expanded){
    const group=records.filter(record=>record.tab===tab),native=[...root.querySelectorAll('details')].filter(item=>(item.closest('[data-panel]')?.dataset.panel||root.id||'general')===tab);
    expanded??=group.some(item=>item.body.hidden)||native.some(item=>!item.open);
    for(const record of group)set(record,expanded);for(const details of native)details.open=expanded;
  }
  let dragged=null,suppressClick=false;
  const siblings=node=>[...node.parentElement.children].filter(item=>item.matches('.settings-fold,details[data-section-key]'));
  const orderKey=node=>`${scope}:${node.closest('[data-panel]')?.dataset.panel||root.id||'general'}:${node.parentElement.closest('[data-section-key]')?.dataset.sectionKey||'root'}`;
  function saveOrder(node){orders[orderKey(node)]=siblings(node).map(item=>item.dataset.sectionKey);try{storage?.setItem(ORDER_KEY,JSON.stringify(orders));}catch{}}
  const sections=[...root.querySelectorAll('.settings-fold,details[data-section-key]')];
  const parents=new Set(sections.map(node=>node.parentElement));
  for(const parent of parents){const items=[...parent.children].filter(node=>node.dataset.sectionKey),order=items.length&&orders[orderKey(items[0])];if(order)for(const key of order){const node=items.find(item=>item.dataset.sectionKey===key);if(node)parent.append(node);}}
  function move(source,target){const before=new Map(siblings(source).map(node=>[node,node.getBoundingClientRect()])),list=siblings(source),forward=list.indexOf(source)<list.indexOf(target);target[forward?'after':'before'](source);
    if(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)for(const [node,rect]of before){if(node===source)continue;const dy=rect.top-node.getBoundingClientRect().top;if(dy)node.animate?.([{transform:`translateY(${dy}px)`},{transform:'none'}],{duration:170,easing:'ease-out'});}
  }
  let pointer=null;
  root.addEventListener('pointerdown',event=>{if(event.button!==0)return;const handle=event.target.closest('.settings-fold-heading,summary');if(!handle)return;pointer={id:event.pointerId,handle,node:handle.closest('.settings-fold,details'),x:event.clientX,y:event.clientY};},{signal:controller.signal});
  root.addEventListener('pointermove',event=>{
    if(!pointer||event.pointerId!==pointer.id||!(event.buttons&1))return;
    if(!dragged&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<6)return;
    if(!dragged){
      dragged=pointer.node;suppressClick=true;pointer.handle.setPointerCapture?.(event.pointerId);dragged.classList.add('settings-section-dragging');
      pointer.scroller=root.closest('.panel-controls-body,#controlPanels,.review-panel-scroll')||root;pointer.scroll=pointer.scroller.scrollTop;
      pointer.items=siblings(dragged).map(node=>({node,...rectOf(node)}));pointer.others=pointer.items.filter(item=>item.node!==dragged);
      pointer.start=pointer.items.findIndex(item=>item.node===dragged);pointer.slot=pointer.start;
      pointer.height=dragged.getBoundingClientRect().height+10;
    }
    event.preventDefault();
    const delta=pointer.scroller.scrollTop-pointer.scroll,dy=event.clientY-pointer.y+delta;
    dragged.style.transform=`translateY(${dy}px)`;dragged.style.position='relative';dragged.style.zIndex='3';dragged.style.pointerEvents='none';
    const center=pointer.items[pointer.start].top+pointer.items[pointer.start].height/2+dy;
    pointer.slot=reorderSlot(pointer.others,center);
    for(const item of pointer.others){
      const original=pointer.items.indexOf(item),index=pointer.others.indexOf(item),shift=original>pointer.start&&index<pointer.slot?-pointer.height:original<pointer.start&&index>=pointer.slot?pointer.height:0;
      item.node.style.transition=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'none':'transform 140ms ease-out';item.node.style.transform=shift?`translateY(${shift}px)`:'';
    }
    const rect=pointer.scroller.getBoundingClientRect();if(event.clientY>rect.bottom-28)pointer.scroller.scrollTop+=10;else if(event.clientY<rect.top+28)pointer.scroller.scrollTop-=10;
  },{signal:controller.signal});
  function rectOf(node){const r=node.getBoundingClientRect();return{top:r.top,height:r.height};}
  function finishPointer(event){
    const current=pointer;pointer=null;
    if(dragged){
      const source=dragged;dragged=null;
      for(const {node}of current.items){node.style.transform='';node.style.transition='';node.style.position='';node.style.zIndex='';node.style.pointerEvents='';}
      source.classList.remove('settings-section-dragging');
      if(event?.type!=='pointercancel'){const before=current.others[current.slot]?.node;if(before)before.before(source);else current.others.at(-1)?.node.after(source);saveOrder(source);}
    }
    if(current?.handle.hasPointerCapture?.(current.id))current.handle.releasePointerCapture(current.id);
    setTimeout(()=>{suppressClick=false;},0);
  }
  root.addEventListener('pointerup',finishPointer,{signal:controller.signal});root.addEventListener('pointercancel',finishPointer,{signal:controller.signal});
  root.addEventListener('lostpointercapture',event=>{if(pointer?.id===event.pointerId)finishPointer({type:'pointercancel'});},{signal:controller.signal});
  root.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:controller.signal});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&pointer){finishPointer({type:'pointercancel'});event.preventDefault();return;}if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!event.target.matches('.settings-fold-heading,summary'))return;const node=event.target.closest('.settings-fold,details'),items=siblings(node),index=items.indexOf(node),target=items[index+(event.key==='ArrowDown'?1:-1)];if(target){event.preventDefault();move(node,target);saveOrder(node);event.target.focus();}},{signal:controller.signal});
  return{toggleTab,records,dispose(){finishPointer({type:'pointercancel'});controller.abort();
    for(const record of [...records].reverse()){record.heading.replaceChildren(...record.originalHeading);record.section.before(record.heading,...record.body.childNodes);record.section.remove();}
  }};
}
