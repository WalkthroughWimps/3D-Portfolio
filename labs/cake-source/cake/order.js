(async () => {
  if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const form = document.querySelector('#cake-order'), frame = document.querySelector('#cake-preview');
  let options;
  try { options = await (window.CakeMenuPromise ||= fetch('/api/menu', { cache:'no-store' }).then(response=>{if(!response.ok)throw new Error();return response.json();})); window.CakeOrderOptions = options; }
  catch { document.querySelector('#order-feedback').textContent = 'The cake menu could not load. Please refresh to try again.'; form.querySelector('[type=submit]').disabled = true; return; }
  const fullMenu=structuredClone(options);
  const select = (id, values, initial) => { const node = document.getElementById(id); values.forEach(([value, label]) => node.add(new Option(label, value))); if (initial&&values.some(([id])=>id===initial)) node.value = initial; };
  select('flavor', [['','Choose a cake'],...options.cakes]); select('size', options.sizes, '8'); select('icing', [['','Choose an icing'],...options.icings]); select('filling', options.fillings);
  select('topperA', options.toppers, 'none'); select('topperB', options.toppers, 'none');
  const builder=createCakeOrderBuilder(form,options,frame);
  function markFavorites(){
    let favorites={};try{favorites=JSON.parse(sessionStorage.getItem('cake-favorites-v1')||'{}');}catch{}
    for(const [ids,group]of [[['flavor','bottom-flavor'],'cakes'],[['icing','bottom-icing'],'icings'],[['filling','bottom-filling'],'fillings'],[['topperA','topperB','bottom-topperA','bottom-topperB'],'toppers']]){
      for(const id of ids)for(const option of document.getElementById(id).options){const picked=Array.isArray(favorites[group])&&favorites[group].includes(option.value);option.textContent=option.textContent.replace(/^★ /,'');if(picked)option.textContent='★ '+option.textContent;option.dataset.favorite=String(picked);}
    }
  }
  markFavorites();
  const allergenList = document.querySelector('#allergen-list'), otherInput = document.querySelector('#other-allergen'), allergenFeedback = document.querySelector('#allergen-feedback');
  let allergenId = 0;
  function allergenRow(name, custom = false) {
    const row = document.createElement('div'); row.className = 'allergen-row'; row.dataset.allergen = name; row.dataset.custom = String(custom);
    const label = document.createElement('label'); label.className = 'check';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = custom;
    const title = document.createElement('span'); title.textContent = name; label.append(checkbox, title);
    const severity = document.createElement('select'); severity.setAttribute('aria-label', `${name} severity`); severity.id = `allergen-severity-${++allergenId}`; checkbox.setAttribute('aria-controls', severity.id);
    severity.add(new Option('Severity…', '')); options.severities.forEach(([value, text]) => severity.add(new Option(text, value)));
    severity.disabled = !custom; severity.required = custom;
    checkbox.addEventListener('change', () => {
      if (custom && !checkbox.checked) { row.remove(); allergenFeedback.textContent = `${name} removed.`; otherInput.focus(); }
      else { severity.disabled = !checkbox.checked; severity.required = checkbox.checked; if (!checkbox.checked) severity.value = ''; }
    });
    row.append(label, severity); allergenList.append(row); return row;
  }
  options.allergens.forEach(name => allergenRow(name));
  function addAllergen(focusSeverity = true) {
    const name = otherInput.value.trim().replace(/\s+/g, ' '); if (!name) return false;
    const existing = [...allergenList.children].find(row => row.dataset.allergen.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) {
      const checkbox = existing.querySelector('input'); checkbox.checked = true;
      const severity = existing.querySelector('select'); severity.disabled = false; severity.required = true;
      otherInput.value = ''; allergenFeedback.textContent = `${existing.dataset.allergen} selected. Choose its severity.`; allergenList.dispatchEvent(new Event('change',{bubbles:true})); if (focusSeverity) severity.focus(); return true;
    }
    if (allergenList.querySelectorAll('[data-custom=true]').length >= 8) { allergenFeedback.textContent = 'You can add up to eight other allergens. Include further details in your celebration notes.'; return false; }
    const row = allergenRow(name, true); otherInput.value = ''; allergenFeedback.textContent = `${name} added. Choose its severity.`; allergenList.dispatchEvent(new Event('change',{bubbles:true})); if (focusSeverity) row.querySelector('select').focus(); return true;
  }
  document.querySelector('#add-allergen').addEventListener('click', () => addAllergen());
  otherInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addAllergen(); } });
  otherInput.addEventListener('blur', event => { if (event.relatedTarget?.id !== 'add-allergen') addAllergen(false); });
  const allergies = () => [...allergenList.children].filter(row => row.querySelector('input').checked).map(row => ({ name: row.dataset.allergen, severity: row.querySelector('select').value }));
  const allergyConflict=()=>window.CakeAllergens.inspectSelected?.(builder.items(),fullMenu,allergies())||{hasConflict:false,issues:[]};
  const date = document.querySelector('#event-date');
  date.min = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  date.max = `${Number(date.min.slice(0, 4)) + 2}${date.min.slice(4)}`;
  const draftStorageKey = 'cake-order-draft-v1', retryLockStorageKey = 'cake-order-attempt-lock-v1', draftLifetimeMs = 24 * 60 * 60 * 1000;
  let submissionKey = crypto.randomUUID(), submitted = false, recoveryBlocked = false, recoveryAcknowledged = false, retryLocked = false, clearingDraft = false, retryExpired = false, staleAttemptDisplay = false, attemptedAt = null, attemptedPayload = null, attemptedReview = '';
  let draftStorage = null, draftSaveTimer = null, savedDraft = false;
  // Public Labs samples keep form fields in memory; only sanitized demo orders persist.
  try { if (!window.CakeLabs) { draftStorage = window.sessionStorage; draftStorage.getItem(draftStorageKey); } } catch { draftStorage = null; }
  const draftNotice = document.createElement('section'); draftNotice.className = 'notice'; draftNotice.id = 'draft-notice'; draftNotice.setAttribute('aria-label', 'Unfinished request draft');
  const draftMessage = document.createElement('p'); draftMessage.className = 'hint'; draftMessage.setAttribute('role', 'status'); draftNotice.append(draftMessage);
  const draftActions = document.createElement('div'); draftActions.className = 'actions'; draftNotice.append(draftActions);
  const clearDraftButton = document.createElement('button'); clearDraftButton.type = 'button'; clearDraftButton.className = 'secondary'; clearDraftButton.textContent = 'Clear saved request'; clearDraftButton.hidden = true; draftActions.append(clearDraftButton);
  const useCurrentCakeButton = document.createElement('button'); useCurrentCakeButton.type = 'button'; useCurrentCakeButton.className = 'secondary'; useCurrentCakeButton.textContent = 'Use these current cake selections'; useCurrentCakeButton.hidden = true; draftActions.append(useCurrentCakeButton);
  form.before(draftNotice);
  function showDraftMessage(message, canClear = savedDraft) { draftMessage.textContent = message; clearDraftButton.hidden = !canClear; }
  function showOriginalAttemptItems(payload) {
    const details = document.createElement('details'), summary = document.createElement('summary'), review = document.createElement('div');
    details.className = 'original-request-review'; review.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5'; summary.textContent = 'Review your original request'; review.textContent = attemptedReview;
    details.append(summary, review); draftNotice.append(details);
  }
  function readDraftFields() {
    return { name:form.elements.namedItem('name').value, email:form.elements.namedItem('email').value, phone:form.elements.namedItem('phone').value,
      date:form.elements.namedItem('date').value, requestedTime:document.querySelector('#requested-time').value,
      timezone:document.querySelector('#fulfillment-timezone').value, method:document.querySelector('#fulfillment-method').value,
      address:document.querySelector('#delivery-address').value, details:form.elements.namedItem('details').value };
  }
  const draftFieldLimits = { name:100, email:254, phone:40, date:10, requestedTime:5, timezone:80, method:16, address:400, details:2000 };
  const lockedControlStates = new WeakMap();
  const validStoredFields = fields => fields && Object.entries(draftFieldLimits).every(([key, limit]) => typeof fields[key] === 'string' && fields[key].length <= limit) &&
    (!fields.date || /^\d{4}-\d{2}-\d{2}$/.test(fields.date)) && (!fields.requestedTime || /^\d{2}:\d{2}$/.test(fields.requestedTime)) && ['pickup','delivery'].includes(fields.method);
  function validStoredAllergies(list) {
    if (!Array.isArray(list) || list.length > options.allergens.length + 8) return false;
    const names = new Set(), severities = new Set(options.severities.map(([id]) => id));
    return list.every(item => {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !severities.has(item.severity)) return false;
      const name = item.name.trim().toLocaleLowerCase(); if (names.has(name)) return false; names.add(name); return true;
    }) && list.filter(item => !options.allergens.some(name => name.toLocaleLowerCase() === item.name.trim().toLocaleLowerCase())).length <= 8;
  }
  function validDraft(draft) {
    return draft && draft.version === 1 && Number.isFinite(draft.updatedAt) && draft.updatedAt <= Date.now() + 60_000 &&
      Date.now() - draft.updatedAt <= draftLifetimeMs && typeof draft.submissionKey === 'string' && /^[\w-]{20,80}$/.test(draft.submissionKey) &&
      (draft.attemptedAt === undefined || Number.isFinite(draft.attemptedAt) && draft.attemptedAt <= Date.now() + 60_000) &&
      (!draft.attemptedAt || draft.attemptedPayload && typeof draft.attemptedPayload === 'object' && draft.attemptedPayload.consent === true && typeof draft.attemptedPayload.name === 'string' && Array.isArray(draft.attemptedPayload.items) && draft.attemptedPayload.fulfillment && Array.isArray(draft.attemptedPayload.allergies) && typeof draft.attemptedReview === 'string' && draft.attemptedReview.length <= 32_000) &&
      validStoredFields(draft.fields) && validStoredAllergies(draft.allergies) && draft.builder;
  }
  function restoreFields(fields) {
    form.elements.namedItem('name').value = fields.name; form.elements.namedItem('email').value = fields.email; form.elements.namedItem('phone').value = fields.phone;
    form.elements.namedItem('date').value = fields.date; form.elements.namedItem('details').value = fields.details;
    document.querySelector('#requested-time').value = fields.requestedTime; document.querySelector('#fulfillment-timezone').value = fields.timezone;
    document.querySelector('#fulfillment-method').value = fields.method; document.querySelector('#delivery-address').value = fields.address;
  }
  function restoreAllergies(list) {
    for (const item of list) {
      const existing = [...allergenList.children].find(row => row.dataset.allergen.toLocaleLowerCase() === item.name.trim().toLocaleLowerCase());
      const row = existing || allergenRow(item.name.trim(), true), checkbox = row.querySelector('input'), severity = row.querySelector('select');
      checkbox.checked = true; severity.disabled = false; severity.required = true; severity.value = item.severity;
    }
  }
  function restoreDraft() {
    if(window.CakeLabs){showDraftMessage('Sample form details stay in this tab while it is open. Saved demo receipts use fictional information.',false);return false;}
    if (!draftStorage) { showDraftMessage('Draft saving is unavailable in this tab. Your entries may be lost if you leave.', false); return false; }
    let raw;
    try { raw = draftStorage.getItem(draftStorageKey); }
    catch { draftStorage = null; showDraftMessage('Draft saving is unavailable in this tab. Your entries may be lost if you leave.', false); return false; }
    if (!raw) { showDraftMessage('Unfinished requests are kept in this tab for up to 24 hours after your last change.', false); return false; }
    let draft;
    try { draft = JSON.parse(raw); } catch { draft = null; }
    if (draft?.attemptedAt && Number.isFinite(draft.attemptedAt) && Date.now() - draft.attemptedAt > draftLifetimeMs) {
      const lock = { version:1, attemptedAt:draft.attemptedAt, submissionKey:draft.submissionKey };
      try { draftStorage.setItem(retryLockStorageKey, JSON.stringify(lock)); draftStorage.removeItem(draftStorageKey); } catch { draftStorage = null; }
      submissionKey = draft.submissionKey; attemptedAt = draft.attemptedAt; retryExpired = true; savedDraft = false; clearDraftButton.textContent = 'Start a new request';
      showDraftMessage('This request may have reached the studio, and its 24-hour safe retry window has expired. Check with the studio before starting another request.', true); return false;
    }
    if (!validDraft(draft)) {
      try { draftStorage.removeItem(draftStorageKey); } catch { draftStorage = null; }
      showDraftMessage('The saved request was incomplete or expired, so it was cleared. Start a new request.', false); return false;
    }
    restoreFields(draft.fields); restoreAllergies(draft.allergies); submissionKey = draft.submissionKey; attemptedAt = draft.attemptedAt || null; attemptedPayload = draft.attemptedPayload || null;
    savedDraft = true;
    if (!builder.restore(draft.builder)) {
      if (attemptedPayload) {
        retryLocked = true; staleAttemptDisplay = true; attemptedReview = draft.attemptedReview; clearDraftButton.textContent = 'Start a new request'; showOriginalAttemptItems(attemptedPayload);
        showDraftMessage('This attempted request includes cake choices no longer on the menu. The current preview may show defaults; retry sends the original cake selections shown below. To change the order, start a new request after checking with the studio.', true);
      } else {
        recoveryBlocked = true; useCurrentCakeButton.hidden = false;
        showDraftMessage('Some saved cake choices are no longer on the menu. Your other details were restored; review the current cake selections before sending.');
      }
    } else {
      if (attemptedPayload) {
        const fulfillmentMatches = attemptedPayload.fulfillment.method === draft.fields.method && attemptedPayload.fulfillment.time === draft.fields.requestedTime && attemptedPayload.fulfillment.timezone === draft.fields.timezone && attemptedPayload.fulfillment.address === draft.fields.address;
        const detailsMatch = attemptedPayload.name === draft.fields.name && attemptedPayload.email === draft.fields.email && attemptedPayload.phone === draft.fields.phone && attemptedPayload.date === draft.fields.date && attemptedPayload.details === draft.fields.details;
        if (!fulfillmentMatches || !detailsMatch || JSON.stringify(attemptedPayload.allergies) !== JSON.stringify(draft.allergies) || JSON.stringify(attemptedPayload.items) !== JSON.stringify(builder.items())) {
          recoveryBlocked = true; retryLocked = true; attemptedPayload = null; clearDraftButton.textContent = 'Start a new request'; showDraftMessage('The saved retry details do not match the visible request. Check with the studio before starting a new request.', true);
        } else {
          retryLocked = true; clearDraftButton.textContent = 'Start a new request';
          showDraftMessage('A request may already have reached the studio. The original details are locked for a safe retry; confirm consent again, or start a new request after checking with the studio.', true);
        }
      } else showDraftMessage(`Your unfinished request, including contact and allergy details, is saved in this tab until ${new Date(draft.updatedAt + draftLifetimeMs).toLocaleString()}. Clear it on shared devices.`);
    }
    return true;
  }
  function persistDraft() {
    if (!draftStorage || submitted || clearingDraft) return false;
    const draft = { version:1, updatedAt:Date.now(), submissionKey, ...(attemptedAt ? {attemptedAt,attemptedPayload,attemptedReview} : {}), fields:readDraftFields(), allergies:allergies(), builder:builder.snapshot() };
    try {
      draftStorage.setItem(draftStorageKey, JSON.stringify(draft)); savedDraft = true;
      if (attemptedAt) draftStorage.setItem(retryLockStorageKey, JSON.stringify({version:1,attemptedAt,submissionKey}));
      if (staleAttemptDisplay) showDraftMessage('This attempted request includes cake choices no longer on the menu. The current preview may show defaults; retry sends the original cake selections shown below. To change the order, start a new request after checking with the studio.', true);
      else if (recoveryAcknowledged) showDraftMessage('Review the cake selections above, then send your request when they are correct.');
      else if (!recoveryBlocked) showDraftMessage(`Your unfinished request, including contact and allergy details, is saved in this tab until ${new Date(draft.updatedAt + draftLifetimeMs).toLocaleString()}. Clear it on shared devices.`);
      else showDraftMessage('Some saved cake choices are no longer on the menu. Your other details were restored; review the current cake selections before sending.');
      return true;
    } catch {
      draftStorage = null; savedDraft = false; showDraftMessage('Draft saving is unavailable in this tab. Your entries may be lost if you leave.', false); return false;
    }
  }
  function scheduleDraftSave() { if (draftSaveTimer !== null) clearTimeout(draftSaveTimer); draftSaveTimer = setTimeout(() => { draftSaveTimer = null; persistDraft(); }, 150); }
  const restored = restoreDraft();
  if (!restored && draftStorage) {
    try {
      const lock = JSON.parse(draftStorage.getItem(retryLockStorageKey) || 'null');
      if (lock?.version === 1 && Number.isFinite(lock.attemptedAt) && typeof lock.submissionKey === 'string' && /^[\w-]{20,80}$/.test(lock.submissionKey)) {
        submissionKey = lock.submissionKey; attemptedAt = lock.attemptedAt; recoveryBlocked = true; retryLocked = true;
        clearDraftButton.textContent = 'Start a new request';
        if (Date.now() - lock.attemptedAt > draftLifetimeMs) retryExpired = true;
        showDraftMessage(retryExpired
          ? 'This request may have reached the studio, and its 24-hour safe retry window has expired. Check with the studio before starting another request.'
          : 'A request may already have reached the studio, but its saved details are missing. Check with the studio before starting another request.', true);
      }
    } catch { draftStorage = null; showDraftMessage('Draft saving is unavailable in this tab. Your entries may be lost if you leave.', false); }
  }
  clearDraftButton.addEventListener('click', () => {
    if ((retryExpired || retryLocked && attemptedAt) && !window.confirm('This request may already have reached the studio. Have you checked before starting a new request?')) return;
    clearingDraft = true; if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
    try { draftStorage?.removeItem(draftStorageKey); draftStorage?.removeItem(retryLockStorageKey); } catch {} location.reload();
  });
  useCurrentCakeButton.addEventListener('click', () => {
    recoveryBlocked = false; recoveryAcknowledged = true; useCurrentCakeButton.hidden = true;
    flow?.reveal(document.querySelector('#flavor'));
    document.querySelector('#flavor').focus(); persistDraft();
    showDraftMessage('Review the cake selections above, then send your request when they are correct.');
  });
  const cake = () => builder.cake();
  const fulfillment=()=>({method:options.settings?.deliveryEnabled===true?document.querySelector('#fulfillment-method').value:'pickup',time:document.querySelector('#requested-time').value,address:options.settings?.deliveryEnabled===true?document.querySelector('#delivery-address').value:'',timezone:document.querySelector('#fulfillment-timezone').value});
  function update() {
    const value = cake(), noFilling = value.filling === 'none' || options.visuals?.fillings?.[value.filling]?.base === 'none';
    document.querySelector('#amount-field').disabled = noFilling;
    document.querySelector('#amount-help').textContent = noFilling ? 'Choose filling pieces to adjust the amount.' : options.amounts[value.amount]?.description;
    document.querySelector('#cake-summary').textContent = `${options.cakes.find(([id]) => id === value.flavor)?.[1]||'Choose a cake'} · ${options.icings.find(([id]) => id === value.icing)?.[1]||'Choose an icing'}`;
    // The inline composition is the single preview, including incomplete neutral drafts.
    const data=readDraftFields();
    builder.update({id:'preview',status:'pending',name:data.name||'Your request',email:data.email,phone:data.phone,date:data.date,fulfillment:fulfillment(),allergies:allergies(),allergyConflict:allergyConflict().hasConflict,details:data.details,cake:value});
    const deliveryEnabled=options.settings?.deliveryEnabled===true;document.querySelector('#fulfillment-method').closest('label').hidden=!deliveryEnabled;document.querySelector('#delivery-address-field').hidden=!deliveryEnabled||fulfillment().method!=='delivery';document.querySelector('#delivery-address').required=deliveryEnabled&&fulfillment().method==='delivery';
    if (retryLocked) setAttemptControlsLocked(true);
  }
  function setAttemptControlsLocked(locked) {
    for (const control of form.querySelectorAll('input,select,textarea,button')) {
      if (control.type === 'submit') { control.disabled = locked && retryExpired; continue; }
      if (control.name === 'consent' || control.id === 'cake-item-picker' || control.closest('#cake-item-tabs,.build-navigation,.build-review,#draft-notice')) continue;
      if (locked) {
        if (!lockedControlStates.has(control)) lockedControlStates.set(control, control.disabled);
        control.disabled = true;
      } else if (lockedControlStates.has(control)) {
        control.disabled = lockedControlStates.get(control); lockedControlStates.delete(control);
      }
    }
    retryLocked = locked;
  }
  form.addEventListener('change', () => { update(); scheduleDraftSave(); });
  form.addEventListener('input', scheduleDraftSave);
  frame.addEventListener('load', update);
  window.addEventListener('message', event => { if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'cake-preview-ready') update(); });
  update();
  let lastAllergySignature='';
  const flow=window.createCakeOrderFlow(form,{
    allergies,allergyConflict,builder,menu:options,isRetry:()=>retryLocked||Boolean(attemptedPayload),
    applyAllergies(){
      const signature=JSON.stringify(allergies().map(a=>a.name));
      const screened=window.CakeAllergens.screenMenu(fullMenu,allergies());
      if(signature!==lastAllergySignature&&!retryLocked&&!attemptedPayload){builder.setMenu(screened);markFavorites();lastAllergySignature=signature;update();}
      return {available:retryLocked||Boolean(attemptedPayload)||Boolean(screened.cakes.length&&screened.icings.length)};
    }
  });
  window.CakeLabs?.prepareOrder(form);
  flow.refreshLayout?.();
  if (staleAttemptDisplay) document.querySelector('#preview-note').textContent = 'The preview uses current menu defaults and is not the original cake request. Review your original request above.';
  if (retryLocked || retryExpired) setAttemptControlsLocked(true);
  if (restored) persistDraft();
  window.addEventListener('beforeunload', persistDraft);
  const layout = document.querySelector('.order-layout');
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (submitted) return;
    const retrying = Boolean(attemptedPayload), data = Object.fromEntries(new FormData(form)), feedback = document.querySelector('#order-feedback'), button = form.querySelector('[type=submit]');
    if (retryExpired) { feedback.textContent = 'This request may already have reached the studio. Check with the studio before starting a new request.'; feedback.focus(); return; }
    if (recoveryBlocked) { feedback.textContent = 'Review the current cake selections and choose “Use these current cake selections” before sending.'; feedback.focus(); return; }
    if (retrying) {
      if (!form.elements.namedItem('consent').checked) { feedback.textContent = 'Please confirm consent again before safely retrying this request.'; form.elements.namedItem('consent').focus(); return; }
    } else {
      data.quantity=Number(data.quantity);
      if (!data.email?.trim() && !data.phone?.trim()) { feedback.textContent = 'Please leave an email address or phone number.';flow.show('time'); document.querySelector('#contact-email').focus(); return; }
      const phone=data.phone?.trim()||'',digits=phone.replace(/\D/g,'');
      if(phone&&(!/^[+()\d .-]+$/.test(phone)||digits.length<7||digits.length>15)){feedback.textContent='Check your phone number.';flow.show('time');document.querySelector('#contact-phone').focus();return;}
      if (otherInput.value.trim()) { addAllergen(); feedback.textContent = 'Choose the severity for your added allergy before sending.'; form.reportValidity(); return; }
      if(!builder.isComplete()){const limit=builder.fillingLimitIssue();feedback.textContent=limit?`Cake ${limit.itemIndex+1}, ${limit.tierIndex?'bottom':'top'} tier has ${limit.count} fillings. The current limit is ${limit.max} per tier. Remove ${limit.count-limit.max} before sending.`:'Choose a cake and icing for every tier before sending.';flow.reveal(builder.focusFirstIncomplete());return;}
      const safety=window.CakeAllergens.inspectItems(builder.items(),fullMenu,allergies());
      if(!safety.allowed){feedback.textContent='Some choices need allergy review. Review the filtered menu.';flow.show('allergens');return;}
      if (!form.reportValidity()) return;
      attemptedPayload = { ...data, consent:true, cake:cake(), items:builder.items(), fulfillment:fulfillment(), allergies:allergies() };
      if(window.CakeLabs?.prepareSubmission)attemptedPayload=window.CakeLabs.prepareSubmission(attemptedPayload);
      const fullReview = builder.reviewText({id:'draft',status:'pending',...attemptedPayload});
      attemptedReview = fullReview.length <= 32_000 ? fullReview : 'The original order summary was too long to save. The exact original request is retained for retry; contact the studio before changing it.';
    }
    if (!attemptedAt) attemptedAt = Date.now();
    clearDraftButton.textContent = 'Start a new request';
    setAttemptControlsLocked(true);
    if (!persistDraft()) showDraftMessage('Draft saving is unavailable in this tab. Keep this page open to retry safely if your connection is interrupted.', false);
    button.disabled = true; feedback.textContent = 'Sending your cake request…';
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': submissionKey }, body: JSON.stringify(attemptedPayload) });
      const result = await response.json();
      if (!response.ok) { const error = new Error(result.error || 'Unable to submit your request.'); error.status = response.status; throw error; }
      submitted = true;
      try { draftStorage?.removeItem(draftStorageKey); draftStorage?.removeItem(retryLockStorageKey); } catch {}
      savedDraft = false; showDraftMessage('Your request was received. The unfinished request saved in this tab has been cleared.', false);
      layout.classList.remove('is-building');
      const link = new URL('/cake/order-status.html', location.origin); link.hash = result.token;
      document.querySelector('#status-link').href = link.href;
      form.hidden = true; const success = document.querySelector('#order-success'); success.hidden = false; success.focus();
      window.CakeLabs?.completeSubmission?.();
      form.reset();
      document.querySelector('#copy-link').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link.href); document.querySelector('#copy-feedback').textContent = 'Private link copied.'; }
        catch { document.querySelector('#copy-feedback').textContent = `Save this private link: ${link.href}`; }
      });
    } catch (error) {
      if (error.status === 400) {
        attemptedAt = null; attemptedPayload = null; submissionKey = crypto.randomUUID();
        try { draftStorage?.removeItem(retryLockStorageKey); } catch {}
        setAttemptControlsLocked(false); update(); persistDraft();
        showDraftMessage('The studio could not accept that request. You can correct the details and send again.');
      }
      feedback.textContent = error.status === 400
        ? error.message
        : 'We could not confirm receipt. Your original details are locked; retry sends the same request. To change it, start a new request after checking with the studio.';
      feedback.focus();
    }
    finally { button.disabled = false; }
  });
})();
