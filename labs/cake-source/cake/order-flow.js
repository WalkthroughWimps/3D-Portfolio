/* Provisional screen layout. Allergy review remains first; later screens can be reordered. */
window.createCakeOrderFlow = function(form, { allergies, applyAllergies, isRetry }) {
  const element=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const choices=form.querySelector('.cake-choices'), allergy=form.querySelector('[aria-labelledby="allergies-heading"]');
  const celebration=document.querySelector('#event-date').closest('section'),contact=form.querySelector('[name=name]').closest('section');
  const take=id=>document.getElementById(id);
  const make=(id,title)=>{const panel=element('section','card fields build-screen');panel.dataset.screen=id;const h=element('h2','build-heading',title);h.tabIndex=-1;panel.append(h);return panel;};
  const items=make('items','Your cakes'),quantity=make('quantity','Cake quantity'),cake=make('cake','Cake & size'),icing=make('icing','Icing'),toppings=make('toppings','Toppings'),topperQuantities=make('topper-quantities','Topper quantities'),fillings=make('fillings','Filling'),fillingAmount=make('filling-amount','Filling amount'),extraFillings=make('extra-fillings','Additional fillings'),topNotes=make('top-notes','Top tier notes'),tiers=make('tiers','Cake tiers'),itemNotes=make('item-notes','Cake item notes');
  const sizeLabel=take('size').parentElement,icingLabel=take('icing').parentElement,oldPair=sizeLabel.parentElement;
  items.append(choices.querySelector('.fields'));
  quantity.append(form.querySelector('[name=quantity]').parentElement);
  cake.append(take('flavor').parentElement,sizeLabel);
  icing.append(icingLabel);oldPair.remove();
  const toppingPair=take('topperA').parentElement.parentElement,quantities=take('topperA-quantity').parentElement.parentElement;
  toppings.append(toppingPair);topperQuantities.append(quantities);
  const fillingAdditions=take('top-extra-fillings').parentElement;
  const tierNotes=take('top-tier-notes').parentElement;
  fillings.append(take('filling').parentElement);fillingAmount.append(take('amount-field'));
  extraFillings.append(take('top-extra-fillings'),take('top-add-filling'));
  topNotes.append(tierNotes);fillingAdditions.remove();
  const tierFooter=take('mix-fillings-field').parentElement,cakeItemNotes=take('cake-item-notes').parentElement;
  take('mix-fillings').title=take('mix-fillings-help').textContent;
  tiers.append(take('bottom-tier-fields'),tierFooter);
  itemNotes.append(cakeItemNotes);
  choices.replaceWith(items,quantity,cake,icing,toppings,topperQuantities,fillings,fillingAmount,extraFillings,topNotes,tiers,itemNotes);
  for(const screen of [items,quantity,cake,icing,toppings,topperQuantities,fillings,fillingAmount,extraFillings,topNotes,tiers,itemNotes])for(const hint of [...screen.querySelectorAll('.hint:not([id])')]){
    if(hint.textContent.trim().length<140)continue;
    const details=element('details','build-extra-info'),summary=element('summary','','More information');hint.before(details);details.append(summary,hint);
  }
  allergy.classList.add('build-screen');allergy.dataset.screen='allergies';
  celebration.classList.add('build-screen');celebration.dataset.screen='celebration';
  contact.classList.add('build-screen');contact.dataset.screen='contact';
  allergy.querySelector('.step').textContent='Allergies first';celebration.querySelector('.step').textContent='The celebration';contact.querySelector('.step').textContent='Your details & review';
  form.prepend(allergy);
  const noLabel=element('label','check no-allergies'),no=element('input');no.type='checkbox';no.id='no-allergies';noLabel.append(no,element('span','','No allergies to report'));allergy.querySelector('#allergies-help').after(noLabel);
  const banner=element('div','build-allergy-warning');banner.setAttribute('role','status');banner.hidden=true;
  banner.append(element('strong','','ALLERGEN DETECTED'),element('span','','Customer-reported allergy · studio review required. Conflicting and unverified choices are withheld.'));
  form.before(banner);
  const screening=element('p','notice');screening.id='allergy-screening-status';screening.setAttribute('role','status');allergy.append(screening);
  const bottom=take('bottom-tier-fields'),bottomChildren=[...bottom.children];
  const bottomParts=[bottomChildren.slice(0,2),bottomChildren.slice(2,3),bottomChildren.slice(3,5),bottomChildren.slice(5,7),bottomChildren.slice(7)];
  const allergenList=take('allergen-list'),allergyHelp=take('allergies-help'),topExtras=take('top-extra-fillings');
  const allergyExtras=[...allergy.children].filter(n=>![allergy.querySelector('h2'),allergyHelp,noLabel,allergenList].includes(n));
  const itemControls=[...items.querySelector('.fields').children];
  itemControls.forEach((node,i)=>node.dataset.buildGroup=i<2?'select':'edit');
  allergyExtras.forEach(node=>node.dataset.buildGroup=node.matches('.other-allergen,#other-help,#allergen-feedback')?'custom':'review');
  let allergyChunks=[],screens=[];
  const page=(node,title,kind='',part=0)=>({node,title,kind,part});
  function buildPages(){
    const rows=[...allergenList.children];allergyChunks=[];
    const labs=Boolean(take('labs-allergy-sample'));
    if(!labs)for(let i=0;i<rows.length;i+=3)allergyChunks.push(rows.slice(i,i+3));
    const extraSize=matchMedia('(max-width:340px), (max-height:600px)').matches?1:2,extraCount=Math.max(1,Math.ceil(topExtras.children.length/extraSize));
    screens=[...(labs?[page(allergy,'Fictional allergy filter','labs-allergy')]:[...allergyChunks.map((_,i)=>page(allergy,`Allergies ${i+1} of ${allergyChunks.length}`,'allergy-rows',i)),page(allergy,'Add another allergy','allergy-custom'),page(allergy,'Allergy review','allergy-review')]),
      page(items,'Select a cake','items-select'),page(items,'Add or remove cakes','items-edit'),page(quantity,'Cake quantity'),page(cake,'Cake & size'),page(icing,'Icing'),page(toppings,'Toppings'),page(topperQuantities,'Topper quantities'),page(fillings,'Filling'),page(fillingAmount,'Filling amount'),...Array.from({length:extraCount},(_,i)=>page(extraFillings,extraCount>1?`Additional fillings ${i+1} of ${extraCount}`:'Additional fillings','extra-fillings',i)),...labs?[]:[page(topNotes,'Top tier notes')],
      page(tiers,'Cake tiers','tier-setup'),...['Bottom cake & icing','Bottom filling','More bottom fillings','Bottom toppings','Bottom notes'].flatMap((title,i)=>labs&&i===4?[]:[page(tiers,title,'tier-bottom',i)]),
      ...labs?[]:[page(itemNotes,'Cake item notes')],
      ...(labs?[page(celebration,'Celebration')]:[page(celebration,'Celebration date','celebration-date'),page(celebration,'Collection or delivery','celebration-method'),page(celebration,'Celebration notes','celebration-notes')]),
      ...(labs?[page(contact,'Review & send')]:[page(contact,'Your name','contact-name'),page(contact,'Contact details','contact-details'),page(contact,'Review request','contact-review'),page(contact,'Send request','contact-send')])];
  }
  buildPages();
  const progress=element('nav','build-progress');progress.setAttribute('aria-label','Cake request progress');const count=element('p','kicker'),title=element('p');progress.append(count,title);form.before(progress);
  const draftNotice=document.querySelector('#draft-notice');
  if(draftNotice){const draftDetails=element('details','build-draft-info'),draftSummary=element('summary','','Draft and privacy details');draftDetails.open=Boolean(isRetry());draftDetails.append(draftSummary,...draftNotice.childNodes);draftNotice.append(draftDetails);}
  const controls=element('div','build-navigation'),back=element('button','secondary','← Back'),next=element('button','','Next →');back.type=next.type='button';controls.append(back,next);form.append(controls);
  const review=document.querySelector('#customer-order-review');const reviewDetails=element('details','build-review');reviewDetails.append(element('summary','','Review your complete cake request'),review);contact.querySelector('[type=submit]').before(reviewDetails);
  const reviewDialog=element('dialog','build-review-dialog'),reviewTitle=element('h2','','Review your request'),reviewBody=element('div','build-review-page');
  const reviewNav=element('div','build-review-nav'),reviewBack=element('button','secondary','← Back'),reviewNext=element('button','','Next →'),reviewClose=element('button','secondary','Close review');
  for(const button of [reviewBack,reviewNext,reviewClose])button.type='button';
  reviewNav.append(reviewBack,reviewNext,reviewClose);reviewDialog.append(reviewTitle,reviewBody,reviewNav);document.body.append(reviewDialog);
  let reviewPages=[],reviewIndex=0;
  const cellText=cell=>{if(!cell)return '—';const copy=cell.cloneNode(true);copy.querySelectorAll('.sheet-mobile-label,img').forEach(n=>n.remove());return copy.textContent.replace(/\s+/g,' ').trim()||'—';};
  const overviewLines=overview=>{const copy=overview.cloneNode(true);copy.querySelectorAll('br').forEach(node=>node.replaceWith('\n'));copy.querySelectorAll('h3,li,.order-allergy-box > strong').forEach(node=>node.after(document.createTextNode('\n')));copy.querySelectorAll('.order-allergy-box').forEach(node=>{node.before('\n');node.after('\n');});return copy.textContent.split(/\n+/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);};
  function createReviewPages(){
    reviewPages=[];
    const overview=review.querySelector('.order-overview');
    if(overview){const lines=overviewLines(overview);for(let i=0;i<lines.length;i+=3)reviewPages.push({title:i?'Request details':'Request summary',lines:lines.slice(i,i+3)});}
    for(const [itemIndex,table] of [...review.querySelectorAll('.cake-order-sheet')].entries()){
      const caption=table.querySelector('caption')?.textContent.trim()||`Cake ${itemIndex+1}`;let quantity='—';
      for(const [tierIndex,row] of [...table.querySelectorAll('tbody tr')].entries()){
        const cells=[...row.querySelectorAll('td')];if(tierIndex===0)quantity=cellText(cells[1]);
        const offset=tierIndex===0?2:0,tag=`${caption} · tier ${tierIndex+1}`;
        reviewPages.push({title:tag,lines:[`Quantity: ${quantity}`,`Cake and size: ${cellText(cells[offset])}`,`Icing: ${cellText(cells[offset+1])}`,`Toppings: ${cellText(cells[offset+2])}`,`Topper count: ${cellText(cells[offset+3])}`]});
        reviewPages.push({title:`${tag} · fillings`,lines:[`Fillings: ${cellText(cells[offset+4])}`,`Filling amount: ${cellText(cells[offset+5])}`,`Tier notes: ${cellText(cells[offset+6])}`]});
      }
      const note=table.nextElementSibling;if(note?.tagName==='P')reviewPages.push({title:`${caption} · notes`,lines:[note.textContent.trim()]});
    }
    if(!reviewPages.length)reviewPages.push({title:'Review your request',lines:['Your cake selections will appear here.']});
  }
  function showReview(n){reviewIndex=Math.max(0,Math.min(reviewPages.length-1,n));const current=reviewPages[reviewIndex];reviewTitle.textContent=`${reviewDialog.classList.contains('allergen-detected')?'ALLERGEN DETECTED · ':''}${current.title}`;reviewBody.replaceChildren(...current.lines.map(line=>element('p','',line)));reviewDialog.setAttribute('aria-label',`Review ${reviewIndex+1} of ${reviewPages.length}: ${reviewTitle.textContent}`);reviewBack.disabled=reviewIndex===0;reviewNext.hidden=reviewIndex===reviewPages.length-1;reviewBody.scrollTop=0;}
  reviewDetails.querySelector('summary').addEventListener('click',event=>{event.preventDefault();createReviewPages();reviewDialog.classList.toggle('allergen-detected',Boolean(review.querySelector('.order-document.allergen-detected')));showReview(0);reviewDialog.showModal();});
  reviewBack.addEventListener('click',()=>showReview(reviewIndex-1));reviewNext.addEventListener('click',()=>showReview(reviewIndex+1));reviewClose.addEventListener('click',()=>reviewDialog.close());
  reviewDialog.addEventListener('close',()=>reviewDetails.querySelector('summary').focus({preventScroll:true}));
  const celebrationGroups=[...celebration.children].slice(1),contactGroups=[...contact.children].slice(1);
  celebrationGroups.forEach((node,i)=>node.dataset.buildGroup=i<2?'date':i===2?'method':'notes');
  contactGroups.forEach((node,i)=>node.dataset.buildGroup=i<2?'name':i<4?'contact':node===reviewDetails||node.classList.contains('hint')?'review':'send');
  const preview=document.querySelector('.preview-card');let index=0;
  const previewHome=document.createComment('Live preview position');preview.before(previewHome);
  const previewButton=element('button','build-preview-button','Preview cake');previewButton.type='button';progress.append(previewButton);
  const landscape=matchMedia('(min-width:760px) and (max-height:500px)');
  const placePreviewButton=()=>{(landscape.matches?controls:progress).append(previewButton);};
  placePreviewButton();landscape.addEventListener('change',placePreviewButton);
  const previewDialog=element('dialog','build-preview-dialog');previewDialog.setAttribute('aria-label','Your live cake preview');
  const closePreview=element('button','secondary','Close preview');closePreview.type='button';previewDialog.append(closePreview);document.body.append(previewDialog);
  previewButton.addEventListener('click',()=>{preview.hidden=false;previewDialog.append(preview);previewDialog.showModal();});
  closePreview.addEventListener('click',()=>previewDialog.close());
  previewDialog.addEventListener('close',()=>{previewHome.after(preview);syncPreview();previewButton.focus({preventScroll:true});});
  const previewAvailable=()=>{previewButton.disabled=!take('flavor').value||!take('icing').value;previewButton.title=previewButton.disabled?'Choose a cake and icing first':'Open your live cake preview';};
  form.addEventListener('change',previewAvailable);
  function isAvailable(page){
    if(page.kind==='tier-bottom')return !bottom.hidden;
    if(page.node===fillingAmount)return take('filling').value!=='none';
    if(page.node===topperQuantities)return ['topperA','topperB'].some(id=>take(id).value!=='none');
    return true;
  }
  function syncPreview(){const wide=matchMedia('(min-width:760px) and (min-height:501px)').matches,available=index>allergyChunks.length&&screens[index]?.node!==contact&&screens[index]?.node!==celebration;preview.hidden=!wide&&!available;previewButton.hidden=wide||!available;previewAvailable();}
  function show(n,focus=true){
    if(previewDialog.open)previewDialog.close();
    index=Math.max(0,Math.min(screens.length-1,n));
    if(!isAvailable(screens[index])){const direction=n<index?-1:1;while(index>0&&index<screens.length-1&&!isAvailable(screens[index]))index+=direction;}
    const current=screens[index];
    for(const screen of new Set(screens.map(p=>p.node))){screen.hidden=screen!==current.node;screen.inert=screen!==current.node;}
    for(const [i,row] of [...allergenList.children].entries())row.hidden=current.kind!=='allergy-rows'||Math.floor(i/3)!==current.part;
    allergenList.hidden=current.kind!=='allergy-rows';allergyHelp.hidden=!(current.kind==='labs-allergy'||current.kind==='allergy-rows'&&current.part===0);noLabel.hidden=current.kind!=='allergy-rows'||current.part!==0;
    for(const node of allergyExtras)node.hidden=node.dataset.buildGroup!==(current.kind==='allergy-custom'?'custom':current.kind==='allergy-review'?'review':'none');
    const extraSize=matchMedia('(max-width:340px), (max-height:600px)').matches?1:2;
    for(const [i,row] of [...topExtras.children].entries())row.hidden=current.kind!=='extra-fillings'||Math.floor(i/extraSize)!==current.part;
    items.dataset.buildPart=current.kind==='items-select'?'select':current.kind==='items-edit'?'edit':'all';
    allergy.dataset.buildPart=current.kind==='allergy-custom'?'custom':current.kind==='allergy-review'?'review':'all';
    tierFooter.hidden=current.kind!=='tier-setup';
    tiers.dataset.buildPart=current.kind==='tier-setup'?'setup':current.kind==='tier-bottom'?'bottom':'other';
    celebration.dataset.buildPart=current.kind.startsWith('celebration-')?current.kind.slice(12):'all';
    contact.dataset.buildPart=current.kind.startsWith('contact-')?current.kind.slice(8).replace('details','contact'):'all';
    if(current.kind==='tier-bottom')for(const [part,nodes] of bottomParts.entries())for(const node of nodes)node.hidden=part!==current.part;
    else for(const nodes of bottomParts)for(const node of nodes)node.hidden=false;
    const available=screens.filter(isAvailable);count.textContent=`Build a cake · ${available.indexOf(current)+1} of ${available.length}`;title.textContent=current.title;
    current.node.querySelector('h2').textContent=matchMedia('(min-width:760px) and (max-height:500px)').matches?`${available.indexOf(current)+1}/${available.length} · ${current.title}`:current.title;
    back.disabled=index===0;next.hidden=index===screens.length-1;controls.hidden=form.hidden;
    document.body.dataset.buildScreen=current.node.dataset.screen;syncPreview();
    if(focus){const heading=current.node.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});current.node.scrollTop=0;}
  }
  function move(direction){let target=index+direction;while(target>=0&&target<screens.length&&!isAvailable(screens[target]))target+=direction;show(target);}
  function updateAllergyState(){
    const reported=allergies().length>0;if(reported)no.checked=false;
    document.body.classList.toggle('has-reported-allergy',reported);form.classList.toggle('allergen-detected',reported);banner.hidden=!reported;
    const result=applyAllergies();
    screening.textContent=reported?(result.available?'Choices have been filtered using the recorded recipe and cross-contact information. The studio must still review this request.':'There are no verified cake and icing choices for these allergy answers yet. The studio needs to review its recipes and cross-contact information before this cake can be built.'):'We’ll use your answers before showing cake choices.';
    return result;
  }
  function validScreen(){
    const current=screens[index],screen=current.node;
    if(current.kind==='allergy-review'){
      if(!allergies().length&&!no.checked){screening.textContent='Select an allergy, or confirm that there are no allergies to report.';show(0);no.focus();return false;}
      const pending=take('other-allergen');if(pending.value.trim()){take('add-allergen').click();return false;}
    }
    const invalid=[...screen.querySelectorAll('input,select,textarea')].find(n=>!n.disabled&&n.getClientRects().length&&!n.closest('.honeypot')&&!n.checkValidity());if(invalid){invalid.focus({preventScroll:true});invalid.reportValidity();invalid.scrollIntoView({block:'nearest'});return false;}
    if((current.kind==='allergy-review'||current.kind==='labs-allergy')&&!updateAllergyState().available)return false;
    return true;
  }
  back.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>{if(validScreen())move(1);});
  no.addEventListener('change',()=>{if(no.checked){for(const row of take('allergen-list').children){row.querySelector('input').checked=false;const severity=row.querySelector('select');severity.value='';severity.disabled=true;severity.required=false;}updateAllergyState();form.dispatchEvent(new Event('change',{bubbles:true}));}});
  take('allergen-list').addEventListener('change',()=>{if(!isRetry())updateAllergyState();});
  // Enter advances the current screen. Submission remains explicit on the final screen.
  form.addEventListener('submit',event=>{if(index!==screens.length-1){event.preventDefault();event.stopImmediatePropagation();if(validScreen())move(1);}},true);
  function pageFor(target){return screens.findIndex(p=>p.node.contains(target)&&(
    p.kind==='allergy-rows'?allergyChunks[p.part]?.includes(target.closest('.allergen-row')):
    p.kind==='allergy-custom'||p.kind==='allergy-review'?allergyExtras.some(n=>n.dataset.buildGroup===(p.kind==='allergy-custom'?'custom':'review')&&n.contains(target)):
    p.kind==='tier-bottom'?bottomParts[p.part]?.some(n=>n.contains(target)):
    p.kind==='tier-setup'?!bottom.contains(target):
    p.kind.startsWith('celebration-')?celebrationGroups.some(n=>n.dataset.buildGroup===p.kind.slice(12)&&n.contains(target)):
    p.kind.startsWith('contact-')?contactGroups.some(n=>n.dataset.buildGroup===p.kind.slice(8).replace('details','contact')&&n.contains(target)):true));}
  form.addEventListener('invalid',event=>{const at=pageFor(event.target);if(at>=0&&at!==index)show(at,false);},true);
  form.noValidate=true;
  // Let mobile browsers shrink the builder shell when the on-screen keyboard opens.
  const updateViewport=()=>{const viewport=window.visualViewport,height=viewport?.height||window.innerHeight;document.documentElement.style.setProperty('--builder-viewport-height',`${Math.round(height)}px`);document.documentElement.style.setProperty('--builder-keyboard-inset',`${Math.round(Math.max(0,window.innerHeight-height-(viewport?.offsetTop||0)))}px`);};
  updateViewport();window.addEventListener('resize',updateViewport,{passive:true});window.visualViewport?.addEventListener('resize',updateViewport,{passive:true});window.visualViewport?.addEventListener('scroll',updateViewport,{passive:true});
  function refreshLayout(){const prior=screens[index];buildPages();const found=screens.findIndex(p=>p.node===prior?.node&&p.kind===prior.kind&&p.part===prior.part);show(found>=0?found:Math.min(index,screens.length-1),false);}
  let refreshQueued=false;const queueRefresh=()=>{if(refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refreshLayout();});};
  new MutationObserver(queueRefresh).observe(allergenList,{childList:true});
  window.addEventListener('cake-labs-order-ready',refreshLayout);
  form.addEventListener('change',queueRefresh);
  updateAllergyState();show(isRetry()?screens.length-1:0,false);
  return {show,refresh:updateAllergyState,refreshLayout,reveal(node){const at=pageFor(node);if(at>=0)show(at);}};
};
