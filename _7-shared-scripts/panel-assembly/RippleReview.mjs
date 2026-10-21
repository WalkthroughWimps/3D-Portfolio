/** Canvas-only diagnostic of the live simulation. Display gain never changes physical motion. */
export function mountRippleReview({app,root,onSelect=()=>{}}){
  const canvas=root.querySelector('#rippleVisualizer'),ctx=canvas.getContext('2d');
  const status=root.querySelector('#rippleReviewStatus'),buttons=root.querySelector('#rippleReviewNodes');
  const {ripple,motion}=app;let active=false,visible=false,disposed=false,raf=0,lastDraw=0,gain=60;
  let selected=app.manifest.squarePanels[0].panelId,frames=0;
  const history=new Float32Array(120),upperHistory=new Float32Array(120),lowerHistory=new Float32Array(120);let cursor=0,historyCount=0;
  const records=[...ripple.movingPanels,...ripple.fixedPanels];
  const points=records.map((p,i)=>({id:p.panelId,x:ripple.x[i],y:ripple.y[i],fixed:i>=ripple.count,
    name:p.appName||p.panelId}));
  for(const p of points){const b=document.createElement('button');b.type='button';b.dataset.ripplePanel=p.id;
    b.title=`${p.name}${p.fixed?' · fixed support':''}`;b.setAttribute('aria-label',`Ripple from ${p.name}${p.fixed?', fixed support':''}`);
    b.style.left=`${50+p.x*43}%`;b.style.top=`${50-p.y*43}%`;
    b.className=p.fixed?'ripple-node pinned':'ripple-node';b.textContent=p.fixed?'◇':'●';buttons.append(b);
  }
  const pulse=id=>{if(!app.rig.isPanelVisible(id))return;selected=id;onSelect(id);app.requestReviewRipple(id);app.refreshLifecycle();invalidate();};
  const onClick=e=>{const b=e.target.closest('[data-ripple-panel]');if(b)pulse(b.dataset.ripplePanel);};
  buttons.addEventListener('click',onClick);
  function allowed(){return active&&visible&&!document.hidden&&!disposed;}
  function invalidate(){if(allowed()&&!raf)raf=requestAnimationFrame(tick);}
  function tick(now){raf=0;if(!allowed())return;
    if(now-lastDraw>=1000/30||ripple.sleeping||ripple.paused||ripple.reducedMotion){draw();lastDraw=now;}
    if(!ripple.sleeping&&!ripple.paused&&!ripple.reducedMotion&&!app.suspended)invalidate();
  }
  function draw(){
    for(const p of points){const content=app.nameFrames?.content.get(app.nameFrames?.entries.get(p.id)?.contentId);if(content)p.name=content.title;}
    const compact=canvas.parentElement.classList.contains('is-compact');
    const width=Math.max(240,Math.round(canvas.clientWidth||300)),height=compact?190:300,dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==width*dpr||canvas.height!==height*dpr){canvas.width=width*dpr;canvas.height=height*dpr;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#080f19';ctx.fillRect(0,0,width,height);
    const mapHeight=compact?height:height-58,scale=mapHeight*.43;
    const xy=(i,raised=true)=>[width/2+points[i].x*width*.43,mapHeight/2-points[i].y*scale-(raised&&!points[i].fixed?ripple.height[i]*gain*scale:0)];
    const color=h=>{const t=Math.min(1,Math.abs(h)/ripple.options.maxDisplacement);return h>=0?`rgb(${120+135*t},${140-50*t},${155-65*t})`:`rgb(${120-65*t},${140+90*t},${155+100*t})`;};
    ctx.lineWidth=1;
    for(let i=0;i<ripple.count;i++)for(let k=ripple.offsets[i];k<ripple.offsets[i+1];k++){
      const j=ripple.neighbors[k];if(j<i)continue;
      const a=xy(i),b=xy(j);ctx.strokeStyle='#51657b';ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    }
    for(let i=0;i<points.length;i++){
      const base=xy(i,false),p=xy(i),h=i<ripple.count?ripple.height[i]:0;
      ctx.strokeStyle='#6f8499';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(...base);ctx.lineTo(...p);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=points[i].fixed?'#c6d4df':color(h);ctx.beginPath();ctx.arc(...p,points[i].fixed?2.5:5,0,Math.PI*2);ctx.fill();
      if(!points[i].fixed){
        ctx.strokeStyle=points[i].id===selected?'#fff':'#7995b0';ctx.beginPath();
        for(let k=0;k<5;k++){const dx=[-.055,.055,.055,-.055][k%4],dy=[-.055,-.055,.055,.055][k%4],z=h+(ripple.slopeX?.[i]||0)*dx+(ripple.slopeY?.[i]||0)*dy;
          const x=width/2+(points[i].x+dx)*width*.43,y=mapHeight/2-(points[i].y+dy)*scale-z*gain*scale;
          if(!k)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }ctx.stroke();
      }
      if(points[i].id===selected){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(...p,8,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1;}
    }
    const index=ripple.index.get(selected),value=index===undefined?0:ripple.height[index];
    history[cursor]=value;upperHistory[cursor]=Math.max(0,...ripple.height);lowerHistory[cursor]=Math.min(0,...ripple.height);
    cursor=(cursor+1)%history.length;historyCount=Math.min(history.length,historyCount+1);
    if(!compact){const mid=height-25;ctx.strokeStyle='#34475c';ctx.beginPath();ctx.moveTo(12,mid);ctx.lineTo(width-12,mid);ctx.stroke();
    for(const [trace,color] of [[upperHistory,'#ff8f69'],[lowerHistory,'#65d8ff'],[history,'#dceaff']]){
    ctx.strokeStyle=color;ctx.beginPath();for(let i=0;i<historyCount;i++){
      const v=trace[(cursor-historyCount+i+history.length)%history.length],x=12+i*(width-24)/(history.length-1),y=mid-v/ripple.options.maxDisplacement*20;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.stroke();}}
    const s=ripple.getStats(),review=app.rippleReview,transfer=app.getRippleTransferStats?.();
    const blocked=app.hostReducedMotion||app.userReducedMotion?'Reduced motion: simulation disabled':!ripple.options.enabled?'Ripple disabled':ripple.paused?'Paused':!motion.focused?'Focus the skills face to inject a pulse':s.sleeping?'Settled':'Moving';
    status.textContent=`${blocked} · field ${(s.maxHeight*1000).toFixed(3)} mm · cards ${((transfer?.appliedPeak||0)*1000).toFixed(3)} mm · ${points.find(p=>p.id===selected)?.name}: ${(value*1000).toFixed(3)} mm · diagram ${gain}× only${review.influenceCards&&app.rig.deployment!==1?' · raising for card clearance':''}`;
    for(const b of buttons.children){const visible=app.rig.isPanelVisible(b.dataset.ripplePanel);
      const name=points.find(p=>p.id===b.dataset.ripplePanel)?.name;b.title=name||b.title;b.setAttribute('aria-label',`Ripple from ${name}`);
      b.disabled=!visible;b.hidden=!visible;b.setAttribute('aria-pressed',String(b.dataset.ripplePanel===selected));}
    frames++;
  }
  const unsubscribe=ripple.subscribe(invalidate);
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting||false;if(visible)invalidate();else stop();});observer.observe(canvas);
  // Leaving the host's Skills context must also release Review's click interception.
  const hostObserver=new IntersectionObserver(entries=>{app.setRippleReview({active:active&&Boolean(entries[0]?.isIntersecting)});});hostObserver.observe(root);
  const resize=new ResizeObserver(invalidate);resize.observe(canvas);
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
  const onVisibility=()=>{if(document.hidden)stop();else invalidate();};document.addEventListener('visibilitychange',onVisibility);
  return{setActive(value){active=Boolean(value);app.setRippleReview({active});if(active)invalidate();else stop();},
    select(id){selected=id;history.fill(0);historyCount=0;invalidate();},setGain(value){gain=Math.max(1,Math.min(1000,Number(value)||250));invalidate();},invalidate,
    getStats(){return{active,visible,frames,gain,selected,scheduled:Boolean(raf)};},
    dispose(){disposed=true;stop();unsubscribe();observer.disconnect();hostObserver.disconnect();resize.disconnect();document.removeEventListener('visibilitychange',onVisibility);buttons.removeEventListener('click',onClick);app.setRippleReview({active:false});}};
}
