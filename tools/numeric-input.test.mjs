import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const load=async path=>import('data:text/javascript;base64,'+fs.readFileSync(new URL(path,import.meta.url)).toString('base64'));
const {mountNumericInputs,registerNumericInputOwner}=await load('../_7-shared-scripts/core/numeric-input.js');
const {PAGE_IDS,newNote,blankNoteAppearance,validateBundle}=await load('../_7-shared-scripts/sticky-notes/data.js');

function setup({lock='none',focused=false,value='100',min='-5000',max='5000',step='1'}={}){
 const win=new EventTarget(),doc=new EventTarget(),captures=new Set(),calls={input:0,change:0,start:0,end:[]};let time=0;
 Object.assign(win,{setTimeout,clearTimeout,getSelection:()=>({removeAllRanges(){calls.selectionCleared=true;}})});
 Object.assign(doc,{nodeType:9,defaultView:win,documentElement:{style:{userSelect:'text'}},activeElement:null,pointerLockElement:null,contains:input=>input.isConnected});
 const input=new EventTarget(),attrs={min,max,step};
 Object.assign(input,{type:'number',value,disabled:false,readOnly:false,isConnected:true,style:{cursor:'auto'},getAttribute:name=>attrs[name]??null,closest:()=>input,focus(){doc.activeElement=input;},select(){calls.selected=true;},setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)});
 const grant=()=>{doc.pointerLockElement=input;doc.dispatchEvent(new Event('pointerlockchange'));};
 doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));calls.exited=true;};
 if(lock==='immediate')input.requestPointerLock=()=>{grant();return Promise.resolve();};
 if(lock==='denied')input.requestPointerLock=()=>Promise.reject(new Error('Denied'));
 if(lock==='delayed')input.requestPointerLock=()=>undefined;
 if(focused)input.focus();
 const unown=registerNumericInputOwner(input,{start(){calls.start++;return 'history';},end(_input,data){calls.end.push(data);}});
 input.addEventListener('input',()=>calls.input++);input.addEventListener('change',()=>calls.change++);
 const dispose=mountNumericInputs(doc);
 const send=(host,type,properties={})=>{const event=new Event(type,{bubbles:true,cancelable:true});for(const [name,value] of Object.entries({target:input,pointerId:1,pointerType:'mouse',button:0,buttons:1,clientX:10,clientY:10,movementX:0,movementY:0,timeStamp:time+=10,...properties}))Object.defineProperty(event,name,{value});host.dispatchEvent(event);return event;};
 const down=()=>send(doc,'pointerdown'),move=(x,extra={})=>send(win,'pointermove',{clientX:x,...extra}),up=()=>send(win,'pointerup',{buttons:0});
 return {win,doc,input,calls,captures,grant,send,down,move,up,close(){dispose();unown();},dispose};
}

test('focused numeric fields capture immediately and keep scrubbing after leaving the field',()=>{
 const s=setup({focused:true});try{s.down();assert.equal(s.captures.has(1),true);s.move(26,{target:s.win});assert.equal(s.input.value,'102');s.move(50,{target:s.win});assert.equal(s.input.value,'105');assert.equal(s.doc.activeElement,s.input);assert.equal(s.send(s.doc,'selectstart').defaultPrevented,true);s.up();assert.equal(s.calls.change,1);assert.equal(s.calls.start,1);assert.equal(s.calls.end[0].cancel,false);assert.equal(s.captures.size,0);assert.equal(s.doc.documentElement.style.userSelect,'text');}finally{s.close();}
});

test('pointer-only relative events continue beyond screen edges without counting compatibility duplicates',()=>{
 const s=setup({lock:'immediate'});try{s.down();s.move(18);assert.equal(s.doc.pointerLockElement,s.input);s.move(18,{movementX:400,timeStamp:100});assert.equal(s.input.value,'151');s.send(s.win,'mousemove',{clientX:18,movementX:400,timeStamp:100});assert.equal(s.input.value,'151');s.move(18,{movementX:80,timeStamp:120});assert.equal(s.input.value,'161');s.up();assert.equal(s.doc.pointerLockElement,null);assert.equal(s.calls.change,1);}finally{s.close();}
});

