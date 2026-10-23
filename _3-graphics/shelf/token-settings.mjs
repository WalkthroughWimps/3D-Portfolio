const KEY='site.games.character-stands.v1';
export const TOKEN_DEFAULTS=Object.freeze({outline:true,stroke:'#fff2db',strokeWidth:4,scale:1,opacity:1,artwork:null,characters:{}});
export function loadTokenSettings(){try{return {...TOKEN_DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return {...TOKEN_DEFAULTS};}}
export function characterSettings(settings,index){return {...settings,...settings.characters?.[index]};}
export function saveTokenSettings(value){const next={...TOKEN_DEFAULTS,...value};localStorage.setItem(KEY,JSON.stringify(next));dispatchEvent(new CustomEvent('character-stand-settings',{detail:next}));return next;}
// Expand only the silhouette's alpha, preserving holes and the supplied transparency.
export function outlinedArtwork(image,settings,{size=512}={}){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),mask=document.createElement('canvas');mask.width=mask.height=size;
 const m=mask.getContext('2d'),pad=settings.outline?Math.max(0,Math.min(24,settings.strokeWidth))*size/512+2:2,ratio=Math.min((size-2*pad)/image.width,(size-2*pad)/image.height),w=image.width*ratio,h=image.height*ratio,x=(size-w)/2,y=(size-h)/2;
 m.drawImage(image,x,y,w,h);
 if(settings.outline){const r=settings.strokeWidth*size/512;for(let angle=0;angle<Math.PI*2;angle+=Math.PI/24)ctx.drawImage(mask,Math.cos(angle)*r,Math.sin(angle)*r);ctx.globalCompositeOperation='source-in';ctx.fillStyle=settings.stroke;ctx.fillRect(0,0,size,size);ctx.globalCompositeOperation='source-over';}
 ctx.drawImage(mask,0,0);return canvas;
}
export function createTokenSettingsPanel(){
 const section=document.createElement('section');section.innerHTML=`<h2>Games</h2><h3>Character card stands</h3><label>Edit character <select data-character><option value="0">Defaults for all stands</option><option value="1">Character 1</option><option value="2">Character 2</option><option value="3">Character 3</option><option value="4">Character 4</option><option value="5">Character 5</option><option value="6">Character 6</option></select></label><p>Transparent PNG, WebP or SVG artwork. Stored on this browser and shared by both tabletop games.</p><label>Character artwork <input type="file" accept="image/png,image/webp,image/svg+xml,image/jpeg" data-token="artwork"></label><img data-token-preview alt="Character artwork preview" style="max-width:150px;max-height:150px;background:repeating-conic-gradient(#ddd 0 25%,white 0 50%) 0/16px 16px"><label><input data-token="outline" type="checkbox"> Outline the artwork silhouette</label><label>Stroke color <input data-token="stroke" type="color"></label><label>Stroke width <input data-token="strokeWidth" type="range" min="0" max="24" step="1"></label><label>Card size <input data-token="scale" type="range" min="0.6" max="1.5" step="0.05"></label><label>Artwork opacity <input data-token="opacity" type="range" min="0.1" max="1" step="0.05"></label><button type="button" data-token-clear>Use blank character cards</button><p data-token-status role="status"></p>`;
 let current=loadTokenSettings(),generation=0,character=0;const effective=()=>character?characterSettings(current,character):current;
 const status=section.querySelector('[data-token-status]'),preview=section.querySelector('[data-token-preview]');
 function show(){const value=effective();for(const input of section.querySelectorAll('[data-token]')){const key=input.dataset.token;if(key==='artwork')continue;if(input.type==='checkbox')input.checked=value[key];else input.value=value[key];}preview.hidden=!value.artwork;if(value.artwork)preview.src=value.artwork;}
 function commit(next){try{saveTokenSettings(next);current=next;status.textContent='Saved. Open tabletop pieces update immediately.';show();}catch{status.textContent='Could not save artwork. Browser storage is full; try a smaller image.';}}
 function change(patch){current=loadTokenSettings();commit(character?{...current,characters:{...current.characters,[character]:{...current.characters?.[character],...patch}}}:{...current,...patch});}
 const refresh=()=>{current=loadTokenSettings();show();};section.addEventListener('focusin',refresh);section.addEventListener('pointerenter',refresh);
 section.querySelector('[data-character]').addEventListener('change',e=>{character=Number(e.target.value);generation++;show();});
 section.addEventListener('input',e=>{const key=e.target.dataset.token;if(!key||key==='artwork')return;change({[key]:e.target.type==='checkbox'?e.target.checked:e.target.type==='range'?Number(e.target.value):e.target.value});});
 section.querySelector('[data-token="artwork"]').addEventListener('change',async e=>{
  const file=e.target.files?.[0],ticket=++generation;if(!file)return;status.textContent='Preparing transparent artwork…';
  const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');const scale=Math.min(1,1024/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);if(ticket===generation)change({artwork:canvas.toDataURL('image/png')});}catch{status.textContent='This image could not be decoded. Choose PNG, WebP, SVG or JPEG.';}finally{URL.revokeObjectURL(url);}
 });
 section.querySelector('[data-token-clear]').addEventListener('click',()=>{generation++;change({artwork:null});});show();return section;
}
