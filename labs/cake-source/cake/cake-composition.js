/* Lightweight tier composition uses the same supplied textures and garnish images. */
(function(scope){
  const textures={redVelvet:'red-velvet-cake-crumb-v2.webp',vanilla:'vanilla-cake-crumb-v2.webp',lemon:'lemon-cake-crumb-v2.webp',white:'white-cake-crumb-clean.webp',chocolate:'chocolate-cake-crumb-v1.webp',carrot:'carrot-cake-crumb-v1.webp',pistachio:'pistachio-cake-crumb-v1.webp'};
  const toppers=scope.CakeToppingVisuals;
  const fills={chocolateChips:'phase12-chocolate-chip-cut-a.webp',almondPieces:'materials/almond-cut-a-v1.webp',walnutPieces:'materials/walnut-cut-a-v1.webp',candyCoatedChocolate:'materials/candy-coated-cut-red-v1.webp',caramelNutChocolate:'materials/caramel-nut-chocolate-cut-v1.webp',peanutButterCup:'materials/peanut-butter-cup-half-v1.webp'};
  const observers=new WeakMap();
  function seedOf(value){let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;}
  function random(seed){let state=seed||1;return()=>{state+=0x6d2b79f5;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
  function spread(count,width,height,pad,seed){
    if(!count)return[];const rng=random(seed),points=[];
    const left=Math.min(width/2,pad),top=Math.min(height/2,pad),rangeX=Math.max(0,width-2*left),rangeY=Math.max(0,height-2*top);
    if(count===1)return[{x:width/2,y:height/2}];
    for(let index=0;index<count;index++){
      let best=null,score=-Infinity;
      for(let attempt=0;attempt<Math.max(48,count*5);attempt++){
        const x=left+rng()*rangeX,y=top+rng()*rangeY;
        const nearest=points.reduce((distance,point)=>Math.min(distance,Math.hypot(x-point.x,y-point.y)),Infinity);
        const edge=Math.min(x,width-x,y,height-y),candidate=nearest+edge*.13+rng()*.03;
        if(candidate>score){best={x,y};score=candidate;}
      }
      points.push(best);
    }
    // A small centroid pass evens the gaps while keeping every point in bounds.
    for(let pass=0;pass<2;pass++){
      const sums=points.map(()=>({x:0,y:0,count:0})),samples=Math.max(120,count*24);
      for(let sample=0;sample<samples;sample++){
        const x=left+rng()*rangeX,y=top+rng()*rangeY;let owner=0,distance=Infinity;
        points.forEach((point,index)=>{const d=(x-point.x)**2+(y-point.y)**2;if(d<distance){distance=d;owner=index;}});
        sums[owner].x+=x;sums[owner].y+=y;sums[owner].count++;
      }
      points.forEach((point,index)=>{const sum=sums[index];if(!sum.count)return;point.x=Math.max(left,Math.min(width-left,point.x*.65+sum.x/sum.count*.35));point.y=Math.max(top,Math.min(height-top,point.y*.65+sum.y/sum.count*.35));});
    }
    return points;
  }
  function interleave(groups){const result=[];for(let index=0;groups.some(group=>index<group.length);index++)for(const group of groups)if(group[index])result.push(group[index]);return result;}
  function sizeContents(container){
    const rows=[...container.querySelectorAll('.composition-tier')],compact=container.classList.contains('compact-cake-preview');
    for(const row of rows){
      const width=row.clientWidth||(compact?76:Math.max(84,container.clientWidth||84));
      const height=row.clientHeight||(compact?76/rows.length:Math.max(24,(container.clientHeight||56)/rows.length));
      const piece=Math.round(Math.min(44,Math.max(16,width*.07,height*.30)));
      const families=[...new Set([...row.querySelectorAll('.composition-filling')].map(img=>img.dataset.fillingIndex))];
      const density=Math.min(1,width*height/(piece*piece*30*Math.sqrt(Math.max(1,families.length))));
      const chosen=interleave(families.map(family=>[...row.querySelectorAll(`.composition-filling[data-filling-index="${family}"]`)].filter(img=>Number(img.dataset.pieceIndex)<Math.max(1,Math.round(Number(img.dataset.baseCount)*density)))));
      for(const img of row.querySelectorAll('.composition-filling'))img.hidden=!chosen.includes(img);
      const icing=Math.min(height*.16,Math.max(4,piece*.25)),areaHeight=Math.max(0,height-icing);
      const points=spread(chosen.length,width,areaHeight,piece*.65,seedOf(row.dataset.fillingSeed||''));
      chosen.forEach((img,index)=>{img.style.width=piece+'px';img.style.height='auto';img.style.left=points[index].x+'px';img.style.top=(icing+points[index].y)+'px';img.style.transform=`translate(-50%,-50%) rotate(${img.dataset.rotation}deg)`;});
      const cap=Math.round(Math.min(42,Math.max(14,height*.4))),all=[...row.querySelectorAll('.composition-topper')];
      const hasSprinkles=all.some(element=>element.classList.contains('composition-sprinkle'));
      const visible=Math.min(all.length,Math.max(2,Math.floor(width/(hasSprinkles?22:40))));
      all.forEach((img,index)=>img.hidden=index>=visible);
      const band=Math.min(height,Math.max(cap,height*.35)),topPoints=spread(visible,width,band,cap*.7,seedOf(row.dataset.topperSeed||''));
      all.slice(0,visible).forEach((img,index)=>{
        const profile=toppers[img.dataset.topper],sprinkle=img.classList.contains('composition-sprinkle');
        const ratio=sprinkle?0.43:(img.naturalWidth&&img.naturalHeight?img.naturalHeight/img.naturalWidth:1)*profile.heightScale;
        const drawnWidth=sprinkle?Math.max(6,Math.min(14,width*.025)):Math.max(1,Math.min(profile.width,cap/Math.max(.05,ratio),width*.26));
        img.style.width=drawnWidth+'px';img.style.height=Math.max(1,drawnWidth*ratio)+'px';img.style.left=topPoints[index].x+'px';img.style.top=Math.max(0,topPoints[index].y-drawnWidth*ratio/2)+'px';img.style.bottom='auto';
      });
    }
  }
  function render(container,item,options){container.replaceChildren();container.dataset.tiers=item.tiers.length;const generation=String(Number(container.dataset.generation||0)+1);container.dataset.generation=generation;
    const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
    for(const [ti,tier]of item.tiers.entries()){
      const cake=options.visuals?.cakes?.[tier.flavor]?.base||tier.flavor,color=tier.icing?(options.visuals?.icings?.[tier.icing]?.color||options.icings.find(i=>i[0]===tier.icing)?.[2]||'#d0d0d0'):'#bfc0c1';
      const row=node('div','composition-tier');row.style.backgroundImage=tier.flavor&&textures[cake]?`url('/cake/assets/images/backgrounds/${textures[cake]}')`:'none';row.classList.toggle('composition-neutral',!tier.flavor);row.classList.toggle('composition-neutral-icing',!tier.icing);row.dataset.flavor=tier.flavor;row.style.setProperty('--tier-icing',color);
      const band=node('div','composition-icing');row.append(band);row.append(node('span','composition-tier-label',`${CakeOrderModel.tierName(item,ti)} · ${options.cakes.find(c=>c[0]===tier.flavor)?.[1]||tier.flavor}`));
      const fillingList=CakeOrderModel.effectiveFillings(item,tier);row.dataset.fillingSeed=fillingList.map(f=>f.id).join('|')+'|'+ti;
      for(const [fi,f]of fillingList.entries()){
        const base=options.visuals?.fillings?.[f.id]?.base||f.id;if(!fills[base])continue;
        const count={light:3,normal:5,extra:8}[f.amount]||5;
        for(let i=0;i<count;i++){
          const img=node('img','composition-filling');img.alt='';img.dataset.fillingIndex=String(fi);img.dataset.pieceIndex=String(i);img.dataset.baseCount=String(count);img.dataset.rotation=String((i*47+fi*13)%100-50);
          img.src='/cake/assets/images/'+fills[base];row.append(img);
        }
      }
      const toppingGroups=tier.toppers.map(t=>Array.from({length:t.quantity*((options.visuals?.toppers?.[t.id]?.base||t.id)==='rainbowSprinkles'?6:1)},()=>t.id));const all=interleave(toppingGroups);row.dataset.topperSeed=tier.toppers.map(t=>t.id).join('|')+'|'+ti;
      for(const [index,id]of all.entries()){
        const base=options.visuals?.toppers?.[id]?.base||id,profile=toppers[base];if(!profile)continue;
        if(base==='rainbowSprinkles'){
          const sprinkle=node('span','composition-topper composition-sprinkle');sprinkle.dataset.topper=base;sprinkle.style.backgroundColor=['#ec3b4a','#20b7e2','#f4c32f','#5dc755','#f382d0','#f8ede0'][index%6];sprinkle.style.borderRadius='999px';sprinkle.style.transform=`translateX(-50%) rotate(${(index*47)%150-75}deg)`;row.append(sprinkle);
        }else{
          const img=node('img','composition-topper');img.alt='';img.dataset.topper=base;
          img.onload=()=>{if(container.dataset.generation===generation&&img.isConnected)sizeContents(container);};
          img.src='/cake/assets/images/'+profile.image;row.append(img);
        }
      }
      container.append(row);
    }
    sizeContents(container);
    if(container.id==='composed-cake-preview'&&!observers.has(container)&&typeof ResizeObserver==='function'){
      const observer=new ResizeObserver(()=>{if(container.isConnected)sizeContents(container);});observer.observe(container);observers.set(container,observer);
    }
  }
  scope.CakeComposition={render};
})(window);
