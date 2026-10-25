/* Browser-only adapter for the static Labs preview. This deliberately never sends API requests to the network. */
(() => {
  'use strict';

  // The cake preview is an embedded visual scene, not a customer-facing page.
  if (/\/cake-preview\/?$/.test(location.pathname)) return;

  const STORAGE_KEY = 'cake-labs-demo-v1';
  const SESSION_KEY = 'cake-labs-session-v1';
  const MENU_KEY = 'cake-labs-menu-v1';
  const PRIVACY_SEEN_KEY = 'cake-labs-privacy-dialog-v1';
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
    if(!event)throw new Error('Enter a valid event date and time.');
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
        const tierFillings=Array.isArray(tier.fillings)?tier.fillings:[];
        if(tierFillings.length>4)throw new Error('Choose no more than four fillings per tier.');
        const fillings = tierFillings.filter(fill => menu.fillings.some(([id]) => id === fill.id && id !== 'none')).map(fill => ({
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
    const allowedKeys=new Set(['name','email','phone','details','date','requestedTime','timezone','fulfillment','cake','items','allergies','consent','website','quantity','amount','flavor','icing','size','filling','topperA','topperB']);
    if(Object.keys(payload).some(key=>!allowedKeys.has(key)))return true;
    if(payload.website)return true;
    const allowed = {name:'Demo Guest',email:'demo@example.invalid',phone:'',details:'',timezone:'America/Chicago'};
    for (const [key,value] of Object.entries(allowed)) if (payload[key] != null && payload[key] !== value) return true;
    if (!sampleEvent(payload)) return true;
    if (payload.fulfillment && (Object.keys(payload.fulfillment).some(key=>!['method','time','address','timezone'].includes(key)) || payload.fulfillment.address || !['pickup',undefined].includes(payload.fulfillment.method) || (payload.fulfillment.timezone && payload.fulfillment.timezone!=='America/Chicago'))) return true;
    if (Array.isArray(payload.items) && payload.items.some(item => item.notes || item.tiers?.some(tier => tier.notes))) return true;
    if (!validAllergies(payload.allergies, window.CAKE_LABS_MENU || window.CakeOrderOptions)) return true;
    if (payload.otherAllergen || payload.details) return true;
    return false;
  }
  function validAllergies(allergies, options) {
    if (allergies == null) return true;
    if (!Array.isArray(allergies) || allergies.length > 9) return false;
    const names = options?.allergens || [], severities = new Set((options?.severities || []).map(([id]) => id)), seen = new Set();
    return allergies.every(item => {
      if (!item || !names.includes(item.name) || !severities.has(item.severity) || seen.has(item.name)) return false;
      seen.add(item.name); return true;
    });
  }
  function allergySelected(form) {
    return Boolean(form?.querySelector('#allergen-list input[type="checkbox"]:checked'));
  }

  const PRIVATE_MESSAGE = 'Cleared: the private input was removed. Contact details and named allergy information are not collected. This local demo saves cake choices, event date/time, and only a generic allergy flag.';
  const PRIVACY_INTRO = 'This is a browser-local demo. Use example cake choices and event details; don’t enter names or contact details. The allergy checklist filters ingredients, while saved samples keep only a generic allergy flag.';
  function purgeDrafts() {
    let purged = false;
    try { for (const key of DRAFT_KEYS) if (sessionStorage.getItem(key) !== null) { sessionStorage.removeItem(key); purged = true; } } catch {}
    return purged;
  }
  let privacyDialog, privacyReturnFocus;
  let purgeNoticeShown=false;
  function ensurePrivacyDialog() {
    if (privacyDialog?.isConnected) return privacyDialog;
    privacyDialog=document.createElement('dialog');privacyDialog.id='labs-privacy-dialog';privacyDialog.setAttribute('aria-labelledby','labs-privacy-title');
    const heading=document.createElement('h2');heading.id='labs-privacy-title';heading.textContent='About this local demo';
    const message=document.createElement('p');message.id='labs-privacy-feedback';message.className='labs-privacy-feedback';message.setAttribute('role','status');
    const close=document.createElement('button');close.id='labs-privacy-dismiss';close.type='button';close.textContent='Continue';
    privacyDialog.append(heading,message,close);document.body.append(privacyDialog);
    close.addEventListener('click',()=>privacyDialog.close());
    privacyDialog.addEventListener('close',()=>{if(privacyReturnFocus?.isConnected)privacyReturnFocus.focus();privacyReturnFocus=null;});
    return privacyDialog;
  }
  function privateNotice(message=PRIVATE_MESSAGE) {
    const dialog=ensurePrivacyDialog(),feedback=dialog.querySelector('#labs-privacy-feedback');
    feedback.textContent=message;
    if(!dialog.open){privacyReturnFocus=document.activeElement;dialog.showModal();}
  }
  function showPrivacyIntro() {
    let seen=false;try{seen=sessionStorage.getItem(PRIVACY_SEEN_KEY)==='1';}catch{}
    if(seen)return;
    try{sessionStorage.setItem(PRIVACY_SEEN_KEY,'1');}catch{}
    if(purgeNoticeShown)return;
    privateNotice(PRIVACY_INTRO);
  }
  function todayIso() {
    const day = new Date();
    return `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
  }
  function validIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year,month,day] = value.split('-').map(Number);
    if(year<1||month<1||month>12||day<1)return false;
    const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    return day<=days[month-1];
  }
  function sampleEvent(payload) {
    if(payload===undefined)payload={date:document.querySelector('#event-date')?.value||todayIso(),requestedTime:document.querySelector('#requested-time')?.value??''};
    const requested=payload.requestedTime,fulfillment=payload.fulfillment?.time;
    if(requested!=null&&fulfillment!=null&&requested!==fulfillment)return null;
    const date=payload.date||todayIso(),time=requested??fulfillment??'';
    return validIsoDate(date) && (time === '' || (typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) ? {date,time} : null;
  }
  const privateSelectors = '[name="name"],[name="email"],[name="phone"],[name="details"],#fulfillment-timezone,#fulfillment-method,#delivery-address,#other-allergen,#top-tier-notes,#bottom-tier-notes,#cake-item-notes';
  function prepareOrder(form) {
    if (!form || form.dataset.labsPrivacyReady === 'true') return;
    form.dataset.labsPrivacyReady = 'true';
    const fixed = new Map([
      ['name','Demo Guest'], ['email','demo@example.invalid'], ['phone',''],
      ['details',''], ['fulfillment-timezone','America/Chicago'],
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
    const scan = () => {
      form.querySelectorAll(privateSelectors).forEach(lock);
      const no=form.querySelector('#no-allergies');
      if(no)no.checked=!allergySelected(form);
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
      const allergyHeading=allergy.querySelector('.step');if(allergyHeading)allergyHeading.textContent = 'Allergies and dietary needs';
      const help = allergy.querySelector('#allergies-help');
      if (help) help.textContent = 'Select applicable ingredients and severity. Labs stores only a generic allergy flag.';
      for (const node of allergy.querySelectorAll('.other-allergen,#other-help,.inline-note,#allergen-feedback')) node.hidden = true;
      const other=allergy.querySelector('#other-allergen');if(other){other.value='';other.disabled=true;}
      allergy.querySelector('#allergen-list')?.addEventListener('change',()=>{
        const no=form.querySelector('#no-allergies');if(no)no.checked=!allergySelected(form);
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
      const heading = celebration.querySelector('.step'); if (heading) heading.textContent = 'Event date and time';
      const dateInput=form.querySelector('#event-date'),timeInput=form.querySelector('#requested-time');
      if(dateInput&&!dateInput.value)dateInput.value=todayIso();
      for(const input of [dateInput,timeInput]) if(input) input.addEventListener('change',()=>form.dispatchEvent(new Event('change',{bubbles:true})));
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

      // Event date and time are requested logistics; named allergy details remain represented only by a generic flag.
      const fingerprint = JSON.stringify({ cake:order.cake, items:order.items || [], date:order.date, time:order.fulfillment.time, allergyAlert:Boolean(order.allergies.length) });
      state = readState();
      const previous = state.submissions[key];
      if (previous) {
        if (previous.fingerprint !== fingerprint) return jsonResponse({ error:'This demo key was already used for a different cake. Start a new demo request.' }, 409);
        return jsonResponse(previous.receipt, 200);
      }
      const maxFillings=Number.isInteger(menu.settings?.maxFillings)?Math.max(1,Math.min(4,menu.settings.maxFillings)):2;
      const overFillingLimit=(order.items||[]).some(item=>item.tiers.some(tier=>{
        let effective;
        try{effective=window.CakeOrderModel?.effectiveFillings?window.CakeOrderModel.effectiveFillings(item,tier):item.mixFillings?[...new Map(item.tiers.flatMap(entry=>entry.fillings).map(fill=>[fill.id,fill])).values()]:tier.fillings;}
        catch{return true;}
        return effective.length>maxFillings;
      }));
      if(overFillingLimit)return jsonResponse({error:`Choose no more than ${maxFillings} fillings per tier for this menu.`},400);
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
    if (purgedOnLoad && !purgeNoticeShown) {purgeNoticeShown=true;privateNotice('Cleared: old drafts were removed from this tab. Contact details and named allergy information are not collected.');}
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showPrivacyIntro,{once:true});else showPrivacyIntro();

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
