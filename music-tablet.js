// Music page tablet: single video thumbnail + player.
// This is intentionally self-contained and ONLY touches the
// tablet screen mesh. It does NOT know about or modify the
// main page play button (`playPerformance`) or any music
// playback functions.

import * as THREE from 'three';

// Path to the HQ video and its thumbnail. Resolve via mediaUrl when MEDIA_BASE set.
const TABLET_VIDEO_SRC = (window && window.mediaUrl) ? window.mediaUrl('Videos/videos-page/music-videos-hq.webm') : 'Videos/videos-page/music-videos-hq.webm';
const TABLET_THUMB_SRC = (window && window.mediaUrl) ? window.mediaUrl('Videos/videos-page/music-videos.jpg') : 'Videos/videos-page/music-videos.jpg';

// Public entry point used by `music-piano.js` / `music-piano-debug.js`.
// It is safe if the tablet mesh is not found; it will just return null.
export function setupMusicTabletScreen(rootObject3D) {
  if (!rootObject3D) return null;

  let screenMesh = null;

  // First, try to find the exact tablet screen mesh by name.
  rootObject3D.traverse(obj => {
    if (screenMesh || !obj.isMesh) return;
    const name = obj.name || '';
    if (name === "pe'rPad_screen") {
      screenMesh = obj;
    }
  });

  // Fallback: loose match if that specific mesh is ever renamed.
  if (!screenMesh) {
    rootObject3D.traverse(obj => {
      if (screenMesh || !obj.isMesh) return;
      if (/screen|tablet/i.test(obj.name || '')) {
        screenMesh = obj;
      }
    });
  }

  if (!screenMesh || !screenMesh.material) return null;

  const screenAspect = (() => {
    try {
      const box = new THREE.Box3().setFromObject(screenMesh);
      const size = box.getSize(new THREE.Vector3());
      const dims = [size.x, size.y, size.z].filter(v => isFinite(v) && v > 1e-6).sort((a, b) => b - a);
      if (dims.length >= 2) return Math.max(0.01, dims[0] / dims[1]);
    } catch (e) { /* ignore */ }
    return 16 / 10;
  })();
  const MAX_DIM = 2048;
  const CW = screenAspect >= 1 ? MAX_DIM : Math.round(MAX_DIM * screenAspect);
  const CH = screenAspect >= 1 ? Math.round(MAX_DIM / screenAspect) : MAX_DIM;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.flipY = false;

  const material = Array.isArray(screenMesh.material)
    ? screenMesh.material[0]
    : screenMesh.material;
  material.map = texture;
  material.emissive = new THREE.Color(0xffffff);
  material.emissiveIntensity = 1.0;
  material.emissiveMap = texture;
  material.needsUpdate = true;

  // If the tablet only uses a subset of UVs, remap so our
  // full 0..1 canvas fills that region, and correct orientation.
  const uvRemap = { repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0, rotation: 0 };
  try {
    const geo = screenMesh.geometry;
    if (geo && geo.attributes && geo.attributes.uv && geo.attributes.position) {
      const uv = geo.attributes.uv;
      const pos = geo.attributes.position;
      let umin = 1, vmin = 1, umax = 0, vmax = 0;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        if (u < umin) umin = u;
        if (u > umax) umax = u;
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
      const ur = Math.max(1e-4, umax - umin);
      const vr = Math.max(1e-4, vmax - vmin);
      const repU = 1 / ur;
      const repV = 1 / vr;
      const offU = -umin / ur;
      const offV = -vmin / vr;
      uvRemap.repeatU = repU;
      uvRemap.repeatV = repV;
      uvRemap.offsetU = offU;
      uvRemap.offsetV = offV;

      // Detect UV orientation vs mesh axes to correct sideways screens.
      let minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (let i = 1; i < pos.count; i++) {
        if (pos.getX(i) < pos.getX(minX)) minX = i;
        if (pos.getX(i) > pos.getX(maxX)) maxX = i;
        if (pos.getY(i) < pos.getY(minY)) minY = i;
        if (pos.getY(i) > pos.getY(maxY)) maxY = i;
      }
      const duX = uv.getX(maxX) - uv.getX(minX);
      const dvX = uv.getY(maxX) - uv.getY(minX);
      const duY = uv.getX(maxY) - uv.getX(minY);
      const dvY = uv.getY(maxY) - uv.getY(minY);
      const swapUV = Math.abs(dvX) > Math.abs(duX);
      let flipU = false;
      let flipV = false;
      if (!swapUV) {
        flipU = duX < 0;
        flipV = dvY < 0;
      } else {
        uvRemap.rotation = dvX >= 0 ? -Math.PI / 2 : Math.PI / 2;
        flipV = (uvRemap.rotation < 0) ? (duY > 0) : (duY < 0);
      }
      if (flipU) {
        uvRemap.repeatU *= -1;
        uvRemap.offsetU = 1 - uvRemap.offsetU;
      }
      if (flipV) {
        uvRemap.repeatV *= -1;
        uvRemap.offsetV = 1 - uvRemap.offsetV;
      }

      texture.repeat.set(uvRemap.repeatU, uvRemap.repeatV);
      texture.offset.set(uvRemap.offsetU, uvRemap.offsetV);
      if (uvRemap.rotation) {
        texture.center.set(0.5, 0.5);
        texture.rotation = uvRemap.rotation;
      } else {
        texture.rotation = 0;
      }
      texture.needsUpdate = true;
    }
  } catch (e) {
    console.warn('music-tablet uv remap failed', e);
  }

  // Layout: full-bleed 16:9 video area, with a subtle
  // dark frame/background and a play button in the center.
  const BG_COLOR = '#041019';
  const FRAME_COLOR = '#0d2638';
  const FRAME_PAD = Math.round(CW * 0.015);

  // Use almost the full tablet height, then make the inner
  // video area strictly 16:9 by width so it "touches" the
  // left/right bezel edges visually.
  const videoRect = {
    x: FRAME_PAD,
    y: FRAME_PAD,
    w: CW - FRAME_PAD * 2,
    h: CH - FRAME_PAD * 2,
  };

  // Enforce 16:9 using width and adjust height.
  const targetW = videoRect.w;
  const targetH = Math.round(targetW * (9 / 16));
  const padY = Math.max(0, Math.round((videoRect.h - targetH) / 2));
  videoRect.y += padY;
  videoRect.h = targetH;

  // Simple state for this tablet only.
  const state = {
    mode: 'thumbnail', // 'thumbnail' | 'playing'
    hoverPlay: false,
  };

  const videoEl = document.createElement('video');
  videoEl.src = encodeURI(TABLET_VIDEO_SRC);
  videoEl.playsInline = true;
  videoEl.muted = false;
  videoEl.preload = 'metadata';
  videoEl.crossOrigin = 'anonymous';

  const thumbImg = new Image();
  thumbImg.src = encodeURI(TABLET_THUMB_SRC);
  thumbImg.crossOrigin = 'anonymous';

  function drawFrame() {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CW, CH);

    ctx.fillStyle = FRAME_COLOR;
    ctx.fillRect(
      videoRect.x - FRAME_PAD,
      videoRect.y - FRAME_PAD,
      videoRect.w + FRAME_PAD * 2,
      videoRect.h + FRAME_PAD * 2,
    );

    let source = null;
    if (state.mode === 'playing' && videoEl.readyState >= 2) {
      source = videoEl;
    } else if (thumbImg.complete) {
      source = thumbImg;
    }

    if (source) {
      drawFitted(source, videoRect);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(videoRect.x, videoRect.y, videoRect.w, videoRect.h);
    }

    // Centered tablet-only play button. Name is distinct from
    // the main page button to avoid any overlap.
    drawTabletPlayButton();

    texture.needsUpdate = true;
  }

  function drawFitted(source, rect) {
    const { x, y, w, h } = rect;
    const sw = source.videoWidth || source.width || 0;
    const sh = source.videoHeight || source.height || 0;
    if (!sw || !sh) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, w, h);
      return;
    }

    // Preserve source aspect ratio inside the target rect (no rotation).
    const ar = sw / sh;
    const tr = w / h;
    let dw = w;
    let dh = h;
    if (ar > tr) {
      dh = Math.round(w / ar);
    } else {
      dw = Math.round(h * ar);
    }
    const dx = x + Math.round((w - dw) / 2);
    const dy = y + Math.round((h - dh) / 2);
    ctx.drawImage(source, dx, dy, dw, dh);
  }

  function drawTabletPlayButton() {
    const cx = videoRect.x + Math.round(videoRect.w / 2);
    const cy = videoRect.y + Math.round(videoRect.h / 2);
    const r = Math.round(Math.min(videoRect.w, videoRect.h) * 0.12);

    const baseFill = state.mode === 'playing' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.75)';
    const hoverBoost = state.hoverPlay ? 1.15 : 1.0;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = r * 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, r * hoverBoost, 0, Math.PI * 2);
    ctx.fillStyle = baseFill;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    if (state.mode === 'playing') {
      const bw = r * 0.35;
      const bh = r * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - bw - bw * 0.35, cy - bh / 2, bw, bh);
      ctx.fillRect(cx + bw * 0.35, cy - bh / 2, bw, bh);
    } else {
      ctx.moveTo(cx - r * 0.35, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.55, cy);
      ctx.lineTo(cx - r * 0.35, cy + r * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  thumbImg.onload = () => drawFrame();
  videoEl.addEventListener('loadeddata', () => {
    if (state.mode === 'playing') drawFrame();
  });
  videoEl.addEventListener('timeupdate', () => {
    if (state.mode === 'playing') drawFrame();
  });
  videoEl.addEventListener('ended', () => {
    state.mode = 'thumbnail';
    state.hoverPlay = false;
    drawFrame();
  });

  // Initial paint
  drawFrame();

  // Pointer interaction: raycast against the tablet screen only.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const rendererCanvas = document.querySelector('canvas#pianoCanvas');

  if (!rendererCanvas) {
    return { canvas, videoEl };
  }

  function uvToCanvas(uv) {
    let u = uv.x * uvRemap.repeatU + uvRemap.offsetU;
    let v = uv.y * uvRemap.repeatV + uvRemap.offsetV;
    if (uvRemap.rotation) {
      const cx = 0.5;
      const cy = 0.5;
      const du = u - cx;
      const dv = v - cy;
      const c = Math.cos(uvRemap.rotation);
      const s = Math.sin(uvRemap.rotation);
      const ru = du * c - dv * s;
      const rv = du * s + dv * c;
      u = ru + cx;
      v = rv + cy;
    }
    return {
      x: THREE.MathUtils.clamp(u, 0, 1) * CW,
      y: THREE.MathUtils.clamp(v, 0, 1) * CH,
    };
  }

  function hitPlayRegion(ev) {
    const rect = rendererCanvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    const camera = findCameraForObject(rootObject3D);
    if (!camera) return { overPlay: false, clickPlay: false };
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(screenMesh, true);
    if (!hits.length || !hits[0].uv) return { overPlay: false, clickPlay: false };
    const pt = uvToCanvas(hits[0].uv);
    const cx = videoRect.x + videoRect.w / 2;
    const cy = videoRect.y + videoRect.h / 2;
    const r = Math.min(videoRect.w, videoRect.h) * 0.14;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const over = dx * dx + dy * dy <= r * r;
    return { overPlay: over, clickPlay: over };
  }

  function onPointerMove(ev) {
    const { overPlay } = hitPlayRegion(ev);
    const nextHover = !!overPlay;
    if (nextHover !== state.hoverPlay) {
      state.hoverPlay = nextHover;
      drawFrame();
    }
  }

  function onPointerDown(ev) {
    const { clickPlay } = hitPlayRegion(ev);
    if (!clickPlay) return;
    ev.preventDefault();
    if (state.mode === 'thumbnail') {
      state.mode = 'playing';
      try { videoEl.play(); } catch (e) { console.warn('tablet video play failed', e); }
      drawFrame();
    } else {
      // tablet play/pause toggle - distinct from main controls
      if (videoEl.paused) {
        try { videoEl.play(); } catch (e) { console.warn('tablet video resume failed', e); }
      } else {
        try { videoEl.pause(); } catch (e) { console.warn('tablet video pause failed', e); }
      }
      drawFrame();
    }
  }

  rendererCanvas.addEventListener('pointermove', onPointerMove);
  rendererCanvas.addEventListener('pointerdown', onPointerDown);

  return { canvas, videoEl };
}

function findCameraForObject(root) {
  if (!root) return null;
  let scene = root;
  while (scene.parent) scene = scene.parent;
  if (scene.isScene) {
    const cameras = [];
    scene.traverse(obj => {
      if (obj.isCamera) cameras.push(obj);
    });
    if (cameras.length) return cameras[0];
  }
  return null;
}
