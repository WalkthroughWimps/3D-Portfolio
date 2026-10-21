import {downloadSettings} from './SettingsArchive.mjs';

/** Scoped settings transfer, shared by page tabs, Skills tabs and section headings. */
export function mountSettingsContextMenu(root,resolve){
  const abort=new AbortController();let entity=null,anchor=null;
  const menu=document.createElement('div');menu.className='settings-context-menu';menu.setAttribute('role','menu');menu.hidden=true;
  const title=document.createElement('strong');title.className='settings-context-title';menu.append(title);
  const picker=document.createElement('input');picker.type='file';picker.accept='application/json,.json';picker.hidden=true;
  const status=document.createElement('span');status.className='settings-context-status';status.setAttribute('role','status');
  const close=()=>{menu.hidden=true;};
  for(const action of ['Import','Export','Cancel']){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=action;
    if(action==='Cancel')button.className='settings-context-cancel';
    button.onclick=()=>{if(action==='Cancel'){close();anchor?.focus();}else if(action==='Import'){close();picker.click();}else{try{downloadSettings(entity.read(),entity.filename||'settings.json');close();anchor?.focus();}catch(error){status.textContent=error.message;}}};menu.append(button);
  }
  menu.append(status);root.append(picker);document.body.append(menu);
  function open(event){
    const found=resolve(event.target);if(!found)return;
    event.preventDefault();event.stopPropagation();entity=found;anchor=event.target.closest('button,summary,[tabindex]');title.textContent=found.label;status.textContent='';
    const style=getComputedStyle(root);for(const key of ['--settings-surface','--settings-control','--settings-border','--settings-text','--settings-accent'])menu.style.setProperty(key,style.getPropertyValue(key));
    menu.hidden=false;const rect=anchor?.getBoundingClientRect();const x=event.clientX||rect?.left||12,y=event.clientY||rect?.bottom||12;
    menu.style.left=`${Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))}px`;
    menu.querySelector('button').focus();
  }
  root.addEventListener('contextmenu',open,{signal:abort.signal});
  root.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)open(event);},{signal:abort.signal});
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();},{capture:true,signal:abort.signal});
  document.addEventListener('pointermove',event=>{if(menu.hidden||event.pointerType==='touch')return;const rect=menu.getBoundingClientRect(),margin=menu.querySelector('button').getBoundingClientRect().height;if(event.clientX<rect.left-margin||event.clientX>rect.right+margin||event.clientY<rect.top-margin||event.clientY>rect.bottom+margin)close();},{capture:true,passive:true,signal:abort.signal});
  document.addEventListener('keydown',event=>{if(menu.hidden)return;if(event.key==='Escape'){close();anchor?.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}if(event.key==='Tab')close();},{signal:abort.signal});
  globalThis.addEventListener('resize',close,{signal:abort.signal});
  picker.onchange=async()=>{try{const file=picker.files[0];if(!file)return;if(file.size>24e6)throw new RangeError('Settings file too large');await entity.apply(JSON.parse(await file.text()));root.dispatchEvent(new CustomEvent('settings-transfer-status',{bubbles:true,detail:'Settings imported.'}));anchor?.focus();}catch(error){root.dispatchEvent(new CustomEvent('settings-transfer-status',{bubbles:true,detail:`Import failed: ${error.message}`}));}finally{picker.value='';}};
  return{dispose(){abort.abort();menu.remove();picker.remove();}};
}
