(() => {
  const groups=['cakes','icings','toppers','fillings'];
  const labels={cakes:'Cake',icings:'Icing',toppers:'Toppings',fillings:'Fillings'};
  const shell=document.querySelector('.flavor-explorer-shell');let grid=document.getElementById('flavor-grid');
  if(!shell||!grid)return;
  const status=document.getElementById('flavor-explorer-status'),title=document.getElementById('flavor-category-title');
  const step=document.getElementById('flavor-step'),panel=document.getElementById('flavor-panel');
  const tabs=[...document.querySelectorAll('.flavor-tabs [role=tab]')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),motion=window.CakeFlavorMotion.createMotionCore();
  let active=0,page=0,menu=null,visible=false,busy=false,disposed=false,timers=[],burstCancel=null,transitioning=false,suppressClick=false;
  let memoryFavorites=Object.fromEntries(groups.map(group=>[group,[]]));
  function readFavorites(){
    try{
      const raw=JSON.parse(sessionStorage.getItem('cake-favorites-v1')||'null');
      if(raw)memoryFavorites=Object.fromEntries(groups.map(group=>[group,Array.isArray(raw[group])?raw[group].filter(id=>typeof id==='string').slice(0,100):[]]));
    }catch{}
    return structuredClone(memoryFavorites);
  }
  const favorites={
    read:readFavorites,has:(group,id)=>readFavorites()[group]?.includes(id)||false,
    toggle(group,id){
      if(!groups.includes(group)||typeof id!=='string')return false;
      const current=readFavorites(),exists=current[group].includes(id);
      current[group]=exists?current[group].filter(value=>value!==id):[...current[group],id].slice(-100);
      memoryFavorites=current;
      try{sessionStorage.setItem('cake-favorites-v1',JSON.stringify(current));}catch{}
      document.dispatchEvent(new CustomEvent('cake-favorites-change',{detail:{group,id,favorite:!exists}}));
      return !exists;
    }
  };
  window.CakeFavorites=favorites;
  const backdrop=document.createElement('div');backdrop.className='flavor-backdrop';backdrop.setAttribute('aria-hidden','true');
  backdrop.innerHTML='<div class="flavor-backdrop-scene"><div class="flavor-backdrop-icing"></div><div class="flavor-backdrop-cake"></div></div>';
  shell.prepend(backdrop);
  function markFavorite(card){
    const saved=favorites.has(card.dataset.group,card.dataset.id),label=card.querySelector('.flavor-option-label').textContent;
    card.classList.toggle('is-favorite',saved);card.setAttribute('aria-pressed',String(saved));
    card.setAttribute('aria-label',label+(saved?', saved favorite':'')+'. Tap to '+(saved?'remove from':'save to')+' favorites.');
    card.querySelector('.flavor-heart').textContent=saved?'♥':'♡';
  }
  document.addEventListener('cake-favorites-change',event=>{
    for(const card of grid.children)if(!event.detail||card.dataset.group===event.detail.group&&card.dataset.id===event.detail.id)markFavorite(card);
  });

  function dimensions(){
    const width=panel.clientWidth,height=panel.clientHeight;
    const cols=width<420?2:width<700?3:4,rows=Math.max(1,Math.min(3,Math.floor(height/125)));
    return {width,height,cols,rows,capacity:cols*rows};
  }
  function pageCount(group=groups[active]){return Math.max(1,Math.ceil((menu?.[group]?.length||0)/dimensions().capacity));}
  async function setGroup(index,focus=false,nextPage=0,direction=1,animate=true){
    if(transitioning)return;
    suspend();active=(index+groups.length)%groups.length;page=Math.max(0,Math.min(nextPage,pageCount()-1));
    const group=groups[active];shell.dataset.view=group;title.textContent=labels[group];step.textContent='0'+(active+1)+' / 04';
    panel.setAttribute('aria-labelledby','flavor-tab-'+group);
    tabs.forEach((tab,i)=>{const selected=i===active;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected&&focus)tab.focus({preventScroll:true});});
    const previous=grid;
    grid=document.createElement('div');grid.className='flavor-grid';grid.setAttribute('aria-label','Available choices');
    previous.removeAttribute('id');previous.inert=true;previous.setAttribute('aria-hidden','true');grid.id='flavor-grid';panel.append(grid);render();
    if(animate&&!reduced.matches&&previous.children.length){
      transitioning=true;
      const options={duration:420,easing:'cubic-bezier(.22,.7,.23,1)',fill:'both'};
      const outgoing=previous.animate([{transform:'translateX(0)'},{transform:'translateX('+(-direction*105)+'%)'}],options);
      const incoming=grid.animate([{transform:'translateX('+(direction*105)+'%)'},{transform:'translateX(0)'}],options);
      await Promise.allSettled([outgoing.finished,incoming.finished]);outgoing.cancel();incoming.cancel();transitioning=false;
    }
    previous.remove();setupMotion();
  }
  function move(direction){
    if(transitioning)return;
    let next=page+direction,index=active;
    if(next>=pageCount()){index=(active+1)%4;next=0;}
    else if(next<0){index=(active+3)%4;next=pageCount(groups[index])-1;}
    setGroup(index,false,next,direction);
  }
  function render(){
    if(!menu)return;
    const group=groups[active],all=menu[group]||[],d=dimensions(),entries=all.slice(page*d.capacity,(page+1)*d.capacity);
    grid.replaceChildren();
    const rows=Math.ceil(entries.length/d.cols),cellH=d.height/Math.max(1,rows),cellW=d.width/d.cols;
    const artSize=Math.max(48,Math.min(106,cellW-14,cellH-85));
    for(const [n,[id,label]]of entries.entries()){
      const card=document.createElement('button'),art=window.CakeOptionVisuals.render(group,id,menu);
      const caption=document.createElement('span'),heart=document.createElement('span');
      card.type='button';card.className='flavor-option';card.dataset.group=group;card.dataset.id=id;
      art.classList.add('option-art-float');caption.className='flavor-option-label';caption.textContent=label;
      heart.className='flavor-heart';heart.setAttribute('aria-hidden','true');
      card.append(art,caption,heart);markFavorite(card);
      const row=Math.floor(n/d.cols),col=n%d.cols,lastCount=Math.min(d.cols,entries.length-row*d.cols);
      const turn=[-2,1.6,-.8,2.4,-1.4,.7][n%6];
      const jitterX=[-.12,.06,-.05,.12][n%4]*cellW,jitterY=[-.22,.14,-.09,.23,-.13,.04][n%6]*Math.min(cellH,150);
      const w=Math.min(cellW-20,160),h=Math.min(cellH-20,artSize+65);
      card.style.cssText='width:'+w+'px;height:'+h+'px;left:'+Math.max(7,Math.min(d.width-w-7,(d.width-lastCount*cellW)/2+col*cellW+cellW/2-w/2+jitterX))+'px;top:'+Math.max(7,Math.min(d.height-h-7,row*cellH+(cellH-h)/2+jitterY))+'px';
      card.style.setProperty('--card-turn',turn+'deg');card.style.setProperty('--art-size',artSize+'px');card.style.setProperty('--float-delay',-(n%7)*1.7+'s');
      card.addEventListener('click',event=>{
        if(suppressClick){event.preventDefault();return;}
        const selected=favorites.toggle(group,id);card.classList.remove('is-tapped');
        if(selected&&!reduced.matches){void card.offsetWidth;card.classList.add('is-tapped');}
      });
      grid.append(card);
    }
    status.hidden=all.length>0;status.textContent=all.length?'':'No choices are available in this category right now.';
    document.getElementById('flavor-page').textContent=pageCount()>1?(page+1)+' / '+pageCount():'';
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>setGroup(index,false,0,index>=active?1:-1));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();setGroup(event.key==='Home'?0:event.key==='End'?3:active+(event.key==='ArrowRight'?1:-1),true);
    });
  });
  document.querySelectorAll('.flavor-arrow').forEach(button=>button.addEventListener('click',()=>move(Number(button.dataset.step))));
  panel.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}});
  let touchStart=null;
  panel.addEventListener('pointerdown',event=>{touchStart={x:event.clientX,y:event.clientY};suppressClick=false;});
  panel.addEventListener('pointerup',event=>{
    if(!touchStart)return;const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;touchStart=null;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3){suppressClick=true;move(dx<0?1:-1);setTimeout(()=>suppressClick=false,450);}
  });
  panel.addEventListener('pointercancel',()=>touchStart=null);
  let resizeTimer;
  new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(menu&&!transitioning)setGroup(active,false,Math.min(page,pageCount()-1),1,false);},100);}).observe(panel);
  function clearTimers(){timers.forEach(clearTimeout);timers=[];}
  function eligible(){return visible&&!document.hidden&&!reduced.matches&&!disposed&&!transitioning;}
  function playBurst(card,kind){
    if(!eligible()||busy)return false;
    const cards=kind==='group'?[...grid.children]:[card];
    if(!cards.length||cards.some(node=>!node?.isConnected)||!motion.start(kind))return false;
    busy=true;
    const className=kind==='highlight'?'motion-highlight':kind==='group'?'motion-group':'motion-solo';
    const animationName=kind==='highlight'?'flavor-highlight':kind==='group'?'flavor-group':'flavor-solo';
    const expected=kind==='highlight'?3:2,counts=new Map(cards.map(node=>[node,0]));
    const clear=node=>{node.classList.remove(className);node.removeEventListener('animationiteration',cycle);node.removeEventListener('animationend',cycle);node.removeEventListener('animationcancel',cancelled);};
    const cancel=()=>{cards.forEach(clear);motion.cancel();busy=false;burstCancel=null;};
    const cancelled=event=>{if(event.target===event.currentTarget&&event.animationName===animationName)cancel();};
    function cycle(event){
      if(event.target!==event.currentTarget||event.animationName!==animationName)return;
      const node=event.currentTarget,count=counts.get(node);if(count>=expected)return;
      // A throttled frame can skip iteration events; the end still completes every CSS cycle.
      const duration=Number.parseFloat(getComputedStyle(node).animationDuration);
      const completed=event.type==='animationend'?expected:Math.min(expected,Math.round(event.elapsedTime/duration));
      counts.set(node,Math.max(count,completed));for(let i=count;i<completed;i++)motion.completeCycle();
      if([...counts.values()].every(value=>value>=expected)){
        cards.forEach(clear);busy=false;burstCancel=null;
        if(motion.finish()==='group')playBurst(null,'group');else schedule();
      }
    }
    burstCancel=cancel;
    let ordered=cards;
    const stagger=kind==='group'&&Math.random()<.5;
    if(stagger){ordered=[...cards];for(let i=ordered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}}
    ordered.forEach((node,index)=>{
      node.style.setProperty('--group-delay',(stagger?index*Math.min(35,600/Math.max(1,cards.length-1)):0)+'ms');
      node.style.setProperty('--wiggle-direction',Math.random()<.5?'-1':'1');
      node.addEventListener('animationiteration',cycle);node.addEventListener('animationend',cycle);node.addEventListener('animationcancel',cancelled);node.classList.add(className);
    });
    return true;
  }
  function scheduleOne(kind,min,max,chance){
    if(!eligible())return;
    let timer;timer=setTimeout(()=>{
      timers=timers.filter(id=>id!==timer);
      if(eligible()&&!busy&&motion.chance(chance)){
        const choices=[...grid.querySelectorAll(kind==='highlight'?'.flavor-option.is-favorite':'.flavor-option:not(.is-favorite)')];
        if(choices.length)playBurst(choices[Math.floor(Math.random()*choices.length)],kind);
      }
      scheduleOne(kind,min,max,chance);
    },(min+Math.random()*(max-min))*1000);timers.push(timer);
  }
  function schedule(){if(!eligible()||timers.length)return;scheduleOne('solo',7,15,.25);scheduleOne('highlight',5,12,.35);}
  function setupMotion(){if(!eligible())return;grid.querySelectorAll('.flavor-option').forEach(card=>card.classList.add('motion-ready'));schedule();}
  function suspend(){clearTimers();burstCancel?.();grid.querySelectorAll('.flavor-option').forEach(card=>card.classList.remove('motion-ready','is-tapped','motion-solo','motion-highlight','motion-group'));}
  const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);if(visible)setupMotion();else suspend();},{threshold:0});observer.observe(shell);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else setupMotion();});
  window.addEventListener('pagehide',()=>{disposed=true;suspend();observer.disconnect();});
  window.addEventListener('pageshow',()=>{disposed=false;observer.observe(shell);setupMotion();});
  reduced.addEventListener?.('change',()=>{suspend();setupMotion();});
  async function load(){
    status.hidden=false;status.textContent='Loading available choices…';
    try{
      menu=await(window.CakeMenuPromise||=fetch('/api/menu',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Menu unavailable');return response.json();}));setGroup(active);
    }catch{status.textContent='Could not load current choices. Please refresh to try again.';}
  }
  load();
})();
