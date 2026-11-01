import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Gameplay is deliberately independent of Blender. Replace tile visuals later
// with named GLB objects/armatures; keep the rules, turns and occupancy untouched.
const SIZE = 6;
const COLORS = [0x23d67d, 0x1252ff, 0xff75d2, 0xffd342];
const COLOR_NAMES = ["Green", "Blue", "Pink", "Yellow"];
const WHITE = 0xf6f7f5;
const RED = 0xff3b4e;
const BG = 0x283443;
const boardElement = document.getElementById('scene');
const status = document.getElementById('status');
const hint = document.getElementById('hint');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101924);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(10, 15, 16);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
boardElement.appendChild(renderer.domElement);
// Match the portfolio controls: RMB orbit, middle-button drag pan; LMB plays.
const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons = {
  LEFT: null,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.ROTATE
};
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enableZoom = true;   // Wheel scroll zooms; middle-button dragging still pans.
controls.zoomSpeed = 0.85;
controls.minDistance = 5;
controls.maxDistance = 85;
controls.minPolarAngle = 0.10;
controls.maxPolarAngle = Math.PI / 2 - 0.06; // Stay above the board.
controls.target.set(0, 0, 0);
const homeTarget = controls.target.clone();
const homeOffset = camera.position.clone().sub(homeTarget);
const homeRadius = homeOffset.length();
function fitBoard() {
  // The board half-diagonal is ~5.2 world units; add clearance for the raised buttons.
  // Perspective framing uses both horizontal and vertical FOV so narrow windows fit too.
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const safeFov = Math.min(verticalFov, horizontalFov);
  const requiredDistance = 3.80 / Math.sin(safeFov / 2) * 1.03;
  const distance = Math.max(9.5, requiredDistance);
  const direction = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  controls.update();
}
// Double-clicking either camera button resets only its respective transform.
// Handle the clicks explicitly because browser dblclick events for RMB vary.
const lastCameraClick = new Map();
let dragStart = null;
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 1 && event.button !== 2) return;
  const now = performance.now();
  const previous = lastCameraClick.get(event.button);
  if (previous && now - previous.time < 360 &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 10) {
    lastCameraClick.delete(event.button);
    if (event.button === 2) {
      // Restore original orientation without undoing the current pan offset.
      const distance = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).addScaledVector(homeOffset.clone().normalize(), distance);
    } else {
      // Restore pan center without changing current rotation or zoom distance.
      const shift = homeTarget.clone().sub(controls.target);
      camera.position.add(shift);
      controls.target.copy(homeTarget);
    }
    controls.update();
    event.preventDefault();
    event.stopImmediatePropagation();
    dragStart = null;
  } else {
    dragStart = {button:event.button,x:event.clientX,y:event.clientY};
  }
}, true);
renderer.domElement.addEventListener('pointerup', event => {
  if (!dragStart || dragStart.button !== event.button) return;
  const moved = Math.hypot(event.clientX - dragStart.x,event.clientY - dragStart.y);
  if (moved < 7) lastCameraClick.set(event.button, {time:performance.now(),x:event.clientX,y:event.clientY});
  else lastCameraClick.delete(event.button);
  dragStart = null;
}, true);
scene.add(new THREE.HemisphereLight(0xe3f2ff, 0x27334c, 2.1));
const direct = new THREE.DirectionalLight(0xffffff, 2.7);
direct.position.set(4, 12, 8);
scene.add(direct);
const base = new THREE.Mesh(new THREE.BoxGeometry(7.3, .4, 7.3), new THREE.MeshStandardMaterial({ color: 0x202a35, metalness: .55, roughness: .38 }));
base.position.y = -.45;
scene.add(base);
const tiles = [];
const roundGeometry = new THREE.CylinderGeometry(.42, .45, .36, 36);
// A softly beveled square extrusion, centered at the same origin and height as
// the original cylindrical stump. Switch shared geometries without replacing
// Mesh instances, keeping every tile's material, animation and raycast ID.
function roundedSquareGeometry(width, height, radius, bevel) {
  const half=width/2, r=radius;
  const shape=new THREE.Shape();
  shape.moveTo(-half+r,-half);
  shape.lineTo(half-r,-half); shape.quadraticCurveTo(half,-half,half,-half+r);
  shape.lineTo(half,half-r); shape.quadraticCurveTo(half,half,half-r,half);
  shape.lineTo(-half+r,half); shape.quadraticCurveTo(-half,half,-half,half-r);
  shape.lineTo(-half,-half+r); shape.quadraticCurveTo(-half,-half,-half+r,-half);
  const coreDepth=height-2*bevel;
  const geo=new THREE.ExtrudeGeometry(shape,{depth:coreDepth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:5,steps:1});
  geo.translate(0,0,-coreDepth/2);
  geo.rotateX(-Math.PI/2);
  geo.computeVertexNormals();
  return geo;
}
const squareGeometry=roundedSquareGeometry(.72,.36,.115,.035);
const endingRoundGeometry=new THREE.CylinderGeometry(.91,.94,.38,40);
const endingSquareGeometry=roundedSquareGeometry(1.65,.38,.25,.045);
let squareStumps=true;
function updateStumpShape(){
  for(const tile of tiles) tile.body.geometry=squareStumps?squareGeometry:roundGeometry;
  for(const tile of endingTiles) tile.button.geometry=squareStumps?endingSquareGeometry:endingRoundGeometry;
}
const pipGeometry = new THREE.SphereGeometry(.155, 20, 10);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let match = null;
let generation = 0;
let fastMode = false;
const settings = {};
for (const [name, defaultValue] of Object.entries({thinkMin:450,thinkMax:1150,motion:250,clearStep:110,clearExp:-15,warning:650,trailFlash:250,startFlash:580,ending:3000})) {
  const el = document.getElementById(name);
  settings[name] = defaultValue;
  const output = document.getElementById(name+'Val');
  const update = () => { settings[name] = +el.value; output.textContent = name==='clearExp' ? (settings[name]>0?'+':'')+settings[name]+'%' : settings[name]+' ms'; };
  el.addEventListener('input',update); update();
}
// Accessibility: disable all flashing effects, with a single slider for contrast.
const flashingToggle=document.getElementById('enableFlashing');
const intensitySlider=document.getElementById('flashIntensity');
const intensityOutput=document.getElementById('flashIntensityVal');
const flashOptions={enabled:true,intensity:0.10};
function refreshFlashSettings(){
  flashOptions.enabled=flashingToggle.checked;
  flashOptions.intensity=Number(intensitySlider.value)/100;
  intensityOutput.textContent=Math.round(flashOptions.intensity*100)+'%';
  intensitySlider.disabled=!flashOptions.enabled;
  if(!flashOptions.enabled)startFlashOn=true;
  if(match)redraw();
}
flashingToggle.addEventListener('change',refreshFlashSettings);
intensitySlider.addEventListener('input',refreshFlashSettings);
// Honor the system preference on first load, but leave the option user-editable.
const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
if(reduceMotion?.matches)flashingToggle.checked=false;

