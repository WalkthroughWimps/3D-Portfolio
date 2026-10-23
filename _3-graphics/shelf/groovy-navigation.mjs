const drawings={
 spread:'<g transform="translate(22 44) rotate(18)"><rect width="31" height="43" rx="4"/></g><g transform="translate(34 35)"><rect width="31" height="43" rx="4"/></g><g transform="translate(19 39) rotate(-21)"><rect width="31" height="43" rx="4"/></g>',
 grid:'<rect x="17" y="35" width="25" height="26" rx="3"/><rect x="48" y="35" width="25" height="26" rx="3"/><rect x="17" y="66" width="25" height="26" rx="3"/><rect x="48" y="66" width="25" height="26" rx="3"/>',
 return:'<path d="M23 61H61M35 47L21 61 35 75M60 46V80H75V42H57"/>',
 back:'<path d="M64 42L34 61 64 80M35 61H77"/>',
 previous:'<path d="M59 40L33 61 59 82M32 61H75"/>',
 next:'<path d="M40 40L66 61 40 82M66 61H24"/>',
 read:'<path d="M19 42Q34 37 45 45Q60 37 76 42V82Q60 77 45 84Q32 77 19 82ZM45 45V84"/>',
 close:'<rect x="31" y="36" width="39" height="49" rx="5"/><path d="M38 38V82M48 51H61M48 59H61"/>',
 open:'<path d="M20 58L45 70 76 56V79L45 91 20 78ZM20 58L45 45 76 56M45 70V90M22 56L16 43 42 32 48 46M73 56L83 43 54 32 48 46"/>',
 play:'<rect x="20" y="41" width="55" height="43" rx="7"/><path d="M42 49L61 62 42 76Z"/>',
 pack:'<path d="M21 52H76V83H21ZM21 52L31 40H64L76 52M48 53V82M38 36L48 46 58 36"/>',
 settings:'<path d="M23 46H74M23 62H74M23 78H74"/><circle cx="38" cy="46" r="6"/><circle cx="61" cy="62" r="6"/><circle cx="41" cy="78" r="6"/>'
};
let nextFilter=0;
export function groovyArtwork(label,icon){
 const id=`groovy-${++nextFilter}`;return `<svg viewBox="0 0 100 110" aria-hidden="true"><defs><filter id="${id}" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="3" stdDeviation="0" flood-color="#362039"/><feDropShadow dx="-1" dy="-1" stdDeviation=".4" flood-color="#fff4dc" flood-opacity=".9"/></filter></defs><circle cx="49" cy="62" r="39" fill="#ba784e"/><circle cx="49" cy="58" r="39" fill="#f4c592" stroke="#ffdfb9" stroke-width="2"/><g fill="#ffeed0" stroke="#fff1d4" stroke-width="10" stroke-linejoin="round" stroke-linecap="round" filter="url(#${id})">${drawings[icon]||drawings.back}</g><g fill="#ffe4be" stroke="#4776a2" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${drawings[icon]||drawings.back}</g><g transform="rotate(-7 50 20)" font-family="Georgia,serif" font-style="italic" font-weight="900" font-size="${label.length>9?17:21}" text-anchor="middle" stroke-linejoin="round" filter="url(#${id})"><text x="49" y="26" fill="#633455" stroke="#633455" stroke-width="7">${label}</text><text x="49" y="24" fill="#633455" stroke="#fff1d4" stroke-width="3" paint-order="stroke">${label}</text></g></svg>`;
}
// Context is explicit, making it impossible for hidden actions to intercept page input.
export function navigationActions({state,selected,layout,page,busy,turning=false}){
 if(busy||state==='shelf')return [];
 const book=selected.startsWith('book-'),game=selected.startsWith('game-'),actions=[];
 if(selected==='easel')return [{id:'return',label:'Shelf',icon:'return'}];
 if(book){const grade=Number(selected.split('-')[1]);if(layout==='spread'&&!turning&&page<=-.99999&&grade>1)actions.push({id:'previous-book',label:`Grade ${grade-1}`,side:'left',grade:grade-1});if(layout==='spread'&&!turning&&page>=9.99999&&grade<6)actions.push({id:'next-book',label:`Grade ${grade+1}`,side:'right',grade:grade+1});actions.push({id:'spread',label:`Back to ${layout}`,icon:layout});}
 if(book||state==='spread'||state==='grid')actions.push({id:'layout',label:layout==='spread'?'Grid':'Spread',icon:layout==='spread'?'grid':'spread'});
 if(book||state==='grid')actions.push({id:'open-book',label:page>-.99&&page<9.99?'Close':'Read',icon:page>-.99&&page<9.99?'close':'read'});
 if(game){if(state==='game')actions.push({id:'open-game',label:'Open',icon:'open'});if(state==='game-open')actions.push({id:'play-game',label:'Tabletop',icon:'play'},{id:'close-game',label:'Pack up',icon:'pack'});}
 if(book||game||state==='spread'||state==='grid')actions.push({id:'return',label:'Put away',icon:'return'});
 return actions;
}
export function createGroovyNavigation({onAction,reduced=()=>false}){
 const root=document.createElement('nav');root.className='groovy-navigation';root.setAttribute('aria-label','Shelf navigation');document.body.append(root);const items=new Map();let source=null,key='';
 fetch(new URL('./groovy-keyframes.json',import.meta.url)).then(r=>r.json()).then(j=>source=j).catch(()=>{});
 function animate(button,enter){if(reduced())return Promise.resolve();const frames=source?(enter?source.enter:source.exit):[{transform:`scale(${enter?0:1})`},{transform:`scale(${enter?1:0})`}];return button.animate(frames,{duration:enter?11/30*1000:20/30*1000,easing:'linear',fill:'both'}).finished.catch(()=>{});}
 return {
  update(context){const actions=navigationActions(context),next=JSON.stringify(actions);if(next===key)return;key=next;const ids=new Set(actions.map(a=>a.id));for(const [id,button] of items)if(!ids.has(id)){items.delete(id);button.disabled=true;button.inert=true;button.style.pointerEvents='none';button.setAttribute('aria-hidden','true');if(button.dataset.grade)button.remove();else animate(button,false).then(()=>button.remove());}
   for(const a of actions){let button=items.get(a.id);if(!button){button=document.createElement('button');button.type='button';button.dataset.action=a.id;root.append(button);items.set(a.id,button);button.addEventListener('click',()=>onAction(button.dataset.action,Number(button.dataset.grade)||null));if(!a.grade)animate(button,true);}button.dataset.side=a.side||'column';button.dataset.grade=a.grade||'';button.title=a.label;button.setAttribute('aria-label',a.id.includes('book')&&a.grade?`${a.id==='previous-book'?'Previous':'Next'} book · Grade ${a.grade}`:a.label);button.innerHTML=a.grade?`<span>${a.id==='previous-book'?'Previous':'Next'} book · Grade ${a.grade}</span>`:groovyArtwork(a.label,a.icon);button.classList.toggle('grade-pendant',!!a.grade);}
   let row=0;for(const button of items.values())if(button.dataset.side==='column')button.style.setProperty('--row',row++);root.style.setProperty('--rows',row);
  },
  position({left,right,y}){for(const button of items.values())if(button.dataset.side!=='column'){const x=button.dataset.side==='left'?left:right;button.style.left=`${x}px`;button.style.top=`${y}px`;}},
  dispose(){for(const button of root.children)button.getAnimations().forEach(a=>a.cancel());root.remove();items.clear();}
 };
}
