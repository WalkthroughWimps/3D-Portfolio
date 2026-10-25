/* Browser-only sample menu state for the Labs controls. Recipes below are fictional. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./order-options.js') : root.CakeOrderOptions,
    typeof module === 'object' && module.exports ? require('./appearance-settings.js') : root.CakeAppearanceSettings
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CakeLabsMenuData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (options, appearanceApi) {
  'use strict';
  const groups = ['cakes','icings','fillings','toppers','sizes'];
  const cakeColors = { redVelvet:'#710706', vanilla:'#e7c17e', lemon:'#ebbd53', white:'#e2dfd3', chocolate:'#4e200f', carrot:'#b7621b', pistachio:'#beb060' };
  const allergens = options.allergens;
  function error(status,message) { throw Object.assign(new Error(message),{status}); }
  const metadata = (contains = [], mayContain = []) => ({ verified:true,contains,mayContain });
  function fixtureAllergens(group,id) {
    if (id === 'none' || group === 'sizes') return metadata();
    if (group === 'cakes') return metadata(['Milk','Eggs','Wheat',...(['carrot','pistachio'].includes(id) ? ['Tree nuts'] : [])]);
    if (group === 'icings') return metadata(['Milk']);
    if (/almond|walnut/i.test(id)) return metadata(['Tree nuts']);
    if (/peanut/i.test(id)) return metadata(['Peanuts','Milk']);
    if (/chocolate|candy|caramel/i.test(id)) return metadata(['Milk','Soy']);
    if (/rosette|dollop|ruffle|fondant/i.test(id)) return metadata(['Milk']);
    return metadata();
  }
  function ordered(entries) {
    return entries.map((item,index) => ({item,index})).sort((a,b) => Number(b.item.available) - Number(a.item.available) || a.item.sortOrder - b.item.sortOrder || a.index - b.index).map(({item}) => item);
  }
  function create(defaultMenu = options) {
    return {
      groups:Object.fromEntries(groups.map(group => [group,defaultMenu[group].map(([id,label,color],sortOrder) => ({ id,label,base:id,color:color || cakeColors[id] || '#fff4df',available:true,sortOrder,allergenInfo:fixtureAllergens(group,id) }))])),
      revision:0,
      settings:{maxFillings:defaultMenu.settings?.maxFillings ?? 2},
      appearance:appearanceApi.defaults()
    };
  }
  function validMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.verified !== 'boolean') error(400,'Check the allergen information.');
    const read = key => {
      if (!Array.isArray(value[key]) || value[key].some(name => !allergens.includes(name)) || new Set(value[key]).size !== value[key].length) error(400,'Choose known allergens without duplicates.');
      return allergens.filter(name => value[key].includes(name));
    };
    const contains = read('contains'), mayContain = read('mayContain');
    if (contains.some(name => mayContain.includes(name))) error(400,'List each allergen once.');
    return { verified:value.verified,contains,mayContain };
  }
  function publicMenu(catalog, defaultMenu = options) {
    const result = structuredClone(defaultMenu);
    result.revision = catalog.revision;
    const maxFillings=catalog.settings?.maxFillings ?? defaultMenu.settings?.maxFillings ?? 2;
    result.settings={maxFillings:Number.isInteger(maxFillings)&&maxFillings>=1&&maxFillings<=4?maxFillings:2};
    result.appearance = appearanceApi.normalize(catalog.appearance);
    result.visuals = {};
    result.allergenInfo = {};
    for (const group of groups) {
      const active = ordered(catalog.groups[group]).filter(item => item.available);
      result[group] = active.map(item => group === 'icings' ? [item.id,item.label,item.color] : [item.id,item.label]);
      result.visuals[group] = Object.fromEntries(active.map(item => [item.id,{base:item.base,color:item.color}]));
      result.allergenInfo[group] = Object.fromEntries(active.map(item => [item.id,item.allergenInfo]));
    }
    const explicitToppers = new Set(catalog.groups.toppers.map(item => item.id));
    for (const [id,label] of result.fillings) {
      if (id === 'none' || result.visuals.fillings[id]?.base === 'none' || explicitToppers.has(id)) continue;
      result.toppers.push([id,label]);
      result.visuals.toppers[id] = {...result.visuals.fillings[id]};
      result.allergenInfo.toppers[id] = structuredClone(result.allergenInfo.fillings[id]);
    }
    return result;
  }
  function mutate(catalog,input) {
    if (!input || typeof input !== 'object') error(400,'Choose valid menu settings.');
    if (!Number.isInteger(input.revision) || input.revision !== catalog.revision) error(409,'The sample menu changed. Reload and try again.');
    const next = structuredClone(catalog);
    delete next.entry;
    if (input.action === 'settings') {
      const maxFillings=input.settings?.maxFillings;
      if(!Number.isInteger(maxFillings)||maxFillings<1||maxFillings>4)error(400,'Choose a maximum of one to four fillings per tier.');
      next.settings={maxFillings};next.revision++;return next;
    }
    if (input.action === 'appearance') {
      try { next.appearance = appearanceApi.normalize(input.appearance); } catch (cause) { error(400,cause.message); }
      next.revision++;
      return next;
    }
    if (!groups.includes(input.group)) error(400,'Choose a valid menu category.');
    const entries = next.groups[input.group];
    if (input.action === 'reorder') {
      if (!Array.isArray(input.ids) || input.ids.length !== entries.length || new Set(input.ids).size !== entries.length || !input.ids.every(id => entries.some(item => item.id === id))) error(400,'Include each choice exactly once.');
      const order = new Map(input.ids.map((id,index) => [id,index]));
      next.groups[input.group] = ordered(entries.map(item => ({...item,sortOrder:order.get(item.id)})));
      next.revision++;
      return next;
    }
    if (input.action === 'toggle') {
      const entry = entries.find(item => item.id === input.id);
      if (!entry) error(404,'Menu choice not found.');
      if (typeof input.available !== 'boolean') error(400,'Choose whether this option is available.');
      if (!input.available && ((['fillings','toppers'].includes(input.group) && entry.id === 'none') || entries.filter(item => item.available && item.id !== entry.id).length === 0)) error(400,'Keep this required choice available.');
      entry.available = input.available;
      next.groups[input.group] = ordered(entries);
      next.entry = entry;
      next.revision++;
      return next;
    }
    const existing = input.id ? entries.find(item => item.id === input.id) : null;
    if (input.id && !existing) error(404,'Menu choice not found.');
    const label = typeof input.label === 'string' ? input.label.trim().replace(/\s+/g,' ') : '';
    if (!label || label.length > 80 || /[\u0000-\u001f\u007f]/.test(label)) error(400,'Use a choice name of 1–80 characters.');
    if (entries.some(item => item.id !== existing?.id && item.label.toLowerCase() === label.toLowerCase())) error(400,'That name already exists.');
    if (!existing && entries.length >= 100) error(400,'This category already has 100 choices.');
    if (typeof input.available !== 'boolean') error(400,'Choose whether this option is available.');
    if (!input.available && existing && entries.filter(item => item.available && item.id !== existing.id).length === 0) error(400,'Keep at least one available choice.');
    const base = input.group === 'sizes' ? (existing?.base || options.sizes[0][0]) : input.base;
    if (!options[input.group].some(([id]) => id === base)) error(400,'Choose an existing preview style.');
    if (['fillings','toppers'].includes(input.group) && existing?.id === 'none' && (base !== 'none' || !input.available)) error(400,'Keep the empty choice available.');
    const color = ['cakes','icings'].includes(input.group) ? input.color : existing?.color || '#fff4df';
    if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) error(400,'Choose a valid preview color.');
    const changedIngredient = !!existing && (label !== existing.label || base !== existing.base);
    let allergenInfo = existing?.allergenInfo || {verified:false,contains:[],mayContain:[]};
    if (Object.hasOwn(input,'allergenInfo')) allergenInfo = validMetadata(input.allergenInfo);
    else if (changedIngredient) allergenInfo = {...allergenInfo,verified:false};
    if (['fillings','toppers'].includes(input.group) && existing?.id === 'none') allergenInfo = metadata();
    const entry = {id:existing?.id || `custom_${globalThis.crypto.randomUUID().replaceAll('-','')}`,label,base,color,available:input.available,sortOrder:existing?.sortOrder ?? entries.length,allergenInfo};
    if (existing) Object.assign(existing,entry);
    else entries.push(entry);
    next.groups[input.group] = ordered(entries);
    next.entry = entry;
    next.revision++;
    return next;
  }
  return Object.freeze({create,publicMenu,mutate});
});