function stampTexture(text) {
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,256,256); ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 150px system-ui';ctx.fillStyle='#f5f4e9';ctx.fillText(text,128,135);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
for(let i=0;i<36;i++) {
  const row=Math.floor(i/SIZE), col=i%SIZE;
  const body = new THREE.Mesh(squareGeometry,new THREE.MeshStandardMaterial({color:0x435267,metalness:.55,roughness:.34}));
  body.position.set(col-2.5,0,row-2.5);
  body.userData.tile=i;
  scene.add(body);
  const led = new THREE.Mesh(pipGeometry,new THREE.MeshStandardMaterial({color:BG,emissive:BG,emissiveIntensity:.2,roughness:.22}));
  led.position.y=.192; led.userData.tile=i;body.add(led);
  tiles.push({body,led,index:i,targetY:0,visY:0,color:BG});
}
const endingTiles=[];
for(let i=0;i<9;i++) {
  const c=i%3, r=Math.floor(i/3);
  const item = new THREE.Group(); item.position.set((c-1)*2.12,.04,(r-1)*2.12);
  const button=new THREE.Mesh(endingSquareGeometry,new THREE.MeshStandardMaterial({color:0x4d6275,metalness:.55,roughness:.35}));
  const letter = new THREE.Mesh(new THREE.PlaneGeometry(1.22,1.22),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));
  letter.rotation.x=-Math.PI/2;letter.position.y=.197;
  item.add(button,letter);item.visible=false;scene.add(item);
  endingTiles.push({item,letter,button});
}
let lastSceneWidth = 0, lastSceneHeight = 0;
function resize(){
  const w=boardElement.clientWidth,h=boardElement.clientHeight;
  if(!w||!h||(w===lastSceneWidth&&h===lastSceneHeight))return;
  lastSceneWidth=w;lastSceneHeight=h;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
  // Frame only at startup: resizing a sidebar must not undo manual zoom/rotation/pan.
  if(!resize.initialized){fitBoard();resize.initialized=true;}
}
window.addEventListener('resize',resize);
new ResizeObserver(resize).observe(boardElement);
resize();
// OrbitControls listens to the canvas only: scrolling either sidebar never zooms.
// Prevent wheel events originating on the board from escaping into the document.
renderer.domElement.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
function frame(){requestAnimationFrame(frame);const amount=fastMode?1:Math.max(.05,Math.min(.5,20/Math.max(40,settings.motion)));for(const tile of tiles){tile.visY += (tile.targetY-tile.visY)*amount;tile.body.position.y=tile.visY;}controls.update();renderer.render(scene,camera);}frame();
const ms=(value)=>fastMode?0:value;
function sleep(delay, token){return new Promise(resolve=>setTimeout(()=>resolve(token===generation),Math.max(0,ms(delay))));}
// Adjust the interval smoothly across the *whole* trail, never compound it per stump.
// -30% means the final step is 30% quicker than the first; +30% is subtly slower.
// Reused for elimination and the reversed after-move trail reveal.
function trailInterval(stepIndex, trailLength, scale=1){
  const progress=trailLength<=1?0:stepIndex/(trailLength-1);
  return Math.max(0, settings.clearStep*scale*(1+(settings.clearExp/100)*progress));
}