test('older pointer-lock implementations can scrub with mousemove and mouseup alone',()=>{
 const s=setup({lock:'immediate'});try{s.down();s.move(18);s.send(s.win,'mousemove',{movementX:80,timeStamp:100});assert.equal(s.input.value,'111');s.send(s.win,'mouseup',{buttons:0});assert.equal(s.calls.change,1);assert.equal(s.doc.pointerLockElement,null);}finally{s.close();}
});

test('denied lock retains capture and supports precise steps, bounds and Escape rollback',async()=>{
 const s=setup({lock:'denied',value:'1',min:'.2',max:'2',step:'.1'});try{s.down();s.move(50,{shiftKey:true});await Promise.resolve();await Promise.resolve();assert.equal(s.input.value,'1.1');assert.equal(s.captures.has(1),true);s.move(200);assert.equal(s.input.value,'2');s.send(s.win,'keydown',{key:'Escape'});assert.equal(s.input.value,'1');assert.equal(s.calls.change,0);assert.equal(s.calls.end[0].cancel,true);assert.equal(s.input.style.cursor,'auto');assert.equal(s.captures.size,0);}finally{s.close();}
});

test('late undefined-return pointer lock is released after the gesture or mount ends',()=>{
 for(const ending of ['release','dispose']){const s=setup({lock:'delayed'});try{s.down();s.move(26);if(ending==='release')s.up();else s.dispose();s.grant();assert.equal(s.doc.pointerLockElement,null);assert.equal(s.calls.end.length,1);}finally{s.close();}}
});

test('pointer-lock handoff does not cancel an active drag and secondary releases do not end it',()=>{
 const s=setup({lock:'delayed'});try{s.down();s.move(26);s.send(s.win,'pointercancel');assert.equal(s.calls.end.length,0);s.grant();s.move(26,{movementX:80});s.send(s.win,'pointerup',{button:2,buttons:1});assert.equal(s.input.value,'112');assert.equal(s.calls.end.length,0);s.up();assert.equal(s.calls.change,1);const click=s.send(s.doc,'click',{detail:1});assert.equal(click.defaultPrevented,true);}finally{s.close();}
});

test('single clicks and double clicks still focus for typing; ordinary text fields retain native selection',()=>{
 const s=setup();try{s.down();s.up();assert.equal(s.input.value,'100');assert.equal(s.calls.start,0);assert.equal(s.calls.change,0);s.send(s.doc,'dblclick');assert.equal(s.calls.selected,true);const text={closest:()=>null,isConnected:true};assert.equal(s.send(s.doc,'pointerdown',{target:text}).defaultPrevented,false);assert.equal(s.send(s.doc,'selectstart',{target:text}).defaultPrevented,false);}finally{s.close();}
});

test('blur and disposal cancel once, restore the value and remove live input ownership',()=>{
 for(const ending of ['blur','dispose']){const s=setup({lock:'immediate'});try{s.down();s.move(42);if(ending==='blur')s.send(s.win,'blur',{target:s.win});else s.dispose();assert.equal(s.input.value,'100');assert.equal(s.calls.end.length,1);assert.equal(s.calls.end[0].cancel,true);assert.equal(s.captures.size,0);s.up();assert.equal(s.calls.change,0);assert.equal(s.doc.documentElement.style.userSelect,'text');}finally{s.close();}}
});

test('new notes on every page start blank and reusable appearance never copies authored text',()=>{
 const anchor={surface:'context:graphics:dom',triangle:0,bary:[1,0,0]},saved={text:'Existing authored words',color:'#ccddff',rotation:23,size:1.3};
 const next=blankNoteAppearance(saved);assert.deepEqual(next,{text:'',color:'#ccddff',rotation:23,size:1.3});assert.equal(saved.text,'Existing authored words');
 for(const pageId of PAGE_IDS){const note=newNote(pageId,anchor);assert.equal(note.text,'');assert.equal(validateBundle({version:1,notes:[note]}).notes[0].text,'');}
});
