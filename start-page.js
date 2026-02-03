import { assetUrl, isLocalDev } from "./assets-config.js";
import { loadDebugIfEnabled } from "./debug/debug-loader.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const isLocalHost = isLocalDev();
const SETTINGS_CONTROLLER_GLB = assetUrl("glb/settings-controller.glb");
let settingsControllerReadyResolve = () => {};
let hasSignaledSettingsControllerReady = false;
const settingsControllerReady = new Promise((resolve) => {
    settingsControllerReadyResolve = resolve;
});
const settingsControllerBridge = {
    ready: settingsControllerReady,
    scene: null,
    renderer: null,
    camera: null,
    model: null,
    controls: null,
    canvas: null
};
function signalSettingsControllerReady() {
    if (hasSignaledSettingsControllerReady) return;
    hasSignaledSettingsControllerReady = true;
    settingsControllerReadyResolve(settingsControllerBridge);
}
if (typeof window !== "undefined") {
    window.settingsController = settingsControllerBridge;
}
if (isLocalHost) {
    window.setAssetsBase = (urlOrBlank) => {
        if (!urlOrBlank) {
            localStorage.removeItem("ASSETS_BASE");
        } else {
            localStorage.setItem("ASSETS_BASE", String(urlOrBlank));
        }
        location.reload();
    };
    window.clearAssetsBase = () => {
        localStorage.removeItem("ASSETS_BASE");
        location.reload();
    };
}
// Bind controls to SiteA11y and implement jump UI with visualizer
(function(){
    // Helper storage keys
    const AUDIO_ALLOWED_KEY = 'site.audio.allowed';
    const AUDIO_VOLUME_KEY = 'site.audio.volume';
    const AUDIO_SYNC_KEY = 'site.audio.sync';
    const AUDIO_MUTED_KEY = 'site.audio.muted';

    // File paths (relative to site root)
    const MEDIA = {
        counts: {
            video: assetUrl('Videos/start-page/counting-hq.webm'),
            audio: assetUrl('Videos/start-page/counting.opus')
        },
        alphabet: {
            video: assetUrl('Videos/start-page/alphabet-hq.webm'),
            audio: assetUrl('Videos/start-page/alphabet.opus')
        }
    };

    // Elements
    const saveBtn = document.getElementById('save_a11y');
    const resetBtn = document.getElementById('reset_a11y');
    const permModal = document.getElementById('permissionModal');
    const permAllow = document.getElementById('permAllow');
    const permDeny = document.getElementById('permDeny');
    const jumpContainer = document.getElementById('jumpContainer');
    const jumpVideo = document.getElementById('jumpVideo');
    const jumpAudio = document.getElementById('jumpAudio');
    const syncSlider = document.getElementById('syncSlider');
    const syncLeft = document.getElementById('syncLeft');
    const syncRight = document.getElementById('syncRight');
    const syncDisplay = document.getElementById('syncDisplay');
    const volumeSlider = document.getElementById('volumeSlider');
    const volDown = document.getElementById('volDown');
    const volUp = document.getElementById('volUp');
    const volumeDisplay = document.getElementById('volumeDisplay');
    const tabNumbers = document.getElementById('tab-numbers');
    const tabAlphabet = document.getElementById('tab-alphabet');
    const nextBtn = document.getElementById('nextBtn');
    const a11ySection = document.getElementById('a11ySection');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const leadText = document.getElementById('leadText');
    const settingsControllerScene = document.getElementById('settingsControllerScene');
    const settingsControllerCanvas = document.getElementById('settingsControllerCanvas');
    const settingsControllerStatus = document.getElementById('settingsControllerStatus');
    const settingsControllerGridCols = null;
    const settingsControllerGridRows = null;
    const settingsControllerInfo = null;

        const topTabA11y = document.getElementById('topTabA11y');
        const topTabAudio = document.getElementById('topTabAudio');
        const tabInfo = document.getElementById('tabInfo');
        const debugZoomValue = document.getElementById('debugZoomValue');
        const debugFrameValue = document.getElementById('debugFrameValue');
        const debugFramePercent = document.getElementById('debugFramePercent');
        const debugRotXValue = document.getElementById('debugRotXValue');
        const debugRotYValue = document.getElementById('debugRotYValue');
        const debugRotZValue = document.getElementById('debugRotZValue');
        const debugRotateEnabled = document.getElementById('debugRotateEnabled');
        const debugZoomEnabled = document.getElementById('debugZoomEnabled');
        const debugPanEnabled = document.getElementById('debugPanEnabled');
        const debugPosXValue = document.getElementById('debugPosXValue');
        const debugPosYValue = document.getElementById('debugPosYValue');
        const debugPosZValue = document.getElementById('debugPosZValue');
        const debugGlbXValue = document.getElementById('debugGlbXValue');
        const debugGlbYValue = document.getElementById('debugGlbYValue');
        const debugGlbZValue = document.getElementById('debugGlbZValue');

    function setTabInfo(text){
        if(tabInfo){
            tabInfo.textContent = text;
        }
    }

    function initSettingsControllerScene(){
        if(!settingsControllerScene || !settingsControllerCanvas){
            signalSettingsControllerReady();
            return;
        }
        if(settingsControllerBridge.renderer) return;
        settingsControllerScene.classList.add('controller-loading');

        const renderer = new THREE.WebGLRenderer({
            canvas: settingsControllerCanvas,
            antialias: true,
            alpha: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x0f1115, 0);

        const scene = new THREE.Scene();

        const fallbackCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        fallbackCamera.position.set(0, 1.6, 4);
        let activeCamera = fallbackCamera;

        const ambient = new THREE.HemisphereLight(0xffffff, 0x0f1115, 0.6);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(2, 4, 3);
        scene.add(ambient, dirLight);

        const controls = new OrbitControls(activeCamera, renderer.domElement);
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.autoRotate = false;
        controls.autoRotateSpeed = 0.5;
        controls.minDistance = 0.05;
        controls.maxDistance = Infinity;
        controls.target.set(0, 1, 0);
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };

        function setUserCameraControlsEnabled(isEnabled){
            if(!controls) return;
            console.log('[settings controls]', isEnabled ? 'enabled' : 'disabled');
            controls.enabled = !!isEnabled;
            controls.enableRotate = !!isEnabled;
            controls.enableZoom = !!isEnabled;
            controls.enablePan = false;
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE
            };
            controls.update();
        }

        setUserCameraControlsEnabled(false);

        let camAnimDebugEl = document.getElementById('camAnimDebug');
        if(!camAnimDebugEl){
            camAnimDebugEl = document.createElement('div');
            camAnimDebugEl.id = 'camAnimDebug';
            camAnimDebugEl.style.cssText = `
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 99999;
        font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        background: rgba(0,0,0,0.65);
        color: #d8ffef;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 10px;
        padding: 10px 12px;
        max-width: 460px;
        white-space: pre;
        pointer-events: none;
    `;
            document.body.appendChild(camAnimDebugEl);
        }
        let camAnimDebugVisible = true;
        const camAnimLog = [];
        const MAX_CAM_LOG = 16;
        const logCamEvent = (message) => {
            const stamp = (performance.now() / 1000).toFixed(2);
            camAnimLog.push(`${stamp}s ${message}`);
            if(camAnimLog.length > MAX_CAM_LOG){
                camAnimLog.shift();
            }
        };
        if(settingsBtn){
            settingsBtn.addEventListener('click', () => {
                camAnimDebugVisible = !camAnimDebugVisible;
                camAnimDebugEl.style.display = camAnimDebugVisible ? '' : 'none';
            });
        }

        let uiMixer = null;
        let cameraMixer = null;
        let usesGltfCamera = false;
        let clip = null;
        let uiAction = null;
        let cameraAction = null;
        let cameraTargetTime = null;
        let targetTime = null;
        let animationJumpBackFrame = null;
        const TOTAL_FRAMES = 90;
        const ACCESSIBILITY_FRAME = 1;
        const AUDIO_FRAME = 15;
        const RETURN_FRAME = 30;
        const FRAME_EPSILON = 0.1;
        let introActive = true;
        let screenCanvas = null;
        let screenCtx = null;
        let screenTexture = null;
        let okRect = { x: 0.4, y: 0.72, w: 0.2, h: 0.12 };
        const clock = new THREE.Clock();
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const interactiveNames = new Set(['btn-accessibility', 'btn-vol-sync', 'btn-save']);
        const glbBounds = new THREE.Box3();
        const glbCenter = new THREE.Vector3();
        const CAMERA_ANIM_FRAMES = 120;
        // Multiplier for manual camera tween length. 1 = original speed.
        const CAMERA_ANIM_SPEED_MULTIPLIER = 5;
        const CAMERA_ANIM_EXPECTED_FPS = 60;
        let cameraEnableTimer = null;
        let shouldTrackControls = false;
        let lastControlsEnabled = null;
        const FORCE_MANUAL_CAMERA = true;
        const CAMERA_ANIM_POS = [
            [-0.005232, 4.233088, 1.427375],
            [-0.005232, 4.233088, 1.427375],
            [-0.005232, 4.233088, 1.427375],
            [-0.005232, 4.233088, 1.427375],
            [-0.005232, 4.233088, 1.427375],
            [-0.024937, 4.239168, 1.466424],
            [-0.081893, 4.256743, 1.57929],
            [-0.172859, 4.284814, 1.759556],
            [-0.294598, 4.322381, 2.000803],
            [-0.44387, 4.368443, 2.29661],
            [-0.617436, 4.422002, 2.64056],
            [-0.812056, 4.482059, 3.026232],
            [-1.024492, 4.547612, 3.44721],
            [-1.251503, 4.617664, 3.897073],
            [-1.489852, 4.691214, 4.369401],
            [-1.736299, 4.767263, 4.857778],
            [-1.987605, 4.844811, 5.355783],
            [-2.24053, 4.92286, 5.856997],
            [-2.491836, 5.000408, 6.355002],
            [-2.738283, 5.076457, 6.843379],
            [-2.976633, 5.150007, 7.315707],
            [-3.203645, 5.220058, 7.76557],
            [-3.41608, 5.285612, 8.186548],
            [-3.610701, 5.345668, 8.57222],
            [-3.784266, 5.399227, 8.916171],
            [-3.933537, 5.44529, 9.211979],
            [-4.055277, 5.482856, 9.453225],
            [-4.146243, 5.510927, 9.633491],
            [-4.203199, 5.528502, 9.746358],
            [-4.222904, 5.534583, 9.785406]
        ];
        const CAMERA_ANIM_ROT = [
            [-0.612905, -0.001839, -0.001426, 0.790153],
            [-0.590093, -0.012765, -0.009332, 0.80718],
            [-0.567535, -0.023725, -0.016364, 0.822845],
            [-0.545317, -0.03465, -0.022569, 0.837209],
            [-0.523517, -0.045477, -0.027998, 0.85034],
            [-0.502206, -0.056148, -0.032701, 0.862303],
            [-0.481449, -0.066613, -0.036729, 0.873167],
            [-0.461303, -0.076827, -0.040137, 0.882998],
            [-0.44182, -0.086748, -0.042974, 0.891865],
            [-0.423046, -0.096343, -0.045295, 0.899832],
            [-0.405021, -0.10558, -0.047149, 0.906966],
            [-0.387782, -0.114432, -0.048586, 0.913329],
            [-0.371359, -0.122878, -0.049655, 0.918982],
            [-0.35578, -0.130897, -0.050402, 0.923984],
            [-0.341068, -0.138474, -0.050872, 0.928391],
            [-0.327243, -0.145596, -0.051108, 0.932256],
            [-0.314321, -0.152252, -0.051149, 0.935631],
            [-0.302318, -0.158433, -0.051033, 0.938562],
            [-0.291245, -0.164132, -0.050795, 0.941094],
            [-0.281111, -0.169344, -0.050468, 0.943267],
            [-0.271924, -0.174066, -0.050081, 0.945119],
            [-0.263692, -0.178293, -0.049663, 0.946684],
            [-0.25642, -0.182026, -0.049236, 0.947993],
            [-0.25011, -0.185262, -0.048822, 0.949073],
            [-0.244767, -0.188, -0.048441, 0.949947],
            [-0.240392, -0.19024, -0.048107, 0.950634],
            [-0.236988, -0.191983, -0.047834, 0.951152],
            [-0.234556, -0.193227, -0.047632, 0.951513],
            [-0.233097, -0.193974, -0.047508, 0.951726],
            [-0.23261, -0.194223, -0.047466, 0.951797]
        ];
        let cameraTween = null;
        let lastCameraFrame = null;

        function frameToTime(frame){
            if(!clip) return 0;
            const clamped = Math.min(Math.max(frame, 1), TOTAL_FRAMES);
            return ((clamped - 1) / (TOTAL_FRAMES - 1)) * clip.duration;
        }

        function timeToFrame(time){
            if(!clip) return 1;
            const ratio = clip.duration ? time / clip.duration : 0;
            return 1 + ratio * (TOTAL_FRAMES - 1);
        }

        function setFrame(frame){
            if(!uiAction || !uiMixer) return;
            uiAction.paused = true;
            uiAction.time = frameToTime(frame);
            uiMixer.setTime(uiAction.time);
        }

        function frameToClipTime(frame, clipItem){
            if(!clipItem) return 0;
            const clamped = Math.min(Math.max(frame, 1), TOTAL_FRAMES);
            return ((clamped - 1) / (TOTAL_FRAMES - 1)) * clipItem.duration;
        }

        function getCameraHoldTime(clipItem){
            if(!clipItem) return 0;
            const base = frameToClipTime(RETURN_FRAME, clipItem);
            const end = Math.max(0, clipItem.duration - 1e-4);
            return Math.min(base, end);
        }

        function setCameraFrame(frame){
            if(!cameraAction || !cameraMixer) return;
            cameraAction.enabled = true;
            cameraAction.paused = true;
            cameraAction.time = frameToClipTime(frame, cameraAction.getClip());
            cameraMixer.setTime(cameraAction.time);
        }

        function syncControlsToCamera(model){
            if(!controls || !activeCamera) return;
            logCamEvent('syncControlsToCamera()');
            let center = new THREE.Vector3(0, 0, 0);
            if(model){
                const bounds = new THREE.Box3().setFromObject(model);
                center = bounds.getCenter(new THREE.Vector3());
            }
            controls.target.copy(center);
            controls.update();
        }

        function startManualCameraTween(){
            if(!activeCamera) return;
            logCamEvent('startManualCameraTween()');
            const camPos = new THREE.Vector3();
            const camDir = new THREE.Vector3();
            activeCamera.getWorldPosition(camPos);
            activeCamera.getWorldDirection(camDir);
            const camQuat = new THREE.Quaternion();
            activeCamera.getWorldQuaternion(camQuat);
            if(activeCamera.parent && activeCamera.parent !== scene){
                scene.add(activeCamera);
                activeCamera.position.copy(camPos);
                activeCamera.quaternion.copy(camQuat);
                activeCamera.rotation.setFromQuaternion(camQuat, 'XYZ');
            }
            const currentTarget = controls?.target ? controls.target.clone() : camPos.clone().add(camDir.multiplyScalar(2.5));
            const targetDistance = camPos.distanceTo(currentTarget);
            cameraTween = {
                frame: 0,
                targetDistance: Number.isFinite(targetDistance) && targetDistance > 0.001 ? targetDistance : 2.5
            };
            lastCameraFrame = 0;
            setUserCameraControlsEnabled(false);
        }

        function getManualCameraTotalFrames(){
            return Math.max(2, Math.round(CAMERA_ANIM_FRAMES * CAMERA_ANIM_SPEED_MULTIPLIER));
        }

        function stepManualCameraTween(){
            if(!cameraTween || !activeCamera) return false;
            const total = getManualCameraTotalFrames();
            const sampleMax = CAMERA_ANIM_POS.length - 1;
            const t = Math.min(1, Math.max(0, cameraTween.frame / (total - 1)));
            const sampleIndex = t * sampleMax;
            const idx0 = Math.floor(sampleIndex);
            const idx1 = Math.min(sampleMax, idx0 + 1);
            const s = sampleIndex - idx0;
            const pos0 = CAMERA_ANIM_POS[idx0];
            const pos1 = CAMERA_ANIM_POS[idx1];
            const rot0 = CAMERA_ANIM_ROT[idx0];
            const rot1 = CAMERA_ANIM_ROT[idx1];
            if(pos0 && pos1){
                activeCamera.position.set(
                    pos0[0] + (pos1[0] - pos0[0]) * s,
                    pos0[1] + (pos1[1] - pos0[1]) * s,
                    pos0[2] + (pos1[2] - pos0[2]) * s
                );
            }
            if(rot0 && rot1){
                const q0 = new THREE.Quaternion(rot0[0], rot0[1], rot0[2], rot0[3]);
                const q1 = new THREE.Quaternion(rot1[0], rot1[1], rot1[2], rot1[3]);
                activeCamera.quaternion.copy(q0.slerp(q1, s));
            }
            activeCamera.updateMatrixWorld(true);
            cameraTween.frame += 1;
            if(cameraTween.frame >= total){
                logCamEvent('stepManualCameraTween() complete');
                activeCamera.updateMatrixWorld(true);
                const model = settingsControllerBridge.model;
                const box = new THREE.Box3().setFromObject(model);
                const glbCenter = box.getCenter(new THREE.Vector3());
                const endPos = activeCamera.position.clone();
                const endQuat = activeCamera.quaternion.clone();
                const wasDamping = controls.enableDamping;
                controls.enableDamping = false;
                controls.target.copy(glbCenter);
                activeCamera.position.copy(endPos);
                activeCamera.quaternion.copy(endQuat);
                activeCamera.updateMatrixWorld(true);
                controls.update();
                controls.update();
                controls.enableDamping = wasDamping;
                cameraTween = null;
                lastCameraFrame = total - 1;
                shouldTrackControls = true;
                usesGltfCamera = false;
                setUserCameraControlsEnabled(true);
                lastControlsEnabled = controls.enabled;
            }
            return true;
        }

        function activateOrbitCameraFromActive(model){
            if(!activeCamera) return;
            logCamEvent('activateOrbitCameraFromActive()');
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            activeCamera.getWorldPosition(worldPos);
            activeCamera.getWorldQuaternion(worldQuat);

            const orbitCamera = new THREE.PerspectiveCamera(
                activeCamera.fov || 45,
                activeCamera.aspect || 1,
                activeCamera.near || 0.01,
                activeCamera.far || 1000
            );
            orbitCamera.position.copy(worldPos);
            orbitCamera.quaternion.copy(worldQuat);
            orbitCamera.updateMatrixWorld(true);

            activeCamera = orbitCamera;
            controls.object = activeCamera;
            usesGltfCamera = false;
            syncControlsToCamera(model);
            settingsControllerBridge.camera = activeCamera;
        }

        function finalizeCameraAnimation(model){
            if(!cameraAction || !cameraMixer) return;
            const target = cameraTargetTime !== null
                ? cameraTargetTime
                : getCameraHoldTime(cameraAction.getClip());
            // Force the pose to the very last frame and HOLD it.
            cameraAction.enabled = true;
            cameraAction.paused = true;
            cameraAction.time = target;

            // Make sure the mixer applies that pose immediately.
            cameraMixer.setTime(target);
            cameraMixer.update(0);
            if(activeCamera){
                activeCamera.updateMatrixWorld(true);
            }
            if(model){
                model.updateMatrixWorld(true);
            }
            usesGltfCamera = false;
            setUserCameraControlsEnabled(true);
            syncControlsToCamera(model);
            cameraTargetTime = null;
        }

        function startAnimationToFrame(frame, jumpBackFrame = null){
            if(!uiAction || !clip || !uiMixer) return;
            const desiredTime = frameToTime(frame);
            if(Math.abs(uiAction.time - desiredTime) <= FRAME_EPSILON){
                if(jumpBackFrame !== null){
                    setFrame(jumpBackFrame);
                }
                return;
            }
            targetTime = desiredTime;
            animationJumpBackFrame = jumpBackFrame;
            uiAction.paused = false;
        }

        function isAtFrame(frame){
            return Math.abs(timeToFrame(uiAction?.time || 0) - frame) <= 0.6;
        }

        function setAccessibilityView(){
            if(isAtFrame(ACCESSIBILITY_FRAME)) return;
            if(isAtFrame(AUDIO_FRAME)){
                startAnimationToFrame(RETURN_FRAME, ACCESSIBILITY_FRAME);
                return;
            }
            setFrame(ACCESSIBILITY_FRAME);
        }

        function setAudioView(){
            if(isAtFrame(AUDIO_FRAME)) return;
            startAnimationToFrame(AUDIO_FRAME, null);
        }

        settingsControllerBridge.setAccessibilityView = setAccessibilityView;
        settingsControllerBridge.setAudioView = setAudioView;

        setUserCameraControlsEnabled(false);

        let lastWidth = 0;
        let lastHeight = 0;
        function resizeScene(){
            const rect = settingsControllerScene.getBoundingClientRect();
            const maxDimension = 1200;
            const width = Math.min(Math.max(1, rect.width), maxDimension);
            const height = Math.min(Math.max(1, rect.height), maxDimension);
            if(width < 2 || height < 2) return;
            if(Math.abs(width - lastWidth) < 1 && Math.abs(height - lastHeight) < 1) return;
            lastWidth = width;
            lastHeight = height;
            renderer.setSize(width, height, false);
            if(activeCamera && activeCamera.isPerspectiveCamera){
                activeCamera.aspect = width / height;
                activeCamera.updateProjectionMatrix();
            }else if(activeCamera && activeCamera.isOrthographicCamera){
                activeCamera.updateProjectionMatrix();
            }
        }

        function fitCameraToModel(model){
            const bounds = new THREE.Box3().setFromObject(model);
            const size = bounds.getSize(new THREE.Vector3());
            const center = bounds.getCenter(new THREE.Vector3());
            const fitRatio = 0.85;
            const aspect = activeCamera.aspect || 1;
            const fitHeight = size.y || 1;
            const fitWidth = (size.x || 1) / aspect;
            const fitSize = Math.max(fitHeight, fitWidth);
            const fov = THREE.MathUtils.degToRad(activeCamera.fov);
            const distance = (fitSize * 0.5) / Math.tan(fov * 0.5) / fitRatio;
            activeCamera.position.set(center.x, center.y, center.z + distance);
            activeCamera.near = Math.max(0.01, distance / 100);
            activeCamera.far = distance * 100;
            activeCamera.updateProjectionMatrix();
            controls.target.copy(center);
            controls.update();
        }

        function fitTextureToUV(mesh, texture){
            if(!mesh || !texture || !mesh.geometry || !mesh.geometry.attributes) return;
            const uvAttr = mesh.geometry.attributes.uv;
            if(!uvAttr) return;
            let minU = Infinity;
            let minV = Infinity;
            let maxU = -Infinity;
            let maxV = -Infinity;
            for(let i = 0; i < uvAttr.count; i++){
                const u = uvAttr.getX(i);
                const v = uvAttr.getY(i);
                if(u < minU) minU = u;
                if(v < minV) minV = v;
                if(u > maxU) maxU = u;
                if(v > maxV) maxV = v;
            }
            const rangeU = maxU - minU;
            const rangeV = maxV - minV;
            if(rangeU <= 0 || rangeV <= 0) return;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1 / rangeU, 1 / rangeV);
            texture.offset.set(-minU / rangeU, -minV / rangeV);
            texture.needsUpdate = true;
        }

        function flipTextureX(texture){
            if(!texture) return;
            texture.wrapS = THREE.RepeatWrapping;
            texture.repeat.x *= -1;
            texture.offset.x = 1 - texture.offset.x;
            texture.needsUpdate = true;
        }

        function flipTextureY(texture){
            if(!texture) return;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.y *= -1;
            texture.offset.y = 1 - texture.offset.y;
            texture.needsUpdate = true;
        }

        function getScreenAxes(mesh){
            const bbox = new THREE.Box3().setFromObject(mesh);
            const size = bbox.getSize(new THREE.Vector3());
            const axes = [
                { axis: 'x', size: size.x },
                { axis: 'y', size: size.y },
                { axis: 'z', size: size.z }
            ].sort((a, b) => a.size - b.size);
            const normalAxis = axes[0].axis;
            const uAxis = axes[1].axis;
            const vAxis = axes[2].axis;
            const axisVec = (axis) => {
                if(axis === 'x') return new THREE.Vector3(1, 0, 0);
                if(axis === 'y') return new THREE.Vector3(0, 1, 0);
                return new THREE.Vector3(0, 0, 1);
            };
            return {
                normalAxis,
                right: axisVec(vAxis),
                up: axisVec(uAxis)
            };
        }

        function getUvOrientation(mesh){
            const geo = mesh.geometry;
            const pos = geo && geo.attributes ? geo.attributes.position : null;
            const uv = geo && geo.attributes ? geo.attributes.uv : null;
            if(!pos || !uv) return null;
            const axes = getScreenAxes(mesh);
            let tangent = new THREE.Vector3();
            let bitangent = new THREE.Vector3();
            let count = 0;
            for(let i = 0; i < pos.count - 2; i += 3){
                const p0 = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
                const p1 = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
                const p2 = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
                const uv0 = new THREE.Vector2(uv.getX(i), uv.getY(i));
                const uv1 = new THREE.Vector2(uv.getX(i + 1), uv.getY(i + 1));
                const uv2 = new THREE.Vector2(uv.getX(i + 2), uv.getY(i + 2));
                const e1 = p1.clone().sub(p0);
                const e2 = p2.clone().sub(p0);
                const duv1 = uv1.clone().sub(uv0);
                const duv2 = uv2.clone().sub(uv0);
                const denom = duv1.x * duv2.y - duv1.y * duv2.x;
                if(Math.abs(denom) < 1e-6) continue;
                const r = 1 / denom;
                const t = e1.clone().multiplyScalar(duv2.y).sub(e2.clone().multiplyScalar(duv1.y)).multiplyScalar(r);
                const b = e2.clone().multiplyScalar(duv1.x).sub(e1.clone().multiplyScalar(duv2.x)).multiplyScalar(r);
                tangent.add(t);
                bitangent.add(b);
                count += 1;
                if(count >= 10) break;
            }
            if(count === 0) return null;
            tangent.normalize();
            bitangent.normalize();
            const right = axes.right.clone().normalize();
            const up = axes.up.clone().normalize();
            const uDotRight = Math.abs(tangent.dot(right));
            const uDotUp = Math.abs(tangent.dot(up));
            const rotated = uDotUp > uDotRight;
            const uAxis = rotated ? up : right;
            const vAxis = rotated ? right : up;
            const flipU = tangent.dot(uAxis) < 0;
            const flipV = bitangent.dot(vAxis) < 0;
            return { rotated, flipU, flipV };
        }

        function buildControlScreenTexture(clip, uvBounds, screenAspect, animatedNodes){
            const canvas = document.createElement('canvas');
            const size = 1024;
            const aspect = screenAspect && Number.isFinite(screenAspect) ? screenAspect : 1;
            const height = Math.max(256, Math.round(size / Math.max(0.25, aspect)));
            canvas.width = size;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if(!ctx) return null;
            screenCanvas = canvas;
            screenCtx = ctx;

            ctx.fillStyle = '#f0e2ff';
            ctx.fillRect(0, 0, size, height);

            ctx.strokeStyle = 'rgba(6, 16, 56, 0.35)';
            ctx.lineWidth = 2;
            const cols = 20;
            const rows = 12;
            for(let c = 0; c <= cols; c++){
                const x = (c / cols) * size;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for(let r = 0; r <= rows; r++){
                const y = (r / rows) * height;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(size, y);
                ctx.stroke();
            }

            ctx.fillStyle = '#010718';
            ctx.font = '900 40px "Arial Black", "Trebuchet MS", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for(let c = 0; c < cols; c++){
                const letter = String.fromCharCode(65 + c);
                const x = ((c + 0.5) / cols) * size;
                ctx.fillText(letter, x, 6);
            }
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for(let r = 0; r < rows; r++){
                const number = String(r + 1);
                const y = ((r + 0.5) / rows) * height;
                ctx.fillText(number, 6, y);
            }

            const fps = clip ? ((TOTAL_FRAMES - 1) / Math.max(clip.duration, 0.001)) : 30;
            const lines = [];
            if(clip){
                lines.push(`Animation Clip: ${clip.name || 'unnamed'}`);
                const nodes = Array.isArray(animatedNodes) ? animatedNodes : [];
                lines.push(`Animated nodes (${nodes.length}):`);
                nodes.forEach((nodeName) => {
                    lines.push(`- ${nodeName}`);
                });
            }else{
                lines.push('Animation Clip: none');
            }

            const cellWidth = size / 20;
            const cellHeight = height / 12;
            const infoX = cellWidth * 1.5;
            const infoY = cellHeight * 1.5;
            const infoWidth = size - infoX - (cellWidth * 0.5);
            const infoHeight = height - infoY - (cellHeight * 0.5);
            ctx.fillStyle = 'rgba(240, 226, 255, 0.97)';
            ctx.fillRect(infoX, infoY, infoWidth, infoHeight);
            ctx.fillStyle = '#010718';
            ctx.font = '900 44px "Arial Black", "Trebuchet MS", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Hello, person', size * 0.5, cellHeight * 1.1);

            const okX = okRect.x * size;
            const okY = okRect.y * height;
            const okW = okRect.w * size;
            const okH = okRect.h * height;
            ctx.fillStyle = '#010718';
            ctx.fillRect(okX, okY, okW, okH);
            ctx.fillStyle = '#f0e2ff';
            ctx.font = '900 36px "Arial Black", "Trebuchet MS", system-ui, sans-serif';
            ctx.fillText('OK', okX + okW / 2, okY + okH / 2);
            ctx.fillStyle = '#010718';
            ctx.font = '800 22px "Arial Black", "Trebuchet MS", system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const text = lines.join('\n');
            const padding = 16;
            const maxWidth = infoWidth - padding * 2;
            let x = infoX + padding;
            let y = infoY + padding;
            const lineHeight = 28;
            text.split('\n').forEach((line) => {
                const words = line.split(' ');
                let current = '';
                words.forEach((word) => {
                    const test = current ? `${current} ${word}` : word;
                    if(ctx.measureText(test).width > maxWidth && current){
                        ctx.fillText(current, x, y);
                        y += lineHeight;
                        current = word;
                    }else{
                        current = test;
                    }
                });
                if(current){
                    ctx.fillText(current, x, y);
                    y += lineHeight;
                }
            });

            const texture = new THREE.CanvasTexture(canvas);
            texture.flipY = false;
            if('colorSpace' in texture){
                texture.colorSpace = THREE.SRGBColorSpace;
            }else{
                texture.encoding = THREE.sRGBEncoding;
            }
            texture.needsUpdate = true;
            return texture;
        }

        function animate(){
            if(controls && controls.enabled){
                controls.update();
            }
            const delta = clock.getDelta();
            if(uiMixer && uiAction){
                if(targetTime !== null && !uiAction.paused){
                    const nextTime = uiAction.time + delta;
                    if(nextTime >= targetTime){
                        uiAction.time = targetTime;
                        uiAction.paused = true;
                        targetTime = null;
                        uiMixer.setTime(uiAction.time);
                        if(animationJumpBackFrame !== null){
                            setFrame(animationJumpBackFrame);
                            animationJumpBackFrame = null;
                        }
                    }else{
                        uiAction.time = nextTime;
                        uiMixer.setTime(uiAction.time);
                    }
                }
            }
            if(cameraMixer && cameraAction && !cameraAction.paused){
                if(cameraTargetTime !== null){
                    const nextTime = cameraAction.time + delta;
                    if(nextTime >= cameraTargetTime){
                        cameraAction.time = cameraTargetTime;
                        cameraMixer.setTime(cameraAction.time);
                        finalizeCameraAnimation(settingsControllerBridge.model);
                        shouldTrackControls = true;
                        lastControlsEnabled = controls.enabled;
                    }else{
                        cameraAction.time = nextTime;
                        cameraMixer.setTime(cameraAction.time);
                    }
                }else{
                    cameraMixer.update(delta);
                }
            }
            stepManualCameraTween();
            if(shouldTrackControls && controls && lastControlsEnabled !== null && controls.enabled !== lastControlsEnabled){
                console.log('controls.enabled changed', lastControlsEnabled, '->', controls.enabled, 'at', (performance.now() / 1000).toFixed(2));
                lastControlsEnabled = controls.enabled;
            }
            if(camAnimDebugEl){
                const clipName = cameraAction?.getClip?.()?.name ?? '(no clip)';
                const clipDur = cameraAction?.getClip?.()?.duration ?? 0;
                const t = cameraAction?.time ?? 0;
                let debugText =
`CAM ANIM DEBUG
usesGltfCamera: ${usesGltfCamera}
controls.enabled: ${controls?.enabled}
clip: ${clipName}
duration: ${Number(clipDur).toFixed(4)}
time: ${Number(t).toFixed(4)}
cameraTargetTime: ${cameraTargetTime === null ? 'null' : Number(cameraTargetTime).toFixed(4)}
paused: ${!!cameraAction?.paused}
enabled: ${!!cameraAction?.enabled}`;
                if(camAnimLog.length){
                    debugText += `\n\nEVENT LOG\n${camAnimLog.join('\n')}`;
                }
                camAnimDebugEl.textContent = debugText;
            }
            if(debugFrameValue || debugFramePercent){
                const total = getManualCameraTotalFrames();
                const frameIndex = cameraTween
                    ? Math.min(total - 1, Math.max(0, cameraTween.frame))
                    : (typeof lastCameraFrame === 'number' ? Math.min(total - 1, Math.max(0, lastCameraFrame)) : null);
                if(debugFrameValue){
                    debugFrameValue.textContent = frameIndex !== null ? String(frameIndex + 1) : '--';
                }
                if(debugFramePercent){
                    const percent = frameIndex !== null ? Math.round(((frameIndex + 1) / total) * 100) : null;
                    debugFramePercent.textContent = percent !== null ? `${percent}%` : '--%';
                }
            }
            if(debugZoomValue && activeCamera){
                const camWorldPos = new THREE.Vector3();
                activeCamera.getWorldPosition(camWorldPos);
                const zoomDistance = camWorldPos.distanceTo(controls.target);
                debugZoomValue.textContent = Number.isFinite(zoomDistance)
                    ? zoomDistance.toFixed(3)
                    : '--';
            }
            if((debugRotXValue || debugRotYValue || debugRotZValue) && activeCamera){
                const camWorldQuat = new THREE.Quaternion();
                activeCamera.getWorldQuaternion(camWorldQuat);
                const worldEuler = new THREE.Euler().setFromQuaternion(camWorldQuat, 'XYZ');
                const toDeg = (rad) => THREE.MathUtils.radToDeg(rad);
                if(debugRotXValue) debugRotXValue.textContent = toDeg(worldEuler.x).toFixed(2);
                if(debugRotYValue) debugRotYValue.textContent = toDeg(worldEuler.y).toFixed(2);
                if(debugRotZValue) debugRotZValue.textContent = toDeg(worldEuler.z).toFixed(2);
            }
            if(debugRotateEnabled || debugZoomEnabled || debugPanEnabled){
                if(debugRotateEnabled) debugRotateEnabled.textContent = controls?.enableRotate ? 'T' : 'F';
                if(debugZoomEnabled) debugZoomEnabled.textContent = controls?.enableZoom ? 'T' : 'F';
                if(debugPanEnabled) debugPanEnabled.textContent = controls?.enablePan ? 'T' : 'F';
            }
            if((debugPosXValue || debugPosYValue || debugPosZValue) && activeCamera){
                const camWorldPos = new THREE.Vector3();
                activeCamera.getWorldPosition(camWorldPos);
                if(debugPosXValue) debugPosXValue.textContent = camWorldPos.x.toFixed(3);
                if(debugPosYValue) debugPosYValue.textContent = camWorldPos.y.toFixed(3);
                if(debugPosZValue) debugPosZValue.textContent = camWorldPos.z.toFixed(3);
            }
            if((debugGlbXValue || debugGlbYValue || debugGlbZValue) && settingsControllerBridge.model){
                glbBounds.setFromObject(settingsControllerBridge.model);
                glbBounds.getCenter(glbCenter);
                if(debugGlbXValue) debugGlbXValue.textContent = glbCenter.x.toFixed(3);
                if(debugGlbYValue) debugGlbYValue.textContent = glbCenter.y.toFixed(3);
                if(debugGlbZValue) debugGlbZValue.textContent = glbCenter.z.toFixed(3);
            }
            renderer.render(scene, activeCamera);
            requestAnimationFrame(animate);
        }

        resizeScene();
        const resizeObserver = new ResizeObserver(resizeScene);
        resizeObserver.observe(settingsControllerScene);
        window.addEventListener('resize', resizeScene);
        window.addEventListener('orientationchange', resizeScene);
        animate();

        const loader = new GLTFLoader();
        loader.load(SETTINGS_CONTROLLER_GLB, (gltf)=>{
            const model = gltf.scene;
            if(!model) return;
            scene.add(model);
            model.updateMatrixWorld(true);

            const allClips = gltf.animations || [];
            console.group('[SettingsController GLB] Animations');
            allClips.forEach((c, i) => {
                console.log(`#${i}`, c.name || '(unnamed)', 'duration:', c.duration);
            });
            console.groupEnd();
            const animatedNodes = new Set();
            allClips.forEach((clipItem) => {
                clipItem.tracks.forEach((track) => {
                    const name = typeof track.name === 'string' ? track.name : '';
                    const nodeName = name.split('.')[0].trim();
                    if(nodeName) animatedNodes.add(nodeName);
                });
            });

            const findCameraNode = () => {
                if(gltf.cameras && gltf.cameras.length){
                    return gltf.cameras[0];
                }
                let found = null;
                model.traverse((node) => {
                    if(found || !node.isCamera) return;
                    found = node;
                });
                return found;
            };

            const cameraNode = findCameraNode();
            if(cameraNode){
                activeCamera = cameraNode;
                controls.object = activeCamera;
                setUserCameraControlsEnabled(false);
                usesGltfCamera = true;
                if(activeCamera && activeCamera.isPerspectiveCamera){
                    if(!Number.isFinite(activeCamera.aspect) || activeCamera.aspect <= 0){
                        activeCamera.aspect = lastWidth && lastHeight ? (lastWidth / lastHeight) : 1;
                    }
                    activeCamera.updateProjectionMatrix();
                }
                activeCamera.updateMatrixWorld(true);
            }else{
                const bounds = new THREE.Box3().setFromObject(model);
                const size = bounds.getSize(new THREE.Vector3());
                const center = bounds.getCenter(new THREE.Vector3());
                model.position.sub(center);
                const scale = 1.6 / Math.max(size.x, size.y, size.z, 0.0001);
                model.scale.setScalar(scale);
                fitCameraToModel(model);
            }

            const hasCameraTrack = (clipItem) => {
                if(!cameraNode || !clipItem) return false;
                return clipItem.tracks.some((track) => {
                    const name = typeof track.name === 'string' ? track.name : '';
                    return name.startsWith(`${cameraNode.name}.`);
                });
            };

            const splitClipByCamera = (clipItem) => {
                if(!cameraNode || !clipItem) return { cameraOnly: null, uiOnly: null };
                const cameraTracks = [];
                const uiTracks = [];
                clipItem.tracks.forEach((track) => {
                    const name = typeof track.name === 'string' ? track.name : '';
                    if(name.startsWith(`${cameraNode.name}.`)){
                        cameraTracks.push(track);
                    }else{
                        uiTracks.push(track);
                    }
                });
                const cameraOnly = cameraTracks.length
                    ? new THREE.AnimationClip(`${clipItem.name || 'camera'}-camera`, clipItem.duration, cameraTracks)
                    : null;
                const uiOnly = uiTracks.length
                    ? new THREE.AnimationClip(`${clipItem.name || 'ui'}-ui`, clipItem.duration, uiTracks)
                    : null;
                return { cameraOnly, uiOnly };
            };

            let cameraClip = allClips.find(hasCameraTrack) || null;
            let uiClip = allClips.find((clipItem) => !hasCameraTrack(clipItem)) || null;
            if(!uiClip && cameraClip){
                const split = splitClipByCamera(cameraClip);
                if(split.cameraOnly) cameraClip = split.cameraOnly;
                if(split.uiOnly) uiClip = split.uiOnly;
            }
            if(!uiClip){
                uiClip = allClips[0] || null;
            }
            if(uiClip && cameraNode){
                const uiTracks = uiClip.tracks.filter((track) => {
                    const name = typeof track.name === 'string' ? track.name : '';
                    return !name.startsWith(`${cameraNode.name}.`);
                });
                if(uiTracks.length !== uiClip.tracks.length){
                    uiClip = uiTracks.length
                        ? new THREE.AnimationClip(`${uiClip.name || 'ui'}-ui`, uiClip.duration, uiTracks)
                        : null;
                }
            }

            if(!uiMixer){
                uiMixer = new THREE.AnimationMixer(model);
            }
            if(uiClip){
                clip = uiClip;
                uiAction = uiMixer.clipAction(uiClip);
                uiAction.clampWhenFinished = true;
                uiAction.setLoop(THREE.LoopOnce, 1);
                uiAction.play();
                setFrame(ACCESSIBILITY_FRAME);
            }

            if(cameraClip && !FORCE_MANUAL_CAMERA){
                if(!cameraMixer){
                    cameraMixer = new THREE.AnimationMixer(model);
                }
                cameraAction = cameraMixer.clipAction(cameraClip);
                cameraAction.clampWhenFinished = true;
                cameraAction.setLoop(THREE.LoopOnce, 1);
                cameraAction.paused = true;
                cameraAction.enabled = true;
                setCameraFrame(ACCESSIBILITY_FRAME);
                if(activeCamera){
                    activeCamera.updateMatrixWorld(true);
                }
            }
            if(!cameraClip || FORCE_MANUAL_CAMERA){
                cameraAction = null;
                cameraMixer = null;
                usesGltfCamera = false;
                setUserCameraControlsEnabled(false);
                syncControlsToCamera(model);
            }

            const findUvBounds = (mesh) => {
                const geo = mesh.geometry;
                const uv = geo && geo.attributes ? geo.attributes.uv : null;
                if(!uv || !uv.count) return null;
                const min = new THREE.Vector2(Infinity, Infinity);
                const max = new THREE.Vector2(-Infinity, -Infinity);
                for(let i = 0; i < uv.count; i++){
                    const u = uv.getX(i);
                    const v = uv.getY(i);
                    if(u < min.x) min.x = u;
                    if(v < min.y) min.y = v;
                    if(u > max.x) max.x = u;
                    if(v > max.y) max.y = v;
                }
                return { min, max };
            };

            const getMeshAspect = (mesh) => {
                const bounds = new THREE.Box3().setFromObject(mesh);
                const size = bounds.getSize(new THREE.Vector3());
                const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
                const width = Math.max(dims[0], 0.001);
                const height = Math.max(dims[1], 0.001);
                return width / height;
            };

            const screenTextureTargets = [];
            model.traverse((child) => {
                if(!child.isMesh) return;
                if(child.name === 'control-screen' || child.name === 'control_screen'){
                    screenTextureTargets.push(child);
                }
            });

            const primaryScreen = screenTextureTargets[0] || null;
            const uvBounds = primaryScreen ? findUvBounds(primaryScreen) : null;
            const screenAspect = primaryScreen ? getMeshAspect(primaryScreen) : null;
            const screenTextureBuilt = buildControlScreenTexture(clip, uvBounds, screenAspect, [...animatedNodes].sort());
            screenTexture = screenTextureBuilt;
            if(screenTexture){
                let applied = false;
                if(primaryScreen){
                    fitTextureToUV(primaryScreen, screenTexture);
                }
                // Force horizontal flip only (UVs already rotated in the asset).
                flipTextureX(screenTexture);
                screenTextureTargets.forEach((child) => {
                    const material = child.material;
                    if(Array.isArray(material)){
                        material.forEach((mat) => {
                            if(mat && 'map' in mat){
                                mat.map = screenTexture;
                                mat.needsUpdate = true;
                            }
                        });
                    }else if(material && 'map' in material){
                        material.map = screenTexture;
                        material.needsUpdate = true;
                    }
                    applied = true;
                });
            if(!applied){
                console.warn('control-screen mesh not found for grid overlay');
            }
        }

        function handlePointerDown(event){
            if(event.button !== 0) return;
            const rect = settingsControllerCanvas.getBoundingClientRect();
            if(rect.width === 0 || rect.height === 0) return;
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, activeCamera);
            const hits = raycaster.intersectObjects(model.children, true);
            if(!hits.length) return;
            if(introActive){
                const hit = hits[0];
                const findOkNode = (node) => {
                    let current = node;
                    while(current){
                        const name = (current.name || '').toLowerCase();
                        if(name.includes('ok')) return true;
                        current = current.parent;
                    }
                    return false;
                };
                let okHit = false;
                if(hit.uv && screenTexture && screenTexture.repeat){
                    let u = hit.uv.x * screenTexture.repeat.x + screenTexture.offset.x;
                    let v = hit.uv.y * screenTexture.repeat.y + screenTexture.offset.y;
                    u = ((u % 1) + 1) % 1;
                    v = ((v % 1) + 1) % 1;
                    const withinOk = u >= okRect.x && u <= okRect.x + okRect.w && v >= okRect.y && v <= okRect.y + okRect.h;
                    okHit = withinOk || findOkNode(hit.object);
                    if(okHit && cameraAction && !FORCE_MANUAL_CAMERA){
                        introActive = false;
                        setUserCameraControlsEnabled(false);
                        cameraAction.enabled = true;
                        cameraAction.reset();
                        cameraAction.paused = false;
                        cameraTargetTime = getCameraHoldTime(cameraAction.getClip());
                        cameraAction.play();
                        return;
                    }
                }
                if(introActive && okHit){
                    introActive = false;
                    if(cameraEnableTimer){
                        clearTimeout(cameraEnableTimer);
                    }
                    const totalFrames = getManualCameraTotalFrames();
                    const durationMs = (totalFrames / CAMERA_ANIM_EXPECTED_FPS) * 1000;
                    cameraEnableTimer = setTimeout(() => {
                        setUserCameraControlsEnabled(true);
                    }, durationMs);
                    startManualCameraTween();
                }
                return;
            }
                let target = hits[0].object;
                while(target && !interactiveNames.has(target.name)){
                    target = target.parent;
                }
                if(!target) return;
                if(target.name === 'btn-accessibility'){
                    setAccessibilityView();
                }else if(target.name === 'btn-vol-sync' || target.name === 'btn-save'){
                    setAudioView();
                }
            }

            settingsControllerCanvas.addEventListener('pointerdown', handlePointerDown);
            settingsControllerCanvas.addEventListener('contextmenu', (event) => {
                event.preventDefault();
            });
            document.addEventListener('keydown', (event)=>{
                if(event.repeat) return;
                if(event.target && /input|textarea|select/i.test(event.target.tagName)) return;
                const key = event.key.toLowerCase();
                if(key === 'a'){
                    setAccessibilityView();
                }else if(key === 'v'){
                    setAudioView();
                }
            });

            settingsControllerScene.classList.remove('controller-loading');
            settingsControllerScene.classList.add('controller-ready');
            settingsControllerBridge.scene = scene;
            settingsControllerBridge.renderer = renderer;
            settingsControllerBridge.camera = activeCamera;
            settingsControllerBridge.model = model;
            settingsControllerBridge.controls = controls;
            settingsControllerBridge.canvas = settingsControllerCanvas;
            signalSettingsControllerReady();
        }, undefined, (error)=>{
            console.warn("Settings controller GLB load failed", error);
            if(settingsControllerStatus){
                settingsControllerStatus.textContent = "Unable to load controller preview.";
            }
            settingsControllerScene.classList.remove('controller-loading');
            signalSettingsControllerReady();
        });
    }

    // Modal elements
    const modalTabA11y = document.getElementById('modalTabA11y');
    const modalTabAudio = document.getElementById('modalTabAudio');
    const modalA11yContent = document.getElementById('modalA11yContent');
    const modalAudioContent = document.getElementById('modalAudioContent');
    const modalSync = document.getElementById('modalSync');
    const modalClose = document.getElementById('modalClose');
    const modalClose2 = document.getElementById('modalClose2');
    const modalSaveA11y = document.getElementById('modalSaveA11y');

    // Visualizer
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const vizDb = document.getElementById('vizDb');

    // WebAudio nodes
    let audioCtx = null;
    let mediaSource = null; // from jumpAudio
    let analyser = null;
    let delayNode = null;
    let destinationGain = null;
    let suppressVolumeEvent = false;
    let vizPeakDb = -Infinity;
    let vizPeakColor = '#2aa198';

    // State
    let currentVideoKey = 'counts';
    let storedVolume = parseFloat(localStorage.getItem(AUDIO_VOLUME_KEY) || '0.25');
    let storedMuted = (localStorage.getItem(AUDIO_MUTED_KEY) === 'true');
    // default sync to 270 ms if nothing stored
    let storedSync = parseInt(localStorage.getItem(AUDIO_SYNC_KEY) || '270', 10);
    let isOrchestrating = false;

    // Initialize UI values
    syncSlider.value = storedSync;
    if(modalSync) modalSync.value = storedSync;
    syncDisplay.textContent = `Sync: ${storedSync} ms`;

    function showPermissionIfNeeded(){
        const allowed = localStorage.getItem(AUDIO_ALLOWED_KEY);
        if(allowed === null){
            permModal.classList.remove('hidden');
            permModal.style.display = 'flex';
        }
    }

    permAllow.addEventListener('click', async ()=>{
        localStorage.setItem(AUDIO_ALLOWED_KEY, 'true');
        localStorage.setItem(AUDIO_MUTED_KEY, 'false');
        storedMuted = false;
        storedVolume = 0.25;
        localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
        ensureAudioRouting();
        applyVolumeAndMuted();
        try{ await audioCtx.resume(); }catch(e){}
    });
    permDeny.addEventListener('click', ()=>{
        localStorage.setItem(AUDIO_ALLOWED_KEY, 'false');
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
    });

    // Create audio context and routing to apply delay to audio and visualizer
    function ensureAudioRouting(){
        if(audioCtx) return;
        try{
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            mediaSource = audioCtx.createMediaElementSource(jumpAudio);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            delayNode = audioCtx.createDelay(3.0); // max 3s
            destinationGain = audioCtx.createGain();
            // route: mediaSource -> delayNode -> destinationGain -> analyser -> audioCtx.destination
            mediaSource.connect(delayNode);
            delayNode.connect(destinationGain);
            destinationGain.connect(analyser);
            analyser.connect(audioCtx.destination);
            applySyncValue(storedSync);
            applyVolumeAndMuted();
            startVisualizer();
        }catch(e){
            // WebAudio not supported or blocked
            audioCtx = null;
            mediaSource = null;
            analyser = null;
            delayNode = null;
            destinationGain = null;
        }
    }
    function resumeAudioContext(){
        if(audioCtx && audioCtx.state === 'suspended'){
            audioCtx.resume().catch(()=>{});
        }
    }

    function applySyncValue(ms){
        storedSync = parseInt(ms, 10) || 0;
        localStorage.setItem(AUDIO_SYNC_KEY, String(storedSync));
        syncDisplay.textContent = `Sync: ${storedSync} ms`;

        if(window.siteConfig) window.siteConfig.audioSyncMs = storedSync;

        if(!audioCtx || !delayNode) return;
        const audioDelaySec = Math.max(0, storedSync/1000);
        delayNode.delayTime.value = audioDelaySec;
        if(isPlaying) syncWhilePlaying();
    }

    function applyVolumeAndMuted(){
        // When WebAudio available use gain node and keep native element muted to avoid double audio.
        if(destinationGain){
            destinationGain.gain.value = storedMuted ? 0 : storedVolume;
            try{ jumpAudio.muted = false; }catch(e){}
            try{
                suppressVolumeEvent = true;
                jumpVideo.muted = true;
            }catch(e){} finally { suppressVolumeEvent = false; }
        }else{
            try{ jumpAudio.muted = false; jumpVideo.muted = storedMuted; jumpVideo.volume = storedVolume; }catch(e){}
        }
        // persist
        localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
        localStorage.setItem(AUDIO_MUTED_KEY, storedMuted ? 'true':'false');
        updateVolumeUI();
        resetPeakHold();
    }

    function updateVolumeUI(){
        if(volumeSlider){
            volumeSlider.value = Math.round(storedVolume * 100);
        }
        if(volumeDisplay){
            volumeDisplay.textContent = `Volume: ${Math.round(storedVolume * 100)}%`;
        }
    }

    function setVolumeFromPercent(percent){
        const clamped = Math.max(0, Math.min(100, percent));
        storedVolume = clamped / 100;
        storedMuted = storedVolume === 0;
        resumeAudioContext();
        applyVolumeAndMuted();
    }

    function resetPeakHold(){
        vizPeakDb = -Infinity;
        vizPeakColor = '#2aa198';
    }

    function loadVideo(key){
        currentVideoKey = key;
        const media = MEDIA[key];
        // Pause both
        jumpVideo.pause();
        jumpAudio.pause();

        // Set sources on both elements
        while(jumpVideo.firstChild) jumpVideo.removeChild(jumpVideo.firstChild);
        while(jumpAudio.firstChild) jumpAudio.removeChild(jumpAudio.firstChild);
        const vsrc = document.createElement('source'); vsrc.src = media.video; vsrc.type = 'video/webm';
        const asrc = document.createElement('source'); asrc.src = media.audio; asrc.type = 'audio/ogg; codecs=opus';
        jumpVideo.appendChild(vsrc);
        jumpAudio.appendChild(asrc);
        jumpVideo.load();
        jumpAudio.load();

        // Recreate audio routing to new element
        if(audioCtx){
            try{ mediaSource.disconnect(); }catch(e){}
            try{ analyser.disconnect(); }catch(e){}
            try{ delayNode.disconnect(); }catch(e){}
            try{ destinationGain.disconnect(); }catch(e){}
            try{ mediaSource = audioCtx.createMediaElementSource(jumpAudio); mediaSource.connect(delayNode); }catch(e){}
            try{ delayNode.connect(destinationGain); destinationGain.connect(analyser); analyser.connect(audioCtx.destination); }catch(e){}
        }
        // apply persisted settings
        applyVolumeAndMuted();
        applySyncValue(storedSync);
    }

    function preloadMedia(){
        Object.values(MEDIA).forEach((media)=>{
            const preloadVideo = document.createElement('video');
            preloadVideo.preload = 'auto';
            preloadVideo.src = media.video;
            preloadVideo.load();

            const preloadAudio = document.createElement('audio');
            preloadAudio.preload = 'auto';
            preloadAudio.src = media.audio;
            preloadAudio.load();
        });
    }

    // Orchestrate playback so sync offset works both positive and negative
    let isPlaying = false;
    // Whether orchestration (separate audio element + WebAudio) is available and should be used.
    let orchestrationSupported = true;
    function startAudioForVideoPlayback(){
        ensureAudioRouting();
        resumeAudioContext();
        const sync = storedSync;
        const ct = jumpVideo.currentTime || 0;
        if(sync >= 0){
            if(jumpAudio.readyState >= 1){
                try{ jumpAudio.currentTime = ct; }catch(e){}
            }
            if(delayNode) delayNode.delayTime.value = sync / 1000;
        }else{
            if(delayNode) delayNode.delayTime.value = 0;
            const audioOffset = Math.abs(sync) / 1000;
            if(jumpAudio.readyState >= 1){
                try{ jumpAudio.currentTime = ct + audioOffset; }catch(e){}
            }
        }
        jumpAudio.play().catch(()=>{
            // Allow video-only playback if audio is blocked.
            orchestrationSupported = false;
        });
    }

    // When user presses the visible video's play control, intercept and orchestrate (if supported)
    jumpVideo.addEventListener('play', (e)=>{
        if(!orchestrationSupported){
            // allow native playback
            isPlaying = true;
            return;
        }
        startAudioForVideoPlayback();
        isPlaying = true;
    });
    jumpVideo.addEventListener('pause', ()=>{
        if(isPlaying){
            try{ jumpAudio.pause(); }catch(e){}
            isPlaying = false;
        }
    });

    // When user seeks using visible video's UI, update audio currentTime
    jumpVideo.addEventListener('seeked', ()=>{
        try{ jumpAudio.currentTime = jumpVideo.currentTime; }catch(e){}
    });

    // If sync changes while playing, adjust without restarting.
    function syncWhilePlaying(){
        if(!isPlaying || !orchestrationSupported) return;
        const ct = jumpVideo.currentTime || 0;
        if(storedSync >= 0){
            if(delayNode) delayNode.delayTime.value = storedSync / 1000;
            try{ jumpAudio.currentTime = ct; }catch(e){}
        }else{
            if(delayNode) delayNode.delayTime.value = 0;
            const audioOffset = Math.abs(storedSync) / 1000;
            try{
                const target = ct + audioOffset;
                const duration = jumpAudio.duration || 0;
                jumpAudio.currentTime = duration ? Math.min(target, Math.max(0, duration - 0.05)) : target;
            }catch(e){}
        }
    }

    // Visualizer draw loop
    let vizAnimation = null;
    function startVisualizer(){
        if(!analyser || !canvasCtx) return;
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        const width = canvas.width;
        const height = canvas.height;
        const minDb = -54;
        const maxDb = 0;
        const silentThreshold = minDb;

        function draw(){
            analyser.getByteTimeDomainData(dataArray);
            let peak = 0;
            for(let i=0;i<dataArray.length;i++){
                const centered = (dataArray[i] - 128) / 128;
                const abs = Math.abs(centered);
                if(abs > peak) peak = abs;
            }
            const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
            const isSilent = !(Number.isFinite(db)) || db <= silentThreshold;
            const clampedDb = isSilent ? minDb : Math.max(minDb, Math.min(maxDb, db));
            const norm = (clampedDb - minDb) / (maxDb - minDb);
            const level = norm * height;

            let meterColor = '#2aa198';
            if(db > -6){
                meterColor = '#e44b4b';
            }else if(db > -18){
                meterColor = '#e3c14a';
            }

            if(!isSilent && db > vizPeakDb){
                vizPeakDb = db;
                vizPeakColor = meterColor;
            }

            canvasCtx.clearRect(0,0,width,height);
            canvasCtx.fillStyle = meterColor;
            canvasCtx.fillRect(0, height - level, width, level);

                if(Number.isFinite(vizPeakDb)){
                    const peakClamped = Math.max(minDb, Math.min(maxDb, vizPeakDb));
                    const peakNorm = (peakClamped - minDb) / (maxDb - minDb);
                const peakY = height - (peakNorm * height);
                canvasCtx.fillStyle = vizPeakColor;
                canvasCtx.fillRect(0, Math.max(0, peakY - 1), width, 2);
            }

            if(vizDb){
                if(isSilent){
                    vizDb.textContent = 'dB: -ꝏ';
                }else{
                    vizDb.textContent = `dB: ${db.toFixed(1)}`;
                }
            }
            vizAnimation = requestAnimationFrame(draw);
        }
        if(!vizAnimation) draw();
    }
    function stopVisualizer(){ if(vizAnimation){ cancelAnimationFrame(vizAnimation); vizAnimation=null;} }

    // Event bindings
    saveBtn.addEventListener('click', ()=>{
        const reducedMotion = document.getElementById('a11y_reduced_motion').checked;
        const highContrast = document.getElementById('a11y_high_contrast').checked;
        const textScale = (document.querySelector('input[name="a11y_text"]:checked')?.value)||'normal';
        const focusOutline = document.getElementById('a11y_focus_outlines').checked ? 'always':'auto';
        try{ window.SiteA11y.set({ reducedMotion, highContrast, textScale, focusOutline }); }catch(e){}

        a11ySection.style.display = 'none';
        jumpContainer.style.display = 'block';
        topTabA11y.classList.remove('active');
        topTabAudio.classList.add('active');
        leadText.textContent = 'Please customize volume and audio sync for best comfort and accuracy.';

        showPermissionIfNeeded();
        loadVideo(currentVideoKey);
        updateA11yDebugFlags();
    });

    resetBtn.addEventListener('click', ()=>{
        try { localStorage.removeItem('site.a11y.settings'); } catch {}
        window.SiteA11y.apply(window.SiteA11y.get());
        hydrate();
        updateA11yDebugFlags();
    });

    // Top tabs behavior
    topTabA11y.addEventListener('click', ()=>{
        topTabA11y.classList.add('active'); topTabAudio.classList.remove('active');
        a11ySection.style.display = 'block';
        jumpContainer.style.display = 'none';
        leadText.textContent = 'Letâ€™s tune a few preferences so the site works best for you.';
        if(settingsControllerBridge?.setAccessibilityView){
            settingsControllerBridge.setAccessibilityView();
        }
    });
    topTabAudio.addEventListener('click', ()=>{
        topTabAudio.classList.add('active'); topTabA11y.classList.remove('active');
        a11ySection.style.display = 'none';
        jumpContainer.style.display = 'block';
        leadText.textContent = 'Please customize volume and audio sync for best comfort and accuracy.';
        loadVideo(currentVideoKey);
        showPermissionIfNeeded();
        if(settingsControllerBridge?.setAudioView){
            settingsControllerBridge.setAudioView();
        }
    });

    if(nextBtn){
        nextBtn.addEventListener('click', ()=>{
            window.location.href = 'about.html';
        });
    }

    // Video tabs
    tabNumbers.addEventListener('click', ()=>{ tabNumbers.classList.add('active'); tabAlphabet.classList.remove('active'); loadVideo('counts'); });
    tabAlphabet.addEventListener('click', ()=>{ tabAlphabet.classList.add('active'); tabNumbers.classList.remove('active'); loadVideo('alphabet'); });

    function bindStepButton(button, leftDelta, rightDelta, handler){
        if(!button) return;
        button.addEventListener('pointerup', (e)=>{
            if(e.button === 0){
                handler(leftDelta);
            }
        });
        button.addEventListener('contextmenu', (e)=>{
            e.preventDefault();
            handler(rightDelta);
        });
    }

    // Sync arrows
    function changeSyncBy(deltaMs){
        let v = parseInt(syncSlider.value,10) + deltaMs;
        v = Math.max(-3000, Math.min(3000, v));
        syncSlider.value = v; applySyncValue(v);
    }
    bindStepButton(syncLeft, -10, -50, changeSyncBy);
    bindStepButton(syncRight, 10, 50, changeSyncBy);

    // Volume arrows
    function changeVolumeBy(deltaPct){
        const currentPct = Math.round(storedVolume * 100);
        setVolumeFromPercent(currentPct + deltaPct);
    }
    bindStepButton(volDown, -1, -5, changeVolumeBy);
    bindStepButton(volUp, 1, 5, changeVolumeBy);

    // Sliders input
    syncSlider.addEventListener('input', (e)=>{ applySyncValue(e.target.value); if(modalSync) modalSync.value = e.target.value; });
    if(modalSync) modalSync.addEventListener('input', (e)=>{ applySyncValue(e.target.value); syncSlider.value = e.target.value; });
    window.addEventListener('syncOffsetChanged', (e)=>{
        const ms = parseInt(e?.detail?.offsetMs, 10) || 0;
        storedSync = ms;
        syncSlider.value = ms;
        if(modalSync) modalSync.value = ms;
        syncDisplay.textContent = `Sync: ${ms} ms`;
        applySyncValue(ms);
    });
    if(volumeSlider) volumeSlider.addEventListener('input', (e)=>{ setVolumeFromPercent(parseInt(e.target.value, 10)); });

    // Capture native volume/mute changes on the video and persist them across pages
    // Note: users will use visible video's controls; we map them to stored values
    jumpVideo.addEventListener('volumechange', ()=>{
        if(suppressVolumeEvent) return;
        const vol = jumpVideo.volume;
        const muted = jumpVideo.muted;
        storedVolume = vol;
        storedMuted = muted;
        applyVolumeAndMuted();
    });

    // When metadata loaded apply persisted settings
    jumpVideo.addEventListener('loadedmetadata', ()=>{ applyVolumeAndMuted(); });
    jumpAudio.addEventListener('loadedmetadata', ()=>{ applyVolumeAndMuted(); });

    // Fallback to native video playback if orchestration fails
    function fallbackToNativePlayback(){
        try{
            // ensure video is unmuted if user didn't mute
            jumpVideo.muted = storedMuted;
            jumpVideo.volume = storedVolume;
            // stop audio element
            try{ jumpAudio.pause(); }catch(e){}
            // play video natively
            jumpVideo.play().catch(()=>{});
        }catch(e){}
    }

    // Settings modal handlers
    if(settingsBtn && settingsModal){
        settingsBtn.addEventListener('click', ()=>{ settingsModal.classList.add('open'); });
    }
    if(modalClose && settingsModal){
        modalClose.addEventListener('click', ()=>{ settingsModal.classList.remove('open'); });
    }
    if(modalClose2 && settingsModal){
        modalClose2.addEventListener('click', ()=>{ settingsModal.classList.remove('open'); });
    }

    modalTabA11y.addEventListener('click', ()=>{
        modalTabA11y.classList.add('active'); modalTabAudio.classList.remove('active');
        modalA11yContent.classList.remove('hidden'); modalAudioContent.classList.add('hidden');
    });
    modalTabAudio.addEventListener('click', ()=>{
        modalTabAudio.classList.add('active'); modalTabA11y.classList.remove('active');
        modalAudioContent.classList.remove('hidden'); modalA11yContent.classList.add('hidden');
    });

    modalSaveA11y.addEventListener('click', ()=>{
        document.getElementById('a11y_reduced_motion').checked = document.getElementById('modal_a11y_reduced_motion').checked;
        document.getElementById('a11y_high_contrast').checked = document.getElementById('modal_a11y_high_contrast').checked;
        saveBtn.click();
        settingsModal.classList.remove('open');
    });

    // Hydrate function
    function hydrate(){
        const s = window.SiteA11y.get();
        document.getElementById('a11y_reduced_motion').checked = !!s.reducedMotion;
        document.getElementById('a11y_high_contrast').checked = !!s.highContrast;
        const val = s.textScale === 'large' ? 'large' : 'normal';
        [...document.querySelectorAll('input[name="a11y_text"]')].forEach(r=>{ r.checked = (r.value===val); });
        document.getElementById('a11y_focus_outlines').checked = (s.focusOutline === 'always');
    }

    function updateA11yDebugFlags(){
        if(typeof window.SiteA11y?.get !== 'function') return;
        const settings = window.SiteA11y.get();
        const flags = {
            'Reduced motion': settings.reducedMotion ? 'T' : 'F',
            'High contrast': settings.highContrast ? 'T' : 'F',
            'Large text': settings.textScale === 'large' ? 'T' : 'F',
            'Always focus outlines': settings.focusOutline === 'always' ? 'T' : 'F',
        };
        const actions = {};
        if(saveBtn) actions['Save a11y prefs'] = () => saveBtn.click();
        if(resetBtn) actions['Reset a11y prefs'] = () => resetBtn.click();
        if(typeof window.registerDebugHooks === 'function'){
            window.registerDebugHooks({ flags, actions });
        }
    }

    window.addEventListener('debug-ui-ready', updateA11yDebugFlags);
    updateA11yDebugFlags();

    document.addEventListener('DOMContentLoaded', ()=>{
        initSettingsControllerScene();
        hydrate();
        showPermissionIfNeeded();
        storedVolume = parseFloat(localStorage.getItem(AUDIO_VOLUME_KEY) || storedVolume);
        storedMuted = (localStorage.getItem(AUDIO_MUTED_KEY) === 'true');
        storedSync = parseInt(localStorage.getItem(AUDIO_SYNC_KEY) || storedSync, 10);
        syncSlider.value = storedSync;
        if(modalSync) modalSync.value = storedSync;
        applySyncValue(storedSync);
        preloadMedia();
        loadVideo(currentVideoKey);
        if(localStorage.getItem(AUDIO_ALLOWED_KEY) === 'true'){
            storedMuted = false;
            storedVolume = 0.25;
            localStorage.setItem(AUDIO_MUTED_KEY, 'false');
            localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
            ensureAudioRouting();
            applyVolumeAndMuted();
            jumpVideo.play().catch(()=>{});
        }
    });
})();

if ("serviceWorker" in navigator) {
    if (isLocalHost) {
        const clearedKey = "sw_cleared_once";
        if (!sessionStorage.getItem(clearedKey)) {
            navigator.serviceWorker.getRegistrations().then((regs) => {
                if (!regs || !regs.length) return;
                return Promise.all(regs.map((r) => r.unregister())).then(() => {
                    sessionStorage.setItem(clearedKey, "true");
                    location.reload();
                });
            }).catch(() => {});
        }
    } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
}

loadDebugIfEnabled();
