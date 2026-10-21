import * as THREE from 'three';
import {PANEL} from './mechanism-layout.mjs';
import {RETRO,RETRO_COLORS,contrastGain,tint} from './theme.mjs?v=contrast-glows-1';

const HEIGHT=.230;
const BOTTOM=-HEIGHT/2;
const TOP=HEIGHT/2;
const RADIUS=.0095;
const CENTER_Z=.283;
const TRACK_X=[-.063,-.021,.021,.063];
const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const clampSize=value=>Math.max(.6,Math.min(1.10,Number.isFinite(Number(value))?Number(value):1));
const stripeMotion=settings=>({direction:['clockwise','counterclockwise'].includes(settings?.innerRotation)?settings.innerRotation:'none',speed:Math.max(.2,Math.min(5,Number.isFinite(Number(settings?.innerSpeed))?Number(settings.innerSpeed):1))});

// A continuous cylinder whose missing angular band winds along Y. The four
// surfaces include the inside of the sleeve and both exposed slot walls.
export function createSpiralWindowGeometry(own,{height,radius,pitch,hand=1,slotWidth=.28,wall=.0014}){
  const rows=Math.max(96,Math.ceil(height/pitch*32)),columns=48,positions=[],indices=[];
  const innerRadius=radius-wall;
  const add=(theta,y,r)=>{positions.push(Math.sin(theta)*r,y,Math.cos(theta)*r);return positions.length/3-1;};
  const ring=[];
  for(let row=0;row<=rows;row++){
    const y=row/rows*height,center=hand*y/pitch*Math.PI*2;
    const outer=[],inner=[];
    for(let column=0;column<=columns;column++){
      const theta=center+slotWidth/2+(Math.PI*2-slotWidth)*column/columns;
      outer.push(add(theta,y,radius));inner.push(add(theta,y,innerRadius));
    }
    ring.push({outer,inner});
  }
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const a=ring[row].outer[column],b=ring[row].outer[column+1],c=ring[row+1].outer[column],d=ring[row+1].outer[column+1];
    indices.push(a,b,c,b,d,c);
    const ai=ring[row].inner[column],bi=ring[row].inner[column+1],ci=ring[row+1].inner[column],di=ring[row+1].inner[column+1];
    indices.push(ai,ci,bi,bi,ci,di);
  }
  for(let row=0;row<rows;row++)for(const edge of[0,columns]){
    const a=ring[row].outer[edge],b=ring[row+1].outer[edge],c=ring[row].inner[edge],d=ring[row+1].inner[edge];
    if(edge===0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  }
  const geometry=own(new THREE.BufferGeometry());
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.userData.spiralWindow={height,radius,pitch,hand,slotWidth,innerRadius};
  return geometry;
}

