/* Shared, conservative allergy screening for the menu and order review. */
(function (scope) {
  const groups = ['cakes','icings','fillings','toppers'];
  const defaultNames = ['Milk','Eggs','Wheat','Soy','Peanuts','Tree nuts','Sesame','Fish','Shellfish'];
  const key = value => String(value).trim().replace(/\s+/g,' ').toLowerCase();
  function normalizeAllergies(entries, knownNames = defaultNames) {
    const known = new Map(knownNames.map(name => [key(name),name]));
    const names = [], unknown = [];
    for (const raw of Array.isArray(entries) ? entries : []) {
      const name = (typeof raw === 'string' ? raw : raw?.name)?.trim().replace(/\s+/g,' ');
      if (!name) continue;
      const canonical = known.get(key(name));
      const target = canonical ? names : unknown;
      const value = canonical || name;
      if (!target.some(item => key(item) === key(value))) target.push(value);
    }
    return { names, unknown, reported:names.length + unknown.length > 0 };
  }
  function assessment(group, id, menu, allergies) {
    if (id === 'none' && (group === 'fillings' || group === 'toppers')) return null;
    if (allergies.unknown.length) return 'unknown-allergy';
    const info = menu.allergenInfo?.[group]?.[id];
    if (!info || info.verified !== true) return 'unverified';
    if ([...(info.contains || []),...(info.mayContain || [])].some(name => allergies.names.some(reported => key(reported) === key(name)))) return 'allergen-match';
    return null;
  }
  function screenMenu(menu, entries) {
    const allergies = entries?.reported === true && Array.isArray(entries.names) ? entries : normalizeAllergies(entries,menu.allergens || defaultNames);
    const screened = structuredClone(menu);
    screened.allergenInfo ||= {};
    const excluded = [];
    if (!allergies.reported) return { ...screened, allergyScreen:{ reported:false,unknown:[],excluded } };
    for (const group of groups) {
      screened[group] = (menu[group] || []).filter(([id]) => {
        const reason = assessment(group,id,menu,allergies);
        if (reason) { excluded.push({ group,id,reason }); return false; }
        return true;
      });
      screened.allergenInfo[group] = Object.fromEntries(screened[group].map(([id]) => [id,menu.allergenInfo?.[group]?.[id]]));
      if (screened.visuals?.[group]) screened.visuals[group] = Object.fromEntries(screened[group].map(([id]) => [id,menu.visuals[group][id]]));
    }
    screened.allergyScreen = { reported:true,unknown:allergies.unknown,excluded };
    return screened;
  }
  function inspectItems(items, menu, entries) {
    const allergies = entries?.reported === true && Array.isArray(entries.names) ? entries : normalizeAllergies(entries,menu.allergens || defaultNames);
    const issues = [];
    const list = Array.isArray(items) ? items : [items];
    for (const [index,item] of list.entries()) {
      const tiers = Array.isArray(item?.tiers) ? item.tiers : [item?.cake || item];
      for (const [tierIndex,tier] of tiers.entries()) {
        for (const [group,ids] of [['cakes',[tier?.flavor]],['icings',[tier?.icing]],['fillings',Array.isArray(tier?.fillings) ? tier.fillings.map(entry => entry?.id) : [tier?.filling]],['toppers',Array.isArray(tier?.toppers) ? tier.toppers.map(entry => entry?.id) : [tier?.topperA,tier?.topperB]]]) {
          for (const id of ids) {
          if (!id) {
            if (Array.isArray(item?.tiers) && ['cakes','icings'].includes(group)) issues.push({ index,tierIndex,group,id:null,reason:'unavailable' });
            continue;
          }
          const available = (menu[group] || []).some(([choice]) => choice === id);
          const reason = available ? allergies.reported && assessment(group,id,menu,allergies) : 'unavailable';
          if (reason) issues.push({ index,tierIndex,group,id,reason });
          }
        }
      }
    }
    return { allowed:issues.length === 0,requiresReview:allergies.reported || issues.length > 0,issues };
  }
  // Warnings describe selected ingredients; a reported allergy alone is not a conflict.
  function inspectSelected(items,menu,entries){
    const issues=inspectItems(items,menu,entries).issues.filter(issue=>issue.id&&['allergen-match','unknown-allergy','unverified'].includes(issue.reason));
    return {hasConflict:issues.length>0,issues};
  }
  const api = { normalizeAllergies,screenMenu,inspectItems,inspectSelected };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.CakeAllergens = api;
})(typeof window === 'undefined' ? globalThis : window);