function wrap(x){return (x+SIZE)%SIZE;}
function neighbors(i){const x=i%SIZE,y=Math.floor(i/SIZE);return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].map(([a,b])=>wrap(b)*SIZE+wrap(a));}
function knightNeighbors(i){
  const x=i%SIZE,y=Math.floor(i/SIZE), cells=new Set();
  for(const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]])
    cells.add(wrap(y+dy)*SIZE+wrap(x+dx));
  return [...cells];
}
function freeMoves(player){
  const destinations=(player.personality==='knight')?knightNeighbors(player.at):neighbors(player.at);
  return destinations.filter(i=>match.board[i]===null);
}
function setLed(i,color){const led=tiles[i].led; const material=led.material; material.color.setHex(color); material.emissive.setHex(color);material.emissiveIntensity=color===BG?.12:1.75;tiles[i].color=color;}
const displayOptions = {highlightCurrent: true, raiseCurrent: true, lowerPossible: true};
const humanKnightToggle=document.getElementById('humanKnightEnabled');
const stumpShapeToggle=document.getElementById('squareStumps');
squareStumps=stumpShapeToggle.checked;
updateStumpShape();
stumpShapeToggle.addEventListener('change',()=>{
  squareStumps=stumpShapeToggle.checked;
  updateStumpShape();
});
let startFlashOn = true;
refreshFlashSettings();
function redraw(preserveDock=false){
  if(!match)return;
  const current = new Map(match.players.filter(p=>p.active).map(p=>[p.at,p]));
  const reachable = new Set(match.phase==='playing' && displayOptions.lowerPossible
    ? match.players.filter(p=>p.active).flatMap(p=>freeMoves(p)) : []);
  for(let i=0;i<36;i++){
    const tile=tiles[i], owner=match.board[i], occupied=current.get(i);
    setLed(i,owner===null?BG:COLORS[owner]);
    // Keep the center LED colored on every visited button. Only the active
    // position gets a full-body glow, independently controlled by a checkbox.
    const mat=tile.body.material;
    mat.emissive.setHex(occupied && displayOptions.highlightCurrent ? COLORS[occupied.id] : 0x000000);
    mat.emissiveIntensity=occupied && displayOptions.highlightCurrent ? 0.85 : 0;
    // Raised when enabled, traditional lowered position otherwise.
    tile.targetY=occupied ? (displayOptions.raiseCurrent ? .30 : -.22) : (reachable.has(i) ? -.22 : 0);
    // Legal destinations show a white center LED and a colored button face.
    // They remain lowered; the lit face communicates whose turn it is.
    if(match.offered?.includes(i) && match.phase==='playing') {
      const active=match.order[match.turn % match.order.length];
      setLed(i,WHITE);
      mat.emissive.setHex(COLORS[active.id]);
      mat.emissiveIntensity=0.92;
      tile.targetY=displayOptions.lowerPossible ? -.22 : 0;
    }
    // After a move, illuminate the path from the newest cell back to its origin.
    // Each cell remains bright after the sweep reaches it.
    if(match.trailReveal?.playerId===owner && match.trailReveal.lit.has(i)) {
      mat.emissive.setHex(COLORS[owner]);
      mat.emissiveIntensity=flashOptions.enabled ? (0.35+1.25*flashOptions.intensity) : 0.85;
    }
  }
  // Starting bulbs remain steady; color comes from the editable player palette.
  if (match.phase === 'choose') for (let id=0; id<4; id++) {
    const i=match.starts[id];
    setLed(i,COLORS[id]);
    tiles[i].body.material.emissive.setHex(COLORS[id]);
    tiles[i].body.material.emissiveIntensity=(!flashOptions.enabled || startFlashOn) ? (0.25+1.35*flashOptions.intensity) : Math.max(0.03,0.25-0.20*flashOptions.intensity);
    tiles[i].targetY=0;
  }
  if (!preserveDock) updatePlayerDock();
}
function updatePlayerDock(){
  const dock=document.getElementById('playerDock');
  if(!match){dock.replaceChildren();return;}
  const current=match.phase==='playing' ? match.order[match.turn%match.order.length] : null;
  const reveal=document.getElementById('showPersonalities').checked;
  const roster=match.players.length?match.players:match.starts.map((at,id)=>({id,at,active:true,human:false,prestart:true}));
  dock.replaceChildren(...roster.map(p=>{
    const item=document.createElement('div');
    item.className='player-entry'+(current?.id===p.id?' active-turn':'')+(!p.active?' eliminated':'');
    item.style.setProperty('--player-color','#'+COLORS[p.id].toString(16).padStart(6,'0'));
    const head=document.createElement('div');head.className='player-name';
    const colorControl=document.createElement('input');
    colorControl.type='color';
    colorControl.className='player-color-picker';
    colorControl.value='#'+COLORS[p.id].toString(16).padStart(6,'0');
    colorControl.title='Change '+COLOR_NAMES[p.id]+' player color';
    colorControl.setAttribute('aria-label','Change '+COLOR_NAMES[p.id]+' player color');
    colorControl.addEventListener('input', event => {
      COLORS[p.id]=Number.parseInt(event.target.value.slice(1),16);
      // Recolor all owned LEDs/face highlights while preserving their state.
      item.style.setProperty('--player-color',event.target.value);
      redraw(true);
    });
    colorControl.addEventListener('pointerdown', event => event.stopPropagation());
    const name=document.createElement('span');name.textContent=COLOR_NAMES[p.id]+(p.human?' · YOU':' · CP');
    head.append(colorControl,name);item.append(head);
    const detail=document.createElement('small');
    detail.textContent=p.prestart?'Choose this color':!p.active?'Eliminated':p.human?(p.personality==='knight'?'Human · Knight jumps':'Human player'):reveal?personalityLabel(p):'Computer';
    item.append(detail);
    return item;
  }));
}
function announce(main,sub){status.textContent=main;hint.textContent=sub;}
// Layout families are balanced across games (history does not reset on New game).
// Symmetrical diagonal seeds (x === y) yield axis-aligned squares; off-diagonal
// seeds yield rotated shapes. Both are 90-degree rotationally symmetric.
const LAYOUTS = {
  square: {label:'Small square (2×2)', make(){const x=rand(SIZE),y=rand(SIZE);return ids([[x,y],[x+1,y],[x,y+1],[x+1,y+1]]);}},
  mediumSquare: {label:'Medium square (3×3)', make(){const x=rand(SIZE),y=rand(SIZE);return ids([[x,y],[x+2,y],[x,y+2],[x+2,y+2]]);}},
  largeSquare: {label:'Large square (4×4)', make(){const x=rand(SIZE),y=rand(SIZE);return ids([[x,y],[x+3,y],[x,y+3],[x+3,y+3]]);}},
  symmetrical: {label:'Symmetrical (90° rotation)', make(family){
    const candidates=[];
    for(let x=0;x<SIZE/2;x++)for(let y=0;y<SIZE/2;y++){
      if((x===y)===(family==='square'))candidates.push([x,y]);
    }
    const [x,y]=candidates[rand(candidates.length)];
    return ids([[x,y],[SIZE-1-y,x],[SIZE-1-x,SIZE-1-y],[y,SIZE-1-x]]);
  }},
  random: {label:'Random (four distinct)', make(){return shuffle([...Array(36).keys()]).slice(0,4);}}
};
const layoutHistory={family:null,streak:0};
function chooseStartingLayout(){
  const enabledLayouts=enabled('placementOptions');
  const pools={
    square:enabledLayouts.filter(k=>['square','mediumSquare','largeSquare'].includes(k)),
    other:enabledLayouts.includes('random')?['random']:[]
  };
  if(enabledLayouts.includes('symmetrical')){
    pools.square.push('symmetrical');
    pools.other.push('symmetrical');
  }
  const families=Object.keys(pools).filter(f=>pools[f].length);
  let family;
  if(families.length===1)family=families[0];
  else if(!layoutHistory.family)family=families[rand(families.length)];
  else {
    // At streak two, an occasional third is allowed; never four in a row.
    // At streak one, switching remains slightly more likely than repeating.
    const keepChance=layoutHistory.streak>=3?0:layoutHistory.streak===2?0.12:0.42;
    family=Math.random()<keepChance?layoutHistory.family:families.find(f=>f!==layoutHistory.family);
  }
  layoutHistory.streak=family===layoutHistory.family?layoutHistory.streak+1:1;
  layoutHistory.family=family;
  const layout=pools[family][rand(pools[family].length)];
  return {layout,family,starts:shuffle(LAYOUTS[layout].make(family))};
}
function rand(n){return Math.floor(Math.random()*n);}
function shuffle(a){for(let i=a.length-1;i>0;i--){let j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function ids(points){return points.map(([x,y])=>wrap(y)*SIZE+wrap(x));}
function opposite(i){return ids([[i%SIZE+3,Math.floor(i/SIZE)+3]])[0];}
const PERSONALITIES = {
  random:'Wanderer — random',
  toward:'Hunter — toward human',
  away:'Coward — away from human',
  erratic:'Erratic — chase or flee',
  large:'Explorer — largest open region',
  small:'Cat — smallest open region',
  homing:'Homing — spiral around own trail',
  strategic:'Strategist — preserve escape routes',
  foolish:'Fool — prefer risky moves',
  blocker:'Blocker — crowd another player',
  survival:'Survivalist — avoid congestion',
  queen:'Queen — Only goes straight',
  bishop:'Bishop — turn wherever possible',
  knight:'Knight — can only jump'
};
// Display copy is separate from AI/layout logic and identifiers.
const LAYOUT_DISPLAY = {
  square:['Small Square','2×2 adjacent positions'],
  mediumSquare:['Medium Square','3×3 corner positions'],
  largeSquare:['Large Square','4×4 corner positions'],
  symmetrical:['Symmetrical','90° rotational symmetry'],
  random:['Random','Four distinct positions']
};
const PERSONALITY_DISPLAY = {
  random:['Wanderer','Random movement'],
  toward:['Hunter','Toward the human'],
  away:['Coward','Away from the human'],
  erratic:['Erratic','Chases or flees'],
  large:['Explorer','Largest open region'],
  small:['Cat','Smallest open region'],
  homing:['Homing','Spirals around own trail'],
  strategic:['Strategist','Preserves escape routes'],
  foolish:['Fool','Prefers risky moves'],
  blocker:['Blocker','Crowds other players'],
  survival:['Survivalist','Avoids congestion'],
  queen:['Queen','Only goes straight'],
  bishop:['Bishop','Turn wherever possible'],
  knight:['Knight','Can only jump']
};
function setupToggles(containerId,items,all=true){
  const container=document.getElementById(containerId);
  for(const [key,item] of Object.entries(items)){
    const button=document.createElement('button');
    button.type='button';
    button.className='choice-button';
    button.dataset.choice=key;
    button.setAttribute('aria-pressed',String(all));
    const [name, description] = (containerId==='placementOptions'?LAYOUT_DISPLAY:PERSONALITY_DISPLAY)[key];
    const heading=document.createElement('strong');
    heading.className='choice-name';
    heading.textContent=name;
    const detail=document.createElement('span');
    detail.className='choice-description';
    detail.textContent=description;
    button.append(heading,detail);
    button.title=`${name}: ${description}`;
    button.addEventListener('click',()=>{
      const wasSelected=button.getAttribute('aria-pressed')==='true';
      // Layouts require at least one enabled choice. Personality choices can all be off.
      if(containerId==='placementOptions'&&wasSelected&&container.querySelectorAll('[aria-pressed="true"]').length===1)return;
      button.setAttribute('aria-pressed',String(!wasSelected));
    });
    container.appendChild(button);
  }
}
function enabled(id){return [...document.querySelectorAll('#'+id+' .choice-button[aria-pressed="true"]')].map(i=>i.dataset.choice);}
setupToggles('placementOptions',LAYOUTS);
setupToggles('personalityOptions',PERSONALITIES);
for(const [buttonId,selected] of [['selectAllPersonalities',true],['selectNoPersonalities',false]]){
  document.getElementById(buttonId).addEventListener('click',()=>{
    document.querySelectorAll('#personalityOptions .choice-button').forEach(button=>button.setAttribute('aria-pressed',String(selected)));
  });
}
// Toroidal distance: each axis is folded once, so searches never wander
// endlessly across a wrapping boundary.
function distance(a,b){const dx=Math.abs(a%SIZE-b%SIZE),dy=Math.abs(Math.floor(a/SIZE)-Math.floor(b/SIZE));return Math.min(dx,SIZE-dx)+Math.min(dy,SIZE-dy);}
function areaAt(from,board){const seen=new Set([from]),queue=[from];for(let i=0;i<queue.length;i++){for(const n of neighbors(queue[i]))if(!seen.has(n)&&board[n]===null){seen.add(n);queue.push(n);}}return seen.size;}
// Spiral-first Homing behavior. A personal spiral has legs of length
// 1,1,2,2,3,3... with ninety-degree turns. The toroidal board makes all
// coordinates finite, and movement always comes from the legal-neighbor list.
// If the next spiral cell is blocked, seek the nearest *own* trail by direct
// wrapped distance, favoring candidates that run alongside occupied lines.
// This is intentionally a local rule, not a route/path solver.
const SPIRAL_STEPS = [[1,0],[0,1],[-1,0],[0,-1]];
function spiralTile(at,dir){
  const [dx,dy]=SPIRAL_STEPS[dir];
  return ids([[at%SIZE+dx,Math.floor(at/SIZE)+dy]])[0];
}
function initHoming(p){
  if(!p.spiral)p.spiral={direction:rand(4),clockwise:Math.random()<.5,legLength:1,legProgress:0,legsDone:0};
  return p.spiral;
}
function stepSpiral(p,to){
  const sp=initHoming(p);
  const direction=SPIRAL_STEPS.findIndex((_,d)=>spiralTile(p.at,d)===to);
  if(direction<0)return;
  if(direction!==sp.direction){
    // An obstacle forced the movement off the current spiral leg; restart
    // the leg in the newly chosen heading instead of repeating a bad step.
    sp.direction=direction;sp.legProgress=0;sp.legsDone=0;sp.legLength=1;
  }
  sp.legProgress++;
  if(sp.legProgress>=sp.legLength){
    sp.legProgress=0;
    sp.direction=(sp.direction+(sp.clockwise?1:3))%4;
    sp.legsDone++;
    if(sp.legsDone%2===0)sp.legLength++;
  }
}
function homingChoice(p,legal){
  const sp=initHoming(p);
  const preferred=spiralTile(p.at,sp.direction);
  if(legal.includes(preferred))return preferred;
  // If the spiral is blocked, hug existing occupied paths, aiming toward
  // the nearest point of *own* color in direct toroidal distance.
  const own=p.trail.slice(0,-1);
  const score=to=>{
    const dist=own.length?Math.min(...own.map(t=>distance(to,t))):SIZE;
    const adjacent=neighbors(to);
    const hugging=adjacent.filter(t=>match.board[t]!==null).length;
    const ownHug=adjacent.filter(t=>match.board[t]===p.id).length;
    // Prefer turning in the spiral's original direction when otherwise tied.
    const turn=spiralTile(p.at,(sp.direction+(sp.clockwise?1:3))%4)===to?0.2:0;
    return -dist*10+ownHug*2+hugging+turn+Math.random()*.01;
  };
  return legal.slice().sort((a,b)=>score(b)-score(a))[0];
}
// Direction of an ordinary orthogonal move. Knight jumps return -1.
function travelDirection(from,to){
  return SPIRAL_STEPS.findIndex((_,d)=>spiralTile(from,d)===to);
}
function chessStyleChoice(p,legal){
  if(p.personality==='knight')return legal[rand(legal.length)];
  const previous=p.trail.length>=2?travelDirection(p.trail.at(-2),p.at):-1;
  if(previous===-1)return legal[rand(legal.length)];
  const headings=legal.map(to=>({to,heading:travelDirection(p.at,to)}));
  let available;
  if(p.personality==='queen'){
    // Continue in exactly the same heading; turn only when that cell is blocked.
    available=headings.filter(x=>x.heading===previous);
    if(!available.length)available=headings.filter(x=>x.heading!==((previous+2)%4));
  }else{
    // Bishop deliberately zigzags, even after being forced off its previous step.
    available=headings.filter(x=>x.heading!==previous && x.heading!==((previous+2)%4));
  }
  const candidates=available.length?available:headings;
  return candidates[rand(candidates.length)].to;
}
function aiChoice(p,legal){
  const others=match.players.filter(q=>q.active&&q.id!==p.id);
  const human=others.find(q=>q.human);
  const choice=legal.map(to=>{
    const board=match.board.slice();board[to]=p.id;
    const exits=neighbors(to).filter(n=>board[n]===null).length;
    const area=areaAt(to,board);
    const nearOpp=others.length?Math.min(...others.map(q=>distance(to,q.at))):6;
    const humanDist=human?distance(to,human.at):nearOpp;
    const trail=p.trail.slice(0,-1);
    const trailDist=trail.length?Math.min(...trail.map(t=>distance(to,t))):6;
    return {to,exits,area,nearOpp,humanDist,trailDist,noise:Math.random()*.12};
  });
  const behavior=p.personality;
  if(behavior==='random')return legal[rand(legal.length)];
  if(behavior==='homing')return homingChoice(p,legal);
  if(['queen','bishop','knight'].includes(behavior))return chessStyleChoice(p,legal);
  const hunt=behavior==='erratic'?(Math.random()<.5?'toward':'away'):behavior;
  const scores={
    toward:c=>-c.humanDist,
    away:c=>c.humanDist,
    large:c=>c.area,
    // Cat is drawn to tight *local* spaces, not merely a smaller connected
    // region. On a torus most candidate destinations often share a region,
    // causing the previous area-only score to choose almost at random.
    small:c=>-c.exits*20-c.area*.06 + c.nearOpp*.05,
    strategic:c=>c.area*1.2+c.exits*3+c.nearOpp*.5,
    foolish:c=>-c.area-c.exits*3,
    blocker:c=>-c.nearOpp,
    survival:c=>c.area+c.nearOpp*2+c.exits
  };
  const score=scores[hunt]||scores.random||(()=>0);
  choice.sort((a,b)=>(score(b)+b.noise)-(score(a)+a.noise));
  return choice[0].to;
}
function personalityLabel(p){return PERSONALITIES[p.personality]||'Wanderer';}
function newGame(){
  generation++;fastMode=false;document.querySelector('#skip').textContent='Skip animations';
  for(const item of endingTiles)item.item.visible=false;
  for(const tile of tiles)tile.body.visible=true;
  const {layout,family,starts}=chooseStartingLayout();
  match={phase:'choose',layout,layoutFamily:family,starts,chosen:null,board:Array(36).fill(null),players:[],order:[],turn:0,offered:[],trailReveal:null,tick:0};
  document.querySelector('#placementChosen').textContent='This game: '+LAYOUTS[layout].label+' · '+(family==='square'?'Square':'Other');
  startFlashOn=true;redraw();announce('Choose your color and start','Click one of the four colored stumps. Layout: '+LAYOUTS[layout].label+'.');
}
function applySelection(startIndex){
  if(!match||match.phase!=='choose')return;
  const token=generation;
  const behaviors=enabled('personalityOptions');
  // Roll once when the human chooses a starting color. The odds are always 1/14
  // when enabled, independent of which computer personalities are selected.
  const humanIsKnight=humanKnightToggle.checked && rand(14)===0;
  match.players=match.starts.map((at,id)=>({id,at,trail:[at],active:true,human:id===startIndex,personality:id===startIndex?(humanIsKnight?'knight':null):(behaviors.length?behaviors[rand(behaviors.length)]:'random'),spiral:null}));
  for(const p of match.players)match.board[p.at]=p.id;
  const others=match.players.filter(p=>!p.human);
  for(let j=others.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[others[k],others[j]]=[others[j],others[k]];}
  match.order=[match.players[startIndex],...others];match.turn=0;match.phase='selecting';redraw();
  announce('You are '+['GREEN','BLUE','PINK','YELLOW'][startIndex]+(humanIsKnight?' · KNIGHT!':''), humanIsKnight?'You can only jump in L-shapes. Other stumps are setting turn order…':'Other stumps are setting turn order…');
  (async()=>{for(const p of match.order){if(!await sleep(settings.motion+100,token))return;tiles[p.at].targetY=displayOptions.raiseCurrent ? .30 : -.22;}if(token!==generation)return;match.phase='playing';await performTurn(token);})();
}
async function performTurn(token){
  if(token!==generation||!match||match.phase!=='playing')return;
  const surviving=match.players.filter(p=>p.active);
  if(surviving.filter(p=>!p.human).length===0){await finish(true,token);return;}
  const p=match.order[match.turn%match.order.length];
  if(!p.active){advance(token);return;}
  const legal=freeMoves(p);
  match.offered=[];
  redraw();
  if(!legal.length){await eliminate(p,token);return;}
  match.offered=legal;
  redraw();
  if(p.human){announce(p.personality==='knight'?'Your turn · KNIGHT':'Your turn',p.personality==='knight'?'Jump two spaces in one direction and one sideways. Edges wrap around.':'Select one of the white illuminated stumps. Edges wrap around.');return;}
  announce('Computer '+['GREEN','BLUE','PINK','YELLOW'][p.id], document.querySelector('#showPersonalities').checked?personalityLabel(p)+' is choosing a move…':'Computer is choosing a move…');
  const wait=settings.thinkMin+Math.random()*Math.max(0,settings.thinkMax-settings.thinkMin);
  if(!await sleep(wait,token))return;
  const index=aiChoice(p,legal);
  await move(p,index,token);
}
async function move(p,to,token){
  if(token!==generation||!match||match.phase!=='playing'||!match.offered.includes(to))return;
  if(p.personality==='homing')stepSpiral(p,to);
  match.offered=[];p.at=to;p.trail.push(to);match.board[to]=p.id;
  match.trailReveal={playerId:p.id,lit:new Set()};
  redraw();
  // Let the button's position settle before running the light-bar sweep.
  if(!await sleep(settings.motion,token))return;
  const reverseTrail=[...p.trail].reverse();
  if(!flashOptions.enabled){
    match.trailReveal.lit=new Set(reverseTrail);
    redraw();
  }
  for(let j=0;flashOptions.enabled && j<reverseTrail.length;j++){
    if(token!==generation)return;
    match.trailReveal.lit.add(reverseTrail[j]);
    redraw();
    if(!await sleep(trailInterval(j,reverseTrail.length),token))return;
  }
  if(!await sleep(settings.trailFlash,token))return;
  match.trailReveal=null;redraw();
  advance(token);
}
function advance(token){if(token!==generation)return;match.turn=(match.turn+1)%match.order.length;redraw();performTurn(token);}
async function eliminate(p,token){
  if(token!==generation)return;
  match.phase='eliminating';
  announce(p.human?'No legal moves — YOU ARE BAD':'Computer trapped', 'Blocked neighboring spaces flash red before the path clears.');
  const adjacent=p.personality==='knight'?knightNeighbors(p.at):neighbors(p.at);
  for(let pulse=0;pulse<(flashOptions.enabled?2:1);pulse++){
    for(const i of adjacent)setLed(i,RED);
    if(!await sleep(settings.warning/4,token))return;
    if(flashOptions.enabled){redraw();if(!await sleep(settings.warning/4,token))return;}
  }
  if(!flashOptions.enabled){if(!await sleep(settings.warning/2,token))return;redraw();}
  // The blocked player's trail clears in visitation order; spaces free as lights go dark.
  for(let j=0;j<p.trail.length;j++){
    const tileIndex=p.trail[j];
    match.board[tileIndex]=null;setLed(tileIndex,BG);
    tiles[tileIndex].body.material.emissive.setHex(0x000000);
    tiles[tileIndex].body.material.emissiveIntensity=0;
    const interval=trailInterval(j,p.trail.length);
    if(!await sleep(interval,token))return;
  }
  p.active=false;tiles[p.at].targetY=0;
  if(!await sleep(settings.motion,token))return;
  redraw();
  if(p.human){await finish(false,token);return;}
  match.phase='playing';advance(token);
}
async function finish(won,token){
  if(token!==generation)return;
  match.phase='ending';
  announce(won?'YOU ARE WIN':'YOU ARE BAD',won?'Every computer has been eliminated!':'The paths clear before the nine-button message.');
  // Human loss: other paths clear concurrently, each trail has its own timing.
  const remaining=match.players.filter(p=>p.active);
  const clears=remaining.map(async p=>{
    for(let j=0;j<p.trail.length;j++){
      if(token!==generation)return;
      const t=p.trail[j];match.board[t]=null;setLed(t,BG);
      tiles[t].body.material.emissive.setHex(0x000000);
      tiles[t].body.material.emissiveIntensity=0;
      if(!await sleep(trailInterval(j,p.trail.length,0.35),token))return;
    }
    p.active=false;tiles[p.at].targetY=0;
  });
  await Promise.all(clears);
  if(!await sleep(settings.motion,token))return;
  for(const tile of tiles)tile.body.visible=false;
  const word=won?'YOUAREWIN':'YOUAREBAD';
  endingTiles.forEach((b,i)=>{b.letter.material.map=stampTexture(word[i]);b.letter.material.needsUpdate=true;b.item.visible=true;});
  if(!await sleep(settings.ending,token))return;
  if(document.querySelector('#autoplay').checked)newGame();else announce(won?'YOU ARE WIN':'YOU ARE BAD','Press New game to play again.');
}
boardElement.addEventListener('pointerdown',(event)=>{
  if(event.button!==0 || !match)return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const candidates=tiles.flatMap(t=>[t.body,t.led]);
  const intersections=raycaster.intersectObjects(candidates,false);
  if(!intersections.length)return;
  const at=intersections[0].object.userData.tile;
  if(match.phase==='choose'){
    const id=match.starts.indexOf(at);if(id>=0)applySelection(id);
  } else if(match.phase==='playing'){
    const p=match.order[match.turn%match.order.length];
    if(p?.human && match.offered.includes(at))move(p,at,generation);
  }
});
for(const [id,option] of [['highlightCurrent','highlightCurrent'],['raiseCurrent','raiseCurrent'],['lowerPossible','lowerPossible']]){
  const input=document.getElementById(id);
  displayOptions[option]=input.checked;
  input.addEventListener('change',()=>{displayOptions[option]=input.checked;redraw();});
}
document.querySelector('#showPersonalities').addEventListener('change',updatePlayerDock);
document.querySelector('#restart').addEventListener('click',newGame);
document.querySelector('#skip').addEventListener('click',()=>{fastMode=!fastMode;document.querySelector('#skip').textContent=fastMode?'Normal animation':'Skip animations';});
document.querySelector('#showIndices').addEventListener('change',event=>{
  // Coordinates are optional for testing wrap behavior, rendered as a screen-space label strip.
  const prior=document.querySelector('#coords');if(prior)prior.remove();
  if(!event.target.checked)return;
  const legend=document.createElement('div');legend.id='coords';legend.className='hint';legend.textContent='Coordinates: columns 0–5 left to right; rows 0–5 back to front. Wrap: column 5 ↔ 0, row 5 ↔ 0.';
  boardElement.parentElement.append(legend);
});
// Flash only during initial selection, illuminating the entire selected stump.
let previousFlash=0;
function animateStartingLights(now){
  if(flashOptions.enabled && match?.phase==='choose' && now-previousFlash>=settings.startFlash){
    startFlashOn=!startFlashOn;previousFlash=now;redraw(true);
  }
  requestAnimationFrame(animateStartingLights);
}
requestAnimationFrame(animateStartingLights);
newGame();
