(() => {
  const names = { cakes:'Cake flavors', icings:'Icing flavors', fillings:'Fillings', toppers:'Toppers', sizes:'Sizes' };
  const defaults = window.CakeOrderOptions;
  const dialog = document.createElement('dialog'); dialog.id = 'studio-menu-dialog'; dialog.setAttribute('aria-labelledby','studio-menu-title');
  dialog.innerHTML = `<header><div><p class="menu-kicker">Customer choices</p><h2 id="studio-menu-title">Ordering menu</h2></div><button type="button" data-close aria-label="Close ordering menu">×</button></header>
    <p>Add choices, adjust their preview style, or hide unavailable items. Saved changes appear for all customers.</p>
    <label>Category<select id="menu-category"></select></label><label class="menu-limit-setting" id="menu-max-fillings-label">Max fillings per tier<select id="menu-max-fillings" aria-describedby="menu-max-fillings-help"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label><p class="menu-hint" id="menu-max-fillings-help">Customers can choose up to this many different fillings on each tier.</p><p class="menu-hint" id="menu-list-help">Drag choices to reorder them, or use the move buttons. Hidden choices stay at the bottom.</p><div id="menu-choices" aria-label="Existing choices" aria-describedby="menu-list-help"></div>
    <button type="button" id="menu-new">+ Add another choice</button>
    <form id="menu-choice-form"><h3 id="menu-form-title">Add a choice</h3><label>Name<input id="menu-label" maxlength="80" required autocomplete="off"></label>
    <label id="menu-base-label">Preview style<select id="menu-base"></select></label><label id="menu-color-label">Preview tint<input id="menu-color" type="color" value="#fff4df"></label>
    <button type="button" id="menu-use-current">Use current cake styling</button>
    <label class="menu-available"><input id="menu-available" type="checkbox" checked>Available to order</label>
    <fieldset id="menu-allergens"><legend>Allergen information</legend><p class="menu-hint">Only mark information verified after checking the recipe and cross-contact information. Customers should review their order with the studio; this information cannot guarantee an allergen-free item.</p><label class="menu-available"><input id="allergens-verified" type="checkbox">Recipe and cross-contact information checked</label><div id="allergen-options"></div><p class="menu-hint">Select allergens separately for “Contains” and “May contain.” Unknown information stays unverified. Names alone do not indicate allergens.</p></fieldset>
    <p class="menu-hint">New names use an existing cake or decoration style for their visual preview. Hiding a choice preserves previous orders.</p>
    <button type="submit">Save choice for customers</button></form><p id="menu-feedback" role="status"></p>`;
  document.body.append(dialog);
  const get = id => dialog.querySelector('#'+id), category=get('menu-category'), maxFillings=get('menu-max-fillings'), base=get('menu-base'), color=get('menu-color'), name=get('menu-label'), available=get('menu-available'), form=get('menu-choice-form'), feedback=get('menu-feedback');
  Object.entries(names).forEach(([id,label])=>category.add(new Option(label,id)));
  let catalog, editing=null, csrf, saving=false;
  async function api(url, init) {
    const response=await fetch(url,{cache:'no-store',...init});
    if(response.status===401){dialog.close();location.replace('/admin/login');throw new Error('Please sign in again.');}
    const result=await response.json();if(!response.ok){const error=new Error(result.error||'Unable to save the menu.');error.status=response.status;throw error;}return result;
  }
  function useCurrentStyle() {
    if(category.value==='cakes'){
      base.value=(typeof storedState!=='undefined'?storedState.colors?.cakePreset:null)||'redVelvet';
      const tint=getComputedStyle(document.documentElement).getPropertyValue('--cake-tint').trim();if(/^#[a-f\d]{6}$/i.test(tint))color.value=tint;
    } else if(category.value==='icings'){
      const icing=getComputedStyle(document.documentElement).getPropertyValue('--icing').trim();if(/^#[a-f\d]{6}$/i.test(icing))color.value=icing;
    }
  }
  const allergenOptions=get('allergen-options'), allergenNames=defaults.allergens||[];
  for(const allergen of allergenNames){const group=document.createElement('div');group.className='menu-allergen-option';const title=document.createElement('strong');title.textContent=allergen;group.append(title);for(const kind of ['contains','mayContain']){const label=document.createElement('label');label.className='menu-available';const input=document.createElement('input');input.type='checkbox';input.dataset.allergen=allergen;input.dataset.kind=kind;label.append(input,document.createTextNode(kind==='contains'?'Contains':'May contain'));group.append(label);}allergenOptions.append(group);}
  function edit(entry) {
    editing=entry?.id||null; get('menu-form-title').textContent=editing?'Edit choice':'Add a choice';
    name.value=entry?.label||''; available.checked=entry?.available??true;
    base.replaceChildren(...defaults[category.value].map(([id,label])=>new Option(label,id)));
    base.value=entry?.base||defaults[category.value][0][0]; color.value=entry?.color||defaults[category.value][0][2]||'#fff4df';
    get('menu-base-label').hidden=category.value==='sizes';
    get('menu-color-label').hidden=!['cakes','icings'].includes(category.value);
    get('menu-use-current').hidden=!['cakes','icings'].includes(category.value);
    get('menu-allergens').hidden=category.value==='sizes';
    const metadata=entry?.allergenInfo||{verified:false,contains:[],mayContain:[]};get('allergens-verified').checked=metadata.verified===true;
    allergenOptions.querySelectorAll('input').forEach(input=>{input.checked=(metadata[input.dataset.kind]||[]).includes(input.dataset.allergen);input.disabled=category.value==='sizes'||metadata.readOnly===true;});
    if(!entry)useCurrentStyle();
  }
  function renderList() {
    maxFillings.value=String(catalog.settings?.maxFillings??2);
    const list=get('menu-choices'),entries=catalog.groups[category.value];list.replaceChildren(...entries.map((entry,index)=>{
      const row=document.createElement('div');row.className='menu-choice-row'+(entry.available?'':' is-hidden');row.dataset.id=entry.id;row.draggable=entry.available&&!saving;
      const label=document.createElement('span');label.className='menu-choice-name';label.textContent=entry.label;
      const switchLabel=document.createElement('label');switchLabel.className='menu-switch';switchLabel.setAttribute('aria-label',`${entry.available?'Hide':'Show'} ${entry.label}`);const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=entry.available;toggle.disabled=saving;toggle.setAttribute('aria-label',`${entry.available?'Available':'Hidden'}: ${entry.label}`);toggle.addEventListener('change',()=>mutate({action:'toggle',group:category.value,id:entry.id,available:toggle.checked}));switchLabel.append(toggle,document.createTextNode(entry.available?'On':'Off'));
      const moves=document.createElement('div');moves.className='menu-moves';for(const [dir,caption] of [[-1,'Move up'],[1,'Move down']]){const move=document.createElement('button');move.type='button';move.textContent=dir<0?'↑':'↓';move.setAttribute('aria-label',`${caption} ${entry.label}`);move.disabled=!entry.available||saving||entries[index+dir]?.available!==true;move.addEventListener('click',()=>reorderBy(index,dir));moves.append(move);}
      const button=document.createElement('button');button.type='button';button.textContent='Edit';button.setAttribute('aria-label',`Edit ${entry.label}`);button.disabled=saving;button.addEventListener('click',()=>{edit(entry);name.focus();});row.append(label,switchLabel,moves,button);return row;
    }));
    let dragged=null,dropped=false;
    const shift=target=>{
      if(!dragged||dragged===target||target.classList.contains('is-hidden'))return;
      const nodes=[...list.children],before=new Map(nodes.map(node=>[node,node.getBoundingClientRect()])),from=nodes.indexOf(dragged),to=nodes.indexOf(target);
      list.insertBefore(dragged,from<to?target.nextSibling:target);
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const node of nodes){if(node===dragged)continue;const old=before.get(node),now=node.getBoundingClientRect();if(old.x!==now.x||old.y!==now.y)node.animate([{transform:`translate(${old.x-now.x}px,${old.y-now.y}px)`},{transform:'translate(0,0)'}],{duration:170,easing:'ease-out'});}
    };
    const finish=()=>{if(!dragged)return;dragged.classList.remove('dragging');dragged=null;dropped=true;const ids=[...list.children].map(node=>node.dataset.id);if(ids.some((id,index)=>id!==entries[index].id))mutate({action:'reorder',group:category.value,ids});};
    list.querySelectorAll('.menu-choice-row[draggable=true]').forEach(row=>{
      row.addEventListener('dragstart',event=>{dragged=row;dropped=false;event.dataTransfer.setData('text/plain',row.dataset.id);event.dataTransfer.effectAllowed='move';row.classList.add('dragging');});
      row.addEventListener('dragend',()=>{if(!dropped)renderList();dragged=null;});
      row.addEventListener('dragover',event=>{event.preventDefault();shift(row);});
      row.addEventListener('drop',event=>{event.preventDefault();finish();});
      const handle=document.createElement('button');handle.type='button';handle.className='menu-drag-handle';handle.textContent='⠿';handle.setAttribute('aria-label',`Drag ${row.dataset.id} to reorder`);handle.title='Drag to reorder; use arrow buttons with a keyboard';row.prepend(handle);
      handle.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;event.preventDefault();dragged=row;dropped=false;row.classList.add('dragging');handle.setPointerCapture(event.pointerId);});
      handle.addEventListener('pointermove',event=>{if(!dragged||event.pointerType==='mouse')return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.menu-choice-row');if(target&&target.parentElement===list)shift(target);});
      handle.addEventListener('pointerup',event=>{if(event.pointerType!=='mouse')finish();});
      handle.addEventListener('pointercancel',()=>{dragged=null;renderList();});
    });
  }
  async function reloadAfterConflict(){catalog=await api('/api/admin/menu');renderList();feedback.textContent='The menu changed elsewhere. The latest menu is loaded; review it and try your change again.';}
  async function mutate(payload){if(saving||!catalog)return;saving=true;category.disabled=true;maxFillings.disabled=true;get('menu-new').disabled=true;renderList();feedback.textContent='Saving…';try{catalog=await api('/api/admin/menu',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...payload,revision:catalog.revision})});renderList();feedback.textContent=payload.action==='settings'?'Filling limit saved. Customers will see it when they open or refresh the order form.':payload.action==='toggle'?(payload.available?'Choice is available.':'Choice hidden and moved to the bottom.'):'Order saved.';}catch(error){if(error.status===409){try{await reloadAfterConflict();}catch(loadError){feedback.textContent=`${error.message} Latest menu could not be loaded: ${loadError.message}`;}}else{catalog=await api('/api/admin/menu').catch(()=>catalog);renderList();feedback.textContent=error.message;}}finally{saving=false;category.disabled=false;maxFillings.disabled=false;get('menu-new').disabled=false;renderList();}}
  function reorderTo(from,to){const entries=[...catalog.groups[category.value]],moving=entries.splice(from,1)[0];entries.splice(to,0,moving);const active=entries.filter(x=>x.available),hidden=entries.filter(x=>!x.available);mutate({action:'reorder',group:category.value,ids:[...active,...hidden].map(x=>x.id)});}
  function reorderBy(index,dir){const entries=catalog.groups[category.value],target=index+dir;if(!entries[index]?.available||!entries[target]?.available)return;reorderTo(index,target);}
  async function open() {
    if(!dialog.open)dialog.showModal();feedback.textContent='Loading menu…';form.inert=true;category.disabled=true;get('menu-new').disabled=true;
    try { csrf=(await api('/api/admin/session')).csrf;catalog=await api('/api/admin/menu');renderList();edit(null);feedback.textContent=''; }
    catch(error){feedback.textContent=error.message;} finally{form.inert=!catalog;category.disabled=!catalog;get('menu-new').disabled=!catalog;}
  }
  category.addEventListener('change',()=>{if(catalog){renderList();edit(null);feedback.textContent='';}});
  maxFillings.addEventListener('change',()=>mutate({action:'settings',settings:{maxFillings:Number(maxFillings.value)}}));
  base.addEventListener('change',()=>{const source=catalog.groups[category.value].find(item=>item.id===base.value);if(source)color.value=source.color;});
  get('menu-new').addEventListener('click',()=>{edit(null);name.focus();feedback.textContent='';});
  get('menu-use-current').addEventListener('click',useCurrentStyle);
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving||!catalog)return;saving=true;const button=form.querySelector('[type=submit]');button.disabled=true;
    try {
      const allergenInfo={verified:get('allergens-verified').checked,contains:[],mayContain:[]};allergenOptions.querySelectorAll('input:checked').forEach(input=>allergenInfo[input.dataset.kind].push(input.dataset.allergen));
      catalog=await api('/api/admin/menu',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({id:editing,group:category.value,label:name.value,base:base.value,color:color.value,available:available.checked,allergenInfo,revision:catalog.revision})});
      renderList();edit(catalog.entry);feedback.textContent='Saved. Customers will see this choice when they open or refresh the order form.';
    }catch(error){if(error.status===409){try{await reloadAfterConflict();}catch(loadError){feedback.textContent=`${error.message} Latest menu could not be loaded: ${loadError.message}`;}}else feedback.textContent=error.message;}finally{saving=false;button.disabled=false;}
  });
  window.CakeStudioMenu={open};
})();
