/* Shared washed cake/icing camera and one effective motion preference. */
(() => {
  const KEY='cake-motion-preference-v1'; let mode='system';
  try { const saved=localStorage.getItem(KEY); if(['system','on','off'].includes(saved))mode=saved; } catch {}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const api={effective(){return mode==='on'||(mode==='system'&&!reduced.matches);},get(){return mode;},set(value){if(!['system','on','off'].includes(value))return mode;mode=value;try{localStorage.setItem(KEY,mode);}catch{};document.documentElement.dataset.cakeMotion=mode;document.documentElement.classList.toggle('cake-motion-enabled',api.effective());document.dispatchEvent(new CustomEvent('cake-motion-change',{detail:{mode,effective:api.effective()}}));return mode;}};
  window.CakeMotion=api; document.documentElement.dataset.cakeMotion=mode;document.documentElement.classList.toggle('cake-motion-enabled',api.effective());
  reduced.addEventListener?.('change',()=>{if(mode==='system')api.set('system');});
  function mount(root,{view='cake'}={}) {const scene=document.createElement('div');scene.className='cake-scene';scene.setAttribute('aria-hidden','true');scene.innerHTML='<div class="cake-scene-inner"><div class="cake-scene-icing"></div><div class="cake-scene-cake"></div></div>';root.prepend(scene);const setView=value=>{scene.dataset.view=value==='icing'?'icing':'cake';};setView(view);return {setView,setMotion:api.set,destroy(){scene.remove();}};}
  window.CakeScene={mount};
})();
