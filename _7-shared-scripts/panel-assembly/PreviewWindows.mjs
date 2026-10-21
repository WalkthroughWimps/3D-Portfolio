/** Compact, mutually exclusive diagnostics attached to the existing viewport. */
export function mountPreviewWindows({app,root,nav,getTab}){
  const map=root.querySelector('.ripple-review-map'),host=app.renderer.domElement.parentElement;
  const original=map.parentElement,next=map.nextSibling,window=document.createElement('aside');
  window.className='lattice-preview-window';window.setAttribute('aria-label','Live lattice preview');window.hidden=true;
  const heading=document.createElement('strong');heading.textContent='Lattice';window.append(heading,map);host.append(window);map.classList.add('is-compact');
  let visible=true;
  function sync(){const tab=getTab();window.hidden=!(visible&&tab==='Lattice');app.inset?.setVisible?.(visible&&tab==='Filaments');
    const drawer=document.querySelector('.review-panel--right'),box=app.renderer.domElement.getBoundingClientRect(),open=drawer&&!drawer.classList.contains('is-closed'),left=open?drawer.getBoundingClientRect().left:box.right;
    const right=Math.max(12,box.right-left+12);window.style.right=`${right}px`;
    window.style.maxWidth=`${Math.max(0,left-box.left-24)}px`;if(left-box.left<240)window.hidden=true;
  }
  const observer=new IntersectionObserver(entries=>{visible=Boolean(entries[0]?.isIntersecting);sync();});observer.observe(nav);
  const changes=new MutationObserver(sync);const drawer=document.querySelector('.review-panel--right');if(drawer)changes.observe(drawer,{attributes:true,attributeFilter:['class']});
  globalThis.addEventListener('resize',sync);sync();
  return{sync,dispose(){observer.disconnect();changes.disconnect();globalThis.removeEventListener('resize',sync);original.insertBefore(map,next?.parentNode===original?next:null);map.classList.remove('is-compact');window.remove();}};
}
