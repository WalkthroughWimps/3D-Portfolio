import {RETRO,contrastGain,tint} from './theme.mjs?v=contrast-glows-1';
import * as THREE from 'three';
import {PANEL} from './mechanism-layout.mjs';
import {MAX_GAP} from './addon-layout.mjs';
import {createSpiralWindowGeometry} from './helical-meter.js?v=contrast-glows-1';
export {createTrackMeters} from './helical-meter.js?v=contrast-glows-1';

const DIGITS=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const SCREW={radius:.0165,bottom:.252,height:.342,pitch:.025};
const clampSize=value=>Math.max(.6,Math.min(1.10,Number.isFinite(Number(value))?Number(value):1));

/** Seven-segment alarm-clock screen and a true helical screw/follower, host-loop driven. */
export function createAnalogInstruments(group,own,metal,dark,cream,targets){
  const mesh=(name,geometry,material,position,parent=group)=>{const m=new THREE.Mesh(own(geometry),material);m.name=name;m.position.set(...position);parent.add(m);return m;};
  const box=(name,size,position,material=dark,parent=group)=>mesh(name,new THREE.BoxGeometry(...size),material,position,parent);
  const clock=new THREE.Group();clock.name='1970s alarm-clock time display';clock.position.set(0,.505,.264);group.add(clock);
  const marking=own(new THREE.MeshBasicMaterial({color:RETRO.letter}));
  const bakelite=own(new THREE.MeshStandardMaterial({color:'#32231b',roughness:.37,metalness:.08}));
  const black=own(new THREE.MeshBasicMaterial({color:'#100906'}));
  const off=own(new THREE.MeshBasicMaterial({color:'#361912'}));
  const lit=own(new THREE.MeshStandardMaterial({color:'#ff7045',emissive:'#ff3b16',emissiveIntensity:2.1,toneMapped:false,roughness:.45}));
  box('Alarm clock bakelite surround',[.378,.122,.039],[0,0,-.010],bakelite,clock);
  box('Recessed smoked clock screen',[.350,.100,.009],[0,0,.014],black,clock);
  for(const y of[-.058,.058])box('Brushed brass screen trim',[.377,.006,.008],[0,y,.018],metal,clock);
  for(const x of[-.185,.185])box('Clock side trim',[.005,.112,.008],[x,0,.018],metal,clock);
  const shape=new THREE.Shape();shape.moveTo(-.016,0);shape.lineTo(-.013,.003);shape.lineTo(.013,.003);shape.lineTo(.016,0);shape.lineTo(.013,-.003);shape.lineTo(-.013,-.003);shape.closePath();
  const segmentGeometry=own(new THREE.ShapeGeometry(shape));
  const coordinates=[['a',0,.036,0],['b',.019,.018,Math.PI/2],['c',.019,-.018,Math.PI/2],['d',0,-.036,0],['e',-.019,-.018,Math.PI/2],['f',-.019,.018,Math.PI/2],['g',0,0,0]];
  const digits=Array.from({length:5},(_,i)=>{const digit=new THREE.Group();digit.name='Alarm clock digit '+i;digit.position.set((i-2)*.059+(i>1?.009:0),.001,.021);clock.add(digit);return coordinates.map(([key,x,y,angle])=>{const s=new THREE.Mesh(segmentGeometry,off);s.name='LED segment '+key;s.position.set(x,y,0);s.rotation.z=angle;s.userData.segment=key;digit.add(s);return s;});});
  for(const y of[-.013,.013])mesh('Glowing clock colon',new THREE.CircleGeometry(.0026,12),lit,[-.023,y,.021],clock);
  mesh('Glowing clock decimal',new THREE.CircleGeometry(.0026,12),lit,[.101,-.034,.021],clock);
  const redLens=own(new THREE.MeshPhysicalMaterial({color:'#773321',transparent:true,opacity:.14,roughness:.14,metalness:.08,depthWrite:false}));
  const pane=box('Smoked red clock glass',[.350,.101,.003],[0,0,.031],redLens,clock);pane.userData.oddAction='seek';targets.push(pane);

  const meterX=-.511,meterZ=.307,leftSupportX=-.552;
  const meterRoot=new THREE.Group();meterRoot.name='Movable helical level meter';group.add(meterRoot);
  const meterOriginal=new THREE.Group();meterOriginal.position.set(-meterX,-.422,0);meterRoot.add(meterOriginal);
  const meterBox=(name,size,position,material=dark)=>box(name,size,position,material,meterOriginal);
  // Rear support rods sit behind the face; bearing seats bridge their depth
  // to both the slotted rail and the screw caps, including on the right side.
  for(const [index,y]of [.6065,.2375].entries())meterBox(index?'Lower meter cap bearing seat':'Upper meter cap bearing seat',[.062,.0144,.054],[meterX-.017,y,.281],metal);
  const supportZ=PANEL.front-PANEL.thickness/4-PANEL.thickness/6;
  // The outer ends stay seated at the meter; surplus bar length embeds in
  // the cover as the meter approaches the panel.
  const supportLength=MAX_GAP/100+.10*1.10+.04;
  const supports=[.6065,.2375].map((y,i)=>box(i?'Level meter lower support bar':'Level meter upper support bar',[supportLength,.0144,PANEL.thickness/3],[-.05+supportLength/2,y-.422,supportZ],metal,meterRoot));
  let width=1,height=1,side='left',motion={direction:'none',speed:1};
  function place(layout){
    meterRoot.position.set(layout.x,layout.y,0);side=layout.side;
    supports.forEach((support,i)=>support.position.set(-.041*width+(side==='left'?1:-1)*supportLength/2,(i?-.1845:.1845)*height,supportZ));
  }
  place({x:meterX,y:.422,side:'left'});
  const supportShape=new THREE.Shape();supportShape.moveTo(-.007,-.181);supportShape.lineTo(.007,-.181);supportShape.lineTo(.007,.181);supportShape.lineTo(-.007,.181);supportShape.closePath();
  const supportSlot=new THREE.Path();supportSlot.moveTo(-.0024,-.176);supportSlot.lineTo(.0024,-.176);supportSlot.lineTo(.0024,.176);supportSlot.lineTo(-.0024,.176);supportSlot.closePath();supportShape.holes.push(supportSlot);
  mesh('Slotted left antirotation support',new THREE.ExtrudeGeometry(supportShape,{depth:.030,bevelEnabled:false}),metal,[leftSupportX,.422,.280],meterOriginal);
  for(let i=0;i<=10;i++)meterBox('Scale engraved on left support',[.0035,.0018,.0008],[-.5567,.269+i*.0297,.3103],marking);
  const brass=own(new THREE.MeshStandardMaterial({color:'#c79a50',roughness:.34,metalness:.78}));
  const rotor=new THREE.Group();rotor.name='Rotating helical level screw';rotor.position.set(meterX,SCREW.bottom,meterZ);meterOriginal.add(rotor);
  const screwGeometry=createSpiralWindowGeometry(own,{height:SCREW.height,radius:SCREW.radius,pitch:SCREW.pitch,hand:1,slotWidth:.22});
  mesh('Stationary dark core visible through main meter spiral window',new THREE.CylinderGeometry(.0145,.0145,SCREW.height,28),dark,[meterX,SCREW.bottom+SCREW.height/2,meterZ],meterOriginal);
  const scaleInk=own(new THREE.MeshStandardMaterial({color:'#f1d287',emissive:'#f1d287',emissiveIntensity:0,roughness:.38,metalness:.12}));
  mesh('Main meter centered vertical printed scale',new THREE.BoxGeometry(.0007,SCREW.height-.018,.00035),scaleInk,[meterX,SCREW.bottom+SCREW.height/2,meterZ+.0147],meterOriginal);
  const stripes=new THREE.Group();stripes.name='Main meter rotating inner stripes';stripes.position.set(meterX,SCREW.bottom+SCREW.height/2,meterZ);meterOriginal.add(stripes);
  const stripeInk=own(new THREE.MeshStandardMaterial({color:'#f1d287',emissive:'#f1d287',emissiveIntensity:0,roughness:.4,metalness:.08,side:THREE.DoubleSide}));
  const stripeGeometry=own(new THREE.BoxGeometry(.0009,SCREW.height-.018,.00035));
  for(let i=0;i<8;i++){const angle=i*Math.PI/4,stripe=new THREE.Mesh(stripeGeometry,stripeInk);stripe.name=`Main inner vertical stripe ${i+1}`;stripe.position.set(Math.sin(angle)*.01465,0,Math.cos(angle)*.01465);stripe.rotation.y=angle;stripes.add(stripe);}
  const screw=new THREE.Mesh(screwGeometry,brass);screw.name='Cylinder with recessed continuous spiral window';rotor.add(screw);
  const meterHover=mesh('Main meter assembly hover target',new THREE.CylinderGeometry(.021,.021,SCREW.height+.026,20),own(new THREE.MeshBasicMaterial({visible:false,depthWrite:false,color:0x000000})),[meterX,SCREW.bottom+SCREW.height/2,meterZ],meterOriginal);
  meterHover.userData.oddMainMeter=true;targets.push(meterHover);
  mesh('Upper spiral-cut screw cap',new THREE.CylinderGeometry(.024,.024,.014,32),metal,[0,SCREW.height+.007,0],rotor);
  mesh('Wider bottom support cap',new THREE.CylinderGeometry(.030,.030,.016,32),metal,[0,0,0],rotor);
  const amber=own(new THREE.MeshStandardMaterial({color:'#dfaa27',emissive:'#dfaa27',emissiveIntensity:.18,roughness:.35,metalness:.25}));
  const follower=new THREE.Group();follower.name='Rising audio level piston';follower.position.set(meterX,.269,meterZ);meterOriginal.add(follower);
  // A slim C-shaped sleeve wraps the screw, leaving its spiral visible from the front.
  const wrapPositions=[],wrapIndices=[],wrapSegments=48,wrapStart=Math.PI*.20,wrapEnd=Math.PI*1.80;
  for(let i=0;i<=wrapSegments;i++){
    const a=wrapStart+(wrapEnd-wrapStart)*i/wrapSegments;
    for(const r of[.0235,.028])wrapPositions.push(Math.sin(a)*r,-.009,Math.cos(a)*r,Math.sin(a)*r,.009,Math.cos(a)*r);
  }
  for(let i=0;i<wrapSegments;i++){
    const b=i*4,n=b+4;
    wrapIndices.push(b,n,b+1,b+1,n,n+1,b+2,b+3,n+2,b+3,n+3,n+2,b,b+2,n,n,b+2,n+2,b+1,n+1,b+3,n+1,n+3,b+3);
  }
  const wrapGeometry=own(new THREE.BufferGeometry());wrapGeometry.setAttribute('position',new THREE.Float32BufferAttribute(wrapPositions,3));wrapGeometry.setIndex(wrapIndices);wrapGeometry.computeVertexNormals();
  mesh('Slim C-shaped screw wrap',wrapGeometry,metal,[0,0,0],follower);
  box('Flat amber indicator face',[.063,.008,.004],[-.0105,0,.0235],amber,follower);
  box('Indicator center index',[.002,.010,.001],[0,0,.026],marking,follower);
  box('Follower antirotation tab',[.0038,.004,.024],[-.041,0,.010],metal,follower);
  const pin=mesh('Follower pin seated in spiral groove',new THREE.CylinderGeometry(.0006,.0006,.012,10),metal,[0,0,.0208],follower);pin.rotation.x=Math.PI/2;
  let displayed=0,previousTime=-1,mainColor='#dfaa27',mainHovered=false;
  let mainInk=tint(mainColor,.42);
  function update(dt,position,level,reduced,contrast=.5,muted=false,hovered=false){
    const strength=contrastGain(contrast);
    lit.emissiveIntensity=1.17*strength;marking.color.set(RETRO.letter).multiplyScalar(.55*strength);
    const active=level>.003,glow=active||hovered,ink=mainInk;
    mainHovered=hovered;
    scaleInk.color.set(muted?RETRO.muted:ink);scaleInk.emissive.set(muted?RETRO.muted:ink);
    scaleInk.emissiveIntensity=(muted?.64:glow?.58:0)*strength;
    amber.color.set(muted?RETRO.muted:ink);amber.emissive.set(muted?RETRO.muted:ink);
    amber.emissiveIntensity=(muted?.64:glow?.62:0)*strength;
    stripeInk.color.set(muted?RETRO.muted:ink);stripeInk.emissive.set(muted?RETRO.muted:ink);
    stripeInk.emissiveIntensity=(muted?.55:glow?.34:0)*strength;
    if(!reduced&&motion.direction!=='none')stripes.rotation.y+=(motion.direction==='clockwise'?-1:1)*Math.max(0,Number.isFinite(dt)?dt:0)*motion.speed*Math.PI/2;
    const tenths=Math.floor(Math.min(675,Math.abs(position)*10+.00001)),signed=position<0?-tenths:tenths;
    if(signed!==previousTime){previousTime=signed;const values=[tenths/6000,tenths/600,(tenths%600)/100,(tenths%100)/10,tenths%10];digits.forEach((segments,i)=>segments.forEach(s=>{s.material=(position<0&&i===0?s.userData.segment==='g':DIGITS[Math.floor(values[i])].includes(s.userData.segment))?lit:off;}));}
    const target=Math.min(1,Math.sqrt(Math.max(0,level)*3));displayed=reduced?target:displayed+(target-displayed)*(1-Math.exp(-Math.max(0,dt)*(target>displayed?10:4)));
    follower.position.y=.269+displayed*.297;
    // A stationary front pin stays in one groove: travel = -angle*pitch/2π.
    rotor.rotation.y=-(follower.position.y-SCREW.bottom)/SCREW.pitch*Math.PI*2;
  }
  update(0,0,0,true);
  return {update,place,configure(colors,settings={}){mainColor=colors[2];brass.color.set(colors[2]);mainInk=tint(mainColor,.42);scaleInk.color.set(mainInk);scaleInk.emissive.set(mainInk);amber.color.set(mainInk);amber.emissive.set(mainInk);stripeInk.color.set(mainInk);stripeInk.emissive.set(mainInk);width=clampSize(settings.mainMeterWidth);height=clampSize(settings.mainMeterHeight);meterOriginal.scale.set(width,height,1);meterOriginal.position.set(-meterX*width,-.422*height,0);motion={direction:['clockwise','counterclockwise'].includes(settings.innerRotation)?settings.innerRotation:'none',speed:Math.max(.2,Math.min(5,Number.isFinite(Number(settings.innerSpeed))?Number(settings.innerSpeed):1))};place({x:meterRoot.position.x,y:meterRoot.position.y,side});},get level(){return displayed;},get screwState(){return {angle:rotor.rotation.y,indicatorY:meterRoot.position.y+(follower.position.y-.422)*height,pitch:SCREW.pitch,bottom:SCREW.bottom,hovered:mainHovered,hoverTarget:meterHover.userData.oddMainMeter,shellColor:'#'+brass.color.getHexString(),indicatorColor:'#'+amber.color.getHexString(),scaleColor:'#'+scaleInk.color.getHexString(),scaleLines:11,scaleGlow:scaleInk.emissiveIntensity,stripeGlow:stripeInk.emissiveIntensity,stripeAngle:stripes.rotation.y,indicatorGlow:amber.emissiveIntensity,spiralWindow:screwGeometry.userData.spiralWindow};}};
}
