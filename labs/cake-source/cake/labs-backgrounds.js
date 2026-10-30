(() => {
  'use strict';
  if (document.body?.dataset.mode !== 'admin') return;

  const api = window.CakeAppearanceSettings;
  if (!api) return;
  const labels = { home:'Home', flavors:'Flavors', gallery:'Gallery', about:'About', order:'Order', custom:'Custom cakes' };
  const cakes = [
    ['redVelvet','Red velvet'],['vanilla','Vanilla'],['lemon','Lemon'],['white','White cake'],
    ['chocolate','Chocolate'],['carrot','Carrot cake'],['pistachio','Pistachio']
  ];
  const dialog = document.createElement('dialog');
  dialog.id = 'studio-backgrounds-dialog';
  dialog.setAttribute('aria-labelledby','studio-backgrounds-title');
  dialog.innerHTML = `<header><div><p class="backgrounds-kicker">Site appearance</p><h2 id="studio-backgrounds-title">Cake backgrounds</h2></div><button type="button" data-close aria-label="Close cake background settings">×</button></header>
    <p>Choose how cake crumb textures appear across the customer pages. Random backgrounds are picked each time someone opens a page.</p>
    <form id="backgrounds-form"><label class="backgrounds-check"><input id="backgrounds-random" type="checkbox"><span>Choose a random cake background for unassigned pages</span></label>
    <label>Default background<select id="backgrounds-default"></select></label><h3>Page assignments</h3><p class="backgrounds-hint">A page assignment always takes priority over random selection. “Use default” follows the setting above.</p>
    <div id="backgrounds-pages"></div><button type="submit">Save background settings</button></form><p id="backgrounds-feedback" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'studio-backgrounds-open';
  button.textContent = 'Backgrounds';
  button.setAttribute('aria-haspopup','dialog');
  document.body.append(button);
  const $ = id => dialog.querySelector(`#${id}`);
  const form = $('backgrounds-form'), random = $('backgrounds-random'), defaultSelect = $('backgrounds-default');
  const feedback = $('backgrounds-feedback'), pagesHost = $('backgrounds-pages');
  const options = [['','Use default'], ...cakes];
  for (const [id,label] of cakes) defaultSelect.add(new Option(label,id));
  for (const page of api.PAGE_IDS) {
    const label = document.createElement('label');
    label.textContent = `${labels[page]} page`;
    const select = document.createElement('select');
    select.dataset.page = page;
    select.setAttribute('aria-label', `${labels[page]} page cake background`);
    for (const [id,name] of options) select.add(new Option(name,id));
    label.append(select); pagesHost.append(label);
  }
  let catalog = null, csrf = '', busy = false;
  async function request(url, init = {}) {
    const response = await fetch(url, { cache:'no-store', ...init });
    if (response.status === 401) { dialog.close(); location.replace('/admin/login'); throw new Error('Please sign in again.'); }
    let result;
    try { result = await response.json(); } catch { result = {}; }
    if (!response.ok) throw new Error(result.error || 'Unable to load background settings.');
    return result;
  }
  function display() {
    const appearance = api.normalize(catalog.appearance);
    random.checked = appearance.random;
    defaultSelect.value = appearance.defaultCake;
    pagesHost.querySelectorAll('select').forEach(select => { select.value = appearance.pages[select.dataset.page]; });
  }
  async function open() {
    if (!dialog.open) dialog.showModal();
    feedback.textContent = 'Loading background settings…';
    form.inert = true;
    try {
      const session = await request('/api/admin/session');
      csrf = session.csrf;
      catalog = await request('/api/admin/menu');
      display();
      feedback.textContent = '';
    } catch (error) { feedback.textContent = error.message; }
    finally { form.inert = !catalog; }
  }
  button.addEventListener('click', open);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !catalog) return;
    busy = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    const appearance = {
      random:random.checked,
      defaultCake:defaultSelect.value,
      pages:Object.fromEntries([...pagesHost.querySelectorAll('select')].map(select => [select.dataset.page, select.value]))
    };
    try {
      catalog = await request('/api/admin/menu', {
        method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
        body:JSON.stringify({ action:'appearance', appearance:api.normalize(appearance), revision:catalog.revision })
      });
      display();
      feedback.textContent = 'Saved. Customers will see these backgrounds the next time they open a page.';
    } catch (error) { feedback.textContent = error.message; }
    finally { busy = false; submit.disabled = false; }
  });
  window.CakeStudioBackgrounds = Object.freeze({ open });
})();
