import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import { layoutMusicVideoZones } from '../_5-music/music-screen-layout.mjs';
import { growUpperTablet } from '../_5-music/music-tablet-proportions.mjs';

const source = readFileSync(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
const THREE = await import('data:text/javascript;base64,' + readFileSync(new URL('../_3-graphics/shelf/vendor/three.module.js', import.meta.url)).toString('base64'));

function sourceFunction(name){
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let parameterDepth = 0, brace = -1;
  for(let i = source.indexOf('(', start); i < source.length; i++){
    if(source[i] === '(') parameterDepth++;
    if(source[i] === ')' && --parameterDepth === 0){ brace = source.indexOf('{', i + 1); break; }
  }
  assert.ok(brace >= 0);
  let depth = 0;
  for(let i = brace; i < source.length; i++){
    if(source[i] === '{') depth++;
    if(source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(`Unclosed ${name}`);
}

function actualScreenMesh(){
  const bytes = readFileSync(new URL('../assets/glb/toy-piano.glb', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryStart = 20 + jsonLength + 8;
  const screenIndex = gltf.nodes.findIndex(node => /^(?:perpad_screen|pe'rpad_screen)$/i.test(node.name || ''));
  assert.ok(screenIndex >= 0, 'actual pe\'rPad_screen exists');
  const primitive = gltf.meshes[gltf.nodes[screenIndex].mesh].primitives[0];
  const accessor = index => {
    const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
    const dimensions = {SCALAR:1,VEC2:2,VEC3:3}[a.type];
    const size = a.componentType === 5126 ? 4 : 2;
    const dv = new DataView(bytes.buffer, bytes.byteOffset + binaryStart + (view.byteOffset || 0) + (a.byteOffset || 0));
    const values = a.componentType === 5126 ? new Float32Array(a.count * dimensions) : new Uint16Array(a.count * dimensions);
    for(let i = 0; i < values.length; i++) values[i] = a.componentType === 5126 ? dv.getFloat32(i * size, true) : dv.getUint16(i * size, true);
    return {values, dimensions};
  };
  const position = accessor(primitive.attributes.POSITION);
  const uv = accessor(primitive.attributes.TEXCOORD_0);
  const indices = accessor(primitive.indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position.values, position.dimensions));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv.values, uv.dimensions));
  geometry.setIndex(new THREE.BufferAttribute(indices.values, 1));
  const mesh = new THREE.Mesh(geometry);
  const parents = new Map();
  gltf.nodes.forEach((node, index) => (node.children || []).forEach(child => parents.set(child, index)));
  let child = mesh, index = screenIndex;
  while(index !== undefined){
    const node = gltf.nodes[index];
    child.name = node.name;
    if(node.name === "pe'rPad_tablet"){
      const frameBounds = gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
      child.geometry = {boundingBox:new THREE.Box3(new THREE.Vector3().fromArray(frameBounds.min),new THREE.Vector3().fromArray(frameBounds.max))};
    }
    child.position.fromArray(node.translation || [0,0,0]);
    child.quaternion.fromArray(node.rotation || [0,0,0,1]);
    child.scale.fromArray(node.scale || [1,1,1]);
    const parentIndex = parents.get(index);
    if(parentIndex === undefined) break;
    const parent = new THREE.Object3D(); parent.add(child); child = parent; index = parentIndex;
  }
  child.updateMatrixWorld(true);
  return mesh;
}

test('taller actual piano GLB video and controls fit fully across landscape and portrait viewports', () => {
  const mesh = actualScreenMesh();
  growUpperTablet(mesh.parent);
  assert.equal(mesh.geometry.attributes.position.count, 28);
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  const spans = [size.x,size.y,size.z].sort((a,b)=>a-b);
  const canvas = {width:2048,height:Math.max(320,Math.round(2048/(spans[2]/spans[1])))};
  const camera = new THREE.PerspectiveCamera(45,1, .001, 500);
  camera.position.set(0,2,12);
  const state = {
    THREE, layoutMusicVideoZones, musicVideoLayoutProgress:()=>1, topPadMesh:mesh, topPadCanvas:canvas, cam:camera,
    topPadVideo:{videoRect:null,thumbRect:{x:800,y:50,w:400,h:230}},
    topPadUvRemap:{repeatU:1,repeatV:1,offsetU:0,offsetV:0,swap:false,mirrorU:false,mirrorV:false},
    TOPPAD_UV_OVERRIDE:{umin:0.004085332155227661,umax:1,vmin:0.3804967403411865,vmax:0.6195032596588135},
    TOPPAD_FORCE_SWAP:false,TOPPAD_FORCE_MIRROR_V:true,topPadSurfaceAspect:spans[2]/spans[1],
    topPadUvDebugLogged:true,TOPPAD_GRID_COLS:12,TOPPAD_GRID_ROWS:12,
    setTabletStandVideoFocusAngle:()=>{}, console
  };
  const texture = {repeat:{set(){}},offset:{set(){}}};
  const functions = ['remapTextureToUvBounds','topPadWorldPointAtCanvasPixel','getTopPadPlayerRect','computeTopPadZoomTarget'].map(sourceFunction).join('\n');
  // The remap routine's final values are reused for the inverse projection.
  const remapContext = {...state,texture};
  runInNewContext(`${functions}\nremapTextureToUvBounds(topPadMesh, texture)`, remapContext);
  const player = runInNewContext(`${functions}\ngetTopPadPlayerRect(topPadCanvas.width,topPadCanvas.height)`, remapContext);
  assert.ok(player.w > state.topPadVideo.thumbRect.w * 1.5, 'final player is wider than idle thumbnail');
  const points = [[player.x,player.y],[player.x+player.w,player.y],[player.x,player.y+player.h],[player.x+player.w,player.y+player.h],
    [player.x,0],[player.x+player.w,0],[player.x,canvas.height],[player.x+player.w,canvas.height]];
  const bounds = [];
  for(const aspect of [16/9, 1, 9/16, 0.45, 2.4]){
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const target = runInNewContext(`${functions}\ncomputeTopPadZoomTarget()`, remapContext);
    assert.ok(target, `target exists at aspect ${aspect}`);
    camera.position.copy(target.position); camera.up.copy(target.up); camera.lookAt(target.target); camera.updateMatrixWorld(true);
    let maxNdc = 0;
    for(const [x,y] of points){
      const world = runInNewContext(`${functions}\ntopPadWorldPointAtCanvasPixel(${x},${y})`, remapContext);
      assert.ok(world, `actual GLB maps video corner ${x},${y}`);
      const ndc = world.clone().project(camera);
      maxNdc = Math.max(maxNdc,Math.abs(ndc.x),Math.abs(ndc.y));
      assert.ok(Math.abs(ndc.x) < .9 && Math.abs(ndc.y) < .9, `full video and chrome fit at aspect ${aspect}: ${ndc.x},${ndc.y}`);
    }
    bounds.push(`${aspect.toFixed(2)}:${maxNdc.toFixed(3)}`);
  }
  // An unavailable UV/canvas mapping must still keep the entire physical
  // screen visible in a narrow viewport, including any controls on its edge.
  camera.aspect = 0.45; camera.updateProjectionMatrix();
  const fallbackContext = {...remapContext,topPadCanvas:null};
  const fallback = runInNewContext(`${functions}\ncomputeTopPadZoomTarget()`, fallbackContext);
  camera.position.copy(fallback.position); camera.up.copy(fallback.up);
  camera.lookAt(fallback.target); camera.updateMatrixWorld(true);
  const position = mesh.geometry.attributes.position;
  let fallbackMaxNdc = 0;
  for(let i = 0; i < position.count; i++){
    const ndc = new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld).project(camera);
    fallbackMaxNdc = Math.max(fallbackMaxNdc,Math.abs(ndc.x),Math.abs(ndc.y));
  }
  assert.ok(fallbackMaxNdc < .92, `physical screen fallback fits portrait: ${fallbackMaxNdc}`);
  console.log(`Actual GLB screen ${size.x.toFixed(2)}×${size.y.toFixed(2)} world units, canvas ${canvas.width}×${canvas.height}, player ${player.w.toFixed(1)}×${player.h.toFixed(1)}, max |NDC| ${bounds.join(' ')}`);
});

test('Escape cancels entry or leaves a playing focus while unrelated keys do nothing', () => {
  const calls = [];
  const context = {
    topPadVideo:{mode:'zooming',focused:true,zoom:{},cameraRestore:{}},trackVideo:{active:false},
    document:{querySelector:()=>null},
    returnFromSunilFocus:()=>calls.push(['return']),
    stopTopPadVideoPlayback: options => calls.push(['stop',options.immediateRestore]),
    leaveTopPadVideoFocus: options => calls.push(['leave',options.immediate])
  };
  const handler = sourceFunction('handleTopPadVideoKeys');
  const key = value => {
    let prevented = false, stopped = false;
    runInNewContext(`${handler}\nhandleTopPadVideoKeys(ev)`, {...context,ev:{key:value,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}}});
    return {prevented,stopped};
  };
  assert.deepEqual(key('Escape'),{prevented:true,stopped:true});
  assert.deepEqual(calls.pop(),['return']);
  context.topPadVideo.mode='playing';
  assert.deepEqual(key('Escape'),{prevented:true,stopped:true});
  assert.deepEqual(calls.pop(),['return']);
  context.topPadVideo.focused=false; context.topPadVideo.zoom=null;
  assert.deepEqual(key('x'),{prevented:false,stopped:false});
  assert.equal(calls.length,0);
});

test('immediate focus exit clears queued zoom and restores the exact prior camera and control flags', () => {
  const original = {pos:new THREE.Vector3(1,2,3),target:new THREE.Vector3(0,1,0),up:new THREE.Vector3(0,1,0),
    enabled:true,enableRotate:false,enableZoom:true,enablePan:false,enableDamping:true};
  const cam = {position:new THREE.Vector3(5,6,7),up:new THREE.Vector3(1,0,0)};
  const controls = {target:new THREE.Vector3(4,5,6),enabled:false,enableRotate:true,enableZoom:false,enablePan:true,
    enableDamping:false,minDistance:.001,maxDistance:Infinity,update(){}};
  const video = {mode:'playing',focused:true,zoom:{onComplete(){throw Error('stale entry completed');}},cameraRestore:original,
    orbitLimitsRestore:{minDistance:.5,maxDistance:20}};
  const context = {cam,controls,topPadVideo:video,document:{activeElement:null},sunilBackButton:{},updateMusicVideoPresentation(){},renderTopPadGrid(){}};
  const functions = ['restoreTopPadVideoZoomLimits','restoreTopPadFocusControls','leaveTopPadVideoFocus'].map(sourceFunction).join('\n');
  assert.equal(runInNewContext(`${functions}\nleaveTopPadVideoFocus({immediate:true})`,context),true);
  assert.equal(video.focused,false);
  assert.equal(video.zoom,null);
  assert.ok(cam.position.distanceTo(original.pos)<1e-9);
  assert.ok(controls.target.distanceTo(original.target)<1e-9);
  assert.ok(cam.up.distanceTo(original.up)<1e-9);
  for(const name of ['enabled','enableRotate','enableZoom','enablePan','enableDamping']) assert.equal(controls[name],original[name]);
  assert.equal(controls.minDistance,.5);
  assert.equal(controls.maxDistance,20);
  assert.match(sourceFunction('animate'), /if\(!topPadVideo\.focused && !topPadVideo\.zoom\)/);
});
