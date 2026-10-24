/* Lightweight tier composition uses the same supplied textures and garnish images. */
(function(scope){
  const textures={redVelvet:'red-velvet-cake-crumb-v2.webp',vanilla:'vanilla-cake-crumb-v2.webp',lemon:'lemon-cake-crumb-v2.webp',white:'white-cake-crumb-clean.webp',chocolate:'chocolate-cake-crumb-v1.webp',carrot:'carrot-cake-crumb-v1.webp',pistachio:'pistachio-cake-crumb-v1.webp'};
  const toppers=scope.CakeToppingVisuals;
  const fills={chocolateChips:'phase12-chocolate-chip-cut-a.webp',almondPieces:'materials/almond-cut-a-v1.webp',walnutPieces:'materials/walnut-cut-a-v1.webp',candyCoatedChocolate:'materials/candy-coated-cut-red-v1.webp',caramelNutChocolate:'materials/caramel-nut-chocolate-cut-v1.webp',peanutButterCup:'materials/peanut-butter-cup-half-v1.webp'};
  function render(container,item,options){container.replaceChildren();container.dataset.tiers=item.tiers.length;
    const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text)n.textContent=text;return n;};
    for(const [ti,tier]of item.tiers.entries()){
      const cake=options.visuals?.cakes?.[tier.flavor]?.base||tier.flavor,color=options.visuals?.icings?.[tier.icing]?.color||options.icings.find(i=>i[0]===tier.icing)?.[2]||'#fff4df';
      const row=node('div','composition-tier');row.style.backgroundImage=`url('/cake/assets/images/backgrounds/${textures[cake]||textures.redVelvet}')`;row.dataset.flavor=tier.flavor;row.style.setProperty('--tier-icing',color);
      const band=node('div','composition-icing');row.append(band);row.append(node('span','composition-tier-label',`${CakeOrderModel.tierName(item,ti)} · ${options.cakes.find(c=>c[0]===tier.flavor)?.[1]||tier.flavor}`));
      const fillingList=CakeOrderModel.effectiveFillings(item,tier);for(const [fi,f]of fillingList.entries()){const base=options.visuals?.fillings?.[f.id]?.base||f.id;if(!fills[base])continue;const count={light:8,normal:14,extra:21}[f.amount]||14;for(let i=0;i<count;i++){const img=node('img','composition-filling');img.alt='';img.src='/cake/assets/images/'+fills[base];img.style.left=(3+(i*29+fi*13)%90)+'%';img.style.top=(25+(i*31+fi*17)%64)+'%';img.style.transform=`rotate(${(i*47+fi*13)%160-80}deg)`;row.append(img);}}
      const all=tier.toppers.flatMap(t=>Array.from({length:t.quantity},()=>t.id));
      for(const [i,id]of all.entries()){
        const base=options.visuals?.toppers?.[id]?.base||id,profile=toppers[base];if(!profile)continue;
        const img=node('img','composition-topper');img.alt='';img.dataset.topper=base;
        const availableWidth=Math.max(1,Math.min(profile.width,container.clientWidth*.85/Math.max(1,all.length)));
        img.style.width=availableWidth+'px';
        img.onload=()=>{
          const ratio=img.naturalHeight/img.naturalWidth*profile.heightScale;
          const width=Math.min(availableWidth,46/ratio);
          img.style.width=width+'px';img.style.height=Math.max(1,width*ratio)+'px';
        };
        img.src='/cake/assets/images/'+profile.image;img.style.left=((i+.5)/all.length*94+3)+'%';row.append(img);
      }
      container.append(row);
    }
  }
  scope.CakeComposition={render};
})(window);
