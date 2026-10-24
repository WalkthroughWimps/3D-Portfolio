/* Shared frontal knife-cut views for the scene, tiers, and order thumbnails. */
(function(scope){
  const visuals = {
    strawberry: { image:'toppers/sliced-strawberry-v1.webp', heightScale:1, width:64, cutFace:true },
    rosette: { image:'toppers/sliced-rosette-v1.webp', heightScale:1, width:52, icing:true },
    pipedDollop: { image:'phase10-piped-dollop-v1.png', heightScale:1, width:52, icing:true },
    pipedRuffle: { image:'phase10-piped-ruffle-v1.png', heightScale:1, width:52, icing:true },
    fondantDisc: { image:'phase10-fondant-disc-v1.png', heightScale:1, width:64 },
    fondantRibbon: { image:'phase10-fondant-ribbon-v1.png', heightScale:1, width:64 },
    chocolateChips: { image:'toppers/chocolate-chip-cutface-v1.webp', heightScale:1, width:34, cutFace:true },
    candyCoatedChocolate: { image:'toppers/candy-coated-cutface-v1.webp', heightScale:1, width:30, cutFace:true },
    almondPieces: { image:'toppers/almond-cutface-v1.webp', heightScale:1, width:42, cutFace:true },
    walnutPieces: { image:'toppers/walnut-cutface-v1.webp', heightScale:1, width:42, cutFace:true },
    caramelNutChocolate: { image:'toppers/caramel-nut-chocolate-cutface-v1.webp', heightScale:1, width:44, cutFace:true },
    peanutButterCup: { image:'toppers/peanut-butter-cup-cutface-v1.webp', heightScale:1, width:44, cutFace:true },
    blueberries: { image:'toppers/blueberries-cutface-v1.webp', heightScale:1, width:74, cutFace:true, label:'Blueberries' },
    raspberries: { image:'toppers/raspberries-cutface-v1.webp', heightScale:1, width:70, cutFace:true, label:'Raspberries' },
    chocolateCurls: { image:'toppers/chocolate-curls-cutface-v1.webp', heightScale:1, width:80, cutFace:true, label:'Chocolate curls' },
    rainbowSprinkles: { image:'toppers/rainbow-sprinkles-cutface-v1.webp', heightScale:1, width:86, cutFace:true, label:'Rainbow sprinkles' }
  };
  Object.values(visuals).forEach(v=>{if(v.sprites)Object.freeze(v.sprites);Object.freeze(v);});
  Object.freeze(visuals);
  if(typeof module!=='undefined')module.exports=visuals;else scope.CakeToppingVisuals=visuals;
})(typeof window==='undefined'?globalThis:window);
