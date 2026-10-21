import * as THREE from 'three';

/** A single text/number entry anchored to its physical panel, never a whole page. */
export function createPanelEditor(parent) {
  const events=new AbortController(),form=document.createElement('form');
  form.className='odd-panel-entry';form.hidden=true;form.noValidate=true;form.setAttribute('role','dialog');
  form.innerHTML=`<label class="odd-panel-entry-display"><span></span><input required maxlength="64"></label>
    <div class="odd-panel-entry-pad" role="group" aria-label="Number pad">
      <button type="button" data-key="7">7</button><button type="button" data-key="8">8</button><button type="button" data-key="9">9</button>
      <button type="button" data-key="4">4</button><button type="button" data-key="5">5</button><button type="button" data-key="6">6</button>
      <button type="button" data-key="1">1</button><button type="button" data-key="2">2</button><button type="button" data-key="3">3</button>
      <button type="button" data-key="." aria-label="Decimal point">.</button><button type="button" data-key="0">0</button><button type="button" data-key="back" aria-label="Backspace">⌫</button>
    </div><p class="odd-panel-entry-error" role="alert" hidden></p>
    <div class="odd-panel-entry-actions"><button type="button" data-cancel>Cancel</button><button type="submit">OK</button></div>`;
  parent.append(form);
  const label=form.querySelector('label span'),input=form.querySelector('input'),pad=form.querySelector('.odd-panel-entry-pad'),error=form.querySelector('.odd-panel-entry-error');
  let current=null;
  function clearError(){error.hidden=true;error.textContent='';input.removeAttribute('aria-invalid');}
  function showError(message){error.textContent=message;error.hidden=false;input.setAttribute('aria-invalid','true');input.focus({preventScroll:true});}
  function sync(){if(current?.numeric)current.onChange?.({value:input.value,start:input.selectionStart,end:input.selectionEnd});}
  function close(){current?.onClose?.();current=null;form.hidden=true;clearError();}
  function validateNumber(raw){
    const text=raw.trim();
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))return {error:'Enter a valid number.'};
    const value=Number(text);
    if(!Number.isFinite(value))return {error:'Enter a valid number.'};
    if(current.min!==undefined&&value<Number(current.min))return {error:`Minimum: ${current.min}.`};
    if(current.max!==undefined&&value>Number(current.max))return {error:`Maximum: ${current.max}.`};
    const step=Number(current.step),base=current.min===undefined?0:Number(current.min);
    if(Number.isFinite(step)&&step>0){
      const units=(value-base)/step;
      if(Math.abs(units-Math.round(units))>1e-7)return {error:`Use increments of ${current.step}.`};
    }
    return {value};
  }
  function insertKey(key){
    let start=input.selectionStart,end=input.selectionEnd;
    if(key==='back'){
      if(start===end&&start>0)start--;
      if(start===end)return;
      input.setRangeText('',start,end,'end');
    }else{
      if(key==='.'&&(input.value.slice(0,start).includes('.')||input.value.slice(end).includes('.')))return;
      if(input.value.length-(end-start)+key.length>input.maxLength)return;
      input.setRangeText(key,start,end,'end');
    }
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus({preventScroll:true});sync();
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!current)return;
    if(!input.value.trim()){showError('Enter a value.');return;}
    const result=current.numeric?validateNumber(input.value):{value:input.value.trim()};
    if(result.error){showError(result.error);return;}
    if(current.apply(result.value)===false){showError('That value could not be applied.');return;}
    close();
  },{signal:events.signal});
  form.querySelector('[data-cancel]').addEventListener('click',close,{signal:events.signal});
  form.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}},{signal:events.signal});
  input.addEventListener('input',()=>{clearError();sync();},{signal:events.signal});
  for(const name of ['keyup','click','select'])input.addEventListener(name,sync,{signal:events.signal});
  // Keep the input's caret/selection through pointer presses on the number pad.
  pad.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();},{signal:events.signal});
  pad.addEventListener('click',event=>{const key=event.target.closest('button')?.dataset.key;if(current?.numeric&&key)insertKey(key);},{signal:events.signal});
  document.addEventListener('pointerdown',event=>{if(current&&!form.contains(event.target))close();},{capture:true,signal:events.signal});
  return {
    open({title,value,type='number',min,max,step='.01',point,apply,onChange,onClose}){
      if(current)close();
      current={point:new THREE.Vector3(...point),apply,numeric:type!=='text',min,max,step,onChange,onClose};
      label.textContent=title;form.setAttribute('aria-label',title);form.dataset.numeric=String(current.numeric);
      input.type='text';input.inputMode=current.numeric?'decimal':'text';input.value=String(value??'');
      clearError();form.hidden=false;input.focus({preventScroll:true});input.select();sync();
    },
    update(camera,group,canvas){
      if(!current)return;
      const p=group.localToWorld(current.point.clone()).project(camera),rect=parent.getBoundingClientRect();
      const x=canvas.left+(p.x+1)/2*canvas.width-rect.left,y=canvas.top+(1-p.y)/2*canvas.height-rect.top;
      const width=form.offsetWidth,gap=8;
      if(current.numeric){
        const placeRight=x+16,placeLeft=x-width-16;
        form.dataset.padSide=placeRight+width<=rect.width-gap?'right':'left';
        form.style.left=Math.max(gap,Math.min(rect.width-width-gap,form.dataset.padSide==='right'?placeRight:placeLeft))+'px';
        form.style.top=Math.max(gap,Math.min(rect.height-form.offsetHeight-gap,y-form.offsetHeight/2))+'px';
        return;
      }
      const desiredLeft=()=>x-input.offsetLeft-input.offsetWidth/2;
      form.dataset.padSide='right';
      const left=desiredLeft(),top=y-input.offsetTop-input.offsetHeight/2,height=form.offsetHeight;
      form.style.left=Math.max(gap,Math.min(rect.width-width-gap,left))+'px';
      form.style.top=Math.max(gap,Math.min(rect.height-height-gap,top))+'px';
    },
    get active(){return Boolean(current);},close,dispose(){close();events.abort();form.remove();}
  };
}