/** Four open, counterwound helical meters. All positions exposed to the host are in rig space. */
export function createTrackMeters(group,own,metal,dark,targets){
  const root=new THREE.Group();root.name='Four track helical meter bank';group.add(root);
  const mesh=(name,geometry,material,parent=root)=>{const item=new THREE.Mesh(own(geometry),material);item.name=name;parent.add(item);return item;};
  const box=(name,size,material,parent=root)=>mesh(name,new THREE.BoxGeometry(...size),material,parent);
  const black=own(new THREE.MeshStandardMaterial({color:'#241b17',roughness:.7,metalness:.16}));
  const white=new THREE.Color('#ffffff');
  const supportDepth=PANEL.thickness/3;
  const supportZ=PANEL.front-PANEL.thickness/4-supportDepth/2;
  for(const y of[-.132,.132]){
    const rail=box('Track meter end rail',[.176,.007,supportDepth],metal);rail.position.set(0,y,supportZ);
  }
  const rods=[];
  for(const y of[-.127,.127]){
    const rod=box('Track meter panel support rod',[.34,.006,supportDepth],metal);
    rod.position.set(.088+.34/2,y,supportZ);rods.push(rod);
  }

  const spiralGeometry=createSpiralWindowGeometry(own,{height:HEIGHT,radius:RADIUS,pitch:.030,hand:-1,slotWidth:.38});
  const innerGeometry=own(new THREE.CylinderGeometry(.0066,.0066,HEIGHT,18,1));
  const capGeometry=own(new THREE.CylinderGeometry(.012,.012,.010,20));
  const lineGeometry=own(new THREE.BoxGeometry(.0007,HEIGHT-.018,.00035));
  const indicatorGeometry=own(new THREE.BoxGeometry(.021,.006,.006));
  const maxGeometry=own(new THREE.BoxGeometry(.0335,.005,.006));
  const proxyGeometry=own(new THREE.BoxGeometry(.032,.018,.008));
  const hoverGeometry=own(new THREE.CylinderGeometry(.018,.018,HEIGHT+.025,16));
  const tickGeometry=own(new THREE.BoxGeometry(.005,.0015,.0008));
  const stripeGeometry=own(new THREE.BoxGeometry(.0008,HEIGHT-.018,.00035));
  const invisible=own(new THREE.MeshBasicMaterial({visible:false,depthWrite:false,color:0x000000}));
  const meters=TRACK_X.map((x,index)=>{
    const cylinder=new THREE.Group();cylinder.name=`Stationary track ${index+1} meter cylinder`;cylinder.position.set(x,0,CENTER_Z);root.add(cylinder);
    const shell=own(new THREE.MeshStandardMaterial({color:RETRO_COLORS[index],roughness:.34,metalness:.73}));
    const inkColor=tint(RETRO_COLORS[index],.42);
    const scaleInk=own(new THREE.MeshStandardMaterial({color:inkColor,emissive:inkColor,emissiveIntensity:0,roughness:.38,metalness:.12}));
    const indicatorMaterial=own(new THREE.MeshStandardMaterial({color:inkColor,emissive:inkColor,emissiveIntensity:0,roughness:.25,metalness:.30}));
    const maxMaterial=own(new THREE.MeshStandardMaterial({color:tint(RETRO_COLORS[index],.26),emissive:RETRO_COLORS[index],emissiveIntensity:0,roughness:.36,metalness:.42}));
    const inner=new THREE.Mesh(innerGeometry,black);inner.name=`Track ${index+1} fixed printed inner cylinder`;cylinder.add(inner);
    const helix=new THREE.Mesh(spiralGeometry,shell);helix.name=`Track ${index+1} cylinder with counterwound spiral window`;helix.position.y=BOTTOM;cylinder.add(helix);
    const line=new THREE.Mesh(lineGeometry,scaleInk);line.name=`Track ${index+1} centered vertical scale line`;
    line.position.set(0,0,.0069);cylinder.add(line);
    const stripes=new THREE.Group();stripes.name=`Track ${index+1} rotating inner stripes`;cylinder.add(stripes);
    const stripeInk=own(new THREE.MeshStandardMaterial({color:inkColor,emissive:inkColor,emissiveIntensity:0,roughness:.4,metalness:.08,side:THREE.DoubleSide}));
    for(let stripeIndex=0;stripeIndex<8;stripeIndex++){
      const angle=stripeIndex*Math.PI/4, stripe=new THREE.Mesh(stripeGeometry,stripeInk);
      stripe.name=`Track ${index+1} inner vertical stripe ${stripeIndex+1}`;
      stripe.position.set(Math.sin(angle)*.0068,0,Math.cos(angle)*.0068);
      stripe.rotation.y=angle;stripes.add(stripe);
    }
    for(const y of[BOTTOM-.005,TOP+.005]){
      const cap=new THREE.Mesh(capGeometry,metal);cap.name=`Track ${index+1} cylinder cap`;cap.position.y=y;cylinder.add(cap);
    }
    for(const sign of[-1,1]){
      const bearing=box(`Track ${index+1} cap bearing link`,[.006,.014,.027],metal,cylinder);
      bearing.position.set(0,sign*.127,-.0135);
      const bracket=box(`Track ${index+1} front guide end bracket`,[.035,.005,.012],metal,cylinder);
      bracket.position.set(0,sign*.119,.016);
    }
    for(const offset of[-.016,.016]){
      const guide=box(`Track ${index+1} maximum slider guide`,[.0018,.236,.004],metal,cylinder);
      guide.position.set(offset,0,.022);
    }
    for(let tick=0;tick<=10;tick++){
      const mark=new THREE.Mesh(tickGeometry,scaleInk);mark.name=`Track ${index+1} left rail tick ${tick}`;
      mark.position.set(-.0185,BOTTOM+.010+tick*(HEIGHT-.020)/10,.0243);cylinder.add(mark);
    }
    const indicator=new THREE.Mesh(indicatorGeometry,indicatorMaterial);indicator.name=`Track ${index+1} audio level indicator`;
    indicator.position.set(0,BOTTOM+.010,.0125);cylinder.add(indicator);
    const max=new THREE.Mesh(maxGeometry,maxMaterial);max.name=`Track ${index+1} physical maximum slider`;
    max.position.set(0,BOTTOM+.010,.025);cylinder.add(max);
    const proxy=new THREE.Mesh(proxyGeometry,invisible);
    proxy.name=`Track ${index+1} maximum slider target`;proxy.position.set(0,0,.026);proxy.userData.oddAction=`lane-max:${index}`;
    cylinder.add(proxy);targets.push(proxy);
    const hover=new THREE.Mesh(hoverGeometry,invisible);
    hover.name=`Track ${index+1} meter assembly hover target`;hover.userData.oddMeterLane=index;
    cylinder.add(hover);targets.push(hover);
    return {cylinder,inner,helix,line,stripes,stripeInk,hover,indicator,max,proxy,shell,scaleInk,inkColor:new THREE.Color(inkColor),indicatorMaterial,maxMaterial,displayed:0,gain:0,level:0,muted:false,lit:false,hovered:false};
  });
  let motion=stripeMotion(),width=1,height=1;
  function place(layout){
    root.position.set(layout.x,layout.y,0);
    // Left banks reach right; right banks reach left. Track order never flips.
    const direction=layout.side==='right'?-1:1;
    rods.forEach(rod=>{rod.position.x=direction*(.088*width+.34/2);rod.position.y=Math.sign(rod.position.y)*.127*height;});
  }
  function configure(colors=RETRO_COLORS,settings={}){
    motion=stripeMotion(settings);width=clampSize(settings.trackMeterWidth);height=clampSize(settings.trackMeterHeight);
    meters.forEach((meter,i)=>{meter.cylinder.position.x=TRACK_X[i]*width;meter.cylinder.scale.set(width,height,1);});
    for(const rail of root.children.filter(child=>child.name==='Track meter end rail')){rail.position.y=Math.sign(rail.position.y)*.132*height;rail.scale.x=width;}
    place({x:root.position.x,y:root.position.y,side:rods[0]?.position.x<0?'right':'left'});
    meters.forEach((meter,i)=>{
      const color=colors[i]||RETRO_COLORS[i];
      meter.shell.color.set(color);
      const ink=tint(color,.42);
      meter.inkColor.set(ink);
      meter.scaleInk.color.set(ink);meter.scaleInk.emissive.set(ink);
      meter.stripeInk.color.set(ink);meter.stripeInk.emissive.set(ink);
      meter.indicatorMaterial.color.set(ink);meter.indicatorMaterial.emissive.set(ink);
      meter.maxMaterial.color.set(tint(color,.26));meter.maxMaterial.emissive.set(color);
    });
  }
  function update(dt,{levels=[],lanes=[],playing=false,muted=false,siteMuted=false,reduced=false,contrast=.5,hoverLane=-1}={}){
    const strength=contrastGain(contrast),step=Math.max(0,Number.isFinite(dt)?dt:0);
    meters.forEach((meter,i)=>{
      const lane=lanes[i]||{},gain=clamp01(lane.gain??.7);
      const laneMuted=Boolean(muted||siteMuted||lane.muted);
      const level=clamp01(levels[i]);
      const target=playing&&!laneMuted?Math.min(gain,Math.sqrt(level*3)):0;
      meter.displayed=reduced?target:meter.displayed+(target-meter.displayed)*(1-Math.exp(-step*(target>meter.displayed?12:5)));
      meter.indicator.position.y=BOTTOM+.010+meter.displayed*(HEIGHT-.020);
      meter.helix.rotation.y=(.010+meter.displayed*(HEIGHT-.020))/.030*Math.PI*2;
      if(!reduced&&motion.direction!=='none')meter.stripes.rotation.y+=(motion.direction==='clockwise'?-1:1)*step*motion.speed*Math.PI/2;
      meter.max.position.y=BOTTOM+.010+gain*(HEIGHT-.020);meter.proxy.position.y=meter.max.position.y;
      const sounding=Boolean(playing&&level>.003&&!laneMuted);
      const hovered=hoverLane===i;
      meter.stripeInk.emissiveIntensity=(laneMuted?.55:(sounding||hovered)?.34:0)*strength;
      meter.gain=gain;meter.level=level;meter.muted=laneMuted;meter.hovered=hovered;meter.lit=laneMuted||sounding||hovered;
      if(laneMuted){
        meter.stripeInk.color.set(RETRO.muted);meter.stripeInk.emissive.set(RETRO.muted);
        meter.scaleInk.color.set(RETRO.muted);meter.scaleInk.emissive.set(RETRO.muted);
        meter.scaleInk.emissiveIntensity=.64*strength;
        meter.indicatorMaterial.color.set(RETRO.muted);meter.indicatorMaterial.emissive.set(RETRO.muted);
        meter.indicatorMaterial.emissiveIntensity=.64*strength;
        meter.maxMaterial.color.set(RETRO.muted);meter.maxMaterial.emissive.set(RETRO.muted);
        meter.maxMaterial.emissiveIntensity=.64*strength;
      }else{
        const ink=meter.inkColor,glow=sounding||hovered;
        meter.stripeInk.color.copy(ink);meter.stripeInk.emissive.copy(ink);
        meter.scaleInk.color.copy(ink);meter.scaleInk.emissive.copy(ink);
        meter.scaleInk.emissiveIntensity=glow?.58*strength:0;
        meter.indicatorMaterial.color.copy(ink);meter.indicatorMaterial.emissive.copy(ink);
        meter.indicatorMaterial.emissiveIntensity=glow?.62*strength:0;
        meter.maxMaterial.color.copy(meter.shell.color).lerp(white,.26);
        meter.maxMaterial.emissive.copy(meter.shell.color);
        meter.maxMaterial.emissiveIntensity=glow?.24*strength:0;
      }
    });
  }
  function maxRanges(){return meters.map((meter,i)=>({x:root.position.x+TRACK_X[i]*width,minY:root.position.y+(BOTTOM+.010)*height,maxY:root.position.y+(TOP-.010)*height,z:CENTER_Z+.025}));}
  place({x:0,y:0,side:'left'});configure();update(0);
  return {root,place,configure,update,get maxRanges(){return maxRanges();},get states(){return meters.map((meter,i)=>({index:i,displayed:meter.displayed,level:meter.level,gain:meter.gain,muted:meter.muted,hovered:meter.hovered,lit:meter.lit,indicatorY:root.position.y+meter.indicator.position.y*height,maxY:root.position.y+meter.max.position.y*height,color:'#'+meter.shell.color.getHexString(),indicatorColor:'#'+meter.indicatorMaterial.color.getHexString(),scaleColor:'#'+meter.scaleInk.color.getHexString(),scaleLines:11,scaleGlow:meter.scaleInk.emissiveIntensity,stripeGlow:meter.stripeInk.emissiveIntensity,stripeAngle:meter.stripes.rotation.y,indicatorGlow:meter.indicatorMaterial.emissiveIntensity,maxGlow:meter.maxMaterial.emissiveIntensity,hoverTargetLane:meter.hover.userData.oddMeterLane,maxAction:meter.proxy.userData.oddAction,spiralWindow:spiralGeometry.userData.spiralWindow,helixName:meter.helix.name,innerName:meter.inner.name}));}};
}
