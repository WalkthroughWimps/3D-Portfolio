import { bootstrapPage } from '../_7-shared-scripts/core/bootstrap.js';
import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createPanAwareCenterProjection } from '../_7-shared-scripts/shared-glb-mouse-controls.js';
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { assetUrl, corsProbe, isLocalDev } from "../_7-shared-scripts/assets-config.js";

void bootstrapPage({ pageId: 'docs', mount({ scope }) {
  const mount = document.getElementById("glb-viewer");
  if (!mount) {
    console.warn("No #glb-viewer element found.");
    return;
  }
  let frameId = null;
  let suspended = false;
  let disposed = false;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    console.warn('[docs] 3D renderer unavailable; showing the text view.', error);
    mount.textContent = '3D cards are unavailable. The tools and skills are listed below.';
    document.querySelector('.scene-alternative')?.setAttribute('open', '');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "glb-viewer-canvas";
  mount.appendChild(renderer.domElement);
  renderer.setClearColor(0x000000, 0);

  const crankGuide = document.createElement("div");
  crankGuide.className = "crank-guide";
  crankGuide.setAttribute("aria-hidden", "true");
  let crankGuideRenderer;
  try {
    crankGuideRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    console.warn('[docs] 3D guide unavailable; showing the text view.', error);
    renderer.dispose();
    renderer.domElement.remove();
    mount.textContent = '3D cards are unavailable. The tools and skills are listed below.';
    document.querySelector('.scene-alternative')?.setAttribute('open', '');
    return;
  }
  crankGuideRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  crankGuideRenderer.setSize(220, 220, false);
  crankGuideRenderer.outputColorSpace = THREE.SRGBColorSpace;
  crankGuideRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  crankGuideRenderer.toneMappingExposure = 1.05;
  crankGuideRenderer.setClearColor(0x070b12, 0);
  crankGuide.appendChild(crankGuideRenderer.domElement);
  mount.appendChild(crankGuide);

  const crankGuideScene = new THREE.Scene();
  const crankGuideCamera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
  crankGuideScene.add(new THREE.HemisphereLight(0xffffff, 0x181322, 1.8));
  const crankGuideKey = new THREE.DirectionalLight(0xffffff, 2.1);
  crankGuideKey.position.set(2, 4, 5);
  crankGuideScene.add(crankGuideKey);

  const status = document.createElement("div");
  status.className = "glb-viewer-status";
  status.textContent = "Loading model...";
  status.style.zIndex = "2";
  mount.appendChild(status);

  const scene = new THREE.Scene();
  const axes = new THREE.AxesHelper(0.5);
  axes.visible = false;
  scene.add(axes);

  // Default camera (fallback if GLB has none)
  const defaultCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  defaultCamera.position.set(0, 1.2, 3);

  let activeCamera = defaultCamera;
  let centerProjection = null;
  let centerProjectionCamera = null;
  let centerOnViewport = false;
  const stopCenterSetting = getSharedSettings().subscribe(snapshot => {
    centerOnViewport = Boolean(snapshot?.docs?.centerOnViewport);
    if (mount.isConnected) resize();
  }, { immediate: true });
  scope.defer(stopCenterSetting);

  // Default light rig (simple + robust)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(4, 7, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-5, 3, -3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.55);
  rim.position.set(0, 5, -6);
  scene.add(rim);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
  roomEnvironment.dispose();
  scene.environment = environmentTarget.texture;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const controls = new OrbitControls(activeCamera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableRotate = false;
  controls.enabled = false;
  let modelRoot = null;
  let modelPivot = null;
  let cubeParagraph = null;
  let cubeFace = null;
  let cubeAbout = null;
  let crankshaft = null;
  let faceRightBtnMesh = null;
  let faceLeftBtnMesh = null;
  let crankshaftHandle = null;
  let crankGuideModel = null;
  let crankAngle = 0;
  let crankTargetAngle = 0;
  let crankReverseTravel = 0;
  let crankDragCenter = null;
  let lastCrankFrame = performance.now();
  let crankGuideHideTimer = null;
  let skillGroup = null;
  const cardProxies = new Map();
  scope.defer(disposeDocs);
  let spinX = 0;
  let spinY = 0;
  let defaultTarget = null;
  let defaultDirection = null;
  let middlePointer = null;
  let rightPointer = null;
  let lastMiddleClick = 0;
  let lastRightClick = 0;
  const maxSideTilt = Math.PI / 6;
  const rotationTweens = new Map();
  const quarterTurn = Math.PI / 2;
  const FRONT_FILL = 1;
  const BACK_FILL = 1;
  const CARD_CONFIG_URL = assetUrl("icon-colors.json");
  const CARD_COLOR_URL = assetUrl("card-skill-colors.json");
  const cardOrder = [
    "Ableton Live",
    "Adobe Acrobat Reader",
    "Adobe After Effects",
    "Adobe Animate",
    "Adobe Audition",
    "Adobe Bridge",
    "Adobe Capture",
    "Adobe Character Animator",
    "Adobe Illustrator",
    "Adobe InDesign",
    "Adobe Media Encoder",
    "Adobe Premiere Pro",
    "blender",
    "DaVinci Resolve",
    "Finale",
    "Microsoft Excel",
    "Microsoft PowerPoint",
    "Microsoft Word",
    "REAPER",
    "Visual Studio Code",
    "Visual Studio"
  ];
  let cardConfig = null;
  let cardColorConfig = null;
  let cardColorSequence = null;
  let cardColorEntrySequence = null;
  const textureCache = new Map();
  const skillCards = [];
  const cardStates = new Map();

  let allCardsFlipped = false;
  let flipAllButton = null;
  THREE.DefaultLoadingManager.setURLModifier((url) => assetUrl(url));
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");

  function buildCrankGuideModel() {
    if (!crankshaft) return;
    if (crankGuideModel) crankGuideScene.remove(crankGuideModel);
    crankGuideModel = crankshaft.clone(true);
    crankGuideModel.position.set(0, 0, 0);
    // Keep the GLB rest orientation: its handle projects out along +X.
    crankGuideScene.add(crankGuideModel);
    crankGuideModel.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(crankGuideModel);
    const center = bounds.getCenter(new THREE.Vector3());
    // Center the guide on the axle, not the off-center handle bounds.
    center.y = 0;
    center.z = 0;
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = 2 * Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y), Math.abs(bounds.min.z), Math.abs(bounds.max.z), 0.1);
    const distance = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(crankGuideCamera.fov * 0.5))) * 1.45;
    crankGuideCamera.position.set(center.x + Math.max(distance, size.x * 1.4), center.y, center.z);
    crankGuideCamera.up.set(0, 1, 0);
    crankGuideCamera.lookAt(center);
    crankGuideCamera.near = Math.max(distance / 100, 0.01);
    crankGuideCamera.far = distance * 10;
    crankGuideCamera.updateProjectionMatrix();
  }

  function showCrankGuide(event) {
    if (crankGuideHideTimer) {
      window.clearTimeout(crankGuideHideTimer);
      crankGuideHideTimer = null;
    }
    crankGuide.classList.add("is-visible");
    const mountRect = mount.getBoundingClientRect();
    const diameter = crankGuide.getBoundingClientRect().width || 190;
    const radius = diameter * 0.5;
    const x = THREE.MathUtils.clamp(event.clientX - mountRect.left, radius + 8, mountRect.width - radius - 8);
    const y = THREE.MathUtils.clamp(event.clientY - mountRect.top, radius + 8, mountRect.height - radius - 8);
    crankGuide.style.left = `${x}px`;
    crankGuide.style.top = `${y}px`;
  }

  function scheduleCrankGuideHide() {
    if (crankGuideHideTimer) window.clearTimeout(crankGuideHideTimer);
    crankGuideHideTimer = window.setTimeout(() => {
      crankGuide.classList.remove("is-visible");
      crankGuideHideTimer = null;
    }, 700);
  }

  const rotationLocks = [
    "lockedAxes",
    "axisLocks",
    "rotationLocks",
    "rotationLock",
    "lockAxes",
    "lockAxis"
  ];

  function getLockedAxes(object3d) {
    if (!object3d || !object3d.userData) return [];
    const data = object3d.userData;
    for (const key of rotationLocks) {
      if (Array.isArray(data[key])) return data[key];
      if (typeof data[key] === "string") return data[key].split(",").map((axis) => axis.trim());
    }
    const locked = [];
    if (data.lockX) locked.push("x");
    if (data.lockY) locked.push("y");
    if (data.lockZ) locked.push("z");
    return locked;
  }

  function resolveAxis(object3d, preferred, fallback) {
    const locked = getLockedAxes(object3d).map((axis) => axis.toLowerCase());
    if (locked.includes(preferred)) {
      return locked.includes(fallback) ? preferred : fallback;
    }
    return preferred;
  }

  function findObjectByNames(root, names) {
    if (!root) return null;
    for (const name of names) {
      const match = root.getObjectByName(name);
      if (match) return match;
    }
    return null;
  }



  function isDescendant(node, ancestor) {
    let current = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }

  function flashButton(buttonRoot) {
    if (!buttonRoot) return;
    if (buttonRoot.userData && buttonRoot.userData.flashTimer) {
      clearTimeout(buttonRoot.userData.flashTimer);
    }
    const flashColor = new THREE.Color(0x2a7dff);
    buttonRoot.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      child.userData.flashOriginal = materials.map((mat) =>
        mat && mat.color ? mat.color.clone() : null
      );
      materials.forEach((mat) => {
        if (mat && mat.color) mat.color.copy(flashColor);
      });
    });
    buttonRoot.userData.flashTimer = setTimeout(() => {
      buttonRoot.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const originals = child.userData.flashOriginal || [];
        materials.forEach((mat, index) => {
          const original = originals[index];
          if (mat && mat.color && original) mat.color.copy(original);
        });
      });
      buttonRoot.userData.flashTimer = null;
    }, 500);
  }

  function normalizeAngle(angle) {
    const twoPi = Math.PI * 2;
    let normalized = angle % twoPi;
    if (normalized < 0) normalized += twoPi;
    return normalized;
  }

  function getTexture(url) {
    if (!url) return null;
    const resolved = assetUrl(url);
    if (textureCache.has(resolved)) return textureCache.get(resolved);
    const tex = textureLoader.load(resolved);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textureCache.set(resolved, tex);
    return tex;
  }

  function getCardTexture(url, fill) {
    const base = getTexture(url);
    if (!base) return null;
    const tex = base.clone();
    const scale = typeof fill === "number" ? fill : 1;
    tex.repeat.set(scale, scale);
    tex.offset.set((1 - scale) / 2, (1 - scale) / 2);
    tex.needsUpdate = true;
    return tex;
  }

  function flipTextureX(texture) {
    if (!texture) return;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.x *= -1;
    texture.offset.x = 1 - texture.offset.x;
    texture.needsUpdate = true;
  }

  function fitTextureToUV(mesh, texture) {
    if (!mesh || !texture || !mesh.geometry || !mesh.geometry.attributes) return;
    const uvAttr = mesh.geometry.attributes.uv;
    if (!uvAttr) return;
    let minU = Infinity;
    let minV = Infinity;
    let maxU = -Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      if (u < minU) minU = u;
      if (v < minV) minV = v;
      if (u > maxU) maxU = u;
      if (v > maxV) maxV = v;
    }
    const rangeU = maxU - minU;
    const rangeV = maxV - minV;
    if (rangeU <= 0 || rangeV <= 0) return;
    texture.repeat.set(1 / rangeU, 1 / rangeV);
    texture.offset.set(-minU / rangeU, -minV / rangeV);
    texture.needsUpdate = true;
  }



  // Matches: "skill-card001" AND "skill-card.001" (and other digit counts)
  function isSkillCardGroupName(name) {
    if (typeof name !== "string") return false;
    const n = name.toLowerCase();
    if (n === "skill-cards") return false;
    return /^skill-card\.?\d+$/.test(n);
  }

  function getCardPivotLocalFromBBox(card) {
    // World-space bbox center, then convert to parent's local space.
    const box = new THREE.Box3().setFromObject(card);
    const centerWorld = box.getCenter(new THREE.Vector3());
    card.parent.worldToLocal(centerWorld);
    return centerWorld;
  }

  function getCardRoot(obj) {
    let current = obj;
    while (current) {
      if (current.name && isSkillCardGroupName(current.name)) return current;
      current = current.parent;
    }
    return null;
  }

  function getProxyCardTarget(obj) {
    let current = obj;
    while (current) {
      if (current.userData && current.userData.proxyFor) return current.userData.proxyFor;
      current = current.parent;
    }
    return null;
  }

  function isProxyDescendant(obj) {
    let current = obj;
    while (current) {
      if (current.userData && current.userData.isCardProxy) return true;
      current = current.parent;
    }
    return false;
  }

  function collectSkillCards() {
    skillCards.length = 0;
    if (!modelRoot) return;
    const seen = new Set();
    modelRoot.traverse((child) => {
      if (!child.name) return;
      if (!isSkillCardGroupName(child.name)) return;
      if (seen.has(child.name)) return;
      seen.add(child.name);
      skillCards.push(child);
    });
    skillCards.sort((a, b) => {
      const aMatch = a.name.match(/(\d+)/);
      const bMatch = b.name.match(/(\d+)/);
      const aIndex = aMatch ? parseInt(aMatch[1], 10) : 0;
      const bIndex = bMatch ? parseInt(bMatch[1], 10) : 0;
      return aIndex - bIndex;
    });
  }

  function setCardSelectionVisual(cardRoot) {
    cardRoot.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat || !mat.name || !mat.name.toLowerCase().includes("card-side")) return;
        if (!child.userData.sideBaseColor && mat.color) {
          child.userData.sideBaseColor = mat.color.clone();
        }
      });
    });
  }



  function getCardBaseColorByIndex(index) {
    if (!cardColorSequence && cardColorConfig) {
      cardColorSequence = Object.values(cardColorConfig)
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") return entry.text || entry.textColor;
          return null;
        })
        .filter(Boolean);
    }
    if (cardColorSequence && cardColorSequence.length) {
      const value = cardColorSequence[index % cardColorSequence.length];
      if (typeof value === "string") return new THREE.Color(value);
    }
    return null;
  }

  function getCardColorEntryByIndex(index) {
    if (!cardColorEntrySequence && cardColorConfig) {
      cardColorEntrySequence = Object.values(cardColorConfig);
    }
    if (!cardColorEntrySequence || !cardColorEntrySequence.length) return null;
    return cardColorEntrySequence[index % cardColorEntrySequence.length];
  }

  function applyCardTextures() {
    if (!modelRoot || !cardConfig) return;
    collectSkillCards();
    skillCards.forEach((card, index) => {
      ensureUniqueCardMaterials(card);
      const cardKey = card.userData.cardKey || cardOrder[index];
      const config = cardConfig[cardKey];
      if (!config) return;
      const frontFill = FRONT_FILL;
      const backFill = BACK_FILL;
      const frontTex = getCardTexture(config.frontPng, frontFill);
      const backTex = getCardTexture(config.backPng, backFill);
      const colorEntry = getCardColorEntryByIndex(index);
      const baseColor = getCardBaseColorByIndex(index, config);
      const sideColor = colorEntry && colorEntry.side ? new THREE.Color(colorEntry.side) : baseColor;

      card.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!mat || !mat.name) return;
          const matName = mat.name.toLowerCase();
          if ((matName.includes("card-back") || matName.includes("back")) && backTex) {
            mat.map = backTex;
            fitTextureToUV(child, backTex);
            if (mat.color) mat.color.setHex(0xffffff);
            flipTextureX(backTex);
            mat.needsUpdate = true;
          } else if ((matName.includes("card-app") || matName.includes("app") || matName.includes("front")) && frontTex) {
            mat.map = frontTex;
            fitTextureToUV(child, frontTex);
            if (mat.color) mat.color.setHex(0xffffff);
            mat.needsUpdate = true;
          } else if ((matName.includes("card-side") || matName.includes("side") || matName.includes("edge")) && sideColor && mat.color) {
            mat.color.copy(sideColor);
            mat.needsUpdate = true;
          }
        });
      });
      if (!cardStates.has(card)) {
        cardStates.set(card, { isFlipped: false, isSelected: false });
      }
      if (card.userData && typeof card.userData.restY !== "number") {
        card.userData.restY = snapToIncrement(card.rotation.y, Math.PI);
      }
    });
  }

  function ensureUniqueCardMaterials(card) {
    card.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      if (child.userData && child.userData.materialsCloned) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const clones = materials.map((mat) => (mat ? mat.clone() : mat));
      child.material = Array.isArray(child.material) ? clones : clones[0];
      child.userData.materialsCloned = true;
    });
  }

  function buildSkillCardProxies() {
    if (!modelRoot || !skillGroup) return;
    collectSkillCards();
    skillCards.forEach((card) => {
      if (cardProxies.has(card)) return;
      const proxy = card.clone(true);
      proxy.name = `${card.name}-proxy`;
      proxy.userData.isCardProxy = true;
      proxy.userData.proxyFor = card;
      proxy.scale.setScalar(0.85);
      proxy.traverse((child) => {
        if (!child.isMesh) return;
        child.material = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false
        });
        child.castShadow = false;
        child.receiveShadow = false;
      });
      skillGroup.add(proxy);
      cardProxies.set(card, proxy);
    });
  }

  function applySkillCardScale() {
    const targets = [];
    if (skillGroup) {
      skillGroup.traverse((child) => {
        if (!child.name) return;
        // Only true per-card groups, never the container.
        if (!isSkillCardGroupName(child.name)) return;
        // Optional: ensure it’s not a Mesh; cards should be Group/Object3D wrappers.
        if (child.isMesh) return;
        targets.push(child);
      });
    } else {
      collectSkillCards();
      skillCards.forEach((card) => targets.push(card));
    }
    targets.forEach((card) => {
      if (card.userData && card.userData.skillScaleApplied) return;
      const pivot = getCardPivotLocalFromBBox(card);
      const scale = 0.85;
      // Scale card, but keep the bbox-center pivot visually stable.
      card.scale.multiplyScalar(scale);
      card.position.sub(pivot).multiplyScalar(scale).add(pivot);
      card.updateMatrix();
      card.updateMatrixWorld(true);
      card.userData.skillScaleApplied = true;
    });
  }

  Promise.all([
    fetch(CARD_CONFIG_URL, { signal: scope.signal }).then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${CARD_CONFIG_URL}`);
      return response.json();
    }),
    fetch(CARD_COLOR_URL, { signal: scope.signal })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
  ])
    .then(([configData, colorData]) => {
      if (disposed) return;
      cardConfig = configData;
      cardColorConfig = colorData;
      cardColorSequence = null;
      cardColorEntrySequence = null;
      applyCardTextures();
    })
    .catch((error) => {
      if (disposed || error?.name === 'AbortError') return;
      console.warn("Skill card config load failed:", error);
    });

  function snapToIncrement(angle, increment) {
    const normalized = normalizeAngle(angle);
    return Math.round(normalized / increment) * increment;
  }

  function snapToIncrementAroundBase(angle, base, increment) {
    const delta = angle - base;
    const snapped = Math.round(delta / increment) * increment;
    return base + snapped;
  }

  function getActiveRotation(object3d, axis) {
    const tween = rotationTweens.get(object3d);
    if (!tween || tween.axis !== axis) return object3d.rotation[axis];
    const now = performance.now();
    const t = Math.min(1, (now - tween.startTime) / tween.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return tween.start + (tween.end - tween.start) * eased;
  }

  function tweenRotationTo(object3d, axis, target, duration, snapIncrement = quarterTurn) {
    if (!object3d) return;
    const now = performance.now();
    const current = getActiveRotation(object3d, axis);
    let snappedTarget = snapToIncrement(target, snapIncrement);
    if (object3d.userData && typeof object3d.userData.restY === "number" && axis === "y") {
      snappedTarget = snapToIncrementAroundBase(target, object3d.userData.restY, snapIncrement);
    }
    rotationTweens.set(object3d, {
      object3d,
      axis,
      start: current,
      end: snappedTarget,
      startTime: now,
      duration,
      snapIncrement
    });
  }

  function tweenRotation(object3d, axis, direction, duration, snapIncrement = quarterTurn) {
    if (!object3d) return;
    const now = performance.now();
    const current = getActiveRotation(object3d, axis);
    const base = snapToIncrement(current, snapIncrement);
    const existing = rotationTweens.get(object3d);
    let target = base + snapIncrement * direction;
    if (existing && existing.axis === axis) {
      const existingDir = Math.sign(existing.end - existing.start) || 0;
      if (existingDir === direction) {
        target = existing.end + snapIncrement * direction;
      }
    }
    const increment = snapIncrement;
    rotationTweens.set(object3d, {
      object3d,
      axis,
      start: current,
      end: target,
      startTime: now,
      duration,
      snapIncrement: increment
    });
  }

  function resize() {
    const header = document.getElementById("patterned-background");
    const headerH = document.body.dataset.headerLayout === 'legacy' && !centerOnViewport && header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    const desiredH = Math.max(1, Math.round(window.innerHeight - headerH));
    mount.style.setProperty("--glb-viewer-top", `${Math.round(headerH)}px`);
    mount.style.height = `${desiredH}px`;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setSize(w, h, false);
    if (activeCamera && activeCamera.isPerspectiveCamera) {
      activeCamera.aspect = w / h;
      activeCamera.updateProjectionMatrix();
    } else if (activeCamera && activeCamera.isOrthographicCamera) {
      activeCamera.updateProjectionMatrix();
    }
  }
  scope.listen(window, "resize", resize);
  scope.listen(window, 'site:header-layout-change', resize);

  // IMPORTANT: set this path to your real GLB path
  const GLB_PATH = assetUrl("../assets/glb/about-cube.glb");

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);
  loader.load(
    GLB_PATH,
    (gltf) => {
      if (disposed) {
        disposeGraph(gltf.scene);
        return;
      }
      gltf.scene.updateMatrixWorld(true);
      // Add model
      modelRoot = gltf.scene;
      modelPivot = new THREE.Group();
      modelPivot.name = "modelPivot";
      // Apply side tilt outside the local long-axis spin: Ry(tilt) * Rx(spin).
      modelPivot.rotation.order = "YXZ";
      modelPivot.add(modelRoot);
      scene.add(modelPivot);
      skillGroup = modelRoot.getObjectByName("skill-cards");
      applySkillCardScale();
      buildSkillCardProxies();

      // If the GLB includes a camera, use it
      if (gltf.cameras && gltf.cameras.length > 0) {
        activeCamera = gltf.cameras[0];
      } else {
        activeCamera = defaultCamera;
      }

      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // The axle passes through the body origin, not the asymmetric bounds
      // (which include the projecting crank and handle).
      const body = modelRoot.getObjectByName("cube-about");
      if (body) {
        const axleCenter = body.getWorldPosition(new THREE.Vector3());
        center.y = axleCenter.y;
        center.z = axleCenter.z;
      }
      modelRoot.position.sub(center);
      modelPivot.position.copy(center);
      modelPivot.updateMatrixWorld(true);

      if (activeCamera && activeCamera.parent) {
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        activeCamera.updateMatrixWorld(true);
        activeCamera.matrixWorld.decompose(worldPos, worldQuat, worldScale);
        activeCamera.parent.remove(activeCamera);
        scene.add(activeCamera);
        activeCamera.position.copy(worldPos);
        activeCamera.quaternion.copy(worldQuat);
        activeCamera.scale.copy(worldScale);
        activeCamera.updateMatrixWorld(true);
      } else if (activeCamera && activeCamera.parent == null) {
        scene.add(activeCamera);
      }

      // Re-bind controls to whichever camera is active
      controls.object = activeCamera;

      const centerWorld = new THREE.Vector3();
      modelPivot.getWorldPosition(centerWorld);

      if (activeCamera === defaultCamera) {
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 1.5;
        defaultCamera.position.copy(centerWorld).add(new THREE.Vector3(dist, dist * 0.35, dist));
        defaultCamera.near = Math.max(dist / 1000, 0.01);
        defaultCamera.far = dist * 50;
        defaultCamera.updateProjectionMatrix();
      } else {
        const camPos = new THREE.Vector3();
        activeCamera.getWorldPosition(camPos);
        if (activeCamera.isPerspectiveCamera) {
          activeCamera.near = Math.max(size.length() / 1000, 0.01);
          activeCamera.far = Math.max(activeCamera.near + size.length() * 50, 100);
          activeCamera.updateProjectionMatrix();
        } else if (activeCamera.isOrthographicCamera) {
          activeCamera.updateProjectionMatrix();
        }
        const dist = camPos.distanceTo(centerWorld);
        if (Number.isFinite(dist) && dist > 0) {
          controls.minDistance = dist * 0.5;
          controls.maxDistance = dist * 3;
        }
      }

      if (modelPivot && activeCamera === defaultCamera) {
        activeCamera.updateMatrixWorld(true);
        modelPivot.updateMatrixWorld(true);
        const modelCenter = new THREE.Vector3();
        modelPivot.getWorldPosition(modelCenter);
        const ndcCenter = modelCenter.clone().project(activeCamera);
        const worldCenter = ndcCenter.clone().unproject(activeCamera);
        const worldTarget = new THREE.Vector3(0, 0, ndcCenter.z).unproject(activeCamera);
        modelPivot.position.add(worldTarget.sub(worldCenter));
        modelPivot.updateMatrixWorld(true);
        modelPivot.getWorldPosition(centerWorld);
      }

      spinX = 0;
      controls.target.copy(centerWorld);
      controls.update();
      defaultTarget = controls.target.clone();
      defaultDirection = activeCamera.position.clone().sub(defaultTarget).normalize();
      cubeParagraph = findObjectByNames(modelRoot, ["cube-paragraph"]);
      cubeFace = findObjectByNames(modelRoot, ["cube-face"]);
      faceRightBtnMesh = findObjectByNames(modelRoot, ["face-rightbtn"]);
      faceLeftBtnMesh = findObjectByNames(modelRoot, ["face-leftbtn"]);
      crankshaftHandle = findObjectByNames(modelRoot, ["crankshaft-handle"]);
      const neutralizeScale = (object3d) => {
        if (!object3d || !object3d.parent) return;
        const parentScale = new THREE.Vector3();
        object3d.parent.getWorldScale(parentScale);
        if (parentScale.x === 0 || parentScale.y === 0 || parentScale.z === 0) return;
        object3d.scale.set(
          1 / parentScale.x,
          1 / parentScale.y,
          1 / parentScale.z
        );
        object3d.updateMatrixWorld(true);
      };
      neutralizeScale(cubeParagraph);
      neutralizeScale(cubeFace);
      const applyTextureScale = (material, scale) => {
        if (!material) return;
        const textureProps = [
          "map",
          "roughnessMap",
          "metalnessMap",
          "aoMap",
          "emissiveMap",
          "normalMap",
          "bumpMap"
        ];
        textureProps.forEach((prop) => {
          const tex = material[prop];
          if (!tex) return;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(scale, scale);
          tex.needsUpdate = true;
        });
      };

      const stabilizeParagraphMaterial = (object3d) => {
        if (!object3d) return;
        object3d.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const normalized = materials.map((mat) => {
            const next = mat.clone();
            const materialName = String(next.name || "").toLowerCase();
            const isParagraphText = materialName.includes("gold") || materialName.includes("text");

            // The gold lettering was previously treated like the blue leather,
            // leaving it dependent on the cube's angle to the key light. Keep a
            // small amount of the material response while giving the lettering a
            // stable, texture-shaped luminance floor at every resting face.
            if (isParagraphText) {
              if ("metalness" in next) next.metalness = 0.08;
              if ("roughness" in next) next.roughness = 0.78;
              next.metalnessMap = null;
              next.roughnessMap = null;
              if (next.color) next.color.setHex(0xffefd0);
              if (next.emissive) {
                next.emissive.setHex(0x6a4a1c);
                next.emissiveMap = next.map || null;
                next.emissiveIntensity = 0.62;
              }
            } else if (materialName.includes("blue_leather") && next.color) {
              next.color.setHex(0x7896b8);
            }
            next.needsUpdate = true;
            return next;
          });
          child.material = Array.isArray(child.material) ? normalized : normalized[0];
        });
      };
      stabilizeParagraphMaterial(cubeParagraph);
      if (cubeParagraph) {
        cubeParagraph.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => applyTextureScale(mat, 30));
        });
      }
      cubeAbout = findObjectByNames(modelRoot, ["cube-about"]);
      crankshaft = findObjectByNames(modelRoot, ["crankshaft"]);
      if (crankshaft) {
        buildCrankGuideModel();
      }
      if (cubeAbout) {
        const woodTint = new THREE.Color(0x8b0f16);
        cubeAbout.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (!mat || !mat.color) return;
            const name = (mat.name || "").toLowerCase();
            if (name.includes("dark-red-wood")) {
              mat.color.lerp(woodTint, 0.8);
            } else if (name.includes("wood") || name.includes("red")) {
              mat.color.lerp(woodTint, 0.6);
            }
          });
        });
      }
      applyCardTextures();

      flipAllButton = modelRoot.getObjectByName("skill-cards-flip-all");
      if (!flipAllButton && cubeAbout) {
        // Automatically use the authored GLB node once it exists.
        flipAllButton = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.09, 0.018),
          new THREE.MeshStandardMaterial({ color: 0xe5b994, roughness: 0.45 })
        );
        flipAllButton.name = "skill-cards-flip-all";
        flipAllButton.position.set(0, 0.43, -0.75);
        skillGroup.add(flipAllButton);
      }
      status.remove();
      resize();
    },
    () => {
      // progress
      // console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (err) => {
      if (disposed) return;
      console.error("GLTF LOAD FAILED:", GLB_PATH, err);
      console.error("Check path, server, and Network tab for 404:", GLB_PATH);
      status.textContent = "GLB load failed. Check console/network.";
      status.style.color = "#ffb3b3";
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xff5577 })
      );
      scene.add(fallback);
      controls.target.set(0, 0, 0);
      axes.visible = true;
      resize();
    }
  );

  function animate() {
    if (disposed || suspended) return;
    frameId = requestAnimationFrame(animate);
    if (crankshaft) {
      const previousAngle = crankAngle;
      const frameTime = performance.now();
      const dt = Math.min(0.05, Math.max(0, (frameTime - lastCrankFrame) / 1000));
      lastCrankFrame = frameTime;
      const error = crankTargetAngle - crankAngle;
      const step = error * (1 - Math.exp(-10 * dt));
      crankAngle += THREE.MathUtils.clamp(step, -3.5 * dt, 3.5 * dt);
      if (Math.abs(crankTargetAngle - crankAngle) < 0.0001) crankAngle = crankTargetAngle;
      // The crank drives the entire assembly about the same axle as the wheel.
      spinX += crankAngle - previousAngle;
      // Clockwise in the side guide is negative X; counter-rotate the box.
      // Cancel the body's rotation so the physical crank matches that guide.
      crankshaft.rotation.x = -crankAngle - spinX;
    }
    if (modelPivot) {
      modelPivot.rotation.x = spinX;
      modelPivot.rotation.y = spinY;
    }
    if (crankGuideModel && (isDraggingCrank || crankGuide.classList.contains("is-visible"))) {
      crankGuideModel.rotation.x = -crankAngle;
      crankGuideRenderer.render(crankGuideScene, crankGuideCamera);
    }
    const now = performance.now();
    rotationTweens.forEach((tween, object3d) => {
      const t = Math.min(1, (now - tween.startTime) / tween.duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const value = tween.start + (tween.end - tween.start) * eased;
      object3d.rotation[tween.axis] = value;
      if (t >= 1) {
        const snapIncrement = tween.snapIncrement || quarterTurn;
        object3d.rotation[tween.axis] = snapToIncrement(tween.end, snapIncrement);
        rotationTweens.delete(object3d);
        const state = cardStates.get(object3d);
        if (state && !state.isHovered) {
          state.flipInProgress = false;
          cardStates.set(object3d, state);
        }
      }
    });
    if (centerProjectionCamera !== activeCamera) {
      centerProjectionCamera = activeCamera;
      centerProjection = createPanAwareCenterProjection(activeCamera);
    }
    centerProjection.update({ enabled: centerOnViewport && !!modelPivot,
      panned: !!defaultTarget && controls.target.distanceToSquared(defaultTarget) >= 1e-8,
      width: mount.clientWidth, height: mount.clientHeight,
      getCenter: () => {
        modelPivot.updateWorldMatrix(true, false);
        return modelPivot.getWorldPosition(new THREE.Vector3());
      } });
    renderer.render(scene, activeCamera);
  }

  function zoomCamera(delta) {
    if (!activeCamera) return;
    if (activeCamera.isPerspectiveCamera) {
      const dir = new THREE.Vector3();
      activeCamera.getWorldDirection(dir);
      const distance = activeCamera.position.distanceTo(controls.target);
      const step = (delta / 120) * Math.max(distance * 0.08, 0.05);
      activeCamera.position.addScaledVector(dir, step);
    } else if (activeCamera.isOrthographicCamera) {
      const next = THREE.MathUtils.clamp(activeCamera.zoom * (1 - delta * 0.0015), 0.2, 6);
      activeCamera.zoom = next;
      activeCamera.updateProjectionMatrix();
    }
  }

  scope.listen(renderer.domElement, "contextmenu", (event) => {
    event.preventDefault();
  });

  scope.listen(renderer.domElement, "wheel", (event) => {
    if (!modelRoot) return;
    event.preventDefault();
    const delta = Math.max(-120, Math.min(120, event.deltaY));
    if (!event.altKey) {
      zoomCamera(delta);
      controls.update();
      return;
    }
    spinX += delta * 0.0025;
  }, { passive: false });

  const faceRightBtn = document.getElementById("face-rightbtn");
  const faceLeftBtn = document.getElementById("face-leftbtn");
  const rotationDuration = 1200;
  const hoverRotationDuration = 450;
  const paragraphAxis = "x";
  function rotateFaces(direction) {
    if (!cubeParagraph) return;
    const paragraphAxisResolved = resolveAxis(cubeParagraph, paragraphAxis, "y");
    // The portrait is shared by every paragraph; keeping its textured face
    // forward avoids exposing the cube's differently mapped side faces.
    tweenRotation(cubeParagraph, paragraphAxisResolved, -direction, rotationDuration);
  }

  if (faceRightBtn) {
    scope.listen(faceRightBtn, "click", () => rotateFaces(1));
  }
  if (faceLeftBtn) {
    scope.listen(faceLeftBtn, "click", () => rotateFaces(-1));
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let isDraggingCrank = false;
  let crankPointerId = null;
  let lastCrankPoint = null;
  let crankDragDirection = 0;
  let isDraggingModel = false;
  let modelPointerId = null;
  let lastModelPointer = null;
  let modelDragDistance = 0;
  let lastHoveredCard = null;

  function updatePointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return rect;
  }

  function getTopHitFiltered(event, acceptHit) {
    if (!activeCamera || !modelRoot) return null;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, activeCamera);
    const hits = raycaster.intersectObjects([modelRoot], true);
    if (!hits.length) return null;
    if (typeof acceptHit !== "function") return hits[0];
    return hits.find(acceptHit) || null;
  }

  function getTopHit(event) {
    return getTopHitFiltered(event);
  }

  function getCrankCenterScreen() {
    if (!crankshaft || !activeCamera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const center = new THREE.Vector3();
    crankshaft.getWorldPosition(center);
    const centerNdc = center.clone().project(activeCamera);
    const cx = (centerNdc.x * 0.5 + 0.5) * rect.width + rect.left;
    const cy = (-centerNdc.y * 0.5 + 0.5) * rect.height + rect.top;
    return { rect, cx, cy };
  }

  function getObjectScreenPoint(object3d) {
    if (!object3d || !activeCamera) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector3();
    object3d.getWorldPosition(point);
    point.project(activeCamera);
    return {
      x: (point.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-point.y * 0.5 + 0.5) * rect.height + rect.top
    };
  }

  function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    const projection = THREE.MathUtils.clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      0,
      1
    );
    return Math.hypot(point.x - (start.x + dx * projection), point.y - (start.y + dy * projection));
  }

  function startCrankDrag(event) {
    if (!crankshaftHandle || !activeCamera) return false;
    const center = getCrankCenterScreen();
    const handle = getObjectScreenPoint(crankshaftHandle);
    if (!center || !handle) return false;
    const hit = getTopHitFiltered(event, (entry) => isDescendant(entry.object, crankshaft));
    const nearCrank = distanceToSegment(
      { x: event.clientX, y: event.clientY },
      { x: center.cx, y: center.cy },
      handle
    ) <= 42;
    if (!hit && !nearCrank) return false;
    isDraggingCrank = true;
    renderer.domElement.style.cursor = 'grabbing';
    crankPointerId = event.pointerId;
    lastCrankPoint = { x: event.clientX - center.cx, y: event.clientY - center.cy };
    crankDragDirection = 0;
    showCrankGuide(event);
    const guideRect = crankGuide.getBoundingClientRect();
    crankDragCenter = { cx: guideRect.left + guideRect.width / 2, cy: guideRect.top + guideRect.height / 2 };
    lastCrankPoint = { x: event.clientX - crankDragCenter.cx, y: event.clientY - crankDragCenter.cy };
    crankReverseTravel = 0;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return true;
  }

  function startModelDrag(event) {
    isDraggingModel = true;
    renderer.domElement.style.cursor = 'grabbing';
    modelPointerId = event.pointerId;
    lastModelPointer = { x: event.clientX, y: event.clientY };
    modelDragDistance = 0;
    renderer.domElement.classList.add("is-rotating");
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleMeshClick(event) {
    if (!activeCamera) return;
    if (!modelRoot) return;
    if (isDraggingCrank) return;
    const hit = getTopHit(event);
    if (!hit) return;
    const isRight = faceRightBtnMesh && isDescendant(hit.object, faceRightBtnMesh);
    const isLeft = faceLeftBtnMesh && isDescendant(hit.object, faceLeftBtnMesh);
    if (!isRight && !isLeft) return;
    if (isRight) {
      flashButton(faceRightBtnMesh);
      rotateFaces(1);
      return true;
    } else if (isLeft) {
      flashButton(faceLeftBtnMesh);
      rotateFaces(-1);
      return true;
    }
    return false;
  }



  function getCardRestY(cardRoot) {
    if (!cardRoot) return 0;
    const current = typeof cardRoot.userData.restY === "number"
      ? cardRoot.userData.restY
      : snapToIncrement(cardRoot.rotation.y, Math.PI);
    cardRoot.userData.restY = current;
    return current;
  }



  function updateCardSide(cardRoot) {
    const state = cardStates.get(cardRoot) || {};
    const flipped = Boolean(allCardsFlipped) !== Boolean(state.isFlipped);
    const preview = state.isHovered && !state.hoverPinned;
    const side = flipped !== Boolean(preview);
    const base = getCardRestY(cardRoot);
    const current = getActiveRotation(cardRoot, "y");
    const desired = base + (side ? Math.PI : 0);
    const target = desired + Math.round((current - desired) / (Math.PI * 2)) * Math.PI * 2;
    tweenRotationTo(cardRoot, "y", target, hoverRotationDuration, Math.PI);
  }

  function flipAllCards() {
    allCardsFlipped = !allCardsFlipped;
    skillCards.forEach(updateCardSide);
  }

  function setCardHover(cardRoot, hovered) {
    if (!cardRoot) return;
    const state = cardStates.get(cardRoot) || { isFlipped: false, isSelected: false };
    if (state.isHovered === hovered) return;
    state.isHovered = hovered;
    state.hoverPinned = false;
    cardStates.set(cardRoot, state);
    updateCardSide(cardRoot);
  }

  function handleCardHover(event) {
    if (!activeCamera || !skillGroup) return;
    const hit = getTopHitFiltered(event, (hitEntry) => {
      if (!cardProxies.size) return true;
      if (!skillGroup) return true;
      if (!isDescendant(hitEntry.object, skillGroup)) return true;
      return isProxyDescendant(hitEntry.object);
    });
    const proxyTarget = hit ? getProxyCardTarget(hit.object) : null;
    const directHit = getTopHit(event);
    const target = directHit?.object;
    const actionable = (cardProxies.size ? !!proxyTarget : !!(hit && isDescendant(hit.object, skillGroup)))
      || !!(target && ((flipAllButton && isDescendant(target, flipAllButton))
        || (faceLeftBtnMesh && isDescendant(target, faceLeftBtnMesh))
        || (faceRightBtnMesh && isDescendant(target, faceRightBtnMesh))
        || (crankshaft && isDescendant(target, crankshaft))));
    renderer.domElement.style.cursor = actionable ? 'pointer' : '';
    if (cardProxies.size && !proxyTarget) {
      if (lastHoveredCard) setCardHover(lastHoveredCard, false);
      lastHoveredCard = null;
      return;
    }
    const cardRoot = proxyTarget
      || (hit && isDescendant(hit.object, skillGroup) ? getCardRoot(hit.object) : null);
    if (cardRoot === lastHoveredCard) return;
    if (lastHoveredCard) setCardHover(lastHoveredCard, false);
    lastHoveredCard = cardRoot || null;
    if (lastHoveredCard) setCardHover(lastHoveredCard, true);
  }

  function handleCardClick(event) {
    if (!activeCamera || !skillGroup) return false;
    const hit = getTopHitFiltered(event, (hitEntry) => {
      if (!cardProxies.size) return true;
      if (!skillGroup) return true;
      if (!isDescendant(hitEntry.object, skillGroup)) return true;
      return isProxyDescendant(hitEntry.object);
    });
    const proxyTarget = hit ? getProxyCardTarget(hit.object) : null;
    if (!hit) return false;
    if (cardProxies.size && !proxyTarget) return false;
    if (!proxyTarget && !isDescendant(hit.object, skillGroup)) return false;
    const cardRoot = proxyTarget || getCardRoot(hit.object);
    if (!cardRoot) return false;
    const state = cardStates.get(cardRoot) || { isFlipped: false, isSelected: false };
    if (event.shiftKey) {
      state.isSelected = !state.isSelected;
      cardStates.set(cardRoot, state);
      setCardSelectionVisual(cardRoot, state.isSelected);
      return true;
    }
    state.isFlipped = !state.isFlipped;
    cardStates.set(cardRoot, state);
    // A click pins the hover preview until the pointer leaves this card.
    state.hoverPinned = !!state.isHovered;
    updateCardSide(cardRoot);
    return true;
  }

  scope.listen(renderer.domElement, "pointerdown", (event) => {
    if (event.button === 1 && modelPivot && defaultTarget) {
      event.preventDefault();
      middlePointer = { x: event.clientX, y: event.clientY, at: performance.now(), moved: 0 };
      return;
    }
    if (event.button === 2) {
      rightPointer = { x: event.clientX, y: event.clientY, at: performance.now(), moved: 0 };
      startModelDrag(event);
      return;
    }
    if (event.button !== 0) return;
    const buttonHit = getTopHit(event);
    if (flipAllButton && buttonHit && isDescendant(buttonHit.object, flipAllButton)) {
      flipAllCards();
      return;
    }
    if (startCrankDrag(event)) return;
    if (handleMeshClick(event)) return;
    handleCardClick(event);
  });
  scope.listen(renderer.domElement, "pointerleave", () => {
    renderer.domElement.style.cursor = '';
    if (lastHoveredCard) {
      setCardHover(lastHoveredCard, false);
      lastHoveredCard = null;
    }
  });
  function finishPointerInteraction(event) {
    if (event.type === 'pointercancel') {
      middlePointer = rightPointer = null;
      lastMiddleClick = lastRightClick = 0;
    }
    const now = performance.now();
    if (event.button === 1 && middlePointer) {
      const moved = Math.max(middlePointer.moved, Math.hypot(event.clientX - middlePointer.x, event.clientY - middlePointer.y));
      if (now - middlePointer.at <= 240 && moved <= 6) {
        if (now - lastMiddleClick <= 320 && defaultTarget) {
          activeCamera.position.add(defaultTarget.clone().sub(controls.target));
          controls.target.copy(defaultTarget);
          controls.update();
          lastMiddleClick = 0;
        } else lastMiddleClick = now;
      } else lastMiddleClick = 0;
      middlePointer = null;
    }
    if (event.button === 2 && rightPointer) {
      const moved = rightPointer.moved + Math.hypot(event.clientX - rightPointer.x, event.clientY - rightPointer.y);
      if (now - rightPointer.at <= 240 && moved <= 6) {
        if (now - lastRightClick <= 320 && defaultDirection) {
          spinX = spinY = crankAngle = crankTargetAngle = 0;
          const distance = activeCamera.position.distanceTo(controls.target);
          activeCamera.position.copy(controls.target).addScaledVector(defaultDirection, distance);
          controls.update();
          lastRightClick = 0;
        } else lastRightClick = now;
      } else lastRightClick = 0;
      rightPointer = null;
    }
    if (isDraggingCrank && (crankPointerId == null || event.pointerId === crankPointerId)) {
      isDraggingCrank = false;
      lastCrankPoint = null;
      crankDragDirection = 0;
      crankPointerId = null;
      scheduleCrankGuideHide();
    }
    if (isDraggingModel && (modelPointerId == null || event.pointerId === modelPointerId)) {
      isDraggingModel = false;
      lastModelPointer = null;
      modelPointerId = null;
      renderer.domElement.classList.remove("is-rotating");
    }
    if (renderer.domElement.hasPointerCapture?.(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    renderer.domElement.style.cursor = '';
  }
  scope.listen(window, "pointerup", finishPointerInteraction);
  scope.listen(window, "pointercancel", finishPointerInteraction);
  scope.listen(window, "pointermove", (event) => {
    if (middlePointer && modelPivot) {
      const dx = event.clientX - middlePointer.x;
      const dy = event.clientY - middlePointer.y;
      middlePointer.moved += Math.hypot(dx, dy);
      middlePointer.x = event.clientX;
      middlePointer.y = event.clientY;
      const height = Math.max(1, renderer.domElement.clientHeight);
      const distance = activeCamera.position.distanceTo(controls.target);
      const scale = activeCamera.isPerspectiveCamera
        ? 2 * distance * Math.tan(THREE.MathUtils.degToRad(activeCamera.fov * 0.5)) / height
        : (activeCamera.top - activeCamera.bottom) / (height * activeCamera.zoom);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(activeCamera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(activeCamera.quaternion);
      const offset = right.multiplyScalar(-dx * scale).addScaledVector(up, dy * scale);
      activeCamera.position.add(offset);
      controls.target.add(offset);
      controls.update();
      event.preventDefault();
      return;
    }
    if (isDraggingCrank && crankshaft) {
      const center = crankDragCenter;
      if (!center) return;
      const currentPoint = { x: event.clientX - center.cx, y: event.clientY - center.cy };
      if (!lastCrankPoint) {
        lastCrankPoint = currentPoint;
        return;
      }
      const previousRadius = Math.hypot(lastCrankPoint.x, lastCrankPoint.y);
      const currentRadius = Math.hypot(currentPoint.x, currentPoint.y);
      if (previousRadius < 12 || currentRadius < 12) {
        lastCrankPoint = currentPoint;
        return;
      }
      const cross = lastCrankPoint.x * currentPoint.y - lastCrankPoint.y * currentPoint.x;
      const dot = lastCrankPoint.x * currentPoint.x + lastCrankPoint.y * currentPoint.y;
      const rawDelta = Math.atan2(cross, dot);
      if (Math.abs(rawDelta) > 0.001) {
        const direction = Math.sign(rawDelta);
        const travel = Math.min(Math.abs(rawDelta), 0.65);
        if (!crankDragDirection) crankDragDirection = direction;
        if (direction !== crankDragDirection) {
          crankReverseTravel += travel;
          // Ignore small wobbles; sustained reverse travel changes direction.
          if (crankReverseTravel >= 0.35) {
            crankDragDirection = direction;
            crankReverseTravel = 0;
            crankTargetAngle = crankAngle;
          }
        } else crankReverseTravel = 0;
        crankTargetAngle += travel * crankDragDirection;
        crankTargetAngle = THREE.MathUtils.clamp(crankTargetAngle, crankAngle - 0.8, crankAngle + 0.8);
      }
      lastCrankPoint = currentPoint;
      event.preventDefault();
      return;
    }
    if (isDraggingModel && lastModelPointer) {
      const dx = event.clientX - lastModelPointer.x;
      const dy = event.clientY - lastModelPointer.y;
      if (rightPointer) {
        rightPointer.moved += Math.hypot(dx, dy);
        rightPointer.x = event.clientX;
        rightPointer.y = event.clientY;
      }
      modelDragDistance += Math.hypot(dx, dy);
      lastModelPointer = { x: event.clientX, y: event.clientY };
      if (modelDragDistance >= 3) {
        spinY = THREE.MathUtils.clamp(spinY + dx * 0.008, -maxSideTilt, maxSideTilt);
        spinX += dy * 0.008;
      }
      event.preventDefault();
      return;
    }
    handleCardHover(event);
  });
  scope.listen(window, "keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (event.target?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return;
    const key = event.key.toLowerCase();
    if (key === 'a') { event.preventDefault(); flipAllCards(); return; }
    if (key === 'l' || key === 'r') { event.preventDefault(); rotateFaces(key === 'r' ? 1 : -1); return; }
    if (key !== 'f') return;
    const selected = Array.from(cardStates.entries()).filter((entry) => entry[1].isSelected);
    if (!selected.length) return;
    event.preventDefault();

    selected.forEach(([cardRoot, state]) => {
      state.isFlipped = !state.isFlipped;
      cardStates.set(cardRoot, state);
      updateCardSide(cardRoot);
    });
  });

  resize();
  animate();
  if (isLocalDev() || new URLSearchParams(window.location.search || "").has("assetsDebug")) {
corsProbe("assets/glb/about-cube.glb");
    corsProbe("../assets/computer-app-icons/Ableton Live.png");
    corsProbe("../assets/computer-app-icons/backs/Ableton Live_back.png");
  }

  function disposeGraph(root, geometries = new Set(), materials = new Set(), textures = new Set()) {
    root?.traverse(object => {
      if (object.userData?.flashTimer) clearTimeout(object.userData.flashTimer);
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material || materials.has(material)) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  }

  function disposeDocs() {
    if (disposed) return;
    disposed = true;
    suspended = true;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    if (crankGuideHideTimer !== null) clearTimeout(crankGuideHideTimer);
    crankGuideHideTimer = null;
    controls.dispose();
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set(textureCache.values());
    for (const root of [scene, crankGuideScene]) {
      root?.traverse(object => {
        if (object.userData?.flashTimer) clearTimeout(object.userData.flashTimer);
        if (object.geometry) geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!material || materials.has(material)) continue;
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
    }
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    textureCache.clear();
    cardProxies.clear();
    cardStates.clear();
    rotationTweens.clear();
    environmentTarget.dispose();
    pmrem.dispose();
    draco.dispose();
    renderer.dispose();
    crankGuideRenderer.dispose();
    renderer.domElement.remove();
    crankGuide.remove();
    status.remove();
  }

  return {
    suspend() {
      suspended = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      if (crankGuideHideTimer !== null) clearTimeout(crankGuideHideTimer);
      crankGuideHideTimer = null;
      crankGuide.classList.remove('is-visible');
    },
    resume() {
      if (disposed || !suspended) return;
      suspended = false;
      lastCrankFrame = performance.now();
      resize();
      animate();
    }
  };
} }).catch(error => console.error('Shared bootstrap failed', error));
