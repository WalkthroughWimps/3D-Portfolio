(() => {
  const cakeCrumbs={redVelvet:'assets/images/backgrounds/red-velvet-cake-crumb-v2.webp',vanilla:'assets/images/backgrounds/vanilla-cake-crumb-v2.webp',lemon:'assets/images/backgrounds/lemon-cake-crumb-v2.webp',white:'assets/images/backgrounds/white-cake-crumb-clean.webp',chocolate:'assets/images/backgrounds/chocolate-cake-crumb-v1.webp',carrot:'assets/images/backgrounds/carrot-cake-crumb-v1.webp',pistachio:'assets/images/backgrounds/pistachio-cake-crumb-v1.webp'};
  const toppingAssets={strawberry:'assets/images/explorer/strawberry-whole.webp',blueberries:'assets/images/toppers/blueberries-resting-v1.webp',raspberries:'assets/images/toppers/raspberries-resting-v1.webp',chocolateCurls:'assets/images/toppers/chocolate-curls-resting-v1.webp',rainbowSprinkles:'assets/images/toppers/rainbow-sprinkles-resting-v1.webp'};
  const wholeMaterials={chocolateChips:['assets/images/explorer/chocolate-chips-whole.svg'],candyCoatedChocolate:['assets/images/explorer/candy-coated-photo-v2.webp'],almondPieces:['assets/images/materials/almond-whole-v1.webp','assets/images/materials/almond-broken-v1.webp'],walnutPieces:['assets/images/materials/walnut-whole-v1.webp','assets/images/materials/walnut-broken-v1.webp'],caramelNutChocolate:['assets/images/explorer/caramel-peanut-bar-photo-v2.webp'],peanutButterCup:['assets/images/explorer/peanut-cup-whole.svg','assets/images/explorer/peanut-cup-whole.svg','assets/images/explorer/peanut-cup-whole.svg'],rosette:['assets/images/explorer/piped-rosette-whole.svg'],pipedDollop:['assets/images/explorer/piped-dollop-whole.svg'],pipedRuffle:['assets/images/explorer/piped-ruffle-whole.svg'],fondantDisc:['assets/images/explorer/fondant-disc-whole.svg'],fondantRibbon:['assets/images/explorer/fondant-ribbon-whole.svg']};
  const safeColor=value=>/^#[a-f\d]{6}$/i.test(value||'')?value:null;
  function illustration(group,id,menu){
    const node=document.createElement('div');node.className=`option-art option-art-${group}`;node.setAttribute('aria-hidden','true');
    const base=menu?.visuals?.[group]?.[id]?.base||id;
    if(group==='cakes'){
      node.classList.add('option-art-cake');const crumb=cakeCrumbs[base]||cakeCrumbs.vanilla;node.style.setProperty('--crumb-image',`url("${crumb}")`);return node;
    }
    if(group==='icings'){
      node.classList.add('option-art-icing');node.style.setProperty('--icing-color',safeColor(menu?.visuals?.icings?.[id]?.color)||'#fff4df');node.dataset.base=base;const photo=document.createElement('img');photo.src='assets/images/explorer/buttercream-disk.webp';photo.alt='';photo.className='option-icing-photo';photo.loading='lazy';photo.decoding='async';node.append(photo);return node;
    }
    node.classList.add(group==='fillings'?'option-art-filling':'option-art-topping');
    if(id==='none'||base==='none'){node.classList.add('option-art-empty');return node;}
    const paths=group==='toppers'?toppingAssets:{};
    const assets=paths[base]?[paths[base]]:wholeMaterials[base]||[];
    if(assets.length){assets.slice(0,3).forEach((src,index)=>{const image=document.createElement('img');image.src=src;image.alt='';image.loading='lazy';image.decoding='async';image.className=`option-piece option-piece-${index+1}`;node.append(image);});}
    else {node.classList.add('option-art-placeholder');node.dataset.kind=base;const shape=document.createElement('span');shape.className='option-shape';shape.textContent=base==='strawberry'?'♥':base==='rosette'||base==='pipedDollop'?'✿':base==='pipedRuffle'?'❀':base==='fondantRibbon'?'〰':base==='fondantDisc'?'●':'✦';node.append(shape);}
    return node;
  }
  window.CakeOptionVisuals={render:illustration,assets:{cakes:cakeCrumbs,toppers:toppingAssets,wholeMaterials}};
})();
