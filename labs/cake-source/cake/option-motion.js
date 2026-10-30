/* Shared lifecycle scheduler for floating flavor/cake option buttons. */
((scope) => {
  const cores=new WeakMap();
  function mount(container,{selector='.huddle-option',selected}={}) {
    if(!container)throw new TypeError('A motion container is required.');
    let core=cores.get(container);
    if(!core){core=scope.CakeFlavorMotion?.createMotionCore?.();if(core)cores.set(container,core);}
    if(!core)throw new Error('CakeFlavorMotion must load before CakeOptionMotion.');
    const isSelected=selected||((node)=>node.getAttribute('aria-pressed')==='true');
    let nodes=[],timers=[],active=null,manualSuspended=false,destroyed=false,observer=null,intersection=null,attached=container.isConnected,inView=true;
    const reduced=scope.matchMedia?.('(prefers-reduced-motion: reduce)');
    const effective=()=>scope.CakeMotion?.effective?.()??!reduced?.matches;
    const eligible=()=>!destroyed&&!manualSuspended&&attached&&inView&&container.isConnected&&!document.hidden&&effective();
    const clearTimers=()=>{timers.forEach(clearTimeout);timers=[];};
    function clearNode(node,kind){
      if(!node)return;
      const item=active?.records?.get(node);
      if(item){node.removeEventListener('animationiteration',item.cycle);node.removeEventListener('animationend',item.cycle);node.removeEventListener('animationcancel',item.cancelled);}
      node.classList.remove('motion-solo','motion-highlight','motion-group');
      node.style.removeProperty('--motion-delay');node.style.removeProperty('--wiggle-direction');
    }
    function cancelBurst(){
      if(active){for(const node of active.targets)clearNode(node,active.className);active=null;}
      core.cancel();
    }
    function suspend(){manualSuspended=true;clearTimers();cancelBurst();nodes.forEach(node=>{node.classList.remove('motion-ready','is-tapped');});}
    function finishBurst(burst){
      if(active!==burst)return;
      burst.targets.forEach(node=>clearNode(node,burst.className));active=null;
      const follow=core.finish();
      if(follow==='group'&&eligible())playGroup();else schedule();
    }
    function installBurst(targets,kind,expected,stagger=false){
      if(!eligible()||active||!targets.length||targets.some(node=>!node.isConnected||!container.contains(node)))return false;
      if(!core.start(kind))return false;
      const className=kind==='highlight'?'motion-highlight':kind==='group'?'motion-group':'motion-solo';
      const animationName=`huddle-${kind}`;
      const burst={targets,kind,className,expected,records:new Map(),completed:new Map()};active=burst;
      targets.forEach((node,index)=>{
        const cycle=(event)=>{
          if(active!==burst||event.target!==node||event.animationName!==animationName)return;
          if(!node.isConnected||!container.contains(node)){cancelBurst();schedule();return;}
          const previous=burst.completed.get(node)||0;
          const duration=Number.parseFloat(getComputedStyle(node).animationDuration)||1;
          const measured=event.type==='animationend'?expected:Math.min(expected,Math.floor((event.elapsedTime||0)/duration+1e-5));
          const count=Math.max(previous,measured);
          for(let i=previous;i<count;i++){if(kind!=='group')core.completeCycle();}
          burst.completed.set(node,count);
          if([...burst.completed.values()].every(value=>value>=expected))finishBurst(burst);
        };
        const cancelled=(event)=>{if(event.target===node&&event.animationName===animationName&&active===burst){cancelBurst();schedule();}};
        burst.records.set(node,{cycle,cancelled});burst.completed.set(node,0);
        node.style.setProperty('--wiggle-direction',Math.random()<.5?'-1':'1');
        if(kind==='group')node.style.setProperty('--motion-delay',`${stagger?index*Math.min(35,600/Math.max(1,targets.length-1)):0}ms`);
        else node.style.removeProperty('--motion-delay');
        node.addEventListener('animationiteration',cycle);node.addEventListener('animationend',cycle);node.addEventListener('animationcancel',cancelled);
        node.classList.add(className);
      });
      return true;
    }
    function playGroup(){
      if(!eligible())return;
      let targets=[...container.querySelectorAll(selector)];
      if(!targets.length){core.cancel();schedule();return;}
      const stagger=Math.random()<.5;
      if(stagger){for(let i=targets.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[targets[i],targets[j]]=[targets[j],targets[i]];}}
      if(!installBurst(targets,'group',2,stagger)){core.cancel();schedule();}
    }
    function tryBurst(kind){
      if(!eligible()||active)return;
      const choices=nodes.filter(node=>node.isConnected&&container.contains(node)&&(Boolean(isSelected(node))===(kind==='highlight')));
      if(!choices.length)return;
      const probability=kind==='highlight'?.35:.25;
      if(!core.chance(probability))return;
      installBurst([choices[Math.floor(Math.random()*choices.length)]],kind,kind==='highlight'?3:2);
    }
    function scheduleLane(kind,min,max){
      if(!eligible())return;
      let timer;timer=setTimeout(()=>{timers=timers.filter(id=>id!==timer);if(eligible()){tryBurst(kind);scheduleLane(kind,min,max);}},(min+Math.random()*(max-min))*1000);timers.push(timer);
    }
    function schedule(){if(!eligible())return;if(!timers.length){scheduleLane('solo',7,15);scheduleLane('highlight',5,12);}}
    function refresh(){
      if(destroyed)return;
      manualSuspended=false;clearTimers();cancelBurst();nodes.forEach(node=>node.classList.remove('motion-ready','is-tapped'));
      nodes=[...container.querySelectorAll(selector)];
      if(eligible()){nodes.forEach(node=>node.classList.add('motion-ready'));schedule();}
    }
    function onVisibility(){if(document.hidden){clearTimers();cancelBurst();}else if(!manualSuspended)schedule();}
    function onPageHide(){clearTimers();cancelBurst();}
    function onPageShow(){if(!destroyed&&!manualSuspended)refresh();}
    function onSetting(){if(!effective()){clearTimers();cancelBurst();nodes.forEach(node=>node.classList.remove('motion-ready'));}else if(!manualSuspended)refresh();}
    function onIntersection(entries){const entry=entries.find(item=>item.target===container);if(!entry)return;inView=entry.isIntersecting;if(!inView){clearTimers();cancelBurst();}else if(!manualSuspended)schedule();}
    document.addEventListener('visibilitychange',onVisibility);
    document.addEventListener('cake-motion-change',onSetting);
    scope.addEventListener('pagehide',onPageHide);
    scope.addEventListener('pageshow',onPageShow);
    reduced?.addEventListener?.('change',onSetting);
    if(typeof IntersectionObserver==='function'){intersection=new IntersectionObserver(onIntersection,{threshold:0});intersection.observe(container);}
    if(typeof MutationObserver==='function'&&document.documentElement){
      observer=new MutationObserver(()=>{
        const connected=container.isConnected;
        if(!connected){attached=false;clearTimers();cancelBurst();return;}
        if(!attached){attached=true;refresh();return;}
        if(active&&active.targets.some(node=>!node.isConnected||!container.contains(node)))refresh();
      });
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }
    refresh();
    function destroy(){if(destroyed)return;destroyed=true;clearTimers();cancelBurst();observer?.disconnect();intersection?.disconnect();nodes.forEach(node=>node.classList.remove('motion-ready','is-tapped'));nodes=[];document.removeEventListener('visibilitychange',onVisibility);document.removeEventListener('cake-motion-change',onSetting);scope.removeEventListener('pagehide',onPageHide);scope.removeEventListener('pageshow',onPageShow);reduced?.removeEventListener?.('change',onSetting);}
    return Object.freeze({refresh,suspend,destroy});
  }
  const api=Object.freeze({mount,attach:mount});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.CakeOptionMotion=api;
})(typeof window==='undefined'?globalThis:window);
