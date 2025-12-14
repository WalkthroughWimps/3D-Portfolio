import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.153.0/examples/jsm/loaders/GLTFLoader.js';

(() => {
	console.log('[stupid] init (module)');
	try {
	const container = document.getElementById('viewer');
		if (!container) {
			console.error('[stupid] #viewer element not found');
			return;
		}

	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio || 1);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	container.appendChild(renderer.domElement);

// Debug panel helpers (inserted early so other code can use them)
const debugState = {};
function createDebugPanel() {
	const panel = document.createElement('div');
	panel.id = 'debugPanel';
	Object.assign(panel.style, {
		position: 'fixed',
		right: '12px',
		bottom: '12px',
		minWidth: '260px',
		maxWidth: '420px',
		maxHeight: '60vh',
		overflow: 'auto',
		background: 'rgba(18,18,18,0.92)',
		color: '#cfcfcf',
		fontFamily: 'Menlo,monospace,monospace',
		fontSize: '12px',
		lineHeight: '1.3',
		padding: '8px',
		borderRadius: '6px',
		zIndex: 99999,
		boxShadow: '0 6px 18px rgba(0,0,0,0.6)'
	});
	panel.innerHTML = '<strong style="display:block;margin-bottom:6px;color:#fff">Debug</strong>';
	document.body.appendChild(panel);
	return panel;
}
const _debugPanelEl = createDebugPanel();
function renderDebugPanel() {
	const keys = Object.keys(debugState);
	if (!keys.length) {
		_debugPanelEl.innerHTML = '<strong style="display:block;margin-bottom:6px;color:#fff">Debug</strong><div style="opacity:.7">ready</div>';
		return;
	}
	const rows = ['<strong style="display:block;margin-bottom:6px;color:#fff">Debug</strong>'];
	for (const k of keys) {
		const v = debugState[k];
		const val = (typeof v === 'object') ? (JSON.stringify(v, null, 0)) : String(v);
		rows.push(`<div style="margin-bottom:6px"><strong style="color:#9be7ff">${k}</strong>: <span style="color:#e7e7e7">${val}</span></div>`);
	}
	_debugPanelEl.innerHTML = rows.join('');
}
function setDebugField(key, value) {
	debugState[key] = value;
	renderDebugPanel();
}
function debugLog(...args) {
	try { console.log('[stupid]', ...args); } catch (e) {}
	try { setDebugField('lastLog', args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')); } catch (e) {}
}

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x111111);

	// Default camera (will be replaced if GLB has a camera)
	let camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
	camera.position.set(0, 1.5, 3);
	scene.add(camera);

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.screenSpacePanning = false;
	controls.minDistance = 0.1;
	controls.maxDistance = 50;

	// Simple lighting
	const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
	hemi.position.set(0, 1, 0);
	scene.add(hemi);
	const dir = new THREE.DirectionalLight(0xffffff, 0.6);
	dir.position.set(5, 10, 7.5);
	scene.add(dir);

	// helpers and state
	let loadedModel = null;
	let screenMeshRef = null;
	let overlayMeshRef = null;
	let currentVideo = null;
	let currentVideoTexture = null;
	let currentVideoCanvas = null;
	let currentVideoCanvasCtx = null;
	let currentVideoCanvasTexture = null;
	let videoCanvasRAF = null;

	const axesHelper = new THREE.AxesHelper(0.5);
	axesHelper.visible = false;
	scene.add(axesHelper);
	const boxHelper = new THREE.BoxHelper();
	boxHelper.visible = false;
	scene.add(boxHelper);

	// Save initial camera state early so callback can update it safely
	const initialState = {
		position: camera.position.clone(),
		quaternion: camera.quaternion.clone(),
		target: controls.target.clone(),
	};

	const loader = new GLTFLoader();

// Helper: determine a sensible canvas size based on the screen mesh's original texture
function getScreenTextureSize(mesh) {
	// Try to read the existing material map image size if present
	try {
		const mat = mesh.material;
		let map = null;
		if (Array.isArray(mat)) {
			for (let m of mat) { if (m && m.map) { map = m.map; break; } }
		} else if (mat && mat.map) map = mat.map;
		if (map && map.image) {
			const img = map.image;
			const w = img.width || img.naturalWidth || img.videoWidth;
			const h = img.height || img.naturalHeight || img.videoHeight;
			if (w && h) return { w: Math.floor(w), h: Math.floor(h) };
		}
	} catch (e) {
		// ignore
	}
	// fallback to a reasonably large 4:3 canvas
	return { w: 2048, h: 1536 };
}

	debugLog('starting GLTF load');
	setDebugField('gltfStatus', 'loading');
	loader.load((window && window.mediaUrl) ? window.mediaUrl('video_tablet.glb') : 'video_tablet.glb', (gltf) => {
		console.log('[stupid] gltf loaded', gltf);
		const model = gltf.scene || gltf.scenes && gltf.scenes[0];
		loadedModel = model;
		scene.add(model);

		// compute model center and size
		const box = new THREE.Box3().setFromObject(model);
		const center = box.getCenter(new THREE.Vector3());
		const size = box.getSize(new THREE.Vector3());

		// Recenter model to origin (so controls orbit nicely)
		model.position.sub(center);
		// update helpers to match the model
		axesHelper.position.copy(model.position);
		boxHelper.setFromObject(model);
		boxHelper.update();

		// Use GLB camera if present
		if (gltf.cameras && gltf.cameras.length > 0) {
			console.log('[stupid] gltf contains cameras:', gltf.cameras.length);
			const gltfCam = gltf.cameras[0];
			const camNode = gltf.scene.getObjectByProperty('camera', gltfCam);
			if (camNode) {
				camNode.updateWorldMatrix(true, false);
				const worldPos = new THREE.Vector3();
				const worldQuat = new THREE.Quaternion();
				camNode.getWorldPosition(worldPos);
				camNode.getWorldQuaternion(worldQuat);
				gltfCam.position.copy(worldPos);
				gltfCam.quaternion.copy(worldQuat);
				gltfCam.updateMatrixWorld(true);
			}
			if (gltfCam.isPerspectiveCamera) {
				gltfCam.aspect = window.innerWidth / window.innerHeight;
				gltfCam.updateProjectionMatrix();
			}
			camera = gltfCam;
			scene.add(camera);
			controls.object = camera;
			controls.target.set(0, 0, 0);
			controls.update();
		} else {
			console.log('[stupid] no camera in gltf; auto-framing');
			const maxDim = Math.max(size.x, size.y, size.z);
			const fov = camera.fov * (Math.PI / 180);
			let cameraZ = Math.abs(maxDim / 2 * 1.5 / Math.tan(fov / 2));
			if (!isFinite(cameraZ)) cameraZ = 3;
			camera.position.set(center.x, center.y, cameraZ + center.z + 0.5);
			camera.lookAt(center);
			controls.target.copy(center);
			controls.update();
		}

		// Apply framing on initial load so the model starts at a good size
		try {
			fitCameraToObject(camera, model, controls, 1.25);
			// update helpers after framing
			boxHelper.setFromObject(model);
			boxHelper.update();
			// Save this as the initial state so Reset View returns to the framed view
			initialState.position.copy(camera.position);
			initialState.quaternion.copy(camera.quaternion);
			initialState.target.copy(controls.target);

			// Attempt to place overlay on the visible screen mesh at center
			try {
				// Use raycast from camera center to pick the visible screen mesh
				const rc = new THREE.Raycaster();
				rc.setFromCamera(new THREE.Vector2(0, 0), camera);
				const ints = rc.intersectObject(model, true);
				let screenMesh = null;
				if (ints && ints.length) {
					screenMesh = ints[0].object;
					console.log('[stupid] raycast chose mesh', screenMesh.name || screenMesh.id);
					// remember this mesh as the screen target even if overlay creation later fails
					screenMeshRef = screenMesh;
					try { setDebugField('screenMesh', screenMesh.name || screenMesh.id); } catch (e) {}
				}
				// If raycast failed, try fallback UV search
				if (!screenMesh) {
					// traverse meshes to find one with UVs near center UV (0.5,0.5)
					const targetUV = new THREE.Vector2(0.5, 0.5);
					model.traverse((node) => {
						if (screenMesh) return;
						if (!node.isMesh) return;
						const geom = node.geometry;
						if (!geom || !geom.attributes || !geom.attributes.uv) return;
						// pick this mesh as candidate
						screenMesh = node;
					});
				}
				if (screenMesh && screenMesh.isMesh) {
					// --- replace the previous canvas/apply-material block with this ---
// Create a canvas texture with a blue background + smiley and
// apply it as a remapped overlay child of the screen mesh
				const texSize = getScreenTextureSize(screenMesh);
				const canvas = document.createElement('canvas');
				canvas.width = texSize.w;
				canvas.height = texSize.h;
const ctx = canvas.getContext('2d');
// blue background
ctx.fillStyle = '#0b6cff';
ctx.fillRect(0, 0, canvasSize, canvasSize);
// draw a smiley face centered in the texture
const cx = canvasSize / 2;
const cy = canvasSize / 2;
const dia = canvasSize * 0.25; // diameter in pixels (25% of texture)
const r = Math.max(2, dia / 2);
// face (yellow circle)
ctx.beginPath();
ctx.arc(cx, cy, r, 0, Math.PI * 2);
ctx.fillStyle = '#ffeb3b';
ctx.fill();
// eyes
const eyeOffsetX = r * 0.45;
const eyeOffsetY = r * 0.25;
const eyeR = Math.max(1, r * 0.12);
ctx.fillStyle = '#111';
ctx.beginPath();
ctx.arc(cx - eyeOffsetX, cy - eyeOffsetY, eyeR, 0, Math.PI * 2);
ctx.arc(cx + eyeOffsetX, cy - eyeOffsetY, eyeR, 0, Math.PI * 2);
ctx.fill();
// mouth (smile)
ctx.beginPath();
ctx.lineWidth = Math.max(2, r * 0.12);
ctx.strokeStyle = '#111';
ctx.lineCap = 'round';
ctx.arc(cx, cy + r * 0.12, r * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
ctx.stroke();

const tex = new THREE.CanvasTexture(canvas);
tex.colorSpace = THREE.SRGBColorSpace;
tex.flipY = false; // important: prevents the texture from appearing upside-down
tex.needsUpdate = true;

// Create an overlay mesh by cloning the screen geometry and normalizing its UVs to 0..1
let overlayMesh = null;
try {
  const baseGeom = screenMesh.geometry.clone();

	// NOTE: do NOT normalize or remap UVs here — use the mesh's original UVs
	// so the canvas texture maps exactly as authored in the GLB.
	setDebugField('uvNormalization', 'disabled');

  // Material for the overlay: unlit, transparent, draw on top
  const overlayMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  overlayMesh = new THREE.Mesh(baseGeom, overlayMat);
  overlayMesh.name = 'screenOverlay';
  overlayMesh.renderOrder = 999; // draw last
  // Slightly offset the overlay along the normal to avoid z-fighting
  // We'll compute a tiny offset by moving the overlay along the screen mesh normal in world space.
  // Parent the overlay to the screen mesh so transforms follow automatically.
  screenMesh.add(overlayMesh);
  // position the overlay exactly at (0,0,0) in screenMesh local space
  overlayMesh.position.set(0, 0, 0);
  overlayMesh.rotation.set(0, 0, 0);
  overlayMesh.scale.set(1, 1, 1);

  // Nudging the overlay slightly outward along the mesh normal:
  // compute average normal at mesh center and apply a small local translation
  try {
    screenMesh.geometry.computeBoundingSphere();
    const bs = screenMesh.geometry.boundingSphere || { center: new THREE.Vector3() };
    // world normal: approximate by transforming the mesh's local +Z to world and using it
    const localNormal = new THREE.Vector3(0, 0, 1);
    const worldNormal = localNormal.clone().transformDirection(screenMesh.matrixWorld);
    // convert small offset into local space of screenMesh
    const offsetWorld = worldNormal.clone().multiplyScalar(0.001 * bs.radius);
    const offsetLocal = screenMesh.worldToLocal(screenMesh.localToWorld(offsetWorld.clone()));
    overlayMesh.position.add(offsetLocal);
  } catch (e) {
    // ignore if normal calc fails
  }

  // store refs
  overlayMeshRef = overlayMesh;
  screenMeshRef = screenMesh;
  console.log('[stupid] added remapped screen overlay mesh to', screenMesh.name || screenMesh.id);
} catch (err) {
  console.warn('[stupid] failed to create remapped overlay, applying texture directly as fallback', err);
  // fallback: apply texture directly to the material (as the previous behavior)
  try {
    const mat = screenMesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        if (m && 'map' in m) {
          m.map = tex;
          m.map.colorSpace = THREE.SRGBColorSpace;
          m.needsUpdate = true;
        }
      });
    } else if (mat && typeof mat === 'object') {
      if ('map' in mat) {
        mat.map = tex;
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.needsUpdate = true;
      } else {
        screenMesh.material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      }
    }
    screenMeshRef = screenMesh;
    overlayMeshRef = null;
    console.log('[stupid] applied canvas-smiley to screen mesh (fallback)', screenMesh.name || screenMesh.id);
  } catch (err2) {
    console.error('[stupid] fallback apply failed', err2);
  }
}
				} else {
					console.warn('[stupid] cannot create overlay: screen mesh not found');
				}
			} catch (err) {
				console.warn('[stupid] failed to create screen overlay', err);
			}
		} catch (err) {
			console.warn('[stupid] framing on load failed', err);
		}
	}, undefined, (err) => {
		console.error('[stupid] Error loading GLB:', err);
		});




	// Fit camera to object helper
	function fitCameraToObject(camera, object, controls, offset = 1.25) {
		const box = new THREE.Box3().setFromObject(object);
		const sphere = box.getBoundingSphere(new THREE.Sphere());
		const center = sphere.center;
		const radius = sphere.radius;

		if (radius === 0) return;

		if (camera.isPerspectiveCamera) {
			const fov = camera.fov * (Math.PI / 180);
			const cameraDistance = Math.abs(radius / Math.sin(fov / 2)) * offset;
			const dir = new THREE.Vector3();
			camera.getWorldDirection(dir);
			// position the camera so it looks at the center
			const newPos = center.clone().sub(dir.multiplyScalar(cameraDistance));
			camera.position.copy(newPos);
			camera.updateMatrixWorld(true);
			controls.target.copy(center);
			controls.update();
		} else if (camera.isOrthographicCamera) {
			// simple orthographic framing
			camera.zoom = Math.min(
				camera.right / (box.getSize(new THREE.Vector3()).x || 1),
				camera.top / (box.getSize(new THREE.Vector3()).y || 1)
			) * offset;
			camera.updateProjectionMatrix();
			camera.position.copy(center.clone().add(new THREE.Vector3(0, 0, 1)));
			controls.target.copy(center);
			controls.update();
		}
	}

// Play a video (URL) on the detected screen mesh. Replaces the mesh material
// with a simple video-texture material and frames the camera to the screen.
function playVideoOnScreen(url) {
	if (!screenMeshRef) return console.warn('[stupid] no screen mesh to play video on');
	// stop any existing video
	stopVideoOnScreen();
	currentVideo = document.createElement('video');
	currentVideo.src = url;
	currentVideo.crossOrigin = 'anonymous';
	currentVideo.muted = false;
	currentVideo.loop = true;
	currentVideo.playsInline = true;
	currentVideo.preload = 'auto';
	currentVideo.autoplay = true;
	currentVideo.style.display = 'none';
	document.body.appendChild(currentVideo);
	const playPromise = currentVideo.play();
	if (playPromise && playPromise.catch) playPromise.catch(() => { /* autoplay blocked */ });

	// We'll render the video into a canvas so we can enforce a centered 16:9 area
	// and keep a blue background around it.
	const texSize = getScreenTextureSize(screenMeshRef || screenMesh);
	currentVideoCanvas = document.createElement('canvas');
	currentVideoCanvas.width = texSize.w;
	currentVideoCanvas.height = texSize.h;
	currentVideoCanvasCtx = currentVideoCanvas.getContext('2d');
	// create a CanvasTexture we'll update every frame
	currentVideoCanvasTexture = new THREE.CanvasTexture(currentVideoCanvas);
	currentVideoCanvasTexture.colorSpace = THREE.SRGBColorSpace;
	currentVideoCanvasTexture.flipY = false;
	currentVideoCanvasTexture.minFilter = THREE.LinearFilter;
	currentVideoCanvasTexture.magFilter = THREE.LinearFilter;
	currentVideoCanvasTexture.needsUpdate = true;

	// If we have an overlay mesh, swap its map to the canvas texture so it draws on top
	if (overlayMeshRef) {
		// save original overlay map so we can restore it later
		if (!overlayMeshRef.userData._origOverlayMap) overlayMeshRef.userData._origOverlayMap = overlayMeshRef.material.map;
		overlayMeshRef.material.map = currentVideoCanvasTexture;
		overlayMeshRef.material.needsUpdate = true;
		overlayMeshRef.visible = true;
	} else {
		// fallback: apply canvas texture to the screen material (save orig)
		if (!screenMeshRef.userData._origMaterial) screenMeshRef.userData._origMaterial = screenMeshRef.material;
		const vidMat = new THREE.MeshBasicMaterial({ map: currentVideoCanvasTexture, toneMapped: false, side: THREE.DoubleSide });
		screenMeshRef.material = vidMat;
	}

	// frame camera to the screen
	fitCameraToObject(camera, screenMeshRef, controls, 1.05);

	// optionally disable controls pan while playing
	controls.enablePan = false;

	// start an update loop to draw the video into the canvas and keep 16:9 centered vertically
	function drawVideoToCanvas() {
		if (!currentVideoCanvasCtx) return;
		const ctx = currentVideoCanvasCtx;
		const w = currentVideoCanvas.width;
		const h = currentVideoCanvas.height;
		// blue background
		ctx.fillStyle = '#0b6cff';
		ctx.fillRect(0, 0, w, h);
		// compute 16:9 box that fills width and is centered vertically
		const vidW = w;
		const vidH = Math.round(w * 9 / 16);
		const vy = Math.round((h - vidH) / 2);
		try {
			if (currentVideo && currentVideo.readyState >= 2) {
				// draw and scale the video to the computed 16:9 box
				ctx.drawImage(currentVideo, 0, vy, vidW, vidH);
			}
		} catch (e) {
			// ignore draw errors until video is ready
		}
		if (currentVideoCanvasTexture) currentVideoCanvasTexture.needsUpdate = true;
		videoCanvasRAF = requestAnimationFrame(drawVideoToCanvas);
	}

	videoCanvasRAF = requestAnimationFrame(drawVideoToCanvas);

	debugLog('playVideoOnScreen', url);
	setDebugField('video', 'playing');
	setDebugField('videoUrl', url);
	console.log('[stupid] playing video on screen', url);
}

function stopVideoOnScreen() {
	// stop canvas RAF
	if (videoCanvasRAF) {
		cancelAnimationFrame(videoCanvasRAF);
		videoCanvasRAF = null;
	}
	// dispose canvas texture
	if (currentVideoCanvasTexture) {
		currentVideoCanvasTexture.dispose();
		currentVideoCanvasTexture = null;
	}
	// restore overlay material map if we swapped it
	if (overlayMeshRef && overlayMeshRef.userData && overlayMeshRef.userData._origOverlayMap) {
		overlayMeshRef.material.map = overlayMeshRef.userData._origOverlayMap;
		overlayMeshRef.material.needsUpdate = true;
		delete overlayMeshRef.userData._origOverlayMap;
	}
	// restore screen material if we replaced it
	if (screenMeshRef && screenMeshRef.userData && screenMeshRef.userData._origMaterial) {
		screenMeshRef.material = screenMeshRef.userData._origMaterial;
		delete screenMeshRef.userData._origMaterial;
	}
	// remove video element
	if (currentVideo) {
		try { currentVideo.pause(); } catch (e) {}
		try { currentVideo.remove(); } catch (e) {}
		if (currentVideo.parentNode) currentVideo.parentNode.removeChild(currentVideo);
		currentVideo = null;
	}
	// clear canvas refs
	currentVideoCanvas = null;
	currentVideoCanvasCtx = null;

	controls.enablePan = true;
	debugLog('stopVideoOnScreen');
	setDebugField('video', 'stopped');
	console.log('[stupid] stopped video on screen');
}



// pointer handler: raycast and trigger video when clicking the screen area
function onPointerDown(evt) {
	const rect = renderer.domElement.getBoundingClientRect();
	const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
	const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
	const rc = new THREE.Raycaster();
	rc.setFromCamera(new THREE.Vector2(x, y), camera);
	const hits = rc.intersectObject(loadedModel, true);
	if (hits && hits.length) {
		const obj = hits[0].object;
		debugLog('pointer hit', { name: obj.name || obj.id, id: obj.id });
		setDebugField('lastHit', obj.name || obj.id);
		setDebugField('screenMesh', screenMeshRef ? (screenMeshRef.name || screenMeshRef.id) : 'n/a');
		setDebugField('overlayMesh', overlayMeshRef ? (overlayMeshRef.name || overlayMeshRef.id) : 'n/a');
		// robust ancestor check: walk up from hit object to see if we are inside the screen mesh or overlay
		let matched = false;
		let node = obj;
		while (node) {
			if (node === screenMeshRef) { matched = true; break; }
			if (node === overlayMeshRef) { matched = true; break; }
			if (node.name === 'screenOverlay') { matched = true; break; }
			node = node.parent;
		}
		if (matched) {
			const sampleUrl = encodeURI('A-List-Videos-hq.webm');
			if (!currentVideo) playVideoOnScreen(sampleUrl);
			else stopVideoOnScreen();
		} else {
			debugLog('pointer did not match screenMeshRef or overlay');
		}
	}
	setDebugField('pointer', { x: evt.clientX, y: evt.clientY });
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);

	// UI button handlers
	const frameBtn = document.getElementById('frame-btn');
	const toggleHelpersBtn = document.getElementById('toggle-helpers-btn');
	const resetBtn = document.getElementById('reset-btn');

	if (!frameBtn || !toggleHelpersBtn || !resetBtn) {
		console.warn('[stupid] one or more UI buttons not found', { frameBtn, toggleHelpersBtn, resetBtn });
	} else {
		frameBtn.addEventListener('click', () => {
			console.log('[stupid] frame button clicked');
			if (!loadedModel) return console.warn('[stupid] frame: model not loaded');
			fitCameraToObject(camera, loadedModel, controls, 1.25);
			// update helpers after framing
			boxHelper.setFromObject(loadedModel);
			boxHelper.update();
		});

		toggleHelpersBtn.addEventListener('click', () => {
			console.log('[stupid] toggle helpers');
			axesHelper.visible = !axesHelper.visible;
			boxHelper.visible = !boxHelper.visible;
		});

		resetBtn.addEventListener('click', () => {
			console.log('[stupid] reset view');
			camera.position.copy(initialState.position);
			camera.quaternion.copy(initialState.quaternion);
			controls.target.copy(initialState.target);
			if (camera.isPerspectiveCamera) camera.updateProjectionMatrix();
			controls.update();
		});
	}

		// resize handler and animation loop (placed inside try so they only run
		// when initialization succeeded)
		function onWindowResize() {
			if (camera && camera.isPerspectiveCamera) {
				camera.aspect = window.innerWidth / window.innerHeight;
				camera.updateProjectionMatrix();
			}
			if (renderer) renderer.setSize(window.innerWidth, window.innerHeight);
		}
		window.addEventListener('resize', onWindowResize);

		function animate() {
			try {
				requestAnimationFrame(animate);
				if (controls) controls.update();

				if (renderer && scene && camera) renderer.render(scene, camera);
			} catch (err) {
				console.error('[stupid] animate error, stopping loop', err);
			}
		}
		animate();

		// sample status fields (safe guards) placed inside the try so they can
		// reference `screenMeshRef` which is declared in this scope
		try {
			setDebugField('overlayMode', 'canvas-on-mesh');
			setDebugField('overlayMeshName', screenMeshRef ? (screenMeshRef.name || screenMeshRef.id) : 'n/a');
		} catch (e) {
			// ignore: debug panel may not be available
		}

	} catch (e) {
		console.error('[stupid] runtime error', e);
	}

})();
