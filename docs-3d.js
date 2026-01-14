import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const mount = document.getElementById("glb-viewer");
if (!mount) {
  console.warn("No #glb-viewer element found.");
} else {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  renderer.setClearColor(0x000000, 0);

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
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
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
  let skillGroup = null;
  let spinX = 0;
  const rotationTweens = new Map();
  const quarterTurn = Math.PI / 2;
  const FRONT_FILL = 0.65;
  const BACK_FILL = 0.8;
  const CARD_CONFIG_URL = "icon-colors.json";
  const CARD_COLOR_URL = "card-skill-colors.json";
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
  const textureCache = new Map();
  const skillCards = [];
  const cardStates = new Map();
  let lastFlipDirection = 1;
  const textureLoader = new THREE.TextureLoader();

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

  function findNamedAncestor(obj, names) {
    let current = obj;
    while (current) {
      if (names.includes(current.name)) return current;
      current = current.parent;
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

  function getTexture(url, fill) {
    if (!url) return null;
    if (textureCache.has(url)) return textureCache.get(url);
    const tex = textureLoader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const scale = typeof fill === "number" ? fill : 1;
    tex.repeat.set(scale, scale);
    tex.offset.set((1 - scale) / 2, (1 - scale) / 2);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    textureCache.set(url, tex);
    return tex;
  }

  function getCardRoot(obj) {
    let current = obj;
    while (current) {
      if (current.name && current.name.toLowerCase().startsWith("skill-card")) return current;
      current = current.parent;
    }
    return null;
  }

  function collectSkillCards() {
    skillCards.length = 0;
    if (!modelRoot) return;
    const seen = new Set();
    modelRoot.traverse((child) => {
      if (!child.name) return;
      const name = child.name.toLowerCase();
      if (!name.startsWith("skill-card.")) return;
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

  function setCardSelectionVisual(cardRoot, selected) {
    cardRoot.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat || !mat.name || !mat.name.toLowerCase().includes("card-side")) return;
        if (!child.userData.sideBaseColor && mat.color) {
          child.userData.sideBaseColor = mat.color.clone();
        }
        if (mat.emissive) {
          mat.emissive.setHex(selected ? 0x2a7dff : 0x000000);
          mat.emissiveIntensity = selected ? 0.25 : 0;
          mat.needsUpdate = true;
        }
      });
    });
  }

  function getCardBaseColor(cardKey, config) {
    if (cardColorConfig && Object.prototype.hasOwnProperty.call(cardColorConfig, cardKey)) {
      const entry = cardColorConfig[cardKey];
      if (typeof entry === "string") return new THREE.Color(entry);
      if (entry && typeof entry === "object") {
        const candidate = entry.text || entry.textColor || entry.color || entry.base;
        if (typeof candidate === "string") return new THREE.Color(candidate);
      }
    }
    if (config && config.backText) return new THREE.Color(config.backText);
    return null;
  }

  function applyCardTextures() {
    if (!modelRoot || !cardConfig) return;
    collectSkillCards();
    skillCards.forEach((card, index) => {
      const cardKey = card.userData.cardKey || cardOrder[index];
      const config = cardConfig[cardKey];
      if (!config) return;
      const frontFill = typeof config.frontFill === "number" ? config.frontFill : FRONT_FILL;
      const backFill = typeof config.backFill === "number" ? config.backFill : BACK_FILL;
      const frontTex = getTexture(config.frontPng, frontFill);
      const backTex = getTexture(config.backPng, backFill);
      const baseColor = getCardBaseColor(cardKey, config);
      const sideColor = baseColor;
      const backColor = baseColor;
      card.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!mat || !mat.name) return;
          const matName = mat.name.toLowerCase();
          if ((matName.includes("card-back") || matName.includes("back")) && backTex) {
            mat.map = backTex;
            if (backColor && mat.color) mat.color.copy(backColor);
            mat.needsUpdate = true;
          } else if ((matName.includes("card-app") || matName.includes("app") || matName.includes("front")) && frontTex) {
            mat.map = frontTex;
            if (baseColor && mat.color) mat.color.copy(baseColor);
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
      if (card.userData && typeof card.userData.restX !== "number") {
        card.userData.restX = snapToIncrement(card.rotation.x, Math.PI);
      }
    });
  }

  Promise.all([
    fetch(CARD_CONFIG_URL).then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${CARD_CONFIG_URL}`);
      return response.json();
    }),
    fetch(CARD_COLOR_URL)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
  ])
    .then(([configData, colorData]) => {
      cardConfig = configData;
      cardColorConfig = colorData;
      applyCardTextures();
    })
    .catch((error) => {
      console.warn("Skill card config load failed:", error);
    });

  function snapToIncrement(angle, increment) {
    const normalized = normalizeAngle(angle);
    return Math.round(normalized / increment) * increment;
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
    const snappedTarget = snapToIncrement(target, snapIncrement);
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
    const headerH = header ? header.getBoundingClientRect().height : 0;
    const desiredH = Math.max(240, Math.round(window.innerHeight - headerH));
    mount.style.setProperty("--glb-viewer-top", `${Math.max(0, Math.round(headerH))}px`);
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
  window.addEventListener("resize", resize);

  // IMPORTANT: set this path to your real GLB path
  const GLB_PATH = "glb/about-cube.glb";

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
  loader.setDRACOLoader(draco);
  loader.load(
    GLB_PATH,
    (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      // Add model
      modelRoot = gltf.scene;
      modelPivot = new THREE.Group();
      modelPivot.name = "modelPivot";
      modelPivot.add(modelRoot);
      scene.add(modelPivot);
      skillGroup = modelRoot.getObjectByName("skill-cards");

      // If the GLB includes a camera, use it
      if (gltf.cameras && gltf.cameras.length > 0) {
        activeCamera = gltf.cameras[0];
      } else {
        activeCamera = defaultCamera;
      }

      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
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
      const tintMaterials = (object3d, color, strength) => {
        if (!object3d) return;
        object3d.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (!mat || !mat.color) return;
            mat.color.lerp(color, strength);
          });
        });
      };
      const normalizeParagraphMaterial = (object3d) => {
        if (!object3d) return;
        object3d.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const normalized = materials.map((mat) => {
            const next = mat.clone();
            next.flatShading = true;
            next.normalMap = null;
            next.bumpMap = null;
            next.aoMap = null;
            next.lightMap = null;
            next.emissiveMap = null;
            if (next.emissive) next.emissive.setHex(0x000000);
            next.needsUpdate = true;
            return next;
          });
          child.material = Array.isArray(child.material) ? normalized : normalized[0];
          if (child.geometry) {
            child.geometry.computeVertexNormals();
            child.geometry.normalizeNormals();
          }
        });
      };
      normalizeParagraphMaterial(cubeParagraph);
      if (cubeParagraph) {
        const paragraphColor = new THREE.Color(0x2b4a6f);
        tintMaterials(cubeParagraph, paragraphColor, 0.55);
        cubeParagraph.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => applyTextureScale(mat, 30));
        });
      }
      cubeAbout = findObjectByNames(modelRoot, ["cube-about"]);
      crankshaft = findObjectByNames(modelRoot, ["crankshaft"]);
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

      status.remove();
      resize();
    },
    (xhr) => {
      // progress
      // console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    },
    (err) => {
      console.error("GLB load failed:", err);
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
    requestAnimationFrame(animate);
    if (modelPivot) {
      modelPivot.rotation.x = spinX;
    }
    if (crankshaft && modelPivot) {
      crankshaft.rotation.x = -2 * spinX;
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
      }
    });
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

  renderer.domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  renderer.domElement.addEventListener("wheel", (event) => {
    if (!modelRoot) return;
    event.preventDefault();
    const delta = Math.max(-120, Math.min(120, event.deltaY));
    if (event.ctrlKey || event.metaKey) {
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
  const faceAxis = "y";
  function rotateFaces(direction) {
    if (!cubeParagraph || !cubeFace) return;
    const paragraphAxisResolved = resolveAxis(cubeParagraph, paragraphAxis, "y");
    const faceAxisResolved = resolveAxis(cubeFace, faceAxis, "x");
    tweenRotation(cubeParagraph, paragraphAxisResolved, -direction, rotationDuration);
    tweenRotation(cubeFace, faceAxisResolved, -direction, rotationDuration);
  }

  if (faceRightBtn) {
    faceRightBtn.addEventListener("click", () => rotateFaces(1));
  }
  if (faceLeftBtn) {
    faceLeftBtn.addEventListener("click", () => rotateFaces(-1));
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let isDraggingCrank = false;
  let lastCrankAngle = null;
  let lastHoveredCard = null;

  function updatePointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return rect;
  }

  function getTopHit(event) {
    if (!activeCamera || !modelRoot) return null;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, activeCamera);
    const hits = raycaster.intersectObjects([modelRoot], true);
    return hits.length ? hits[0] : null;
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

  function startCrankDrag(event) {
    if (!crankshaftHandle || !activeCamera) return false;
    const hit = getTopHit(event);
    if (!hit || !isDescendant(hit.object, crankshaftHandle)) return false;
    const center = getCrankCenterScreen();
    if (!center) return false;
    isDraggingCrank = true;
    lastCrankAngle = Math.atan2(event.clientY - center.cy, event.clientX - center.cx);
    event.preventDefault();
    return true;
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

  function flipCard(cardRoot, direction) {
    if (!cardRoot) return;
    tweenRotation(cardRoot, "y", direction * 2, rotationDuration);
    lastFlipDirection = direction;
  }

  function getCardRestX(cardRoot) {
    if (!cardRoot) return 0;
    const current = typeof cardRoot.userData.restX === "number"
      ? cardRoot.userData.restX
      : snapToIncrement(cardRoot.rotation.x, Math.PI);
    cardRoot.userData.restX = current;
    return current;
  }

  function setCardHover(cardRoot, hovered) {
    if (!cardRoot) return;
    const state = cardStates.get(cardRoot) || { isFlipped: false, isSelected: false };
    if (state.isHovered === hovered) return;
    state.isHovered = hovered;
    const base = getCardRestX(cardRoot);
    cardStates.set(cardRoot, state);
    const target = hovered ? base + Math.PI : base;
    tweenRotationTo(cardRoot, "x", target, hoverRotationDuration, Math.PI);
  }

  function handleCardHover(event) {
    if (!activeCamera || !skillGroup) return;
    const hit = getTopHit(event);
    const cardRoot = hit && isDescendant(hit.object, skillGroup) ? getCardRoot(hit.object) : null;
    if (cardRoot === lastHoveredCard) return;
    if (lastHoveredCard) setCardHover(lastHoveredCard, false);
    lastHoveredCard = cardRoot || null;
    if (lastHoveredCard) setCardHover(lastHoveredCard, true);
  }

  function handleCardClick(event) {
    if (!activeCamera || !skillGroup) return false;
    const hit = getTopHit(event);
    if (!hit || !isDescendant(hit.object, skillGroup)) return false;
    const cardRoot = getCardRoot(hit.object);
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
    flipCard(cardRoot, state.isFlipped ? 1 : -1);
    return true;
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (startCrankDrag(event)) return;
    if (handleMeshClick(event)) return;
    handleCardClick(event);
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    if (lastHoveredCard) {
      setCardHover(lastHoveredCard, false);
      lastHoveredCard = null;
    }
  });
  window.addEventListener("pointerup", () => {
    isDraggingCrank = false;
    lastCrankAngle = null;
  });
  window.addEventListener("pointermove", (event) => {
    if (isDraggingCrank && crankshaft) {
      const center = getCrankCenterScreen();
      if (!center) return;
      const angle = Math.atan2(event.clientY - center.cy, event.clientX - center.cx);
      if (lastCrankAngle == null) {
        lastCrankAngle = angle;
        return;
      }
      let delta = angle - lastCrankAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      spinX -= delta * 0.5;
      lastCrankAngle = angle;
      event.preventDefault();
      return;
    }
    handleCardHover(event);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "f" && event.key !== "F") return;
    const selected = Array.from(cardStates.entries()).filter((entry) => entry[1].isSelected);
    if (!selected.length) return;
    const direction = -lastFlipDirection || -1;
    selected.forEach(([cardRoot, state]) => {
      state.isFlipped = !state.isFlipped;
      cardStates.set(cardRoot, state);
      flipCard(cardRoot, direction);
    });
  });

  resize();
  animate();
}
