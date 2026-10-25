/* Browser-only adapter for the static Labs preview. This deliberately never sends API requests to the network. */
(() => {
  'use strict';

  // The cake preview is an embedded visual scene, not a customer-facing page.
  if (/\/cake-preview\/?$/.test(location.pathname)) return;

  const STORAGE_KEY = 'cake-labs-demo-v1';
  const SESSION_KEY = 'cake-labs-session-v1';
  const MENU_KEY = 'cake-labs-menu-v1';
  const DRAFT_KEYS = ['cake-labs-order-draft-v1', 'cake-labs-order-attempt-lock-v1', 'cake-order-draft-v1', 'cake-order-attempt-lock-v1'];
  const TOKEN_PATTERN = /^[\w-]{43}$/;
  const IDEMPOTENCY_PATTERN = /^[\w-]{20,80}$/;
  const OBVIOUS_PRIVATE_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\d ().-]{8,}\d)|\b(?:password|credit card|social security|medical history)\b/i;
  const nowIso = () => new Date().toISOString();
  const clone = value => JSON.parse(JSON.stringify(value));
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

  function randomToken(byteLength = 32) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function readMenu() {
    const source = window.CAKE_LABS_MENU || window.CakeOrderOptions;
    if (!source || !Array.isArray(source.cakes) || !Array.isArray(source.sizes)) return null;
    if(window.CakeLabsMenuData)return window.CakeLabsMenuData.publicMenu(readCatalog(),source);
    const menu = clone(source);
    menu.revision = Number.isInteger(menu.revision) ? menu.revision : 0;
    menu.visuals ||= {};
    const cakeColors = { redVelvet:'#710706', vanilla:'#e7c17e', lemon:'#ebbd53', white:'#e2dfd3', chocolate:'#4e200f', carrot:'#b7621b', pistachio:'#beb060' };
    for (const group of ['cakes','icings','fillings','toppers','sizes']) {
      menu.visuals[group] ||= Object.fromEntries((menu[group] || []).map(([id, , color]) => [id, {
        base: id,
        color: color || (group === 'cakes' ? cakeColors[id] : '#fff4df') || '#fff4df'
      }]));
    }
    return menu;
  }
  function readCatalog(){
    const fallback=()=>window.CakeLabsMenuData.create(window.CAKE_LABS_MENU||window.CakeOrderOptions);
    try{const value=JSON.parse(localStorage.getItem(MENU_KEY)||'null');if(value&&Number.isInteger(value.revision)&&value.groups){window.CakeLabsMenuData.publicMenu(value,window.CAKE_LABS_MENU);return value;}}catch{}
    return fallback();
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : null;
      if (state && state.version === 1 && Array.isArray(state.orders) && state.submissions && typeof state.submissions === 'object') return state;
    } catch { /* Storage can be blocked in private browsing. */ }
    return { version:1, orders:[], submissions:{} };
  }

  let state = readState();
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    state = readState();
    // Keep an already-open sample receipt in sync with Reset demo in another tab.
    const refresh = document.querySelector('#refresh-status');
    if (refresh && !refresh.disabled) refresh.click();
  });
  function saveState(next) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); state = next; return true; }
    catch { return false; }
  }

  function choiceLabel(menu, group, id, fallback = id) {
    return menu[group]?.find(entry => entry[0] === id)?.[1] || fallback;
  }

  function makeSafeOrder(payload, menu) {
    const cake = payload?.cake;
    if (!cake || typeof cake !== 'object') throw new Error('Choose a cake before continuing.');
    if(window.CakeAllergens&&!window.CakeAllergens.inspectItems(payload.items||[{cake}],menu,payload.allergies).allowed)throw new Error('An ingredient conflicts with an allergy or has unverified information. Review the filtered sample menu.');
    const choices = [
      ['cakes','flavor'], ['icings','icing'], ['sizes','size'], ['fillings','filling'], ['toppers','topperA'], ['toppers','topperB']
    ];
    for (const [group, field] of choices) {
      if (!menu[group]?.some(([id]) => id === String(cake[field] ?? ''))) throw new Error('One of those cake choices is no longer available. Refresh the page and try again.');
    }
    if (!menu.amounts?.[cake.amount]) throw new Error('Choose a valid filling amount.');
    const event=sampleEvent(payload);
    if(!event)throw new Error('Choose one of the fictional sample dates and times.');
    const {date,time}=event;
    const sizeLabel = choiceLabel(menu, 'sizes', String(cake.size));
    const cakeLabels = {
      flavor:choiceLabel(menu,'cakes',cake.flavor), icing:choiceLabel(menu,'icings',cake.icing),
      size:sizeLabel, filling:choiceLabel(menu,'fillings',cake.filling),
      topperA:choiceLabel(menu,'toppers',cake.topperA), topperB:choiceLabel(menu,'toppers',cake.topperB)
    };
    const safeCake = {
      flavor:cake.flavor, icing:cake.icing, size:String(cake.size), filling:cake.filling,
      amount:cake.amount, topperA:cake.topperA, topperB:cake.topperB
    };
    if (Array.isArray(payload.items) && (payload.items.length < 1 || payload.items.length > 8)) throw new Error('Choose between one and eight cake items for the demo.');
    const sourceItems = Array.isArray(payload.items) ? payload.items : [];
    const safeItems = sourceItems.map(item => {
      if (!item || item.productType !== 'cake' || !Array.isArray(item.tiers) || item.tiers.length < 1 || item.tiers.length > 2 || !menu.sizes.some(([id]) => id === String(item.size))) throw new Error('Review the cake selections and try the demo again.');
      const tiers = item.tiers.map(tier => {
        if (!menu.cakes.some(([id]) => id === tier.flavor) || !menu.icings.some(([id]) => id === tier.icing)) throw new Error('Review the cake selections and try the demo again.');
        const fillings = (Array.isArray(tier.fillings) ? tier.fillings : []).slice(0, 4).filter(fill => menu.fillings.some(([id]) => id === fill.id && id !== 'none')).map(fill => ({
          id:fill.id, amount:menu.amounts[fill.amount] ? fill.amount : 'normal', label:choiceLabel(menu,'fillings',fill.id)
        }));
        const toppers = (Array.isArray(tier.toppers) ? tier.toppers : []).slice(0, 6).filter(top => menu.toppers.some(([id]) => id === top.id && id !== 'none')).map(top => ({
          id:top.id, quantity:Number.isInteger(top.quantity) ? Math.max(1,Math.min(top.quantity,20)) : 1, label:choiceLabel(menu,'toppers',top.id)
        }));
        return {
          flavor:tier.flavor, icing:tier.icing, notes:'', fillings, toppers,
          labels:{ flavor:choiceLabel(menu,'cakes',tier.flavor), icing:choiceLabel(menu,'icings',tier.icing) }
        };
      });
      let mixFillings = item.mixFillings === true;
      if (mixFillings && tiers.length > 1) {
        const amounts = new Map();
        for (const tier of tiers) for (const filling of tier.fillings) {
          if (amounts.has(filling.id) && amounts.get(filling.id) !== filling.amount) throw new Error('Use the same amount for a filling mixed across demo tiers.');
          amounts.set(filling.id,filling.amount);
        }
      } else mixFillings = false;
      return {
        productType:'cake', quantity:Number.isInteger(item.quantity) ? Math.max(1,Math.min(item.quantity,99)) : 1,
        size:String(item.size), sizeLabel:choiceLabel(menu,'sizes',String(item.size)), mixFillings, notes:'', tiers
      };
    });
    if (Array.isArray(payload.items) && (!safeItems.length || safeItems.length !== sourceItems.length)) throw new Error('Review the cake selections and try the demo again.');
    const id = randomToken(12);
    const token = randomToken(32);
    const createdAt = nowIso();
    return {
      id, token, status:'pending', createdAt, updatedAt:createdAt,
      name:'Demo Guest', date, quantity:safeItems[0]?.quantity || 1, cake:safeCake, cakeLabels, ...(safeItems.length ? { items:safeItems } : {}),
      cakeVisuals:{ flavor:menu.visuals?.cakes?.[cake.flavor], icing:menu.visuals?.icings?.[cake.icing] },
      fulfillment:{ method:'pickup', time, timezone:'America/Chicago', address:'Demo only — no pickup or delivery is arranged.' },
      reply:'This sample exists only in this browser. No message was sent to the studio.',
      details:'Fictional Labs request. No message was sent.'
      ,allergies:payload.allergies?.length?[{name:'Sample reported allergy (details omitted in Labs)',severity:'unsure'}]:[]
    };
  }

  function hasPrivateOrderData(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const allowed = {name:'Demo Guest',email:'demo@example.invalid',phone:'',details:'',timezone:'America/Chicago'};
    for (const [key,value] of Object.entries(allowed)) if (payload[key] != null && payload[key] !== value) return true;
    if (!sampleEvent(payload)) return true;
    if (payload.fulfillment && (payload.fulfillment.address || !['pickup',undefined].includes(payload.fulfillment.method))) return true;
    if (Array.isArray(payload.items) && payload.items.some(item => item.notes || item.tiers?.some(tier => tier.notes))) return true;
    if (Array.isArray(payload.allergies) && payload.allergies.some(a => !['Tree nuts','Milk'].includes(a?.name) || a.severity !== 'unsure')) return true;
    return false;
  }

  const PRIVATE_MESSAGE = 'Cleared: this Labs preview accepts cake choices only. Personal and health details are not collected.';
  function purgeDrafts() {
    let purged = false;
    try { for (const key of DRAFT_KEYS) if (sessionStorage.getItem(key) !== null) { sessionStorage.removeItem(key); purged = true; } } catch {}
    return purged;
  }
  function privateNotice() {
    let notice = document.querySelector('#labs-privacy-feedback');
    if (!notice) {
      notice = document.createElement('p'); notice.id = 'labs-privacy-feedback';
      notice.className = 'labs-privacy-feedback'; notice.setAttribute('role', 'status');
      (document.querySelector('main') || document.body).prepend(notice);
    }
    notice.textContent = PRIVATE_MESSAGE;
  }
  function sampleDate(offset=30) {
    const day = new Date(); day.setDate(day.getDate() + offset);
    return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
  }
  const sampleDates=()=>[sampleDate(30),sampleDate(42)];
  const sampleTimes=['','10:00','14:00'];
  function sampleEvent(payload) {
    if(payload===undefined)payload={date:document.querySelector('#event-date')?.value||sampleDate(30),requestedTime:document.querySelector('#requested-time')?.value??''};
    const requested=payload.requestedTime,fulfillment=payload.fulfillment?.time;
    if(requested!=null&&fulfillment!=null&&requested!==fulfillment)return null;
    const date=payload.date||sampleDate(30),time=requested??fulfillment??'';
    return sampleDates().includes(date)&&sampleTimes.includes(time)?{date,time}:null;
  }
  const privateSelectors = '[name="name"],[name="email"],[name="phone"],[name="date"],[name="details"],#requested-time,#fulfillment-timezone,#fulfillment-method,#delivery-address,#other-allergen,#top-tier-notes,#bottom-tier-notes,#cake-item-notes';
  function prepareOrder(form) {
    if (!form || form.dataset.labsPrivacyReady === 'true') return;
    form.dataset.labsPrivacyReady = 'true';
    const fixed = new Map([
      ['name','Demo Guest'], ['email','demo@example.invalid'], ['phone',''], ['date',sampleDate(30)],
      ['details',''], ['requested-time',''], ['fulfillment-timezone','America/Chicago'],
      ['fulfillment-method','pickup'], ['delivery-address',''], ['other-allergen',''],
      ['top-tier-notes',''], ['bottom-tier-notes',''], ['cake-item-notes','']
    ]);
    const keyOf = node => node.name || node.id;
    const lock = node => {
      if (node.dataset.labsPrivate !== 'true') {
        node.dataset.labsPrivate = 'true';
        node.value = fixed.get(keyOf(node)) || '';
        node.removeAttribute('autocomplete');
        node.tabIndex = -1;
      }
      const label = node.closest('label'); if (label && !label.hidden) label.hidden = true;
    };
    let sampleAllergyValue='';
    const scan = () => {
      form.querySelectorAll(privateSelectors).forEach(lock);
      const no=form.querySelector('#no-allergies');
      if(no){no.checked=!sampleAllergyValue;const label=no.closest('label');if(label&&!label.hidden)label.hidden=true;}
    };
    scan();
    const observer = new MutationObserver(scan); observer.observe(form,{childList:true,attributes:true,attributeFilter:['hidden'],subtree:true});
    const purgeField = event => {
      const node = event.target;
      if (!(node instanceof HTMLElement) || node.dataset.labsPrivate !== 'true') return;
      if (event.type === 'beforeinput' || event.type === 'paste' || event.type === 'drop') event.preventDefault();
      const expected = fixed.get(keyOf(node)) || '';
      if (event.type !== 'input' && event.type !== 'change' && node.value === expected) return;
      node.value = expected; purgeDrafts(); privateNotice();
    };
    for (const type of ['beforeinput','paste','drop','input','change']) form.addEventListener(type,purgeField,true);
    const allergy = form.querySelector('[aria-labelledby="allergies-heading"]');
    if (allergy) {
      allergy.querySelector('.step').textContent = 'Sample ingredient filter';
      const help = allergy.querySelector('#allergies-help');
      if (help) help.textContent = 'Choose a fictional test scenario. Do not enter your own health information.';
      for (const node of allergy.querySelectorAll('#allergen-list,.other-allergen,#other-help,.inline-note,#allergen-feedback')) node.hidden = true;
      const select = document.createElement('select'); select.id = 'labs-allergy-sample';
      for (const [value,label] of [['','Sample: no allergy filter'],['Tree nuts','Sample: tree nut filter'],['Milk','Sample: milk filter']]) select.add(new Option(label,value));
      const label = document.createElement('label'); label.className = 'labs-sample-filter'; label.textContent = 'Test menu filtering'; label.append(select);
      (allergy.querySelector('#no-allergies')?.closest('label') || help)?.after(label);
      select.addEventListener('change', () => {
        sampleAllergyValue=select.value;
        for (const row of allergy.querySelectorAll('#allergen-list > *')) {
          const checkbox = row.querySelector('input'), severity = row.querySelector('select');
          if (!checkbox) continue;
          checkbox.checked = row.dataset.allergen === select.value;
          if (severity) { severity.value = checkbox.checked ? 'unsure' : ''; severity.disabled = !checkbox.checked; severity.required = checkbox.checked; }
        }
        const no=form.querySelector('#no-allergies');if(no)no.checked=!select.value;
        allergy.querySelector('#allergen-list')?.dispatchEvent(new Event('change',{bubbles:true}));
      });
    }
    const contact = form.querySelector('[name="name"]')?.closest('section');
    if (contact) {
      const heading = contact.querySelector('.step'); if (heading) heading.textContent = 'Review sample cake';
      for (const node of contact.querySelectorAll('#contact-help,.hint')) node.hidden = true;
      const consent = contact.querySelector('[name="consent"]');
      if (consent) { consent.checked = true; consent.closest('label').hidden = true; }
      const send = contact.querySelector('[type="submit"]'); if (send) send.textContent = 'Save sample cake locally';
    }
    const celebration = form.querySelector('#event-date')?.closest('section');
    if (celebration) {
      const heading = celebration.querySelector('.step'); if (heading) heading.textContent = 'Fictional sample event';
      for (const node of celebration.querySelectorAll('.hint')) node.hidden = true;
      const eventControls=document.createElement('div');eventControls.className='labs-sample-event';eventControls.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:.75rem;margin:1rem 0';
      const dayLabel=document.createElement('label');dayLabel.textContent='Fictional example day';dayLabel.style.display='block';
      const daySelect=document.createElement('select');daySelect.id='labs-example-day';daySelect.setAttribute('aria-label','Fictional example day');daySelect.style.cssText='display:block;width:100%;min-height:44px;margin-top:.35rem';
      const offsets=[30,42];offsets.forEach((offset,index)=>daySelect.add(new Option(index===0?'About 30 days from today':'About 42 days from today',String(offset))));dayLabel.append(daySelect);
      const timeLabel=document.createElement('label');timeLabel.textContent='Fictional example time';timeLabel.style.display='block';
      const timeSelect=document.createElement('select');timeSelect.id='labs-example-time';timeSelect.setAttribute('aria-label','Fictional example time');timeSelect.style.cssText='display:block;width:100%;min-height:44px;margin-top:.35rem';
      for(const [value,label] of [['','No time selected'],['10:00','10:00 AM'],['14:00','2:00 PM']])timeSelect.add(new Option(label,value));timeLabel.append(timeSelect);
      eventControls.append(dayLabel,timeLabel);
      const copy = document.createElement('p'); copy.className = 'labs-sample-copy'; copy.textContent = 'Choose a fictional date and time preset. The pickup details are fixed for this local demo.';
      const dateInput=form.querySelector('#event-date'),timeInput=form.querySelector('#requested-time');
      const applyPreset=()=>{
        const date=sampleDate(Number(daySelect.value)),time=timeSelect.value;
        fixed.set('date',date);fixed.set('requested-time',time);
        dateInput.value=date;dateInput.dispatchEvent(new Event('change',{bubbles:true}));
        timeInput.value=time;timeInput.dispatchEvent(new Event('change',{bubbles:true}));
      };
      daySelect.addEventListener('change',applyPreset);timeSelect.addEventListener('change',applyPreset);
      celebration.append(eventControls,copy);
    }
    form.addEventListener('submit', () => { scan(); for (const node of form.querySelectorAll('[data-labs-private="true"]')) {
      const expected = fixed.get(keyOf(node)) || '';
      if (node.value !== expected) { node.value = expected; purgeDrafts(); privateNotice(); }
    } }, true);
  }

  async function bodyFor(input, init) {
    if (init && Object.hasOwn(init, 'body')) return init.body;
    if (input instanceof Request) return input.clone().text();
    return '';
  }

  async function handleApi(url, method, headers, input, init) {
    const pathname = url.pathname.replace(/^\/cake(?=\/api\/)/, '');
    if(pathname==='/api/admin/session'&&method==='GET'&&/\/labs-admin(?:\.html)?\/?$/.test(location.pathname))return jsonResponse({csrf:'labs-local-demo'});
    if(pathname==='/api/admin/menu'&&/\/labs-admin(?:\.html)?\/?$/.test(location.pathname)){
      if(method==='GET')return jsonResponse(readCatalog());
      if(method==='POST'){
        if(headers.get('X-CSRF-Token')!=='labs-local-demo')return jsonResponse({error:'Refresh the sample controls.'},403);
        try{
          const raw=await bodyFor(input,init);if(typeof raw!=='string'||raw.length>65536)return jsonResponse({error:'Sample setting is too large.'},400);
          if(OBVIOUS_PRIVATE_TEXT.test(raw)){privateNotice();return jsonResponse({error:PRIVATE_MESSAGE},400);}
          const next=window.CakeLabsMenuData.mutate(readCatalog(),JSON.parse(raw));
          try{localStorage.setItem(MENU_KEY,JSON.stringify(next));}catch{return jsonResponse({error:'Browser storage is unavailable; the setting was not saved.'},503);}
          return jsonResponse(next);
        }catch(error){return jsonResponse({error:error.message},error.status||400);}
      }
    }
    if (pathname === '/api/menu' && method === 'GET') {
      const menu = readMenu();
      return menu ? jsonResponse(menu) : jsonResponse({ error:'The demo menu has not loaded.' }, 503);
    }
    if (pathname === '/api/orders' && method === 'POST') {
      let payload;
      try {
        const raw = await bodyFor(input, init);
        if (typeof raw !== 'string' || raw.length > 64 * 1024) return jsonResponse({ error:'The demo request is too large.' }, 400);
        payload = JSON.parse(raw);
      } catch { return jsonResponse({ error:'Enter a valid demo request.' }, 400); }
      if (hasPrivateOrderData(payload)) { purgeDrafts(); privateNotice(); return jsonResponse({error:PRIVATE_MESSAGE},400); }
      if (payload?.consent !== true) return jsonResponse({ error:'Please confirm the demo request before continuing.' }, 400);
      const key = headers.get('Idempotency-Key') || '';
      if (!IDEMPOTENCY_PATTERN.test(key)) return jsonResponse({ error:'Refresh the form and try again.' }, 400);
      const menu = readMenu();
      if (!menu) return jsonResponse({ error:'The demo menu has not loaded.' }, 503);
      let order;
      try { order = makeSafeOrder(payload, menu); }
      catch (error) { return jsonResponse({ error:error.message }, 400); }

      // Fingerprint only the non-personal cake selection; names, dates, contacts, notes and addresses are discarded.
      const fingerprint = JSON.stringify({ cake:order.cake, items:order.items || [],allergyAlert:Boolean(order.allergies.length) });
      state = readState();
      const previous = state.submissions[key];
      if (previous) {
        if (previous.fingerprint !== fingerprint) return jsonResponse({ error:'This demo key was already used for a different cake. Start a new demo request.' }, 409);
        return jsonResponse(previous.receipt, 200);
      }
      const receipt = { id:order.id, token:order.token, status:order.status };
      const next = clone(state);
      next.orders.push(order);
      next.orders = next.orders.slice(-50);
      next.submissions[key] = { fingerprint, receipt };
      const retainedTokens = new Set(next.orders.map(item => item.token));
      for (const [submissionKey, record] of Object.entries(next.submissions)) if (!retainedTokens.has(record.receipt?.token)) delete next.submissions[submissionKey];
      if (!saveState(next)) return jsonResponse({ error:'Demo storage is unavailable. Enable site storage or reset the demo, then try again.' }, 503);
      return jsonResponse(receipt, 201);
    }
    if (pathname === '/api/order-status' && method === 'POST') {
      let payload;
      try { payload = JSON.parse(await bodyFor(input, init) || '{}'); }
      catch { return jsonResponse({ error:'Open the private demo link saved after submitting your request.' }, 400); }
      if (typeof payload.token !== 'string' || !TOKEN_PATTERN.test(payload.token)) return jsonResponse({ error:'Open the private demo link saved after submitting your request.' }, 404);
      state = readState();
      const order = state.orders.find(item => item.token === payload.token);
      if (!order) return jsonResponse({ error:'Demo request not found. Reset may have cleared its local sample data.' }, 404);
      const { token, ...publicOrder } = order;
      return jsonResponse(clone(publicOrder));
    }
    return jsonResponse({ error:'This API is unavailable in the static Labs demo.' }, 404);
  }

  const networkFetch = window.fetch.bind(window);
  window.fetch = async function labsFetch(input, init = {}) {
    let url;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), location.href);
    } catch { return networkFetch(input, init); }
    if (url.pathname.includes('/api/')) {
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      return handleApi(url, method, headers, input, init);
    }
    return networkFetch(input, init);
  };

  function resetDemo() {
      if (!window.confirm('Clear this browser’s local sample requests and this tab’s cake draft?')) return;
      try {
        localStorage.removeItem(STORAGE_KEY);
        for (const key of Object.keys(localStorage)) if (key.startsWith('cake-labs-')) localStorage.removeItem(key);
      } catch { /* Continue with the session cleanup. */ }
      try {
        for (const key of Object.keys(sessionStorage)) if (key.startsWith('cake-labs-')) sessionStorage.removeItem(key);
        for (const key of DRAFT_KEYS) sessionStorage.removeItem(key);
        sessionStorage.removeItem(SESSION_KEY);
      } catch { /* Storage may be unavailable. */ }
      location.reload();
  }

  try {
    if (!sessionStorage.getItem(SESSION_KEY)) sessionStorage.setItem(SESSION_KEY, randomToken(12));
  } catch { /* The in-memory adapter still works without storage. */ }
  function localizePage() {
    if (!document.body) return;
    if (purgedOnLoad) privateNotice();
    const homeForm = document.querySelector('#order-overlay #order-form');
    if (homeForm && homeForm.dataset.labsReplaced !== 'true') {
      homeForm.dataset.labsReplaced = 'true';
      const title = document.querySelector('#order-title');
      if (title) title.textContent = 'Explore a fictional sample cake.';
      const copy = document.createElement('p');
      copy.textContent = 'The sample builder uses fictional event and contact details. Choose cake options without entering personal information.';
      const link = document.createElement('a'); link.href = '/cake/order.html'; link.textContent = 'Open sample cake builder';
      homeForm.replaceChildren(copy, link);
    }
    const footer = document.querySelector('.site-footer');
    if (footer && !footer.hidden && [...footer.children].every(child => child.hidden)) footer.hidden = true;
    const result = document.querySelector('#status-result');

    if (result && !result.hidden) {
      document.querySelector('#status-title').textContent = 'Your local sample request.';
      document.querySelector('#status-badge').textContent = 'Saved in this browser';
      document.querySelector('#refresh-status').textContent = 'Refresh local sample';
      const privacy = document.querySelector('main > p.hint');
      if (privacy) privacy.textContent = 'This is a browser-local demonstration. No studio receives or reviews it. Reset demo removes this sample and invalidates its link.';
    }
    const success = document.querySelector('#order-success');
    if (success && !success.hidden) {
      const heading = success.querySelector('h2');
      if (heading) heading.textContent = 'Demo request saved in this browser.';
      const paragraphs = success.querySelectorAll('p');
      if (paragraphs[0]) paragraphs[0].textContent = 'Local Labs sample';
      if (paragraphs[1]) paragraphs[1].textContent = 'This is a fictional sample. No message was sent to the cake studio, and no payment was taken.';
      if (paragraphs[2]) paragraphs[2].textContent = 'This local status link only works in this browser until you reset the demo. No studio can see it.';
      const statusLink = success.querySelector('#status-link');
      if (statusLink) { const tokenHash = new URL(statusLink.href).hash; statusLink.href = new URL('order-status.html', location.href).href + tokenHash; statusLink.textContent = 'View this sample request locally'; }
      const copyLink = success.querySelector('#copy-link');
      if (copyLink) copyLink.textContent = 'Copy local sample link';
    }
  }
  const purgedOnLoad = purgeDrafts();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', localizePage, { once:true });
  else localizePage();

  // The old homepage inquiry is replaced in Labs. Clear attempted injected fields as well.
  for (const type of ['beforeinput','paste','drop','input','change']) document.addEventListener(type, event => {
    const form = event.target?.closest?.('#order-overlay #order-form');
    if (!form || !event.target.matches?.('input,textarea,select,[contenteditable]')) return;
    if (type === 'beforeinput' || type === 'paste' || type === 'drop') event.preventDefault();
    if ('value' in event.target) event.target.value = '';
    else event.target.textContent = '';
    purgeDrafts(); privateNotice();
  }, true);
  document.addEventListener('submit', event => {
    if (event.target?.id !== 'order-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    for (const node of event.target.querySelectorAll('input,textarea,select,[contenteditable]')) {
      if ('value' in node) node.value = ''; else node.textContent = '';
    }
    purgeDrafts(); privateNotice();
  }, true);

  const successObserver = new MutationObserver(localizePage);
  if (document.body) successObserver.observe(document.body, { subtree:true, attributes:true, attributeFilter:['hidden'] });
  else document.addEventListener('DOMContentLoaded', () => successObserver.observe(document.body, { subtree:true, attributes:true, attributeFilter:['hidden'] }), { once:true });

  window.CakeLabs = Object.freeze({ mode:'local-only', resetStorageKey:STORAGE_KEY, resetDemo, prepareOrder, sampleEvent });
})();
