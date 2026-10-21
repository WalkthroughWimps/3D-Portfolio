import * as THREE from 'three';
import {ReflectedFilamentField} from './ReflectedFilamentField.mjs';

function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,1,32,32,31);g.addColorStop(0,'rgba(255,255,255,.32)');g.addColorStop(.38,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
export function createFilamentInset({renderer,stage,field,element=document.querySelector('#inset'),title=document.querySelector('#insetTitle')}){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#050e1b');
  const camera=new THREE.OrthographicCamera(-.06,.06,.035,-.035,.001,5);camera.position.set(0,0,.8);camera.lookAt(0,0,0);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:'#f46465',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.75}));glow.scale.set(.145,.09,1);glow.position.z=-.04;scene.add(glow);
  const path=axis=>[{id:'inset-'+axis,axis,start:[-.05,0,0],end:[.05,0,0],gapWindows:[[.2,.8]]}];
  const detail=new ReflectedFilamentField(path('H'),{axleDiameter:field.options.axleDiameter});scene.add(detail);
  let contrastGain=1;
  const state={axis:'H',editTarget:'all',visibleIndices:[0,1],colors:[],pathCount:1,usingMainRenderer:true,enabled:false};
  function sync(){const source=field.getSettings().options,selected=source.editTarget,copy=structuredClone(source);
    state.editTarget=selected;state.visibleIndices=selected==='all'?Array.from({length:source.strandCount},(_,i)=>i):[selected];state.colors=state.visibleIndices.map(i=>field.getStrandColor(state.axis,i));
    if(selected!=='all'){
      const chosen=field.getStrandColor(state.axis,selected);
      copy.strandOverrides=Array.from({length:source.strandCount},(_,i)=>({...source.strandOverrides[i],...(i===selected?{}:{intensity:0,glow:0,color:chosen})}));
    }
    copy.editTarget='all';detail.importSettings({schemaVersion:2,options:copy});detail.setContrastGain(contrastGain);
    glow.material.color.set(state.colors[0]||'#f46465');
    title.textContent=selected==='all'?`All ${source.strandCount} filaments · ${state.axis} direction`:`Filament ${selected+1} of ${source.strandCount} · ${state.axis} direction`;
  }
  let pending=0;
  function requestSync(){clearTimeout(pending);pending=setTimeout(()=>{pending=0;sync();},75);}
  function setAxis(axis){if(!['H','V','D+','D-'].includes(axis)||axis===state.axis)return;state.axis=axis;detail.setPaths(path(axis));requestSync();}
  function render(elapsed){if(!state.enabled)return;const canvas=renderer.domElement,box=canvas.getBoundingClientRect(),rect=element.getBoundingClientRect();if(!box.width||!box.height||!rect.width||!rect.height)return;
    detail.update(elapsed,camera);const x=Math.max(0,Math.round(rect.left-box.left)),y=Math.max(0,Math.round(box.bottom-rect.bottom)),w=Math.min(Math.round(rect.width),Math.round(box.width-x)),h=Math.min(Math.round(rect.height),Math.round(box.height-y));if(w<=0||h<=0)return;
    camera.left=-.06;camera.right=.06;camera.top=.06*h/w;camera.bottom=-camera.top;camera.updateProjectionMatrix();
    renderer.setScissorTest(true);renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.setScissorTest(false);renderer.setViewport(0,0,stage.clientWidth,stage.clientHeight);
  }
  element.hidden=true;sync();return{state,scene,field:detail,camera,setContrastGain(gain){contrastGain=Number.isFinite(gain)?gain:1;detail.setContrastGain(contrastGain);glow.material.opacity=Math.min(1,.75*contrastGain);},setVisible(value){state.enabled=Boolean(value);element.hidden=!state.enabled;},setAxis,sync,requestSync,render,dispose(){clearTimeout(pending);detail.dispose();glow.material.map.dispose();glow.material.dispose();}};
}
