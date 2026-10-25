/* Shared measured ingredient huddle. Seeded placement keeps each category stable. */
(() => {
  const hash = value => { let h=2166136261; for(const c of String(value)) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; };
  const intersects=(a,b)=>a.x<b.x+b.w-.01&&a.x+a.w>b.x+.01&&a.y<b.y+b.h-.01&&a.y+a.h>b.y+.01;
  const contains=(a,b)=>a.x<=b.x+.01&&a.y<=b.y+.01&&a.x+a.w>=b.x+b.w-.01&&a.y+a.h>=b.y+b.h-.01;
  function subtract(free,box){
    const next=[];
    for(const r of free){
      if(!intersects(r,box)){next.push(r);continue;}
      if(box.x>r.x)next.push({x:r.x,y:r.y,w:box.x-r.x,h:r.h});
      if(box.x+box.w<r.x+r.w)next.push({x:box.x+box.w,y:r.y,w:r.x+r.w-box.x-box.w,h:r.h});
      if(box.y>r.y)next.push({x:r.x,y:r.y,w:r.w,h:box.y-r.y});
      if(box.y+box.h<r.y+r.h)next.push({x:r.x,y:box.y+box.h,w:r.w,h:r.y+r.h-box.y-box.h});
    }
    return next.filter((r,i)=>r.w>=1&&r.h>=1&&!next.some((q,j)=>i!==j&&contains(q,r)&&(q.w*q.h>r.w*r.h||j<i)));
  }
  function mount(container,{entries=[],group,menu,selectedIds=[],onSelect=()=>{},compact=true,seed=0}={}) {
    const layer=document.createElement('div');layer.className='option-huddle';layer.setAttribute('role','group');layer.setAttribute('aria-label','Available '+group);
    container.replaceChildren(layer);let destroyed=false,motion=null,frame=0,lastSize='';
    const render=()=>{
      if(destroyed)return;
      const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;
      lastSize=w+'x'+h;layer.replaceChildren();
      let state=(hash(group)+hash(seed)+1)>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
      const data=entries.map(([id,label],i)=>{
        const el=document.createElement('button');el.type='button';el.className='huddle-option';el.dataset.id=id;el.style.boxSizing='border-box';el.style.minHeight='44px';
        const visual=window.CakeOptionVisuals.render(group,id,menu),caption=document.createElement('span');caption.className='huddle-label';caption.textContent=label;
        el.append(visual,caption);el.setAttribute('aria-label',label);el.setAttribute('aria-pressed',String(selectedIds.includes(id)));el.classList.toggle('is-selected',selectedIds.includes(id));
        el.addEventListener('click',()=>onSelect(id,selectedIds.includes(id),el));layer.append(el);
        return {id,label,i,el,visual,caption,variants:[]};
      });
      const panel=container.getBoundingClientRect(),pad=6,gap=compact?6:9;
      const obstacles=[...container.parentElement.querySelectorAll('.flavor-arrow')].map(b=>{const r=b.getBoundingClientRect();return{x:r.left-panel.left-2,y:r.top-panel.top-2,w:r.width+4,h:r.height+4};}).filter(r=>r.x<w&&r.x+r.w>0&&r.y<h&&r.y+r.h>0);
      const area=w*h/Math.max(1,data.length),baseArt=Math.max(24,Math.min(88,Math.sqrt(area)*.58));
      const apply=(item,v)=>{item.el.classList.toggle('is-inline',v.inline);item.el.style.flexDirection=v.inline?'row':'column';item.el.style.gap=v.inline?'4px':'3px';item.el.style.padding='3px';item.el.style.width=v.w+'px';item.caption.style.minWidth='0';item.caption.style.flex=v.inline?'1 1 0':'0 1 auto';item.visual.style.setProperty('--art-size',v.art+'px');};
      // Measure real text wrapping rather than estimating a character count. Several
      // footprints let long names sit beside their art while short names sit below it.
      for(const item of data){
        for(let level=0;level<4;level++){
          const art=Math.max(18,Math.round(baseArt*(1-level*.21)));
          for(const inline of [false,true]){
            for(const width of inline?[64,72,80,88,96,104,112,128,144]:[56,64,72,80,88,96,112,136]){
              if(!inline&&width<art+6)continue;
              const v={w:Math.min(w-pad*2,width),art,inline,level};apply(item,v);
              const rect=item.el.getBoundingClientRect(),label=item.caption.getBoundingClientRect();
              if(rect.height>h-pad*2||label.height>49||item.caption.scrollWidth>label.width+1)continue;
              v.h=Math.max(44,Math.ceil(rect.height));v.cost=level*20+(inline?7:0)+Math.abs(width-(inline?116:92))*.06;
              if(!item.variants.some(q=>q.w===v.w&&q.h===v.h&&q.art===v.art&&q.inline===v.inline))item.variants.push(v);
            }
          }
        }
      }
      let solution=null,bestPenalty=Infinity;
      const preferred=data.map(item=>({item,v:item.variants.filter(v=>v.level===0&&!v.inline).sort((a,b)=>a.w*a.h-b.w*b.h)[0]}));
      const preferredArea=preferred.reduce((sum,q)=>sum+(q.v?(q.v.w+gap)*(q.v.h+gap):w*h),0);
      if(preferredArea<w*h*.66){
        // In a roomy category, use best-candidate Poisson anchors directly. Distances
        // are normalized to the panel so the huddle uses its full height as well.
        for(let pass=0;pass<24&&!solution;pass++){
          const placed=[],order=preferred.map(q=>({...q,key:rand()})).sort((a,b)=>b.v.w*b.v.h-a.v.w*a.v.h||a.key-b.key);
          for(const q of order){
            let best=null,bestScore=-Infinity;
            for(let k=0;k<160;k++){
              const bw=q.v.w+gap,bh=q.v.h+gap,x=pad+rand()*Math.max(0,w-pad*2-bw+gap),y=pad+rand()*Math.max(0,h-pad*2-bh+gap),r={x,y,w:bw,h:bh,item:q.item,v:q.v};
              if(obstacles.some(o=>intersects(r,o))||placed.some(o=>intersects(r,o)))continue;
              const cx=(x+bw/2)/w,cy=(y+bh/2)/h;
              const separation=placed.length?Math.min(...placed.map(o=>Math.hypot(cx-(o.x+o.w/2)/w,cy-(o.y+o.h/2)/h))):.5;
              const edge=Math.hypot((cx-.5)*1.1,cy-.5);
              const score=separation-edge*.16;
              if(score>bestScore){best=r;bestScore=score;}
            }
            if(!best)break;placed.push(best);
          }
          if(placed.length===data.length)solution=placed;
        }
      }
      const roomySolution=!!solution;
      // Each pass uses a different seeded ordering and measured footprint. Free-space
      // subtraction guarantees distinct hit targets; later relaxation breaks alignment.
      for(let attempt=0;attempt<300&&!roomySolution;attempt++){
        const level=Math.min(3,Math.floor(attempt/75));
        const chosen=data.map(item=>{
          const variants=item.variants.filter(v=>v.level<=level).sort((a,b)=>(a.w+gap)*(a.h+gap)-(b.w+gap)*(b.h+gap)+a.cost-b.cost);
          const v=variants[0];return {item,v,variants,key:rand()};
        });
        if(chosen.some(q=>!q.v))continue;
        chosen.sort((a,b)=>attempt%3===0?b.v.w*b.v.h-a.v.w*a.v.h:attempt%3===1?b.v.h-a.v.h||b.key-a.key:b.key-a.key);
        let free=[{x:pad,y:pad,w:w-pad*2+gap,h:h-pad*2+gap}];for(const r of obstacles)free=subtract(free,{x:r.x-gap/2,y:r.y-gap/2,w:r.w+gap,h:r.h+gap});
        const placed=[];let penalty=0;
        for(const q of chosen){
          const bw=q.v.w+gap,bh=q.v.h+gap;let best=null,score=Infinity;
          for(const v of q.variants)for(const r of free){
            const bw=v.w+gap,bh=v.h+gap;
            if(r.w<bw-.01||r.h<bh-.01)continue;
            const short=Math.min(r.w-bw,r.h-bh),long=Math.max(r.w-bw,r.h-bh);
            const cost=short+long*.035+v.w*v.h*.06+v.cost*.08+rand()*12;
            if(cost<score){score=cost;const right=rand()<.5,bottom=rand()<.5;best={x:right?r.x+r.w-bw:r.x,y:bottom?r.y+r.h-bh:r.y,w:bw,h:bh,item:q.item,v};}
          }
          if(!best)break;placed.push(best);penalty+=best.v.cost;free=subtract(free,best);
        }
        if(placed.length!==data.length)continue;
        if(penalty<bestPenalty){solution=placed;bestPenalty=penalty;}
        if(attempt>=12&&bestPenalty<40)break;
      }
      if(solution){
        // Sample a small collision-free orbit around each anchor. On roomy screens
        // targets can drift much farther from the packing edges, producing a huddle
        // with varying heights and spacing rather than rows or columns.
        const blocked=q=>obstacles.some(r=>intersects(q,r));
        for(let pass=0;pass<45;pass++)for(const q of solution){
          const radius=Math.max(3,Math.min(20,Math.sqrt(area)*.13))*(1-pass/60);
          const nx=Math.max(pad,Math.min(w-pad-q.w+gap,q.x+(rand()-.5)*radius)),ny=Math.max(pad,Math.min(h-pad-q.h+gap,q.y+(rand()-.5)*radius));
          const candidate={x:nx,y:ny,w:q.w,h:q.h};
          if(!blocked(candidate)&&!solution.some(other=>other!==q&&intersects(candidate,other))){q.x=nx;q.y=ny;}
        }
        for(const q of solution){apply(q.item,q.v);q.item.el.style.left=q.x+'px';q.item.el.style.top=q.y+'px';}
      }else{
        // A measured failure is visible to acceptance checks; never silently hide
        // choices or make their text smaller to conceal an undersized panel.
        for(const item of data){const v=item.variants.slice().sort((a,b)=>a.w*a.h-b.w*b.h)[0]||{w:44,h:44,art:18,inline:true};apply(item,v);item.el.style.left=pad+'px';item.el.style.top=pad+'px';}
      }
      const rects=data.map(q=>q.el.getBoundingClientRect());let collisions=0;
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(intersects({x:rects[i].left,y:rects[i].top,w:rects[i].width,h:rects[i].height},{x:rects[j].left,y:rects[j].top,w:rects[j].width,h:rects[j].height}))collisions++;
      layer.dataset.layoutCollisionCount=String(collisions);layer.dataset.layoutImpossible=String(!solution||collisions>0||rects.some(r=>r.width<44||r.height<44||r.left<panel.left||r.right>panel.right+.1||r.top<panel.top||r.bottom>panel.bottom+.1));motion?.refresh();
    };
    const schedule=()=>{if(destroyed||container.clientWidth+'x'+container.clientHeight===lastSize)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(render);};
    const resize=new ResizeObserver(schedule);resize.observe(container);render();motion=window.CakeOptionMotion?.mount(container,{selector:'.huddle-option',selected:n=>n.classList.contains('is-favorite')||n.getAttribute('aria-pressed')==='true'})||null;
    const update=opts=>{if(opts.selectedIds)selectedIds=opts.selectedIds;if(opts.entries||opts.menu){if(opts.entries)entries=opts.entries;if(opts.menu)menu=opts.menu;render();return;}for(const node of layer.querySelectorAll('.huddle-option')){const selected=selectedIds.includes(node.dataset.id);node.setAttribute('aria-pressed',String(selected));node.classList.toggle('is-selected',selected);}};
    return {update,destroy(){destroyed=true;cancelAnimationFrame(frame);resize.disconnect();motion?.destroy();layer.remove();}};
  }
  window.CakeOptionHuddle={mount};
})();
