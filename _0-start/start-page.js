import { mountCollapsibleSections } from '../_7-shared-scripts/panel-assembly/CollapsibleSections.mjs';
import { mountSettingsContextMenu } from '../_7-shared-scripts/panel-assembly/SettingsContextMenu.mjs';
import { bootstrapPage } from '../_7-shared-scripts/core/bootstrap.js';
import { createStartSettingsFlow } from './start/settings-flow.js';
import { disposeControllerSceneResources } from './start/controller-scene.js';
import { createStartCameraFlow, easeInOutPower } from './start/camera-flow.js';
import { syncStartAccessibleControls } from './start/accessible-controls.js';
import { audioDelaySeconds } from './start/media-calibration.js';
import { createPowerCat } from './start/power-cat.js';
import { createStartViewMemory } from './start/view-memory.js';
import { createModeButtonMotion, sampleMomentaryPress } from './start/button-motion.js';
import { createControllerAccents, contrastHighlightIntensity } from './start/controller-accents.js';
import { createSyncComparison } from './start/sync-comparison.js';
import { mountStartProjectOverlays } from './start/project-overlays.js';
import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import { panelViewport } from '../_7-shared-scripts/core/panel-viewport.js';
import { getSyncOffsetMs, setSyncOffsetMs, snapSyncMs } from '../_7-shared-scripts/global-sync.js';
import { localPreferences } from '../_7-shared-scripts/local-preferences.js';
import { createSceneStickyAdapter, createSceneInputOwnership } from '../_7-shared-scripts/sticky-notes/scene-adapter.js';

import { createCameraTransition } from './camera-transition.js';
import { assetUrl, isLocalDev } from "../_7-shared-scripts/assets-config.js";
import { loadDebugIfEnabled } from "../debug/debug-loader.js";
import { getSceneLightingValue, setSceneLightingValue, getLightScaleForValue, MAX_LIGHT_RATIO } from "../_7-shared-scripts/scene-lighting-sync.js";
import { ensureAudioConsentPrompt, getAudioConsentState, setAudioConsentAllowed, onAudioConsentChange } from "../_7-shared-scripts/audio-consent.js";
import { applyStartPageMouseControlMode } from "../_7-shared-scripts/shared-glb-mouse-controls.js";
import {  getStoredPreservePitch, setPreservePitchFlag, playbackRates as SHARED_PLAYBACK_RATES } from "../_7-shared-scripts/shared-video-controls.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const isLocalHost = isLocalDev();
const localReviewParams = new URLSearchParams(window.location.search);
const isLocalReview = isLocalHost && localReviewParams.get('review') === '1';
const localReviewStartMode = localReviewParams.get('mode') === 'audio' ? 'audio' : 'visuals';
document.documentElement.classList.toggle('is-local-review', isLocalReview);
// This is the latest controller export. Keep the 2D controller fallback in
// index.html available when its CDN copy cannot be reached.
const SETTINGS_CONTROLLER_GLB = assetUrl("assets/glb/settings-controller.glb");
const WELCOME_JINGLE_SRC = assetUrl("assets/audio/welcome-jingle.wav");
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
    stickyAdapter: null,
    canvas: null,
    knobVolNode: null,
    knobSyncNode: null,
    knobDefaults: null,
    knobConstraints: null,
    knobHitboxes: null,
    knobAxisValues: { vol: 0, sync: 0 },
    updateKnobTransformsFromState: null
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
            localPreferences.removeItem("ASSETS_BASE");
        } else {
            localPreferences.setItem("ASSETS_BASE", String(urlOrBlank));
        }
        location.reload();
    };
    window.clearAssetsBase = () => {
        localPreferences.removeItem("ASSETS_BASE");
        location.reload();
    };
}

function initStartPageUILayoutTabs() {
    import("../debug/panel-shell.js").then(({ initPanelShell }) => initPanelShell());
}

if (isLocalReview) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initStartPageUILayoutTabs, { once: true });
    } else {
        initStartPageUILayoutTabs();
    }
}
// Bind controls to SiteA11y and implement jump UI with visualizer
export function mountStartPage({ scope }) {
    if(hasSignaledSettingsControllerReady){
        hasSignaledSettingsControllerReady = false;
        settingsControllerBridge.ready = new Promise(resolve => { settingsControllerReadyResolve = resolve; });
    }
    const listen = (target, type, listener, options) => target ? scope.listen(target, type, listener, options) : null;
    let suspended = false;
    let suspendScene = () => {};
    let resumeScene = () => {};
    let restartVisualizer = false;
    let projectOverlayOpen = false;
    const viewMemory = createStartViewMemory(localPreferences);
    const rememberedStartView = viewMemory.read();
    let rememberCurrentView = () => {};
    listen(window, 'pagehide', () => rememberCurrentView(true));
    const { keys, defaultSliderValue: DEFAULT_SLIDER_VALUE,
        defaultLookTuning: DEFAULT_LOOK_TUNING, lightingState, clamp01Value,
        clampLookTuning, lookTuning, getLuxValue, setLuxValue,
        getEmiValue, setEmiValue } = createStartSettingsFlow({
            preferences: localPreferences, setSceneLightingValue
        });
    const ANIMATION_ALLOWED_KEY = keys.animationAllowed;
    const BRIGHTNESS_VALUE_KEY = keys.brightness;
    const BACKGROUND_CONTRAST_KEY = keys.backgroundContrast;
    const UNDERLIGHT_TUNING_KEY = keys.underlight;
    const SPEAKER_PURPLE_TUNING_KEY = keys.speakerPurple;

    // File paths (relative to site root)
    const MEDIA = {
        counts: {
            label: 'Numbers 1-2-3',
            video: assetUrl('Videos/start-page/counting-lq.webm'),
            audio: assetUrl('Videos/start-page/counting.opus'),
            thumbnail: assetUrl('_0-start/counting-thumb.jpg')
        },
        alphabet: {
            label: 'Alphabet A-B-C',
            video: assetUrl('Videos/start-page/alphabet-lq.webm'),
            audio: assetUrl('Videos/start-page/alphabet.opus'),
            thumbnail: assetUrl('_0-start/alphabet-thumb.jpg')
        }
    };
    const SYNC_GUIDE_URL = assetUrl('assets/audio/sync-guide.mp3');

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
    const returnGalleryBtn = document.getElementById('returnGalleryBtn');
    const a11ySection = document.getElementById('a11ySection');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const leadText = document.getElementById('leadText');
    const portfolioEntry = document.getElementById('portfolioEntry');
    const openComfortSettings = document.getElementById('openComfortSettings');
    const startControllerOverview = document.getElementById('startControllerOverview');
    let controllerUnavailable = false;
    const accessibleControllerControls = document.querySelector('.controller-accessible-controls');
    const settingsControllerScene = document.getElementById('settingsControllerScene');
    const bgOverlay = document.querySelector('.bg-overlay');
    const settingsControllerCanvas = document.getElementById('settingsControllerCanvas');
    const settingsControllerStatus = document.getElementById('settingsControllerStatus');
    const backgroundLookPanel = document.getElementById('backgroundLookPanel');
    const backgroundLookToggle = document.getElementById('backgroundLookToggle');
    const backgroundLookControls = document.getElementById('backgroundLookControls');
    const backgroundToneSlider = document.getElementById('backgroundToneSlider');
    const backgroundToneValue = document.getElementById('backgroundToneValue');
    const backgroundContrastSlider = document.getElementById('backgroundContrastSlider');
    const backgroundContrastValue = document.getElementById('backgroundContrastValue');
    const undersideLightSlider = document.getElementById('undersideLightSlider');
    const undersideLightValue = document.getElementById('undersideLightValue');
    const speakerPurpleSlider = document.getElementById('speakerPurpleSlider');
    const speakerPurpleValue = document.getElementById('speakerPurpleValue');
    const backgroundToneReset = document.getElementById('backgroundToneReset');
    const accessibleAudioMode = document.getElementById('accessibleAudioMode');
    const accessibleVisualsMode = document.getElementById('accessibleVisualsMode');
    const accessibleVolume = document.getElementById('accessibleVolume');
    const accessibleSync = document.getElementById('accessibleSync');
    const accessibleBrightness = document.getElementById('accessibleBrightness');
    const accessibleContrast = document.getElementById('accessibleContrast');
    const accessibleCounts = document.getElementById('accessibleCounts');
    const accessibleAlphabet = document.getElementById('accessibleAlphabet');
    const accessiblePlayPause = document.getElementById('accessiblePlayPause');
    const accessibleGallery = document.getElementById('accessibleGallery');
    const accessibleConfirmYes = document.getElementById('accessibleConfirmYes');
    const accessibleConfirmNo = document.getElementById('accessibleConfirmNo');
    const accessiblePower = document.getElementById('accessiblePower');
    const powerStatus = document.getElementById('startPowerStatus');



    const emissiveListPanel = document.getElementById('emissiveListPanel');
    const emissiveList = document.getElementById('emissiveList');
    const emissiveOutputBtn = document.getElementById('emissiveOutputBtn');
    const emissiveOutput = document.getElementById('emissiveOutput');
    const emissiveTabSelect = document.getElementById('emissiveTabSelect');
    const emissiveTabAdjust = document.getElementById('emissiveTabAdjust');
    const emissiveSelectPanel = document.getElementById('emissiveSelectPanel');
    const emissiveAdjustPanel = document.getElementById('emissiveAdjustPanel');
    const emissiveSelectAll = document.getElementById('emissiveSelectAll');
    const emissiveSelectNone = document.getElementById('emissiveSelectNone');
    // The visible pressed button is authoritative.  Legacy DOM names still use
    // "accessibility", but the controller mode is explicitly audio/visuals.
    let activeSettingsView = 'visuals';
    const controllerFlow = {
        stage: 'motion',
        soundAllowed: null,
        animationAllowed: null,
        selectedMedia: 'counts',
        returnStage: 'gallery',
        saveLatched: false,
        resolvePrompt: null,
        hoverHint: '',
        syncExercise: {
            active: false,
            result: ''
        },
        hitRegions: [],
        thumbnails: new Map()
    };
    settingsControllerBridge.controllerFlow = controllerFlow;
    function syncAccessibleControllerUI(){
        syncStartAccessibleControls({
            elements: { audioMode: accessibleAudioMode, visualsMode: accessibleVisualsMode,
                volumeSlider: accessibleVolume, syncSlider: accessibleSync,
                brightnessSlider: accessibleBrightness, contrastSlider: accessibleContrast,
                counts: accessibleCounts, alphabet: accessibleAlphabet,
                playPause: accessiblePlayPause, gallery: accessibleGallery,
                confirmYes: accessibleConfirmYes, confirmNo: accessibleConfirmNo },
            view: activeSettingsView, volume: storedVolume, syncMs: storedSync,
            brightness: getLuxValue(), contrast: getEmiValue(),
            flow: controllerFlow
        });
    }

    function showSaveConfirmation(){
        if(controllerFlow.stage !== 'confirm'){
            controllerFlow.returnStage = controllerFlow.stage === 'playing' ? 'playing' : 'gallery';
        }
        try{ jumpVideo.pause(); }catch{}
        try{ jumpAudio.pause(); }catch{}
        controllerFlow.stage = 'confirm';
        controllerFlow.saveLatched = true;
        settingsControllerBridge.setSaveLatched?.(true);
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function resolveSaveConfirmation(accepted){
        if(accepted){
            window.location.href = '_1-about/about.html';
            return;
        }
        resetSyncExercise();
    }
    function dismissSavedState(){
        if(!controllerFlow.saveLatched) return false;
        resetSyncExercise();
        return true;
    }
    const getBackgroundBrightness = () => {
        if(Number.isFinite(lightingState.overlay)){
            return Math.max(0, Math.min(1, lightingState.overlay));
        }
        try{
            const raw = localPreferences.getItem(BRIGHTNESS_VALUE_KEY);
            const parsed = clamp01Value(raw);
            if(parsed === null){
                try{ localPreferences.setItem(BRIGHTNESS_VALUE_KEY, String(DEFAULT_SLIDER_VALUE)); }catch{}
                lightingState.overlay = DEFAULT_SLIDER_VALUE;
                return DEFAULT_SLIDER_VALUE;
            }
            lightingState.overlay = parsed;
            return lightingState.overlay;
        }catch{
            lightingState.overlay = DEFAULT_SLIDER_VALUE;
            return DEFAULT_SLIDER_VALUE;
        }
    };

        const setBackgroundBrightness = (value) => {
            const next = clamp01Value(value);
            if(next === null) return getBackgroundBrightness();
            lightingState.overlay = next;
            getSharedSettings().patch({ start: { brightness: next } });
            return next;
        };

        const getBackgroundContrast = () => {
            try{
                const parsed = clamp01Value(localPreferences.getItem(BACKGROUND_CONTRAST_KEY));
                if(parsed !== null) return parsed;
                localPreferences.setItem(BACKGROUND_CONTRAST_KEY, String(DEFAULT_SLIDER_VALUE));
            }catch{}
            return DEFAULT_SLIDER_VALUE;
        };

        const setBackgroundContrast = (value) => {
            const next = clamp01Value(value);
            if(next === null) return getBackgroundContrast();
            getSharedSettings().patch({ start: { backgroundContrast: next } });
            const contrastFactor = 0.5 + next;
            document.documentElement.style.setProperty('--start-overlay-contrast', contrastFactor.toFixed(3));
            if(bgOverlay) bgOverlay.style.setProperty('--start-overlay-contrast', contrastFactor.toFixed(3));
            return next;
        };

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
        const debugCameraPanel = document.getElementById('debugCameraPanel');
        const toggleBrightnessControl = document.getElementById('toggleBrightnessControl');
        const toggleEmissionControl = document.getElementById('toggleEmissionControl');
        const luxControlSlider = document.getElementById('luxControlSlider');
        const luxControlInput = document.getElementById('luxControlInput');
        const emiControlSlider = document.getElementById('emiControlSlider');
        const emiControlInput = document.getElementById('emiControlInput');
        const overlayBlendSlider = document.getElementById('overlayBlendSlider');
        const overlayBlendInput = document.getElementById('overlayBlendInput');
        const resetCameraAnim = document.getElementById('resetCameraAnim');
        const uiAnimSpeedSlider = document.getElementById('uiAnimSpeed');
        const uiAnimSpeedValue = document.getElementById('uiAnimSpeedValue');
        const animDurationCustom = document.getElementById('animDurationCustom');
        const animDurationCustomValue = document.getElementById('animDurationCustomValue');
        const animDurationFocus = document.getElementById('animDurationFocus');
        const animDurationFocusValue = document.getElementById('animDurationFocusValue');
        const animEasePower = document.getElementById('animEasePower');
        const animEasePowerValue = document.getElementById('animEasePowerValue');
        let lightingDebugLineEl = null;
        let knobSidesLineEl = null;
        let lightingDebugState = { source: 'init', knob: '-' };

    function setTabInfo(text){
        if(tabInfo){
            tabInfo.textContent = text;
        }
    }

    function updateLightingToggleLabels(){
        if(toggleBrightnessControl){
            toggleBrightnessControl.textContent = `Lux: ${settingsControllerBridge.luxControlEnabled ? 'on' : 'off'}`;
        }
        if(toggleEmissionControl){
            toggleEmissionControl.textContent = `Emi: ${settingsControllerBridge.emissionControlEnabled ? 'on' : 'off'}`;
        }
    }

    function clamp01(value){
        if(!Number.isFinite(value)) return null;
        return Math.max(0, Math.min(1, value));
    }

    function syncLuxInputs(){
        const value = Math.max(0, Math.min(1, getLuxValue()));
        if(luxControlSlider) luxControlSlider.value = value.toFixed(2);
        if(luxControlInput) luxControlInput.value = value.toFixed(2);
    }

    function syncEmiInputs(){
        const value = Math.max(0, Math.min(1, getEmiValue()));
        if(emiControlSlider) emiControlSlider.value = value.toFixed(2);
        if(emiControlInput) emiControlInput.value = value.toFixed(2);
    }

    function syncOverlayInputs(){
        const value = Math.max(0, Math.min(1, getBackgroundBrightness()));
        const contrast = Math.max(0, Math.min(1, getBackgroundContrast()));
        if(overlayBlendSlider) overlayBlendSlider.value = value.toFixed(2);
        if(overlayBlendInput) overlayBlendInput.value = value.toFixed(2);
        if(backgroundToneSlider) backgroundToneSlider.value = String(Math.round(value * 100));
        if(backgroundToneValue) backgroundToneValue.textContent = `${Math.round(value * 100)}%`;
        if(backgroundContrastSlider) backgroundContrastSlider.value = String(Math.round(contrast * 100));
        if(backgroundContrastValue) backgroundContrastValue.textContent = `${Math.round(contrast * 100)}%`;
        const tuningControls = [
            [undersideLightSlider, undersideLightValue, lookTuning.underlight],
            [speakerPurpleSlider, speakerPurpleValue, lookTuning.speakerPurple]
        ];
        tuningControls.forEach(([slider, output, value]) => {
            const percent = Math.round(value * 100);
            if(slider) slider.value = String(percent);
            if(output) output.textContent = `${percent}%`;
        });
    }

    function setLookTuning(name, value, storageKey){
        const next = clampLookTuning(value);
        if(next === null) return;
        lookTuning[name] = next;
        try{ localPreferences.setItem(storageKey, String(next)); }catch{}
        getSharedSettings().patch({ start: { look: { [name]: next } } });
        settingsControllerBridge.applyReviewLook?.();
        syncOverlayInputs();
    }

    function bindBackgroundLookControls(){
        if(backgroundLookToggle && backgroundLookPanel){
            listen(backgroundLookToggle, 'click', () => {
                const hidden = backgroundLookPanel.classList.toggle('is-hidden');
                backgroundLookToggle.textContent = hidden ? 'SHOW SETTINGS' : 'HIDE SETTINGS';
                backgroundLookToggle.setAttribute('aria-expanded', String(!hidden));
                if(backgroundLookControls){
                    backgroundLookControls.setAttribute('aria-hidden', String(hidden));
                    backgroundLookControls.inert = hidden;
                }
            });
        }
        if(backgroundToneSlider){
            listen(backgroundToneSlider, 'input', () => {
                applyOverlayFromSource(Number(backgroundToneSlider.value) / 100, 'background-panel');
            });
        }
        if(backgroundContrastSlider){
            listen(backgroundContrastSlider, 'input', () => {
                setBackgroundContrast(Number(backgroundContrastSlider.value) / 100);
                syncOverlayInputs();
            });
        }
        if(undersideLightSlider){
            listen(undersideLightSlider, 'input', () => {
                setLookTuning('underlight', Number(undersideLightSlider.value) / 100, UNDERLIGHT_TUNING_KEY);
            });
        }
        if(speakerPurpleSlider){
            listen(speakerPurpleSlider, 'input', () => {
                setLookTuning('speakerPurple', Number(speakerPurpleSlider.value) / 100, SPEAKER_PURPLE_TUNING_KEY);
            });
        }
        if(backgroundToneReset){
            listen(backgroundToneReset, 'click', () => {
                applyOverlayFromSource(0.5, 'background-reset');
                setBackgroundContrast(0.5);
                lookTuning.underlight = DEFAULT_LOOK_TUNING.underlight;
                lookTuning.speakerPurple = DEFAULT_LOOK_TUNING.speakerPurple;
                try{
                    localPreferences.setItem(UNDERLIGHT_TUNING_KEY, String(lookTuning.underlight));
                    localPreferences.setItem(SPEAKER_PURPLE_TUNING_KEY, String(lookTuning.speakerPurple));
                }catch{}
                settingsControllerBridge.applyReviewLook?.();
                syncOverlayInputs();
            });
        }
        if(backgroundLookPanel) backgroundLookPanel.hidden = !isLocalReview;
        setBackgroundContrast(getBackgroundContrast());
        syncOverlayInputs();
    }

    function ensureLightingDebugLine(){
        if(!debugCameraPanel) return;
        if(!lightingDebugLineEl || !lightingDebugLineEl.isConnected){
            const line = document.createElement('div');
            line.id = 'lightingDebugLine';
            line.className = 'debug-camera-value';
            line.style.marginTop = '4px';
            line.style.fontSize = '12px';
            line.style.opacity = '0.95';
            line.style.whiteSpace = 'normal';
            debugCameraPanel.appendChild(line);
            lightingDebugLineEl = line;
        }
        if(!knobSidesLineEl || !knobSidesLineEl.isConnected){
            const sides = document.createElement('div');
            sides.id = 'knobSidesLine';
            sides.className = 'debug-camera-value';
            sides.style.marginTop = '4px';
            sides.style.fontSize = '11px';
            sides.style.opacity = '0.85';
            sides.style.whiteSpace = 'normal';
            debugCameraPanel.appendChild(sides);
            knobSidesLineEl = sides;
        }
    }

    function getConstraintScreenData(node, constraint, canvasRect, camera){
        if(!node || !node.parent || !constraint || !camera) return null;
        const rect = canvasRect || settingsControllerCanvas?.getBoundingClientRect();
        if(!rect?.width || !rect?.height) return null;
        const toScreen = (axisValue) => {
            const local = node.position.clone();
            local[constraint.axis] = axisValue;
            const world = node.parent.localToWorld(local.clone());
            const ndc = world.project(camera);
            return new THREE.Vector2(
                ((ndc.x + 1) * 0.5) * rect.width,
                ((1 - ndc.y) * 0.5) * rect.height
            );
        };
        const pMin = toScreen(constraint.min);
        const pMax = toScreen(constraint.max);
        const minOnLeft = pMin.x <= pMax.x;
        return {
            pMin,
            pMax,
            t0Side: minOnLeft ? 'left' : 'right',
            t1Side: minOnLeft ? 'right' : 'left',
            leftValue: minOnLeft ? constraint.min : constraint.max,
            rightValue: minOnLeft ? constraint.max : constraint.min
        };
    }


    function getKnobSideInfo(type){
        const canvas = settingsControllerCanvas;
        const camera = settingsControllerBridge.camera;
        const constraints = settingsControllerBridge.knobConstraints;
        const node = type === 'vol' ? settingsControllerBridge.knobVolNode : settingsControllerBridge.knobSyncNode;
        const constraint = type === 'vol' ? constraints?.vol : constraints?.sync;
        if(!canvas || !camera || !node || !node.parent || !constraint) return null;
        const info = getConstraintScreenData(node, constraint, canvas.getBoundingClientRect(), camera);
        if(!info) return null;
        return { t0Side: info.t0Side, t1Side: info.t1Side, p0: info.pMin, p1: info.pMax };
    }

    function updateKnobSidesLine(){
        if(!knobSidesLineEl) return;
        const lux = getKnobSideInfo('sync');
        const contrast = getKnobSideInfo('contrast');
        const luxText = lux ? `Lux t0:${lux.t0Side} t1:${lux.t1Side}` : 'Lux t0:? t1:?';
        const contrastText = contrast ? `Contrast t0:${contrast.t0Side} t1:${contrast.t1Side}` : 'Contrast t0:? t1:?';
        knobSidesLineEl.textContent = `${luxText} | ${contrastText}`;
    }

    function updateLightingDebugLine(source, knobType){
        ensureLightingDebugLine();
        if(source) lightingDebugState.source = source;
        if(knobType) lightingDebugState.knob = knobType;
        if(!lightingDebugLineEl) return;
        const lux = Math.max(0, Math.min(1, getLuxValue()));
        const emi = Math.max(0, Math.min(1, getEmiValue()));
        const contrastNodeName = settingsControllerBridge.knobSyncNode?.name || '(none)';
        lightingDebugLineEl.textContent =
            `DBG src:${lightingDebugState.source} knob:${lightingDebugState.knob} Lux:${lux.toFixed(2)} Emi:${emi.toFixed(2)} CNode:${contrastNodeName}`;
        updateKnobSidesLine();
    }

    function applyLuxFromSource(value, source){
        const next = setLuxValue(value);
        settingsControllerBridge.applyLuxControls?.();
        syncLuxInputs();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState({ immediate: 'vol' });
        }
        updateLightingDebugLine(source || 'lux', 'sync');
        syncAccessibleControllerUI();
        return next;
    }

    function applyEmiFromSource(value, source){
        const next = setEmiValue(value);
        getSharedSettings().patch({ start: { contrast: next } });
        settingsControllerBridge.applyEmissionControls?.();
        syncEmiInputs();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState({ immediate: 'sync' });
        }
        updateLightingDebugLine(source || 'emi', 'contrast');
        syncAccessibleControllerUI();
        return next;
    }

    function applyOverlayFromSource(value, source){
        const next = setBackgroundBrightness(value);
        settingsControllerBridge.applyBackgroundBrightness?.(next);
        syncOverlayInputs();
        updateLightingDebugLine(source || 'overlay', '-');
        syncAccessibleControllerUI();
        return next;
    }

    function toggleOverlayBlendForDebugShortcut(){
        const current = Math.max(0, Math.min(1, getBackgroundBrightness()));
        const next = current >= 0.5 ? 0 : 1;
        return applyOverlayFromSource(next, 'debug-shortcut');
    }

    window.toggleOverlayBlendForDebugShortcut = toggleOverlayBlendForDebugShortcut;
    bindBackgroundLookControls();

    function bindAnimTuningControls({ animTuning, uiAnimTuning, resetCustomCameraAnimation, updateUiAnimationSpeed }){
        ensureLightingDebugLine();
        if(uiAnimSpeedSlider && uiAnimSpeedValue){
            uiAnimSpeedSlider.value = String(uiAnimTuning.speed.toFixed(2));
            uiAnimSpeedValue.textContent = `${uiAnimTuning.speed.toFixed(2)}x`;
            listen(uiAnimSpeedSlider, 'input', () => {
                uiAnimTuning.speed = Math.max(0.05, parseFloat(uiAnimSpeedSlider.value) || 1);
                uiAnimSpeedValue.textContent = `${uiAnimTuning.speed.toFixed(2)}x`;
                updateUiAnimationSpeed();
            });
        }
        if(luxControlSlider){
            listen(luxControlSlider, 'input', () => {
                const next = clamp01(parseFloat(luxControlSlider.value));
                if(next === null) return;
                applyLuxFromSource(next, 'lux-slider');
            });
        }
        if(luxControlInput){
            listen(luxControlInput, 'change', () => {
                const next = clamp01(parseFloat(luxControlInput.value));
                if(next === null) return;
                applyLuxFromSource(next, 'lux-input');
            });
        }
        if(emiControlSlider){
            listen(emiControlSlider, 'input', () => {
                const next = clamp01(parseFloat(emiControlSlider.value));
                if(next === null) return;
                applyEmiFromSource(next, 'emi-slider');
            });
        }
        if(emiControlInput){
            const applyEmiInputValue = () => {
                const next = clamp01(parseFloat(emiControlInput.value));
                if(next === null) return;
                applyEmiFromSource(next, 'emi-input');
            };
            listen(emiControlInput, 'input', applyEmiInputValue);
            listen(emiControlInput, 'change', applyEmiInputValue);
        }
        if(overlayBlendSlider){
            listen(overlayBlendSlider, 'input', () => {
                const next = clamp01(parseFloat(overlayBlendSlider.value));
                if(next === null) return;
                applyOverlayFromSource(next, 'overlay-slider');
            });
        }
        if(overlayBlendInput){
            const applyOverlayInputValue = () => {
                const next = clamp01(parseFloat(overlayBlendInput.value));
                if(next === null) return;
                applyOverlayFromSource(next, 'overlay-input');
            };
            listen(overlayBlendInput, 'input', applyOverlayInputValue);
            listen(overlayBlendInput, 'change', applyOverlayInputValue);
        }
        if(toggleBrightnessControl){
            listen(toggleBrightnessControl, 'click', () => {
                settingsControllerBridge.luxControlEnabled = !settingsControllerBridge.luxControlEnabled;
                if(settingsControllerBridge.luxControlEnabled){
                    settingsControllerBridge.syncLuxValueToKnob?.();
                }
                settingsControllerBridge.syncLuxControlsToToggle?.(settingsControllerBridge.luxControlEnabled);
                updateLightingToggleLabels();
                registerLightingDebugActions();
            });
        }
        if(toggleEmissionControl){
            listen(toggleEmissionControl, 'click', () => {
                settingsControllerBridge.emissionControlEnabled = !settingsControllerBridge.emissionControlEnabled;
                if(settingsControllerBridge.emissionControlEnabled){
                    settingsControllerBridge.syncEmissionValueToKnob?.();
                }
                settingsControllerBridge.syncEmissionControlsToToggle?.(settingsControllerBridge.emissionControlEnabled);
                updateLightingToggleLabels();
                registerLightingDebugActions();
            });
        }
        updateLightingToggleLabels();
        syncLuxInputs();
        syncEmiInputs();
        syncOverlayInputs();
        updateLightingDebugLine('bind', '-');
        if(animDurationCustom && animDurationCustomValue){
            animDurationCustom.value = String(animTuning.customDurationMs);
            animDurationCustomValue.textContent = `${animTuning.customDurationMs}ms`;
            listen(animDurationCustom, 'input', () => {
                animTuning.customDurationMs = parseInt(animDurationCustom.value, 10) || animTuning.customDurationMs;
                animDurationCustomValue.textContent = `${animTuning.customDurationMs}ms`;
            });
        }
        if(resetCameraAnim){
            listen(resetCameraAnim, 'click', () => resetCustomCameraAnimation());
        }
        if(animDurationFocus && animDurationFocusValue){
            animDurationFocus.value = String(animTuning.focusDurationMs);
            animDurationFocusValue.textContent = `${animTuning.focusDurationMs}ms`;
            listen(animDurationFocus, 'input', () => {
                animTuning.focusDurationMs = parseInt(animDurationFocus.value, 10) || animTuning.focusDurationMs;
                animDurationFocusValue.textContent = `${animTuning.focusDurationMs}ms`;
            });
        }
        if(animEasePower && animEasePowerValue){
            animEasePower.value = String(animTuning.easePower.toFixed(1));
            animEasePowerValue.textContent = animTuning.easePower.toFixed(1);
            listen(animEasePower, 'input', () => {
                animTuning.easePower = parseFloat(animEasePower.value) || animTuning.easePower;
                animEasePowerValue.textContent = animTuning.easePower.toFixed(1);
            });
        }
    }

    function initSettingsControllerScene(){
        if(!settingsControllerScene || !settingsControllerCanvas){
            signalSettingsControllerReady();
            return;
        }
        if(settingsControllerBridge.renderer) return;
        settingsControllerScene.classList.add('controller-loading');

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas: settingsControllerCanvas,
                antialias: true,
                alpha: true
            });
        } catch (error) {
            console.warn('Settings controller WebGL unavailable', error);
            if(settingsControllerStatus) settingsControllerStatus.textContent = '3D controller unavailable. Use the settings controls below.';
            settingsControllerScene.classList.remove('controller-loading', 'controller-ready');
            settingsControllerScene.classList.add('controller-fallback');
            controllerUnavailable = true;
            document.body.classList.add('start-controller-unavailable');
            setPortfolioEntryVisible(true);
            signalSettingsControllerReady();
            return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x0f1115, 0);
        renderer.setScissorTest(true);

        const scene = new THREE.Scene();
        let sceneFrameId = 0;
        let sceneDisposed = false;
        let resizeObserver = null;
        scope.defer(() => {
            sceneDisposed = true;
            cancelAnimationFrame(sceneFrameId);
            if(pendingMiddleSingleClick){
                clearTimeout(pendingMiddleSingleClick.timerId);
                pendingMiddleSingleClick = null;
            }
            if(document.pointerLockElement === settingsControllerCanvas) document.exitPointerLock?.();
            resizeObserver?.disconnect();
            settingsControllerBridge.controls?.dispose?.();
            disposeControllerSceneResources(scene);
            renderer.dispose();
            settingsControllerBridge.scene = null;
            settingsControllerBridge.renderer = null;
            settingsControllerBridge.camera = null;
            settingsControllerBridge.model = null;
            settingsControllerBridge.controls = null;
            settingsControllerBridge.stickyAdapter = null;
            for(const key of ['renderScreen', 'revealController', 'finishOnboarding', 'selectMode',
                'setAccessibilityView', 'setAudioView', 'updateAudioMeter', 'setSaveLatched',
                'updateKnobTransformsFromState', 'resetCustomCameraAnimation', 'powerCat', 'syncComparison']) {
                settingsControllerBridge[key] = null;
            }
            settingsControllerScene.classList.remove('controller-ready', 'controller-loading');
        });

        const fallbackCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        fallbackCamera.position.set(0, 1.6, 4);
        let activeCamera = fallbackCamera;
        const stickyAdapter = createSceneStickyAdapter({pageId: 'start', scene, canvas: settingsControllerCanvas,
            getCamera: () => activeCamera, getRoot: () => scene, scope,
            onInputOwnership: createSceneInputOwnership(() => controls)});
        settingsControllerBridge.stickyAdapter = stickyAdapter;
        let centerOnViewport = Boolean(getSharedSettings().get().start?.centerOnViewport);
        const modelLocalCenter = new THREE.Vector3();
        const stopCenterSetting = getSharedSettings().subscribe(snapshot => {
            centerOnViewport = Boolean(snapshot.start?.centerOnViewport);
        });
        scope.defer(stopCenterSetting);

        const ambient = new THREE.HemisphereLight(0xffffff, 0x0f1115, 0.6);
        // This ground-only hemisphere is a separate underside fill: brightness
        // scales it with the scene, while its black sky leaves the top key intact.
        const undersideLight = new THREE.HemisphereLight(0x000000, 0x75469a, 0.22);
        undersideLight.userData.lookRole = 'underside';
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(2, 4, 3);
        // The front key cannot illuminate normals on the controller's back or
        // the feet. These are ordinary fills, governed by the same Brightness.
        const rearFill = new THREE.DirectionalLight(0xcbd8ff, 0.9);
        rearFill.position.set(-1, 1.5, -4);
        const bottomFill = new THREE.DirectionalLight(0xb9a9d6, 0.42);
        bottomFill.position.set(0.5, -4, -1);
        bottomFill.userData.lookRole = 'underside';
        scene.add(ambient, undersideLight, dirLight, rearFill, bottomFill);
        const lightingRig = [ambient, undersideLight, dirLight, rearFill, bottomFill];
        let lightingTargets = null;
        const emissiveControlState = {
            exclusions: new Set(),
            scales: new Map()
        };
        settingsControllerBridge.emissiveControlState = emissiveControlState;
        const EMISSIVE_EXCLUSIONS_KEY = 'scene.emissive.exclusions';
        const EMISSIVE_SCALES_KEY = 'scene.emissive.scales';
        let emissiveSelectionSaved = false;
        const DEFAULT_EMISSIVE_INCLUDE = new Set([
            'controller-box',
            'control-panel',
            'arrow-sync-left',
            'arrow-sync-left-minus',
            'arrow-sync-right',
            'arrow-sync-right-plus',
            'arrow-vol-down',
            'arrow-vol-down-minus',
            'arrow-vol-up',
            'arrow-vol-up-plus',
            'btn-accessibility',
            'txt-acc',
            'btn-reset',
            'txt-reset',
            'btn-save',
            'txt-save',
            'btn-vol-sync',
            'txt-vol001',
            'control-screen',
            'info-panel',
            'txt-info-panel014',
            'knob-vol',
            'txt-percent-sync',
            'txt-percent-vol',
            'txt-contrast',
            'txt-contrast001',
            'vol-meter-flip',
            'feet',
            'shape-switch-on',
            'screwholes'
        ].map((name) => name.toLowerCase()));
        const CONTRAST_EMISSIVE_LOCK = new Set([
            'btn-accessibility',
            'txt-acc',
            'btn-reset',
            'txt-reset',
            'btn-save',
            'txt-save',
            'btn-vol-sync',
            'txt-vol001'
        ].map((name) => name.toLowerCase()));
        let animatedNodeNames = new Set();
        let emissiveStrengthBindings = [];
        let loggedEmissiveTracks = false;


        const readoutLabels = new Map();
        const readoutEditor = document.createElement('div');
        readoutEditor.className = 'controller-readout-editor';
        readoutEditor.setAttribute('role', 'group');
        const readoutEditorInput = document.createElement('input');
        readoutEditorInput.type = 'text';
        readoutEditorInput.inputMode = 'numeric';
        readoutEditorInput.autocomplete = 'off';
        readoutEditorInput.spellcheck = false;
        const readoutEditorUnit = document.createElement('span');
        readoutEditorUnit.className = 'controller-readout-editor-unit';
        readoutEditor.append(readoutEditorInput, readoutEditorUnit);
        settingsControllerScene.appendChild(readoutEditor);
        scope.defer(() => readoutEditor.remove());
        let readoutEditState = null;

        const CONTRAST_EXCLUDED_NAMES = new Set([
            'btn-accessibility',
            'btn-vol-sync',
            'btn-save',
            'btn-reset',
            'txt-acc',
            'txt-reset',
            'txt-save',
            'txt-vol',
            'txt-audiosync',
            'txt-volume',
            'txt-contrast',
            'txt-brightness'
        ].map((name) => name.toLowerCase()));



        const isButtonTextName = (name) => {
            if(!name) return false;
            const lowered = String(name).toLowerCase();
            if(CONTRAST_EXCLUDED_NAMES.has(lowered)) return true;
            return lowered.startsWith('btn-')
                || lowered.startsWith('btn_')
                || lowered.startsWith('txt-')
                || lowered.startsWith('txt_');
        };



        const captureLightingTargets = (model, emissiveAnimMaterials, emissiveAnimNodes) => {
            const ignoredEmissionNames = new Set([
                'txt-glow-on',
                'txt-glow-off',
                'btn-glow-on',
                'btn-glow-off',
                'btn-glow-on-2',
                'btn-glow-off-2'
            ]);
            const genericNamePattern = /^(plane|cube|cylinder|sphere|circle|cone|torus|mesh|object|text|curve|surface|grid|empty|null)([._-]?\d+)*$/i;
            const isMeaningfulName = (name) => {
                if(!name) return false;
                const trimmed = String(name).trim();
                if(!trimmed) return false;
                return !genericNamePattern.test(trimmed);
            };
            const getControlNode = (node, root) => {
                let current = node;
                while(current && current !== root){
                    const name = (current.name || '').toLowerCase();
                    if(ignoredEmissionNames.has(name)) return null;
                    if(isMeaningfulName(current.name)) return current;
                    current = current.parent;
                }
                return null;
            };
            const emissiveTargets = [];
            model.traverse((child) => {
                if(!child || !child.isMesh || !child.material) return;
                const name = (child.name || '').toLowerCase();
                if(ignoredEmissionNames.has(name)) return;
                const controlNode = getControlNode(child, model);
                if(!controlNode) return;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                const controlName = (controlNode.name || '').toLowerCase();
                const nodeName = (child.name || '').toLowerCase();
                const userControllable = !isControlScreenPath(getEmissiveNodePath(controlNode, model))
                    && !isControlScreenPath(getEmissiveNodePath(child, model))
                    && !isButtonTextName(controlName)
                    && !isButtonTextName(nodeName)
                    && !emissiveAnimNodes.has(controlName)
                    && !emissiveAnimNodes.has(nodeName);
                const contrastLocked = CONTRAST_EMISSIVE_LOCK.has(controlName)
                    || CONTRAST_EMISSIVE_LOCK.has(nodeName)
                    || animatedNodeNames.has(controlName)
                    || animatedNodeNames.has(nodeName)
                    || isButtonTextName(controlName)
                    || isButtonTextName(nodeName);
                materials.forEach((mat, idx) => {
                    if(!mat || !('emissiveIntensity' in mat)) return;
                    const hasEmission = Boolean(mat.emissive)
                        && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0);
                    const controllable = userControllable && hasEmission && !mat.userData?.controllerOwned
                        && !emissiveAnimMaterials.has((mat.name || '').toLowerCase());
                    // A glTF material may be shared by unrelated components. Each
                    // adjustable mesh needs its own intensity to honor its slider.
                    if(controllable || contrastLocked){
                        const cloned = mat.clone();
                        cloned.userData = { ...(mat.userData || {}), contrastLocked: contrastLocked || mat.userData?.contrastLocked === true };
                        if(Array.isArray(child.material)){
                            child.material[idx] = cloned;
                        }else{
                            child.material = cloned;
                        }
                        mat = cloned;
                    }else{
                        if(!mat.userData) mat.userData = {};
                        if(mat.userData.contrastLocked !== true){
                            mat.userData.contrastLocked = false;
                        }
                    }
                    if(!mat.userData) mat.userData = {};
                    if(!Number.isFinite(mat.userData.maxEmissiveIntensity)){
                        const base = (Number.isFinite(mat.emissiveIntensity) && mat.emissiveIntensity > 0)
                            ? mat.emissiveIntensity
                            : 1;
                        mat.userData.maxEmissiveIntensity = base;
                    }
                    emissiveTargets.push({ node: child, material: mat, controlNode, userControllable: controllable });
                });
            });
            lightingRig.forEach((light) => {
                if(!light || typeof light.intensity !== 'number') return;
                if(!light.userData) light.userData = {};
                if(!Number.isFinite(light.userData.maxIntensity)){
                    light.userData.maxIntensity = light.intensity / MAX_LIGHT_RATIO;
                }
            });
            return { model, emissiveTargets, lights: [...lightingRig] };
        };

        function getReadoutParts(type){
            if(activeSettingsView === 'audio'){
                if(type === 'vol') return { number: String(Math.round(storedVolume * 100)), unit: '%' };
                return { number: `${storedSync > 0 ? '+' : ''}${storedSync}`, unit: 'ms' };
            }
            if(type === 'vol') return { number: String(Math.round(getLuxValue() * 100)), unit: '%' };
            return { number: String(Math.round(getContrastValue() * 100)), unit: '%' };
        }

        function updateControllerReadouts(){
            readoutLabels.forEach((entry, type) => {
            const { ctx, texture, targets } = entry;
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#05090d';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ff3450';
            const { number, unit } = getReadoutParts(type);
            const numericFontSize = unit === 'ms' ? 124 : 142;
            const unitFontSize = unit === 'ms' ? numericFontSize * 0.5 : numericFontSize;
            ctx.font = `${numericFontSize}px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif`;
            const sign = /^[+-]/.test(number) ? number[0] : '';
            const digits = sign ? number.slice(1) : number;
            const signWidth = sign ? ctx.measureText(sign).width * 0.82 : 0;
            const digitsWidth = ctx.measureText(digits).width;
            const numberWidth = signWidth + digitsWidth;
            ctx.font = `${unitFontSize}px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif`;
            const unitWidth = ctx.measureText(unit).width;
            const gap = unit === 'ms' ? 0 : 4;
            const totalWidth = numberWidth + gap + unitWidth;
            const scale = Math.min(1, (w * 0.88) / Math.max(1, totalWidth));
            const startX = (w - totalWidth * scale) / 2;
            ctx.save();
            ctx.translate(startX, 0);
            ctx.scale(scale, scale);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            const baselineY = (h / scale + numericFontSize * 0.72) / 2;
            ctx.font = `${numericFontSize}px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif`;
            if(sign){
                ctx.save();
                ctx.scale(0.82, 1);
                ctx.fillText(sign, 0, baselineY);
                ctx.restore();
            }
            ctx.fillText(digits, signWidth, baselineY);
            ctx.font = `${unitFontSize}px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif`;
            ctx.fillText(unit, numberWidth + gap, baselineY);
            ctx.restore();
            targets.forEach((mesh) => {
                if(!mesh || !mesh.isMesh || !mesh.material) return;
                if(mesh.material.map !== texture){
                    mesh.material.map = texture;
                    mesh.material.transparent = true;
                    mesh.material.depthWrite = false;
                    mesh.material.needsUpdate = true;
                }
            });
            texture.needsUpdate = true;
            });
        }
        settingsControllerBridge.updateSyncPercentLabel = updateControllerReadouts;

        function applyReadoutNumber(type, rawValue){
            if(!/^[+-]?\d+$/.test(String(rawValue).trim())) return false;
            const parsed = Number.parseInt(String(rawValue).trim(), 10);
            if(!Number.isFinite(parsed)) return false;
            if(type === 'vol'){
                const percent = Math.max(0, Math.min(100, parsed));
                if(activeSettingsView === 'audio'){
                    setVolumeFromPercent(percent);
                }else{
                    applyLuxFromSource(percent / 100, 'readout-edit');
                }
            }else if(activeSettingsView === 'audio'){
                applySyncValue(Math.max(-3000, Math.min(3000, parsed)));
            }else{
                applyEmiFromSource(Math.max(0, Math.min(100, parsed)) / 100, 'readout-edit');
            }
            settingsControllerBridge.updateKnobTransformsFromState?.();
            updateControllerReadouts();
            syncAccessibleControllerUI();
            return true;
        }

        function getProjectedReadoutRect(target){
            if(!target || !activeCamera) return null;
            const box = new THREE.Box3().setFromObject(target);
            if(box.isEmpty()) return null;
            const corners = [];
            for(const x of [box.min.x, box.max.x]){
                for(const y of [box.min.y, box.max.y]){
                    for(const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
                }
            }
            const canvasRect = settingsControllerCanvas.getBoundingClientRect();
            const hostRect = settingsControllerScene.getBoundingClientRect();
            const projected = corners.map((corner) => {
                const ndc = corner.project(activeCamera);
                return {
                    x: canvasRect.left - hostRect.left + ((ndc.x + 1) * 0.5 * canvasRect.width),
                    y: canvasRect.top - hostRect.top + ((1 - ndc.y) * 0.5 * canvasRect.height)
                };
            });
            const xs = projected.map((point) => point.x);
            const ys = projected.map((point) => point.y);
            return {
                left: Math.min(...xs),
                top: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys)
            };
        }

        function updateReadoutEditorPosition(){
            if(!readoutEditState) return;
            const rect = getProjectedReadoutRect(readoutEditState.target);
            if(!rect) return;
            readoutEditor.style.left = `${rect.left}px`;
            readoutEditor.style.top = `${rect.top}px`;
            readoutEditor.style.width = `${Math.max(72, rect.width)}px`;
            readoutEditor.style.height = `${Math.max(30, rect.height)}px`;
            readoutEditor.style.fontSize = `${Math.max(12, Math.min(34, rect.height * 0.48))}px`;
        }

        function closeReadoutEditor({ commit = false } = {}){
            if(!readoutEditState) return;
            if(commit) applyReadoutNumber(readoutEditState.type, readoutEditorInput.value);
            readoutEditState = null;
            readoutEditor.classList.remove('is-open');
        }

        function openReadoutEditor(type, target){
            closeReadoutEditor({ commit: true });
            const parts = getReadoutParts(type);
            readoutEditState = { type, target };
            readoutEditorInput.value = parts.number;
            readoutEditorInput.setAttribute('aria-label', `${activeSettingsView === 'audio' ? (type === 'vol' ? 'Volume' : 'Audio sync') : (type === 'vol' ? 'Brightness' : 'Contrast')} numeric value`);
            readoutEditorUnit.textContent = parts.unit;
            readoutEditor.dataset.unit = parts.unit;
            readoutEditor.classList.add('is-open');
            updateReadoutEditorPosition();
            readoutEditorInput.focus({ preventScroll: true });
            readoutEditorInput.select();
        }

        function getReadoutHit(object){
            if(!object) return null;
            for(const [type, entry] of readoutLabels){
                for(const target of entry.targets){
                    let current = object;
                    while(current){
                        if(current === target) return { type, target };
                        current = current.parent;
                    }
                }
            }
            return null;
        }

        listen(readoutEditor, 'pointerdown', (event) => event.stopPropagation());
        listen(readoutEditorInput, 'input', () => {
            if(readoutEditState) applyReadoutNumber(readoutEditState.type, readoutEditorInput.value);
        });
        listen(readoutEditorInput, 'keydown', (event) => {
            if(event.key === 'Enter'){
                event.preventDefault();
                closeReadoutEditor({ commit: true });
            }else if(event.key === 'Escape'){
                event.preventDefault();
                closeReadoutEditor();
            }
        });
        listen(readoutEditorInput, 'blur', () => closeReadoutEditor({ commit: true }));

        const bindReadoutMesh = (mesh, entry) => {
            if(!mesh || !mesh.isMesh || !entry?.texture) return;
            if(mesh.geometry?.attributes?.uv && !mesh.userData.readoutUvNormalized){
                const geometry = mesh.geometry.clone();
                const uv = geometry.attributes.uv;
                let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
                for(let i = 0; i < uv.count; i++){
                    minU = Math.min(minU, uv.getX(i));
                    minV = Math.min(minV, uv.getY(i));
                    maxU = Math.max(maxU, uv.getX(i));
                    maxV = Math.max(maxV, uv.getY(i));
                }
                const rangeU = Math.max(1e-6, maxU - minU);
                const rangeV = Math.max(1e-6, maxV - minV);
                for(let i = 0; i < uv.count; i++){
                    uv.setXY(i, (uv.getX(i) - minU) / rangeU, (uv.getY(i) - minV) / rangeV);
                }
                uv.needsUpdate = true;
                mesh.geometry = geometry;
                mesh.userData.readoutUvNormalized = true;
            }
            const cloned = new THREE.MeshBasicMaterial({
                map: entry.texture,
                transparent: true,
                depthWrite: false,
                toneMapped: false
            });
            if(!mesh.material || Array.isArray(mesh.material)){
                mesh.material = cloned;
            }else{
                mesh.material = cloned;
            }
            if(!entry.targets.includes(mesh)) entry.targets.push(mesh);
        };

        const initReadoutLabel = (node, type) => {
            if(!node) return;
            let entry = readoutLabels.get(type);
            if(!entry){
                const canvas = document.createElement('canvas');
                canvas.width = 768;
                canvas.height = 256;
                const ctx = canvas.getContext('2d');
                if(!ctx) return;
                const texture = new THREE.CanvasTexture(canvas);
                texture.flipY = false;
                if('colorSpace' in texture){
                    texture.colorSpace = THREE.SRGBColorSpace;
                }else{
                    texture.encoding = THREE.sRGBEncoding;
                }
                texture.needsUpdate = true;
                entry = { ctx, texture, targets: [] };
                readoutLabels.set(type, entry);
            }
            if(node.isMesh){
                bindReadoutMesh(node, entry);
                updateControllerReadouts();
                return;
            }
            const preferredMeshes = [];
            const fallbackMeshes = [];
            node.traverse((desc) => {
                if(!desc?.isMesh) return;
                const descName = (desc.name || '').toLowerCase();
                if(descName.includes('text')){
                    preferredMeshes.push(desc);
                }else{
                    fallbackMeshes.push(desc);
                }
            });
            const targets = preferredMeshes.length ? preferredMeshes : fallbackMeshes.slice(0, 1);
            targets.forEach((mesh) => bindReadoutMesh(mesh, entry));
            updateControllerReadouts();
        };

        const getContrastValue = () => {
            return getEmiValue();
        };



        settingsControllerBridge.luxControlEnabled = true;
        settingsControllerBridge.emissionControlEnabled = true;

        const isControlScreenPath = (value) => {
            const name = (value || '').toLowerCase();
            return name.includes('control-screen') || name.includes('control_screen');
        };


        const mapContrastKnobToValue = (t) => t;
        const mapContrastValueToKnob = (value) => value;



        const getEmissiveNodePath = (node, root) => {
            const segments = [];
            let current = node;
            while(current && current !== root){
                const name = current.name || '';
                if(name){
                    segments.push(name);
                }else{
                    const index = current.parent ? current.parent.children.indexOf(current) : -1;
                    segments.push(`unnamed-${index >= 0 ? index : 'x'}`);
                }
                current = current.parent;
            }
            return segments.reverse().join('/');
        };

        const loadEmissiveExclusions = () => {
            try{
                const raw = localPreferences.getItem(EMISSIVE_EXCLUSIONS_KEY);
                emissiveSelectionSaved = raw !== null;
                const parsed = raw ? JSON.parse(raw) : [];
                if(Array.isArray(parsed)){
                    emissiveControlState.exclusions = new Set(parsed.map(String));
                }
            }catch{
                emissiveControlState.exclusions = new Set();
                emissiveSelectionSaved = false;
            }
        };

        const loadEmissiveScales = () => {
            try{
                const raw = localPreferences.getItem(EMISSIVE_SCALES_KEY);
                const parsed = raw ? JSON.parse(raw) : null;
                const next = new Map();
                if(parsed && typeof parsed === 'object'){
                    Object.entries(parsed).forEach(([key, value]) => {
                        const v = Number(value);
                        if(Number.isFinite(v)){
                            next.set(key, Math.max(0, Math.min(2, v)));
                        }
                    });
                }
                emissiveControlState.scales = next;
            }catch{
                emissiveControlState.scales = new Map();
            }
        };

        const saveEmissiveExclusions = () => {
            const payload = JSON.stringify([...emissiveControlState.exclusions]);
            localPreferences.setItem(EMISSIVE_EXCLUSIONS_KEY, payload);
        };

        const saveEmissiveScales = () => {
            const payload = {};
            emissiveControlState.scales.forEach((value, key) => {
                payload[key] = value;
            });
            localPreferences.setItem(EMISSIVE_SCALES_KEY, JSON.stringify(payload));
        };
        settingsControllerBridge.saveEmissiveScales = saveEmissiveScales;

        const isLiveEmissiveTarget = (target) => {
            if(!target?.userControllable || !target.node?.isMesh || !target.material || !lightingTargets?.model) return false;
            const materials = Array.isArray(target.node.material) ? target.node.material : [target.node.material];
            if(!materials.includes(target.material) || target.material.userData?.controllerOwned) return false;
            const color = target.material.emissive;
            if(!color || !(color.r > 0 || color.g > 0 || color.b > 0)) return false;
            let current = target.node;
            for(; current && current !== lightingTargets.model; current = current.parent){
                // PowerCat replaces these original switch meshes; their saved
                // material references are never part of the visible rocker.
                if(['switch-on', 'switch-off001', 'switch-off.001', 'shape-switch-on'].includes((current.name || '').toLowerCase())) return false;
            }
            return current === lightingTargets.model;
        };

        const buildEmissiveList = (model, emissiveTargets) => {
            if(!emissiveList) return;
            emissiveList.innerHTML = '';
            const sliderList = document.getElementById('emissiveSliderList');
            if(sliderList){
                sliderList.innerHTML = '';
            }
            const seen = new Map();
            emissiveTargets.forEach((entry) => {
                if(!isLiveEmissiveTarget(entry) || !entry.controlNode) return;
                const path = getEmissiveNodePath(entry.controlNode, model);
                if(seen.has(path)) return;
                seen.set(path, entry.controlNode);
            });
            const entries = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            if(!emissiveSelectionSaved){
                let defaultIncludeCount = 0;
                entries.forEach(([, node]) => {
                    const name = (node?.name || '').toLowerCase();
                    if(DEFAULT_EMISSIVE_INCLUDE.has(name)){
                        defaultIncludeCount += 1;
                    }
                });
                if(defaultIncludeCount > 0){
                    entries.forEach(([path, node]) => {
                        const name = (node?.name || '').toLowerCase();
                        if(!DEFAULT_EMISSIVE_INCLUDE.has(name)){
                            emissiveControlState.exclusions.add(path);
                        }
                    });
                }else{
                    // Fallback for model/name variations: keep all emissive targets enabled.
                    emissiveControlState.exclusions.clear();
                }
                saveEmissiveExclusions();
                emissiveSelectionSaved = true;
            }
            entries.forEach(([path, node]) => {
                const labelText = `${node.name}`;
                const li = document.createElement('li');
                li.className = 'emissive-list-item';
                const id = `emissive-${path.replace(/[^a-z0-9_-]/gi, '_')}`;
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.id = id;
                input.checked = !emissiveControlState.exclusions.has(path);
                listen(input, 'change', () => {
                    if(input.checked){
                        emissiveControlState.exclusions.delete(path);
                    }else{
                        emissiveControlState.exclusions.add(path);
                    }
                    saveEmissiveExclusions();
                    if(sliderList){
                        const slider = sliderList.querySelector(`input[data-path="${CSS.escape(path)}"]`);
                        const row = slider?.closest('.emissive-slider-item');
                        if(slider){
                            slider.disabled = !input.checked;
                        }
                        if(row){
                            row.classList.toggle('is-disabled', !input.checked);
                        }
                    }
                    applyEmissionControls();
                });
                const label = document.createElement('label');
                label.setAttribute('for', id);
                label.textContent = labelText;
                li.appendChild(input);
                li.appendChild(label);
                emissiveList.appendChild(li);

                if(sliderList){
                    const row = document.createElement('div');
                    row.className = 'emissive-slider-item';
                    row.classList.toggle('is-disabled', emissiveControlState.exclusions.has(path));
                    const sliderLabel = document.createElement('label');
                    sliderLabel.textContent = labelText;
                    const slider = document.createElement('input');
                    slider.type = 'range';
                    const sliderId = `${id}-strength`;
                    slider.id = sliderId;
                    sliderLabel.htmlFor = sliderId;
                    sliderLabel.textContent = `${labelText} strength`;
                    slider.min = '0';
                    slider.max = '2';
                    slider.step = '0.01';
                    slider.dataset.path = path;
                    const initialScale = emissiveControlState.scales.get(path);
                    slider.value = Number.isFinite(initialScale) ? String(initialScale) : '1';
                    slider.disabled = emissiveControlState.exclusions.has(path);
                    const value = document.createElement('span');
                    value.className = 'emissive-slider-value';
                    value.textContent = Number(slider.value).toFixed(2);
                    listen(slider, 'input', () => {
                        const v = Math.max(0, Math.min(2, parseFloat(slider.value) || 0));
                        emissiveControlState.scales.set(path, v);
                        value.textContent = v.toFixed(2);
                        saveEmissiveScales();
                        applyEmissionControls();
                    });
                    row.appendChild(sliderLabel);
                    row.appendChild(slider);
                    row.appendChild(value);
                    sliderList.appendChild(row);
                }
            });
        };

        const setEmissiveTab = (next) => {
            if(!emissiveTabSelect || !emissiveTabAdjust || !emissiveSelectPanel || !emissiveAdjustPanel) return;
            const isSelect = next === 'select';
            emissiveTabSelect.classList.toggle('is-active', isSelect);
            emissiveTabAdjust.classList.toggle('is-active', !isSelect);
            emissiveTabSelect.setAttribute('aria-selected', isSelect ? 'true' : 'false');
            emissiveTabAdjust.setAttribute('aria-selected', isSelect ? 'false' : 'true');
            emissiveSelectPanel.classList.toggle('is-active', isSelect);
            emissiveAdjustPanel.classList.toggle('is-active', !isSelect);
        };

        if(emissiveTabSelect){
            listen(emissiveTabSelect, 'click', () => setEmissiveTab('select'));
        }
        if(emissiveTabAdjust){
            listen(emissiveTabAdjust, 'click', () => setEmissiveTab('adjust'));
        }

        if(emissiveSelectAll){
            listen(emissiveSelectAll, 'click', () => {
                if(!emissiveList) return;
                emissiveList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                    if(input.checked) return;
                    input.checked = true;
                    input.dispatchEvent(new Event('change'));
                });
            });
        }

        if(emissiveSelectNone){
            listen(emissiveSelectNone, 'click', () => {
                if(!emissiveList) return;
                emissiveList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                    if(!input.checked) return;
                    input.checked = false;
                    input.dispatchEvent(new Event('change'));
                });
            });
        }

        if(emissiveOutputBtn && emissiveOutput){
            listen(emissiveOutputBtn, 'click', () => {
                if(!emissiveList) return;
                const selected = [];
                emissiveList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                    if(input.checked){
                        const label = emissiveList.querySelector(`label[for="${input.id}"]`);
                        if(label) selected.push(label.textContent.trim());
                    }
                });
                emissiveOutput.value = selected.join('\n');
            });
        }

        const applyBackgroundBrightness = (value) => {
            const v = Math.max(0, Math.min(1, Number(value)));
            if(!Number.isFinite(v)) return;
            document.documentElement.style.setProperty('--start-overlay-light', String(v));
            if(bgOverlay){
                bgOverlay.style.setProperty('--start-overlay-light', String(v));
            }
        };

        const getControllerLightScale = (value) => {
            const brightness = Math.max(0, Math.min(1, Number(value)));
            const sceneLightValue = 0.005 + 0.995 * brightness;
            return getLightScaleForValue(sceneLightValue)
                * (1 + 2.15 * Math.pow(brightness, 1.35));
        };

        const applySceneAppearance = () => {
            if(!lightingTargets) return;
            const brightness = Math.max(0, Math.min(1, getLuxValue()));
            const contrast = Math.max(0, Math.min(1, getContrastValue()));
            // Brightness owns scene illumination. Contrast owns intentional
            // highlighted materials; neither control writes the other output.
            const contrastEase = contrast * contrast * (3 - 2 * contrast);
            const lightScale = getControllerLightScale(brightness);
            lightingTargets.lights.forEach((light) => {
                const maxIntensity = Number.isFinite(light?.userData?.maxIntensity)
                    ? light.userData.maxIntensity
                    : light.intensity / MAX_LIGHT_RATIO;
                let lookScale = 1;
                if(light.userData?.lookRole === 'underside'){
                    lookScale = 0.25 + (1.75 * lookTuning.underlight);
                }
                light.intensity = maxIntensity * lightScale * lookScale;
            });
            lightingTargets.emissiveTargets.forEach((target) => {
                const { material: mat, node, controlNode, userControllable } = target;
                if(!mat || !node || !controlNode || mat.userData?.controllerOwned) return;
                const currentMaterials = Array.isArray(node.material) ? node.material : [node.material];
                if(!currentMaterials.includes(mat)) return;
                if(userControllable && !isLiveEmissiveTarget(target)) return;
                const path = getEmissiveNodePath(controlNode, lightingTargets.model);
                const meshPath = getEmissiveNodePath(node, lightingTargets.model);
                if(isControlScreenPath(path) || isControlScreenPath(meshPath) || isControlScreenPath(node.name)) return;
                const name = `${node.name || ''} ${controlNode.name || ''} ${mat.name || ''}`.toLowerCase();
                // Structural metal stays structural even when its mesh name (for
                // example vol-meter.001) happens to contain a highlight keyword.
                const structuralMetal = /black matte metal/.test((mat.name || '').toLowerCase());
                const speakerAccent = /speaker/.test(name);
                const intentional = !structuralMetal && !speakerAccent && /txt|label|arrow|meter|glow|highlight/.test(name);
                const base = Number.isFinite(mat.userData?.maxEmissiveIntensity)
                    ? mat.userData.maxEmissiveIntensity
                    : 1;
                const userScale = userControllable ? emissiveControlState.scales.get(path) : undefined;
                const scale = userControllable && emissiveControlState.exclusions.has(path)
                    ? 0
                    : Number.isFinite(userScale) ? userScale : 1;
                const lowContrastSpeaker = 0.16;
                const highContrastSpeaker = 0.4 + (0.9 * lookTuning.speakerPurple);
                const factor = intentional
                    ? contrastHighlightIntensity(contrast)
                    : speakerAccent
                        ? lowContrastSpeaker + (highContrastSpeaker - lowContrastSpeaker) * contrastEase
                        : 0.025;
                mat.emissiveIntensity = base * factor * scale;
                mat.needsUpdate = true;
            });
            powerCat?.setContrast(contrast);
            controllerAccents?.update(contrast);
            applyModeButtonAppearance();
        };
        settingsControllerBridge.applyReviewLook = applySceneAppearance;

        const applyLuxValue = (value) => {
            if(!lightingTargets) return;
            const v = Math.max(0, Math.min(1, Number(value)));
            if(!Number.isFinite(v)) return;
            applySceneAppearance();
        };





        function applyLuxControls(){
            if(!settingsControllerBridge.luxControlEnabled) return;
            applyLuxValue(getLuxValue());
        }

        function applyEmissionControls(){
            if(!settingsControllerBridge.emissionControlEnabled) return;
            applySceneAppearance();
        }

        function syncLuxControlsToToggle(enabled){
            if(enabled){
                applyLuxControls();
            }
        }

        function syncEmissionControlsToToggle(enabled){
            if(enabled){
                applyEmissionControls();
            }
        }

        function syncLuxValueToKnob(){
            const knobValue = Number.isFinite(settingsControllerBridge.knobAxisValues?.sync)
                ? settingsControllerBridge.knobAxisValues.sync
                : 0.5;
            applyLuxFromSource(knobValue, 'syncLuxToKnob');
        }

        function syncEmissionValueToKnob(){
            const contrastValue = getContrastValue();
            const knobValue = mapContrastValueToKnob(contrastValue);
            settingsControllerBridge.knobAxisValues.contrast = knobValue;
            applyEmiFromSource(mapContrastKnobToValue(knobValue), 'syncEmiToKnob');
        }

        settingsControllerBridge.applyLuxControls = applyLuxControls;
        settingsControllerBridge.applyEmissionControls = applyEmissionControls;
        settingsControllerBridge.applyBackgroundBrightness = applyBackgroundBrightness;
        settingsControllerBridge.syncLuxControlsToToggle = syncLuxControlsToToggle;
        settingsControllerBridge.syncEmissionControlsToToggle = syncEmissionControlsToToggle;
        settingsControllerBridge.syncLuxValueToKnob = syncLuxValueToKnob;
        settingsControllerBridge.syncEmissionValueToKnob = syncEmissionValueToKnob;

        listen(window, 'sceneLightingChanged', (event) => {
            const nextValue = clamp01Value(event?.detail?.value ?? getSceneLightingValue());
            if(nextValue !== null) lightingState.lux = nextValue;
            applyLuxControls();
            syncLuxInputs();
            if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
                settingsControllerBridge.updateKnobTransformsFromState();
            }
            updateLightingDebugLine('sceneLightingChanged', knobDragState?.type || '-');
            syncAccessibleControllerUI();
        });

        const FORCE_CAMERA_UNLOCKED = false;
        let controls = null;
        const applyControlsConfig = (controlsInstance) => {
            if(!controlsInstance) return;
            controlsInstance.enablePan = false;
            controlsInstance.enableDamping = true;
            controlsInstance.dampingFactor = 0.08;
            controlsInstance.autoRotate = false;
            controlsInstance.autoRotateSpeed = 0.5;
            controlsInstance.minDistance = 5;
            controlsInstance.maxDistance = 12;
            controlsInstance.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE
            };
        };
        const createOrbitControls = (camera) => {
            if(controls){
                controls.dispose();
                controls = null;
            }
            controls = new OrbitControls(camera, renderer.domElement);
            applyControlsConfig(controls);
            return controls;
        };
        createOrbitControls(activeCamera);
        controls.target.set(0, 1, 0);

        function setUserCameraControlsEnabled(isEnabled){
            if(!controls) return;
            if(FORCE_CAMERA_UNLOCKED){
                controls.enabled = true;
                controls.enableRotate = true;
                controls.enableZoom = true;
                controls.enablePan = true;
                controls.mouseButtons = {
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN
                };
                controls.update();
                return;
            }
            console.log('[settings controls]', isEnabled ? 'enabled' : 'disabled');
            applyStartPageMouseControlMode(controls, { enabled: !!isEnabled, allowRotate: !!isEnabled, allowZoom: !!isEnabled });
        }

        function setPreIntroZoomEnabled(isEnabled){
            if(!controls) return;
            if(FORCE_CAMERA_UNLOCKED){
                controls.enabled = true;
                controls.enableRotate = true;
                controls.enableZoom = true;
                controls.enablePan = true;
                controls.mouseButtons = {
                    LEFT: THREE.MOUSE.ROTATE,
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN
                };
                controls.update();
                return;
            }
            applyStartPageMouseControlMode(controls, { enabled: !!isEnabled, allowRotate: false, allowZoom: !!isEnabled });
        }

        if(FORCE_CAMERA_UNLOCKED){
            setUserCameraControlsEnabled(true);
        }else{
            setUserCameraControlsEnabled(false);
            setPreIntroZoomEnabled(true);
        }

        let camAnimDebugEl = document.getElementById('camAnimDebug');
        const ownsCamAnimDebugEl = !camAnimDebugEl;
        if(!camAnimDebugEl){
            camAnimDebugEl = document.createElement('div');
            camAnimDebugEl.id = 'camAnimDebug';
            camAnimDebugEl.className = 'cam-anim-debug-panel cam-anim-debug-panel--hidden-left';
            document.body.appendChild(camAnimDebugEl);
        }
        const camAnimDebugContent = document.createElement('div');
        camAnimDebugContent.id = 'camAnimDebugContent';
        camAnimDebugContent.className = 'cam-anim-debug-content';
        camAnimDebugContent.setAttribute('aria-hidden', 'true');
        camAnimDebugEl.appendChild(camAnimDebugContent);
        scope.defer(() => {
            camAnimDebugContent.remove();
            if(ownsCamAnimDebugEl) camAnimDebugEl.remove();
        });
        const camAnimLog = [];
        const MAX_CAM_LOG = 16;
        const uiFrameLog = [];
        const MAX_UI_LOG = 48;
        let lastUiFrameLogged = null;
        const logCamEvent = (message) => {
            const stamp = (performance.now() / 1000).toFixed(2);
            camAnimLog.push(`${stamp}s ${message}`);
            if(camAnimLog.length > MAX_CAM_LOG){
                camAnimLog.shift();
            }
        };
        let uiMixer = null;
        let cameraMixer = null;
        let usesGltfCamera = false;
        let clip = null;
        let uiAction = null;
        let powerCat = null;
        let controllerAccents = null;
        const modeButtonMotion = createModeButtonMotion(activeSettingsView);
        let emissiveAction = null;
        let emissionActions = [];
        let cameraAction = null;
        let cameraTargetTime = null;
        let targetTime = null;
        let knobModeMotion = null;
        let animationJumpBackFrame = null;
        const TOTAL_FRAMES = 30;
        const CAMERA_START_FRAME = 1;
        const CAMERA_END_FRAME = 30;
        const UI_START_FRAME = 1;
        const UI_END_FRAME = 30;
        // Authored endpoints: start = VISUALS, end = AUDIO.
        const VISUALS_FRAME = UI_START_FRAME;
        const AUDIO_FRAME = UI_END_FRAME;
        const FRAME_EPSILON = 0.1;
        let introActive = true;
        let cameraViewReady = false;
        let screenTexture = null;
        let animationInfoLines = [];


        let pendingAudioAllowed = null;
        let controllerEntrance = null;
        const clock = new THREE.Clock();
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const interactiveNames = new Set(['btn-accessibility', 'btn-vol-sync', 'btn-save', 'btn-reset', 'switch-plate', 'start-power-rocker']);
        const glbBounds = new THREE.Box3();
        const glbCenter = new THREE.Vector3();
        const KNOB_VOL_RANGE = 0.56;
        const KNOB_SYNC_RANGE = 0.56;
        const controllerButtonNodes = new Map();
        const controllerModeLabelNodes = new Map();
        let audioVisualizationPanel = null;
        let audioVisualizationRotation = null;
        let audioMeterState = null;
        const COLOR_BLACK = new THREE.Color(0x000000);
        const COLOR_BLUE = new THREE.Color(0x238cff);
        const COLOR_GREEN = new THREE.Color(0x0a7f34);
        const COLOR_RED = new THREE.Color(0xd5222c);
        const COLOR_TRANSITION_DARK = new THREE.Color(0x260817);
        const momentaryButtonPulses = new Map();
        let saveButtonMotion = { from: 0, target: 0, startedAt: 0, durationMs: 70 };

        function prepareAudioMeter(node){
            if(!node?.isMesh || !node.geometry) return;
            node.geometry.computeBoundingBox();
            const bounds = node.geometry.boundingBox;
            if(!bounds || bounds.isEmpty()) return;
            // Give the whole scale a dark face and unlit white lettering,
            // so neither scene lighting nor signal color can wash it out.
            node.parent?.traverse(mesh => {
                if(!mesh.isMesh || mesh === node) return;
                const scaleText = /^(txt-vol-meter|vol-meter-lines)/.test(mesh.name || '');
                const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
                    if(!scaleText && material?.name !== 'switch-mat') return material;
                    const owned = new THREE.MeshBasicMaterial({
                        color: scaleText ? 0xf4f7fa : 0x111820,
                        side: THREE.DoubleSide, toneMapped: false
                    });
                    owned.userData = { controllerOwned: true, contrastLocked: true };
                    return owned;
                });
                mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
            });
            // Project the instrument onto its authored face using the same
            // camera projection as the GLB, and only while that face is exposed.
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('aria-hidden', 'true');
            Object.assign(svg.style, { position: 'absolute', pointerEvents: 'none', zIndex: '2', overflow: 'hidden' });
            const well = document.createElementNS(svgNS, 'polygon');
            well.setAttribute('fill', '#626c76');
            well.setAttribute('stroke', '#cbd5df');
            well.setAttribute('stroke-width', '0.7');
            const signal = document.createElementNS(svgNS, 'polygon');
            const peakLine = document.createElementNS(svgNS, 'polyline');
            peakLine.setAttribute('stroke-width', '2');
            peakLine.setAttribute('fill', 'none');
            svg.append(well, signal, peakLine);
            settingsControllerScene.appendChild(svg);
            scope.defer(() => svg.remove());
            node.visible = false;
            audioMeterState = { node, bounds: bounds.clone(), svg, well, signal, peakLine,
                fill: 0, peakFill: 0, clipped: false, peakClipped: false,
                occlusionRay: new THREE.Raycaster(), lastEye: new THREE.Vector3(Infinity, Infinity, Infinity),
                lastCenter: new THREE.Vector3(Infinity, Infinity, Infinity),
                lastNormal: new THREE.Vector3(), unobstructed: false };
        }

        settingsControllerBridge.updateAudioMeter = ({ level = 0, peak = 0, clipped = false, peakClipped = false } = {}) => {
            if(!audioMeterState) return;
            Object.assign(audioMeterState, {
                fill: Math.max(0, Math.min(1, level)),
                peakFill: Math.max(0, Math.min(1, peak)), clipped, peakClipped
            });
        };

        function renderAudioMeter(){
            if(!audioMeterState) return;
            const { node, bounds, svg, well, signal, peakLine, fill, peakFill, clipped, peakClipped } = audioMeterState;
            let visible = settingsControllerBridge.model?.visible
                && (powerCat?.powered ?? true) && !powerCat?.busy;
            if(visible){
                // The projected paint must not shine through the cabinet or a
                // foreground object when the controller is viewed from its side.
                const eye = activeCamera.getWorldPosition(new THREE.Vector3());
                const center = node.localToWorld(bounds.getCenter(new THREE.Vector3()));
                const normal = new THREE.Vector3(0, 1, 0).transformDirection(node.matrixWorld);
                // Selecting AUDIO starts the flip; it does not expose the meter
                // yet. Follow the physical face in both directions, including
                // rapid reversals, rather than the destination mode.
                const facing = normal.dot(eye.clone().sub(center).normalize()) > .025;
                if(facing && (eye.distanceToSquared(audioMeterState.lastEye) > 1e-10
                    || center.distanceToSquared(audioMeterState.lastCenter) > 1e-10
                    || normal.distanceToSquared(audioMeterState.lastNormal) > 1e-10)){
                    audioMeterState.lastEye.copy(eye); audioMeterState.lastCenter.copy(center);
                    audioMeterState.lastNormal.copy(normal);
                    const direction = center.clone().sub(eye);
                    audioMeterState.occlusionRay.set(eye, direction.clone().normalize());
                    audioMeterState.occlusionRay.far = direction.length() + .025;
                    const hit = audioMeterState.occlusionRay.intersectObjects(settingsControllerBridge.model.children, true).find(hit => {
                        for(let ancestor = hit.object; ancestor; ancestor = ancestor.parent) if(!ancestor.visible) return false;
                        return true;
                    });
                    audioMeterState.unobstructed = false;
                    for(let ancestor = hit?.object; ancestor; ancestor = ancestor.parent){
                        if(ancestor === node.parent) { audioMeterState.unobstructed = true; break; }
                    }
                }
                visible = facing && audioMeterState.unobstructed;
            }
            svg.style.display = visible ? 'block' : 'none';
            if(!visible) return;
            const canvasRect = settingsControllerCanvas.getBoundingClientRect();
            const hostRect = settingsControllerScene.getBoundingClientRect();
            Object.assign(svg.style, { left: (canvasRect.left - hostRect.left) + 'px',
                top: (canvasRect.top - hostRect.top) + 'px', width: canvasRect.width + 'px', height: canvasRect.height + 'px' });
            svg.setAttribute('viewBox', '0 0 ' + canvasRect.width + ' ' + canvasRect.height);
            const point = new THREE.Vector3();
            const project = (x, z) => {
                point.set(x, bounds.min.y, z);
                node.localToWorld(point).project(activeCamera);
                return [(point.x + 1) * canvasRect.width / 2, (1 - point.y) * canvasRect.height / 2].join(',');
            };
            const quad = top => [project(bounds.min.x, bounds.max.z), project(bounds.max.x, bounds.max.z),
                project(bounds.max.x, top), project(bounds.min.x, top)].join(' ');
            const length = bounds.max.z - bounds.min.z;
            well.setAttribute('points', quad(bounds.min.z));
            signal.setAttribute('points', quad(bounds.max.z - length * fill));
            signal.setAttribute('fill', clipped ? '#e3293f' : '#269f60');
            signal.style.display = fill > 0.001 ? 'block' : 'none';
            const peakZ = bounds.max.z - length * peakFill;
            peakLine.setAttribute('points', [project(bounds.min.x, peakZ), project(bounds.max.x, peakZ)].join(' '));
            peakLine.setAttribute('stroke', peakClipped ? '#ff293f' : '#b6f5cf');
            peakLine.style.display = peakFill > 0.001 ? 'block' : 'none';
        }

        function setOwnedNodeAppearance(node, color, emissive, intensity){
            if(!node) return;
            node.traverse((mesh) => {
                if(!mesh?.isMesh || !mesh.material) return;
                const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                const owned = source.map((material) => {
                    if(!material.userData?.controllerOwned){
                        const clone = material.clone();
                        clone.userData = { ...(material.userData || {}), controllerOwned: true, contrastLocked: true };
                        return clone;
                    }
                    return material;
                });
                mesh.material = Array.isArray(mesh.material) ? owned : owned[0];
                owned.forEach((material) => {
                    if(material.color) material.color.copy(color);
                    if(material.emissive) material.emissive.copy(emissive);
                    if('emissiveIntensity' in material) material.emissiveIntensity = intensity;
                    material.needsUpdate = true;
                });
            });
        }

        function getButtonBodyColor(pressedAmount){
            const progress = Math.max(0, Math.min(1, pressedAmount));
            const t = Math.pow(progress, 1.35);
            const inverse = 1 - t;
            return new THREE.Color(
                (inverse * inverse * COLOR_RED.r) + (2 * inverse * t * COLOR_TRANSITION_DARK.r) + (t * t * COLOR_BLUE.r),
                (inverse * inverse * COLOR_RED.g) + (2 * inverse * t * COLOR_TRANSITION_DARK.g) + (t * t * COLOR_BLUE.g),
                (inverse * inverse * COLOR_RED.b) + (2 * inverse * t * COLOR_TRANSITION_DARK.b) + (t * t * COLOR_BLUE.b)
            );
        }

        function applyButtonState(body, text, pressedAmount, glowScale){
            const pressed = Math.max(0, Math.min(1, pressedAmount));
            const bodyColor = getButtonBodyColor(pressed);
            const textColor = COLOR_BLUE.clone().lerp(COLOR_GREEN, pressed);
            const glowProgress = Math.pow(pressed, 2.2);
            const bodyIntensity = (0.2 + (2.2 - 0.2) * glowProgress) * glowScale;
            const textIntensity = (1.35 + (0.15 - 1.35) * pressed) * glowScale;
            setOwnedNodeAppearance(body, bodyColor, bodyColor, bodyIntensity);
            setOwnedNodeAppearance(text, textColor, textColor, textIntensity);
        }

        function matchAudioPanelBackToController(panelNode, controllerNode){
            if(!panelNode?.isMesh || !controllerNode?.isMesh || !panelNode.material || !controllerNode.material) return;
            const controllerMaterials = Array.isArray(controllerNode.material)
                ? controllerNode.material
                : [controllerNode.material];
            const controllerMetal = controllerMaterials.find((material) =>
                /black matte metal/i.test(material?.name || '')
            );
            if(!controllerMetal) return;

            // The controller material samples TEXCOORD_1, while the authored
            // panel back only has TEXCOORD_0. Preserve its good unwrap but make
            // it available on the channel used by the shared metal material.
            const geometry = panelNode.geometry;
            if(geometry?.attributes?.uv && !geometry.attributes.uv1){
                panelNode.geometry = geometry.clone();
                panelNode.geometry.setAttribute('uv1', geometry.attributes.uv.clone());
            }

            const panelMaterials = Array.isArray(panelNode.material)
                ? [...panelNode.material]
                : [panelNode.material];
            let replaced = false;
            panelMaterials.forEach((material, index) => {
                if(!/black matte metal/i.test(material?.name || '')) return;
                panelMaterials[index] = controllerMetal;
                replaced = true;
            });
            if(replaced){
                panelNode.material = Array.isArray(panelNode.material)
                    ? panelMaterials
                    : panelMaterials[0];
            }
        }

        function getMomentaryPressAmount(kind, now){
            if(kind === 'save'){
                if(controllerFlow.animationAllowed === false || getSharedSettings().get().accessibility.reducedMotion){
                    return saveButtonMotion.target;
                }
                const t = Math.max(0, Math.min(1, (now - saveButtonMotion.startedAt) / saveButtonMotion.durationMs));
                const eased = t * t * (3 - 2 * t);
                return saveButtonMotion.from + (saveButtonMotion.target - saveButtonMotion.from) * eased;
            }
            const pulse = momentaryButtonPulses.get(kind);
            if(!pulse) return 0;
            const elapsed = now - pulse.startedAt;
            const { amount, done } = sampleMomentaryPress(kind, elapsed);
            if(done){
                momentaryButtonPulses.delete(kind);
                return 0;
            }
            return amount;
        }
        settingsControllerBridge.setSaveLatched = pressed => {
            const now = performance.now();
            saveButtonMotion = { from: getMomentaryPressAmount('save', now), target: pressed ? 1 : 0,
                startedAt: now, durationMs: pressed ? 70 : 110 };
            applyModeButtonAppearance();
        };

        function applyMomentaryButtonState(kind, glowScale, now){
            const body = controllerButtonNodes.get(`${kind}Body`);
            const text = controllerButtonNodes.get(`${kind}Text`);
            if(!body) return;
            if(!body.userData.restPosition) body.userData.restPosition = body.position.clone();
            const amount = getMomentaryPressAmount(kind, now);
            body.position.copy(body.userData.restPosition);
            body.position.y -= 0.025 * amount;
            applyButtonState(body, text, amount, glowScale);
        }

        function applyModeButtonAppearance(){
            const contrast = Math.max(0, Math.min(1, getContrastValue()));
            const contrastEase = contrast * contrast * (3 - 2 * contrast);
            const glowScale = 0.15 + (0.95 - 0.15) * contrastEase;
            const pressedY = -0.08364;
            const releasedY = -0.03530;
            const audioBody = controllerButtonNodes.get('audioBody');
            const visualsBody = controllerButtonNodes.get('visualsBody');
            const modeProgress = controllerFlow.animationAllowed === false
                ? (activeSettingsView === 'audio' ? 1 : 0)
                : (uiAction && clip
                    ? Math.max(0, Math.min(1, uiAction.time / Math.max(0.0001, clip.duration)))
                    : (activeSettingsView === 'audio' ? 1 : 0));
            const now = performance.now();
            const instant = controllerFlow.animationAllowed === false || getSharedSettings().get().accessibility.reducedMotion;
            const buttonAmounts = modeButtonMotion.sample(now, instant);
            if(audioVisualizationPanel){
                if(audioVisualizationRotation && clip){
                    const rotation = audioVisualizationRotation.evaluate(modeProgress * clip.duration);
                    audioVisualizationPanel.quaternion.fromArray(rotation);
                }
                audioVisualizationPanel.visible = true;
            }
            if(audioBody) audioBody.position.y = releasedY + ((pressedY - releasedY) * buttonAmounts.audio);
            if(visualsBody) visualsBody.position.y = releasedY + ((pressedY - releasedY) * buttonAmounts.visuals);
            applyButtonState(audioBody, controllerButtonNodes.get('audioText'), buttonAmounts.audio, glowScale);
            applyButtonState(visualsBody, controllerButtonNodes.get('visualsText'), buttonAmounts.visuals, glowScale);
            applyMomentaryButtonState('save', glowScale, now);
            applyMomentaryButtonState('reset', glowScale, now);

            const audioLabelIntensity = (0.03 + 1.32 * modeProgress) * glowScale;
            const visualsLabelIntensity = (0.03 + 1.32 * (1 - modeProgress)) * glowScale;
            setOwnedNodeAppearance(controllerModeLabelNodes.get('audioSync'), COLOR_BLACK, COLOR_BLUE, audioLabelIntensity);
            setOwnedNodeAppearance(controllerModeLabelNodes.get('volume'), COLOR_BLACK, COLOR_BLUE, audioLabelIntensity);
            setOwnedNodeAppearance(controllerModeLabelNodes.get('contrast'), COLOR_BLACK, COLOR_BLUE, visualsLabelIntensity);
            setOwnedNodeAppearance(controllerModeLabelNodes.get('brightness'), COLOR_BLACK, COLOR_BLUE, visualsLabelIntensity);
        }

        function pulseMomentaryButton(kind){
            const node = controllerButtonNodes.get(`${kind}Body`);
            if(!node) return;
            if(controllerFlow.animationAllowed === false || getSharedSettings().get().accessibility.reducedMotion){
                momentaryButtonPulses.delete(kind);
                applyModeButtonAppearance();
                return;
            }
            if(!node.userData.restPosition) node.userData.restPosition = node.position.clone();
            momentaryButtonPulses.set(kind, { startedAt: performance.now() });
            applyModeButtonAppearance();
        }
        const CAMERA_ANIM_FRAMES = 120;
        // Multiplier for manual camera tween length. 1 = original speed.
        const CAMERA_ANIM_SPEED_MULTIPLIER = 5;
        let shouldTrackControls = false;
        let lastControlsEnabled = null;
        const FORCE_MANUAL_CAMERA = true;

        const animTuning = {
            customDurationMs: 6000,
            focusDurationMs: 520,
            easePower: 3
        };
        window.animTuning = animTuning;
        const uiAnimTuning = {
            speed: 1
        };
        window.uiAnimTuning = uiAnimTuning;

        function configureOneShot(action){
            action.enabled = true;
            action.clampWhenFinished = true;
            action.setLoop(THREE.LoopOnce, 0);
            action.setEffectiveWeight(1);
        }

        function playOneShot(action, direction){
            configureOneShot(action);
            const dur = action.getClip().duration;
            action.time = direction > 0 ? 0.0 : dur;
            action.paused = false;
            action.setEffectiveTimeScale(direction);
            action.play();
        }

        function playEmissionActions(direction){
            if(!emissionActions.length) return;
            emissionActions.forEach((action) => {
                playOneShot(action, direction);
            });
        }
        window.knobAxisValues = settingsControllerBridge.knobAxisValues;
        let focusAnim = null;
        let middlePointerState = null;
        let lastMiddleClickTime = 0;
        let rightPointerState = null;
        let lastRightClickTime = 0;
        let settledDefaultTarget = null;
        let settledDefaultDirection = null;
        let settledModelQuaternion = null;
        let pendingMiddleSingleClick = null;
        let knobDragState = null;
        let arrowPointerState = null;
        function captureSettledDefault(){
            if(!controls || !activeCamera) return;
            settledDefaultTarget = controls.target.clone();
            settledDefaultDirection = activeCamera.position.clone().sub(controls.target).normalize();
            const model = settingsControllerBridge.model;
            settledModelQuaternion = controllerEntrance && model === controllerEntrance.model
                ? new THREE.Quaternion().setFromEuler(controllerEntrance.homeRotation)
                : model?.quaternion.clone() || null;
        }
        rememberCurrentView = (force = false) => {
            if(!cameraViewReady || introActive || !controls || !activeCamera || !settingsControllerBridge.model?.visible) return;
            if(!force && (cameraTween || focusAnim || controllerEntrance)) return;
            viewMemory.record({ version: 1, position: activeCamera.position.toArray(),
                quaternion: activeCamera.quaternion.toArray(), up: activeCamera.up.toArray(),
                target: controls.target.toArray(), zoom: activeCamera.zoom, fov: activeCamera.fov,
                minDistance: controls.minDistance, maxDistance: controls.maxDistance,
                mode: activeSettingsView, presentation: document.body.classList.contains('start-entry-active') ? 'text' : '3d'
            }, performance.now(), force);
        };
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
        const { frameToTime, timeToFrame, frameToClipTime, getCameraHoldTime } = createStartCameraFlow({
            getClip: () => clip, totalFrames: TOTAL_FRAMES,
            cameraStartFrame: CAMERA_START_FRAME, cameraEndFrame: CAMERA_END_FRAME
        });

        function setFrame(frame){
            if(!uiAction || !uiMixer) return;
            uiAction.paused = true;
            const requestedTime = frameToTime(frame);
            // Sampling exactly at a LoopOnce clip's duration can wrap transform
            // tracks back to their first key. Stay infinitesimally inside the
            // authored endpoint so no-animation mode receives the Audio pose.
            uiAction.time = clip && requestedTime >= clip.duration
                ? Math.max(0, clip.duration - 1e-4)
                : requestedTime;
            uiMixer.setTime(uiAction.time);
            if(emissiveAction){
                emissiveAction.paused = true;
                emissiveAction.time = uiAction.time;
            }
            if(emissiveStrengthBindings.length){
                const t = uiAction.time;
                emissiveStrengthBindings.forEach((binding) => {
                    const value = binding.interpolant.evaluate(t);
                    const v = Array.isArray(value) ? value[0] : value?.[0] ?? value;
                    if(Number.isFinite(v)){
                        binding.material.emissiveIntensity = v;
                        binding.material.needsUpdate = true;
                    }
                });
            }
        }

        function setCameraFrame(frame){
            if(!cameraAction || !cameraMixer) return;
            cameraAction.enabled = true;
            cameraAction.paused = true;
            cameraAction.time = frameToClipTime(frame, cameraAction.getClip(), CAMERA_START_FRAME, CAMERA_END_FRAME);
            cameraMixer.setTime(cameraAction.time);
            logCamEvent(`setCameraFrame(${frame}) time=${cameraAction.time.toFixed(4)}`);
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





        function findMeshByName(model, predicate){
            if(!model || typeof predicate !== 'function') return null;
            let found = null;
            model.traverse((node) => {
                if(found || !node.isMesh) return;
                const name = (node.name || '').toLowerCase();
                if(predicate(name, node)) found = node;
            });
            return found;
        }

        function getScreenFocusPoint(model){
            const screen = findMeshByName(model, (name) => name === 'control-screen' || name === 'control_screen');
            if(screen){
                const box = new THREE.Box3().setFromObject(screen);
                return box.getCenter(new THREE.Vector3());
            }
            const bounds = new THREE.Box3().setFromObject(model);
            return bounds.getCenter(new THREE.Vector3());
        }





        function resetCustomCameraAnimation(){
            const model = settingsControllerBridge.model;
            if(!model || !activeCamera || !controls || controllerFlow.stage !== 'gallery') return;
            focusAnim = null;
            cameraTween = null;
            cameraTargetTime = null;

            const screenTarget = getScreenFocusPoint(model);
            const dir = activeCamera.position.clone().sub(controls.target);
            if(dir.lengthSq() < 1e-6){
                dir.set(0, 0, 1);
            }
            dir.normalize();
            const distance = controls.minDistance || 5;

            controls.target.copy(screenTarget);
            activeCamera.position.copy(screenTarget.clone().add(dir.multiplyScalar(distance)));
            activeCamera.lookAt(screenTarget);
            activeCamera.updateMatrixWorld(true);
            const reducedMotion = getSharedSettings().get().accessibility.reducedMotion ||
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            startManualCameraTween({ instant: reducedMotion });
            if(reducedMotion) stepManualCameraTween();
        }

        function startFocusAnimation(target, { zoomToMin = false, durationMs = null } = {}){
            if(!activeCamera || !controls || !target) return;
            const startTarget = controls.target.clone();
            const startPos = activeCamera.position.clone();
            const startDistance = startPos.distanceTo(startTarget);
            const dir = startPos.clone().sub(startTarget).normalize();
            const endDistance = zoomToMin ? controls.minDistance : startDistance;
            const effectiveDuration = durationMs !== null ? durationMs : animTuning.focusDurationMs;

            focusAnim = {
                startTime: performance.now(),
                durationMs: effectiveDuration,
                startTarget,
                endTarget: target.clone(),
                startDistance,
                endDistance,
                dir
            };

            controls.enabled = false;
        }

        function updateFocusAnimation(){
            if(!focusAnim || !activeCamera || !controls) return false;
            const now = performance.now();
            const t = (now - focusAnim.startTime) / focusAnim.durationMs;
            const k = Math.min(1, Math.max(0, t));
            const targetEase = easeInOutPower(k, animTuning.easePower);
            const zoomEase = easeInOutPower(k, animTuning.easePower);
            const target = focusAnim.startTarget.clone().lerp(focusAnim.endTarget, targetEase);
            const distance = focusAnim.startDistance + (focusAnim.endDistance - focusAnim.startDistance) * zoomEase;

            controls.target.copy(target);
            activeCamera.position.copy(target.clone().add(focusAnim.dir.clone().multiplyScalar(distance)));
            activeCamera.updateMatrixWorld(true);

            if(k >= 1){
                focusAnim = null;
                const wasDamping = controls.enableDamping;
                controls.enableDamping = false;
                controls.update();
                controls.enableDamping = wasDamping;
                controls.enableRotate = true;
                controls.enableZoom = true;
                controls.enabled = true;
                return false;
            }
            return true;
        }



        function startManualCameraTween({ instant = false } = {}){
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
            const model = settingsControllerBridge.model;
            const target = controllerEntrance?.homeCenter?.clone() || (model
                ? new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
                : controls.target.clone());
            cameraTween = {
                frame: 0,
                transition: createCameraTransition(activeCamera, controls, CAMERA_ANIM_POS, CAMERA_ANIM_ROT,
                    target, animTuning.customDurationMs, performance.now() - (instant ? animTuning.customDurationMs + 1 : 0))
            };
            lastCameraFrame = 0;
            logCamEvent(`manual tween start camPos=${camPos.x.toFixed(3)},${camPos.y.toFixed(3)},${camPos.z.toFixed(3)}`);
            // The debug unlock override must not let OrbitControls fight this tween.
            controls.enabled = false;
        }

        function getManualCameraTotalFrames(){
            return Math.max(2, Math.round(CAMERA_ANIM_FRAMES * CAMERA_ANIM_SPEED_MULTIPLIER));
        }

        function stepManualCameraTween(){
            if(!cameraTween || !activeCamera) return false;
            const total = getManualCameraTotalFrames();
            const progress = cameraTween.transition.sample(performance.now());
            cameraTween.frame = progress * (total - 1);
            if(progress >= 1){
                logCamEvent('stepManualCameraTween() complete');
                const finalPos = activeCamera.position.clone();
                const finalQuat = activeCamera.quaternion.clone();
                const target = cameraTween.transition.target;
                cameraTween = null;
                lastCameraFrame = total - 1;
                shouldTrackControls = true;
                usesGltfCamera = false;
                createOrbitControls(activeCamera);
                controls.target.copy(target);
                activeCamera.position.copy(finalPos);
                activeCamera.quaternion.copy(finalQuat);
                controls.update();
                settingsControllerBridge.controls = controls;
                captureSettledDefault();
                cameraViewReady = true;
                lastControlsEnabled = controls.enabled;
                if(pendingAudioAllowed !== null){
                    applyAudioPermission(pendingAudioAllowed);
                    pendingAudioAllowed = null;
                }
            }
            return true;
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
            if(pendingAudioAllowed !== null){
                applyAudioPermission(pendingAudioAllowed);
                pendingAudioAllowed = null;
            }
            const finalPos = activeCamera.position.clone();
            const finalQuat = activeCamera.quaternion.clone();
            const center = model
                ? new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
                : new THREE.Vector3(0, 0, 0);
            createOrbitControls(activeCamera);
            controls.enabled = false;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.target.copy(center);
            activeCamera.position.copy(finalPos);
            activeCamera.quaternion.copy(finalQuat);
            activeCamera.updateMatrixWorld(true);
            controls.update();
            controls.enabled = true;
            cameraTargetTime = null;
        }

        function updateUiAnimationSpeed(){
            if(uiAction && targetTime !== null){
                uiAction.timeScale = Math.sign(uiAction.timeScale || 1) * uiAnimTuning.speed;
            }
        }

        function startAnimationToFrame(frame, jumpBackFrame = null, options = {}){
            if(!uiAction || !clip || !uiMixer) return;
            const { triggerEmissive = true } = options;
            const desiredTime = frameToTime(frame);
            if(Math.abs(uiAction.time - desiredTime) <= FRAME_EPSILON){
                if(jumpBackFrame !== null){
                    setFrame(jumpBackFrame);
                }
                return;
            }
            const dir = desiredTime < uiAction.time ? -1 : 1;
            uiAction.timeScale = dir * (uiAnimTuning.speed || 1);
            if(triggerEmissive){
                playEmissionActions(dir);
            }
            targetTime = desiredTime;
            animationJumpBackFrame = jumpBackFrame;
            uiAction.paused = false;
            uiAction.play();
        }

        function isAtFrame(frame){
            return Math.abs(timeToFrame(uiAction?.time || 0) - frame) <= 0.6;
        }





        function selectMode(mode, options = {}){
            dismissSavedState();
            const { triggerEmissive = true, instant = false } = options;
            closeReadoutEditor({ commit: true });
            const nextMode = mode === 'audio' ? 'audio' : 'visuals';
            if(nextMode !== activeSettingsView && !instant && !introActive
                && controllerFlow.animationAllowed !== false && !getSharedSettings().get().accessibility.reducedMotion){
                const constraints = settingsControllerBridge.knobConstraints;
                knobModeMotion = {
                    startedAt: performance.now(),
                    durationMs: (clip?.duration || 1) * 750 / Math.max(.05, uiAnimTuning.speed),
                    from: {
                        vol: settingsControllerBridge.knobVolNode?.position[constraints?.vol?.axis],
                        sync: settingsControllerBridge.knobSyncNode?.position[constraints?.sync?.axis]
                    }
                };
            }else if(instant || introActive || controllerFlow.animationAllowed === false
                || getSharedSettings().get().accessibility.reducedMotion){
                knobModeMotion = null;
            }
            modeButtonMotion.select(nextMode, performance.now(), instant || introActive || !triggerEmissive
                || controllerFlow.animationAllowed === false || getSharedSettings().get().accessibility.reducedMotion);
            activeSettingsView = nextMode;
            controllerFlow.hoverHint = '';
            const targetFrame = nextMode === 'audio' ? AUDIO_FRAME : VISUALS_FRAME;
            const started = !isAtFrame(targetFrame);
            // Always retarget from the current pose; this also handles rapid
            // changes while the previous direction is still playing.
            if(controllerFlow.animationAllowed === false || instant){
                targetTime = null;
                animationJumpBackFrame = null;
                setFrame(targetFrame);
            }else{
                startAnimationToFrame(targetFrame, null, { triggerEmissive });
            }
            if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
                settingsControllerBridge.updateKnobTransformsFromState();
            }
            updateControllerReadouts();
            applyModeButtonAppearance();
            syncAccessibleControllerUI();
            if(!introActive && !cameraTween && !focusAnim){
                setUserCameraControlsEnabled(true);
            }
            return started;
        }

        function setAccessibilityView(options = {}){
            return selectMode('visuals', options);
        }

        function setAudioView(options = {}){
            return selectMode('audio', options);
        }

        settingsControllerBridge.selectMode = selectMode;
        settingsControllerBridge.setAccessibilityView = setAccessibilityView;
        settingsControllerBridge.setAudioView = setAudioView;
        settingsControllerBridge.finishOnboarding = (allowAnimation) => {
            introActive = false;
            setPreIntroZoomEnabled(false);
            settingsControllerBridge.revealController?.(rememberedStartView ? false : allowAnimation);
            controllerFlow.stage = 'gallery';
            settingsControllerBridge.renderScreen?.();
            if(rememberedStartView){
                cameraTween = null; focusAnim = null; controllerEntrance = null;
                activeCamera.up.fromArray(rememberedStartView.up).normalize();
                createOrbitControls(activeCamera);
                controls.enableDamping = false;
                controls.minDistance = rememberedStartView.minDistance;
                controls.maxDistance = rememberedStartView.maxDistance;
                controls.target.fromArray(rememberedStartView.target);
                activeCamera.position.fromArray(rememberedStartView.position);
                activeCamera.quaternion.fromArray(rememberedStartView.quaternion).normalize();
                activeCamera.zoom = rememberedStartView.zoom;
                activeCamera.fov = rememberedStartView.fov;
                activeCamera.updateProjectionMatrix();
                controls.update(); controls.enableDamping = true;
                settingsControllerBridge.controls = controls;
                usesGltfCamera = false; shouldTrackControls = true;
                setUserCameraControlsEnabled(true);
                selectMode(rememberedStartView.mode, { triggerEmissive: false, instant: true });
                cameraViewReady = true;
                captureSettledDefault();
                return;
            }
            startManualCameraTween();
            if(!allowAnimation && cameraTween){
                cameraTween.transition.sample(performance.now() + animTuning.customDurationMs + 1);
                const finalPos = activeCamera.position.clone();
                const finalQuat = activeCamera.quaternion.clone();
                const target = cameraTween.transition.target.clone();
                cameraTween = null;
                shouldTrackControls = true;
                usesGltfCamera = false;
                createOrbitControls(activeCamera);
                controls.target.copy(target);
                activeCamera.position.copy(finalPos);
                activeCamera.quaternion.copy(finalQuat);
                controls.update();
                settingsControllerBridge.controls = controls;
                captureSettledDefault();
                cameraViewReady = true;
            }
        };

        setUserCameraControlsEnabled(false);

        let lastWidth = 0;
        let lastHeight = 0;
        function resizeScene(){
            const rect = settingsControllerScene.getBoundingClientRect();
            const maxDimension = 1200;
            const canvasScale = Math.min(1, maxDimension / Math.max(1, rect.width, rect.height));
            const width = Math.max(1, rect.width * canvasScale);
            const height = Math.max(1, rect.height * canvasScale);
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
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            // The asset's screen U direction is reversed. Apply the same
            // normalized transform to rendering and raycast hit testing.
            texture.repeat.set(-1 / rangeU, 1 / rangeV);
            texture.offset.set(1 + (minU / rangeU), -minV / rangeV);
            texture.needsUpdate = true;
        }









        function buildControlScreenTexture(clip, uvBounds, screenAspect){
            const canvas = document.createElement('canvas');
            const size = 1024;
            const aspect = screenAspect && Number.isFinite(screenAspect) ? screenAspect : 1;
            const height = Math.max(256, Math.round(size / Math.max(0.25, aspect)));
            canvas.width = size;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if(!ctx) return null;
            const texture = new THREE.CanvasTexture(canvas);
            texture.flipY = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            if('colorSpace' in texture){
                texture.colorSpace = THREE.SRGBColorSpace;
            }else{
                texture.encoding = THREE.sRGBEncoding;
            }
            settingsControllerBridge.screenUvBounds = uvBounds;




            const renderScreen = () => {
                const syncStage = controllerFlow.stage === 'gallery' || controllerFlow.stage === 'sync-running';
                ctx.fillStyle = syncStage ? '#512761' : '#071018';
                ctx.fillRect(0, 0, size, height);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                controllerFlow.hitRegions = [];
                if(controllerFlow.stage === 'sound' || controllerFlow.stage === 'motion'){
                    const soundStep = controllerFlow.stage === 'sound';
                    ctx.fillStyle = '#e5cafc';
                    ctx.font = 'bold 38px "Segoe UI", sans-serif';
                    ctx.fillText(soundStep ? 'Allow audio on this site?' : 'Allow animations on this site?', size * 0.5, height * 0.30);
                    const yes = { x: 0.22, y: 0.60, w: 0.24, h: 0.20 };
                    const no = { x: 0.54, y: 0.60, w: 0.24, h: 0.20 };
                    [[yes, '#8cd8ff', 'YES', true], [no, '#f5b7d9', 'NO', false]].forEach(([rect, fill, label, value]) => {
                        ctx.fillStyle = fill;
                        ctx.fillRect(rect.x * size, rect.y * height, rect.w * size, rect.h * height);
                        ctx.fillStyle = '#11172a';
                        ctx.font = '22px "Press Start 2P", "Segoe UI", sans-serif';
                        ctx.fillText(label, (rect.x + rect.w / 2) * size, (rect.y + rect.h / 2) * height);
                        controllerFlow.hitRegions.push({ kind: 'permission', value, polygon: [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]] });
                    });
                }else if(controllerFlow.stage === 'confirm'){
                    ctx.fillStyle = '#e5cafc';
                    ctx.font = '30px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText('DO THESE SETTINGS', size * 0.5, height * 0.30);
                    ctx.fillText('FEEL RIGHT?', size * 0.5, height * 0.43);
                    const yep = { x: 0.20, y: 0.64, w: 0.25, h: 0.20 };
                    const unsure = { x: 0.55, y: 0.64, w: 0.25, h: 0.20 };
                    [[yep, '#8cd8ff', 'YEP', true], [unsure, '#f5b7d9', 'UM...', false]].forEach(([rect, fill, label, value]) => {
                        ctx.fillStyle = fill;
                        ctx.fillRect(rect.x * size, rect.y * height, rect.w * size, rect.h * height);
                        ctx.fillStyle = '#11172a';
                        ctx.font = '21px "Press Start 2P", "Segoe UI", sans-serif';
                        ctx.fillText(label, (rect.x + rect.w / 2) * size, (rect.y + rect.h / 2) * height);
                        controllerFlow.hitRegions.push({ kind: 'save-confirm', value, polygon: [[rect.x,rect.y],[rect.x+rect.w,rect.y],[rect.x+rect.w,rect.y+rect.h],[rect.x,rect.y+rect.h]] });
                    });
                }else if(controllerFlow.stage === 'gallery'){
                    ctx.fillStyle = '#fff4ff';
                    ctx.font = 'bold 32px "Segoe UI", sans-serif';
                    ctx.fillText('COMPARE THE FLASH AND THE CLICK.', size * 0.5, height * 0.20);
                    ctx.fillText('Adjust sync until they happen together.', size * 0.5, height * 0.29);
                    if(controllerFlow.syncExercise.result){ ctx.font = 'bold 24px \"Segoe UI\", sans-serif'; ctx.fillText(controllerFlow.syncExercise.result, size * 0.5, height * 0.37); }
                    const button = { x: 0.30, y: 0.48, w: 0.40, h: 0.30 };
                    ctx.fillStyle = '#a94710';
                    ctx.beginPath();
                    ctx.roundRect(button.x * size, button.y * height, button.w * size, button.h * height, 24);
                    ctx.fill();
                    ctx.fillStyle = '#fff4df';
                    ctx.font = '64px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText('SYNC', size * 0.5, height * 0.63);
                    controllerFlow.hitRegions.push({ kind: 'sync-start', value: true, polygon: [[button.x,button.y],[button.x+button.w,button.y],[button.x+button.w,button.y+button.h],[button.x,button.y+button.h]] });
                }else if(controllerFlow.stage === 'sync-running'){
                    const exercise = controllerFlow.syncExercise;
                    const sample = syncComparison?.sample();
                    ctx.fillStyle = '#fff4ff';
                    ctx.font = 'bold 36px "Segoe UI", sans-serif';
                    ctx.fillText('Match the click to the flash', size * .5, height * .13);
                    ctx.font = '28px "Segoe UI", sans-serif';
                    const message = exercise.result || (sample?.guiding ? 'Listen to the guide…' : 'Turn the sync knob. No tapping needed.');
                    ctx.fillText(message, size * .5, height * .23);
                    ctx.fillStyle = sample?.flash ? '#fff4d1' : '#203747';
                    ctx.beginPath(); ctx.arc(size * .5, height * .46, height * .14, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = sample?.flash ? '#172532' : '#cee7f2';
                    ctx.font = 'bold 32px "Segoe UI", sans-serif';
                    ctx.fillText(sample?.flash ? 'FLASH' : '•', size * .5, height * .46);
                    ctx.fillStyle = '#fff4ff';
                    ctx.font = 'bold 30px "Segoe UI", sans-serif';
                    ctx.fillText('Preview: ' + storedSync + ' ms — not saved', size * .5, height * .68);
                    const buttons = exercise.active
                        ? [{ kind: 'sync-commit', label: 'Use this offset', x: .07, w: .43, fill: '#8cd8ff' },
                            { kind: 'sync-cancel', label: 'Cancel', x: .55, w: .38, fill: '#f5b7d9' }]
                        : [{ kind: 'sync-start', label: 'Try again', x: .07, w: .43, fill: '#8cd8ff' },
                            { kind: 'sync-cancel', label: 'Back', x: .55, w: .38, fill: '#f5b7d9' }];
                    buttons.forEach(button => {
                        ctx.fillStyle = button.fill;
                        ctx.fillRect(size * button.x, height * .79, size * button.w, height * .15);
                        ctx.fillStyle = '#11172a'; ctx.font = 'bold 30px "Segoe UI", sans-serif';
                        ctx.fillText(button.label, size * (button.x + button.w / 2), height * .865);
                        controllerFlow.hitRegions.push({ kind: button.kind, polygon: [[button.x,.79],[button.x+button.w,.79],[button.x+button.w,.94],[button.x,.94]] });
                    });
                }
                if(controllerFlow.hoverHint){
                    ctx.fillStyle = 'rgba(3, 8, 14, .88)';
                    ctx.fillRect(0, height * 0.90, size, height * 0.10);
                    ctx.fillStyle = '#8cd8ff';
                    ctx.font = '14px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText(controllerFlow.hoverHint, size * 0.5, height * 0.95);
                }
                texture.needsUpdate = true;
            };
            settingsControllerBridge.renderScreen = renderScreen;
            renderScreen();
            return texture;
        }

        function animate(){
            if(sceneDisposed || scope.signal.aborted || suspended || projectOverlayOpen){ sceneFrameId = 0; return; }
            updateReadoutEditorPosition();
            if(controllerFlow.stage === 'playing' && jumpVideo.readyState >= 2){
                settingsControllerBridge.renderScreen?.();
            }
            if(updateFocusAnimation()){
                renderScene();
                sceneFrameId = requestAnimationFrame(animate);
                return;
            }
            if(controls && controls.enabled && !cameraTween){
                controls.update();
            }
            const delta = clock.getDelta();
            if(controllerEntrance){
                const { model, homePosition, homeScale, homeRotation, startedAt, durationMs } = controllerEntrance;
                const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
                const pop = 1 + 0.16 * Math.sin(progress * Math.PI) * (1 - progress);
                const eased = 1 - Math.pow(1 - progress, 3);
                model.position.copy(homePosition);
                model.position.y -= (1 - eased) * 0.62;
                model.scale.copy(homeScale).multiplyScalar(Math.max(0.02, eased * pop));
                model.rotation.copy(homeRotation);
                if(progress >= 1){
                    model.position.copy(homePosition);
                    model.scale.copy(homeScale);
                    model.rotation.copy(homeRotation);
                    controllerEntrance = null;
                }
            }
            if(uiMixer){
                if(uiAction && !uiAction.paused){
                    uiMixer.update(delta);
                }
                if(uiAction && targetTime !== null && !uiAction.paused){
                    const reached = uiAction.timeScale >= 0
                        ? uiAction.time >= targetTime
                        : uiAction.time <= targetTime;
                    if(reached){
                        uiAction.time = targetTime;
                        uiAction.paused = true;
                        uiAction.timeScale = 1;
                        if(emissiveAction){
                            emissiveAction.time = uiAction.time;
                            emissiveAction.paused = true;
                            emissiveAction.setEffectiveTimeScale(1);
                        }
                        targetTime = null;
                        uiMixer.setTime(uiAction.time);
                        if(animationJumpBackFrame !== null){
                            setFrame(animationJumpBackFrame);
                            animationJumpBackFrame = null;
                        }
                        if(!introActive && !cameraTween && !focusAnim){
                            setUserCameraControlsEnabled(true);
                        }
                    }
                }
            }
            if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
                settingsControllerBridge.updateKnobTransformsFromState();
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
            applyModeButtonAppearance();
            if(emissiveStrengthBindings.length){
                const t = uiAction?.time ?? 0;
                emissiveStrengthBindings.forEach((binding) => {
                    const value = binding.interpolant.evaluate(t);
                    const v = Array.isArray(value) ? value[0] : value?.[0] ?? value;
                    if(Number.isFinite(v)){
                        binding.material.emissiveIntensity = v;
                        binding.material.needsUpdate = true;
                    }
                });
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
                if(uiAction && clip){
                    const uiFrame = Math.round(timeToFrame(uiAction.time || 0));
                    if(uiFrame !== lastUiFrameLogged){
                        if(uiFrame === 1 || uiFrame === 16){
                            uiFrameLog.push('\n');
                        }
                        uiFrameLog.push(String(uiFrame));
                        if(uiFrameLog.length > MAX_UI_LOG){
                            uiFrameLog.shift();
                        }
                        lastUiFrameLogged = uiFrame;
                    }
                }
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
                if(uiFrameLog.length){
                    debugText += `\n\nUI FRAMES\n${uiFrameLog.join(' ').replace(/\\n\\s*/g, '\\n')}`;
                }
                if(uiAction && clip){
                    debugText += `\n\nUI STATE\nuiClip: ${clip.name || '(unnamed)'}`
                        + `\nuiClipDur: ${Number(clip.duration || 0).toFixed(4)}`
                        + `\nuiTracks: ${clip.tracks?.length || 0}`
                        + `\nuiPaused: ${!!uiAction.paused}`
                        + `\nuiTime: ${Number(uiAction.time || 0).toFixed(4)}`
                        + `\nuiTarget: ${targetTime === null ? 'null' : Number(targetTime).toFixed(4)}`
                        + `\nuiFrame: ${Math.round(timeToFrame(uiAction.time || 0))}`;
                }
                if(animationInfoLines.length){
                    debugText += `\n\nANIMATION INFO\n${animationInfoLines.join('\n')}`;
                }
                if(camAnimLog.length){
                    debugText += `\n\nEVENT LOG\n${camAnimLog.join('\n')}`;
                }
                if(camAnimDebugContent.textContent !== debugText) camAnimDebugContent.textContent = debugText;
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
            if(debugCameraPanel){
                ensureLightingDebugLine();
            }
            renderScene();
            sceneFrameId = requestAnimationFrame(animate);
        }

        function applyPanelProjection(){
            if(activeCamera.view?.enabled) activeCamera.clearViewOffset();
            const withWorkRail = target => {
                const space = panelViewport(target);
                const rect = target.getBoundingClientRect();
                const rail = startControllerOverview.getBoundingClientRect();
                if(startControllerOverview.hidden || !rail.width || !rail.height) return space;
                if(rail.width < rect.width * .65){
                    const left = Math.min(space.right, Math.max(space.left, rail.right - rect.left));
                    return { ...space, left, offsetX: (space.width - left - space.right) / 2 };
                }
                const coveredTop = Math.max(0, Math.min(rect.height * .5, rail.bottom - rect.top));
                return { ...space, offsetY: -coveredTop / 2 };
            };
            const panelSpace = withWorkRail(settingsControllerCanvas);
            let projectionX = panelSpace.offsetX * lastWidth / Math.max(1, panelSpace.width);
            const projectionY = panelSpace.offsetY || 0;
            if(centerOnViewport && settingsControllerBridge.model){
                const rect = settingsControllerCanvas.getBoundingClientRect();
                const pageSpace = withWorkRail(document.documentElement);
                const modelCenter = settingsControllerBridge.model.localToWorld(modelLocalCenter.clone());
                activeCamera.updateMatrixWorld(true);
                const ndc = modelCenter.project(activeCamera);
                const desiredX = THREE.MathUtils.clamp(((pageSpace.left + pageSpace.right) * 0.5 - rect.left) / Math.max(1, rect.width), 0.1, 0.9) * 2 - 1;
                if(Number.isFinite(ndc.x)){
                    projectionX = (ndc.x - desiredX) * lastWidth / 2;
                }
            }
            if(projectionX || projectionY){
                // PerspectiveCamera.setViewOffset assigns aspect = fullWidth / fullHeight.
                // Match the current camera aspect and use a full-size crop so the
                // panels shift the projection without changing its scale or shape.
                const fullWidth = activeCamera.isPerspectiveCamera
                    ? activeCamera.aspect * lastHeight : lastWidth;
                const offsetX = projectionX * fullWidth / lastWidth;
                activeCamera.setViewOffset(fullWidth, lastHeight, offsetX, projectionY, fullWidth, lastHeight);
            }
        }

        function renderScene(){
            if(lastWidth < 2 || lastHeight < 2) return;
            powerCat?.update();
            if(controllerFlow.syncExercise.active) settingsControllerBridge.renderScreen?.();
            applyPanelProjection();
            stickyAdapter.update();
            renderer.setViewport(0, 0, lastWidth, lastHeight);
            renderer.setScissor(0, 0, lastWidth, lastHeight);
            powerCat?.beforeRender();
            try {
                renderer.render(scene, activeCamera);
                // applyPanelProjection shifts the GLB around the page panels.
                // Project the meter before clearing that same camera offset.
                renderAudioMeter();
            }
            finally {
                if(activeCamera.view?.enabled) activeCamera.clearViewOffset();
                powerCat?.afterRender();
            }
            rememberCurrentView();
        }

        resizeScene();
        settingsControllerBridge.resetCustomCameraAnimation = resetCustomCameraAnimation;
        bindAnimTuningControls({ animTuning, uiAnimTuning, resetCustomCameraAnimation, updateUiAnimationSpeed });
        resizeObserver = new ResizeObserver(resizeScene);
        resizeObserver.observe(settingsControllerScene);
        listen(window, 'resize', resizeScene);
        listen(window, 'orientationchange', resizeScene);
        let scenePauseStartedAt = null;
        suspendScene = () => {
            if(scenePauseStartedAt === null) scenePauseStartedAt = performance.now();
            cancelAnimationFrame(sceneFrameId);
            sceneFrameId = 0;
        };
        resumeScene = () => {
            if(sceneDisposed || sceneFrameId || suspended || projectOverlayOpen) return;
            if(scenePauseStartedAt !== null){
                const pausedMs = performance.now() - scenePauseStartedAt;
                if(controllerEntrance) controllerEntrance.startedAt += pausedMs;
                if(focusAnim) focusAnim.startTime += pausedMs;
                cameraTween?.transition.shiftStartTime(pausedMs);
                clock.getDelta();
                scenePauseStartedAt = null;
            }
            animate();
        };
        animate();

        const loader = new GLTFLoader();
        let controllerModelLoaded = false;
        loader.load(SETTINGS_CONTROLLER_GLB, (gltf)=>{
            if(sceneDisposed || scope.signal.aborted){
                disposeControllerSceneResources(gltf.scene);
                return;
            }
            controllerModelLoaded = true;
            const model = gltf.scene;
            if(!model) return;
            scene.add(model);
            model.updateMatrixWorld(true);
            model.worldToLocal(new THREE.Box3().setFromObject(model).getCenter(modelLocalCenter));
            // The first question is intentionally outside the controller. The
            // controller itself appears only after that choice.
            model.visible = false;
            model.updateMatrixWorld(true);
            const nodeByName = (name) => model.getObjectByName(name) || null;
            // The audited visible layout is authoritative: the left
            // btn-accessibility mesh reads AUDIO; the right btn-vol-sync reads
            // VISUALS.  Bind those roles explicitly instead of trusting names.
            controllerButtonNodes.set('audioBody', nodeByName('btn-accessibility'));
            controllerButtonNodes.set('audioText', nodeByName('txt-acc'));
            controllerButtonNodes.set('visualsBody', nodeByName('btn-vol-sync'));
            controllerButtonNodes.set('visualsText', nodeByName('txt-vol'));
            controllerButtonNodes.set('saveBody', nodeByName('btn-save'));
            controllerButtonNodes.set('saveText', nodeByName('txt-save'));
            controllerButtonNodes.set('resetBody', nodeByName('btn-reset'));
            controllerButtonNodes.set('resetText', nodeByName('txt-reset'));
            audioVisualizationPanel = nodeByName('vol-meter-flip');
            matchAudioPanelBackToController(
                nodeByName('vol-meter.001'),
                nodeByName('control-panel')
            );
            prepareAudioMeter(nodeByName('vol-meter'));
            controllerModeLabelNodes.set('audioSync', nodeByName('txt-audiosync'));
            controllerModeLabelNodes.set('volume', nodeByName('txt-volume'));
            controllerModeLabelNodes.set('contrast', nodeByName('txt-contrast'));
            controllerModeLabelNodes.set('brightness', nodeByName('txt-brightness'));
            loadEmissiveExclusions();
            loadEmissiveScales();

            const allClips = gltf.animations || [];
            console.group('[SettingsController GLB] Animations');
            allClips.forEach((c, i) => {
                console.log(`#${i}`, c.name || '(unnamed)', 'duration:', c.duration);
            });
            console.groupEnd();
            const animatedNodes = new Set();
            const emissiveAnimNodes = new Set();
            const emissiveAnimMaterials = new Set();
            emissiveStrengthBindings = [];
            allClips.forEach((clipItem) => {
                clipItem.tracks.forEach((track) => {
                    const name = typeof track.name === 'string' ? track.name : '';
                    const nodeName = name.split('.')[0].trim();
                    if(nodeName) animatedNodes.add(nodeName);
                    const lower = name.toLowerCase();
                    const hasEmissiveTrack = lower.includes('emissiveintensity')
                        || lower.includes('emission')
                        || lower.includes('emissive')
                        || lower.includes('glow');
                    if(hasEmissiveTrack && nodeName){
                        emissiveAnimNodes.add(nodeName.toLowerCase());
                    }
                    const materialMatch = name.match(/materials\[(\d+)\]\.(.+)/i);
                    if(materialMatch){
                        const pathTail = materialMatch[2].toLowerCase();
                        if(pathTail.includes('emissive') || pathTail.includes('emission') || pathTail.includes('glow')){
                            const idx = parseInt(materialMatch[1], 10);
                            if(Number.isFinite(idx) && gltf.materials && gltf.materials[idx]?.name){
                                emissiveAnimMaterials.add(gltf.materials[idx].name.toLowerCase());
                                const mat = gltf.materials[idx];
                                if(track.ValueTypeName === 'number' || track.ValueTypeName === 'scalar' || track.ValueTypeName === undefined){
                                    emissiveStrengthBindings.push({
                                        material: mat,
                                        track,
                                        interpolant: track.createInterpolant()
                                    });
                                }
                            }
                        }
                    } else if(lower.includes('material') && hasEmissiveTrack){
                        const parts = name.split('.');
                        if(parts.length > 1){
                            const matName = parts[0].replace(/^materials\//i, '').trim();
                            if(matName){
                                emissiveAnimMaterials.add(matName.toLowerCase());
                            }
                        }
                    }
                });
            });
            animatedNodeNames = new Set([...animatedNodes].map((name) => name.toLowerCase()));
            if(!loggedEmissiveTracks){
                console.group('[Emissive Strength Tracks]');
                if(emissiveStrengthBindings.length){
                    emissiveStrengthBindings.forEach((binding) => {
                        const times = Array.from(binding.track.times || []);
                        const values = Array.from(binding.track.values || []);
                        console.log({
                            material: binding.material?.name || '(unnamed)',
                            track: binding.track.name,
                            times,
                            values: values.slice(0, 12)
                        });
                    });
                }else{
                    const emissiveTrackNames = [];
                    allClips.forEach((clipItem) => {
                        clipItem.tracks.forEach((track) => {
                            const name = typeof track.name === 'string' ? track.name.toLowerCase() : '';
                            if(name.includes('emissive') || name.includes('emission') || name.includes('glow')){
                                emissiveTrackNames.push(track.name);
                            }
                        });
                    });
                    console.log({
                        bindings: 0,
                        emissiveTrackNames
                    });
                }
                console.groupEnd();
                loggedEmissiveTracks = true;
            }
            const sortedAnimatedNodes = [...animatedNodes].sort();

            lightingTargets = captureLightingTargets(model, emissiveAnimMaterials, emissiveAnimNodes);
            applyLuxControls();
            applyEmissionControls();
            applyBackgroundBrightness(getBackgroundBrightness());
            // Button appearance is node-owned and deterministic; do not infer
            // color changes from shared material names or playback direction.
            let percentSyncNode = null;
            let percentVolNode = null;
            model.traverse((child) => {
                if(!child || !child.isObject3D) return;
                const name = (child.name || '').toLowerCase();
                if(!percentSyncNode && (name === 'txt-percent-sync' || name.includes('txt-percent-sync'))){
                    if(child.isMesh){
                        percentSyncNode = child.parent?.isMesh ? child.parent : child;
                        if(percentSyncNode !== child) child.visible = false;
                    }else{
                        let meshDesc = null;
                        child.traverse((desc) => {
                            if(meshDesc || !desc?.isMesh) return;
                            meshDesc = desc;
                        });
                        percentSyncNode = meshDesc || child;
                    }
                }
                if(!percentVolNode && (name === 'txt-percent-vol' || name.includes('txt-percent-vol'))){
                    if(child.isMesh){
                        percentVolNode = child.parent?.isMesh ? child.parent : child;
                        if(percentVolNode !== child) child.visible = false;
                    }else{
                        let meshDesc = null;
                        child.traverse((desc) => { if(!meshDesc && desc?.isMesh) meshDesc = desc; });
                        percentVolNode = meshDesc || child;
                    }
                }
            });
            // Keep each value on the plate nearest its physical slider. The
            // exported names match those plate positions.
            if(percentSyncNode) initReadoutLabel(percentSyncNode, 'sync');
            if(percentVolNode) initReadoutLabel(percentVolNode, 'vol');

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

            const buildCameraClip = (clipItem) => {
                if(!cameraNode || !clipItem) return null;
                const cameraTracks = clipItem.tracks.filter((track) => {
                    const name = typeof track.name === 'string' ? track.name : '';
                    return name.startsWith(`${cameraNode.name}.`);
                });
                if(!cameraTracks.length) return null;
                return cameraTracks.length === clipItem.tracks.length
                    ? clipItem
                    : new THREE.AnimationClip(`${clipItem.name || 'camera'}-camera`, clipItem.duration, cameraTracks);
            };

            const buildUiClip = (clips) => {
                if(!clips || !clips.length) return null;
                const uiClips = [];
                const emissiveTracks = [];
                const isModeTrack = (trackName) => {
                    const nodeName = String(trackName || '').split('.')[0].trim().toLowerCase();
                    return nodeName === 'info-panel'
                        || nodeName === 'vol-meter-flip'
                        || nodeName === 'btn-accessibility'
                        || nodeName === 'btn-vol-sync'
                        || /^txt-(audiosync|audio-sync|volume|contrast|brightness)/.test(nodeName);
                };
                clips.forEach((clipItem) => {
                    if(!clipItem || !clipItem.tracks?.length) return;
                    clipItem.tracks.forEach((track) => {
                        const name = typeof track.name === 'string' ? track.name.toLowerCase() : '';
                        if(name.includes('emissive') || name.includes('emission') || name.includes('glow') || name.includes('materials/')){
                            emissiveTracks.push(track);
                        }
                    });
                    const uiTracks = clipItem.tracks.filter((track) => isModeTrack(track.name));
                    if(!uiTracks.length) return;
                    const uiDuration = Number.isFinite(clipItem.duration) && clipItem.duration > 0 ? clipItem.duration : -1;
                    uiClips.push(new THREE.AnimationClip(`${clipItem.name || 'ui'}-ui`, uiDuration, uiTracks));
                });
                const combinedTracks = [];
                uiClips.forEach((clipItem) => {
                    if(clipItem?.tracks?.length){
                        combinedTracks.push(...clipItem.tracks);
                    }
                });
                if(!combinedTracks.length) return null;
                const uiClip = new THREE.AnimationClip('ui-combined', -1, combinedTracks);
                if(emissiveTracks.length){
                    uiClip.userData = { ...(uiClip.userData || {}), emissiveTracks };
                }
                return uiClip;
            };

            let cameraClip = buildCameraClip(allClips.find(hasCameraTrack) || null);
            let uiClip = buildUiClip(allClips);
            if(!uiClip && allClips.length){
                const fallback = allClips.find((clipItem) => !hasCameraTrack(clipItem)) || allClips[0];
                if(fallback && fallback.tracks?.length){
                    uiClip = fallback;
                }
            }
            if(uiClip){
                animationInfoLines = [
                    `Animation Clip: ${uiClip.name || 'unnamed'}`,
                    `Animated nodes (${sortedAnimatedNodes.length}):`,
                    ...sortedAnimatedNodes.map((nodeName) => `- ${nodeName}`)
                ];
            }else{
                animationInfoLines = ['Animation Clip: none'];
            }

            if(!uiMixer){
                uiMixer = new THREE.AnimationMixer(model);
            }
            if(uiClip){
                clip = uiClip;
                const audioPanelTrack = uiClip.tracks.find((track) => {
                    const name = String(track?.name || '').toLowerCase();
                    return name.startsWith('vol-meter-flip.') && name.endsWith('.quaternion');
                });
                audioVisualizationRotation = audioPanelTrack?.createInterpolant?.() || null;
                uiAction = uiMixer.clipAction(uiClip);
                uiAction.clampWhenFinished = true;
                uiAction.setLoop(THREE.LoopOnce, 1);
                uiAction.play();
                setFrame(VISUALS_FRAME);
                const emissiveTracks = uiClip.userData?.emissiveTracks || [];
                if(emissiveTracks.length){
                    const emissiveClip = new THREE.AnimationClip('emissive-only', -1, emissiveTracks);
                    emissiveAction = uiMixer.clipAction(emissiveClip);
                    emissiveAction.clampWhenFinished = true;
                    emissiveAction.setLoop(THREE.LoopOnce, 1);
                    emissiveAction.play();
                    emissionActions = [emissiveAction].filter(Boolean);
                }else{
                    emissionActions = [];
                }
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
                logCamEvent(`cameraClip init name=${cameraClip.name || 'unnamed'} dur=${cameraClip.duration.toFixed(4)} time=${cameraAction.time.toFixed(4)}`);
                setCameraFrame(CAMERA_START_FRAME);
                if(activeCamera){
                    activeCamera.updateMatrixWorld(true);
                }
            }
            if(cameraClip && FORCE_MANUAL_CAMERA){
                logCamEvent(`cameraClip found but skipped (FORCE_MANUAL_CAMERA=true) name=${cameraClip.name || 'unnamed'} dur=${cameraClip.duration.toFixed(4)}`);
            }
            if(!cameraClip || FORCE_MANUAL_CAMERA){
                cameraAction = null;
                cameraMixer = null;
                usesGltfCamera = false;
                setUserCameraControlsEnabled(false);
                logCamEvent('manual camera path active');
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

            let knobVolNode = null;
            let knobSyncNode = null;
            model.traverse((child) => {
                if(!child || !child.isObject3D) return;
                const name = (child.name || '').toLowerCase();
                if(!knobVolNode && (name.includes('knob-vol') || name.includes('knob_vol') || name.includes('knobvol'))){
                    knobVolNode = child;
                }
                if(!knobSyncNode && (name.includes('knob-sync') || name.includes('knob_sync') || name.includes('knobsync'))){
                    knobSyncNode = child;
                }
            });
            const gasketByType = { vol: null, sync: null };
            const detectorByType = { vol: null, sync: null };
            const findGasketForType = (type) => {
                if(gasketByType[type]) return gasketByType[type];
                let found = null;
                model.traverse((child) => {
                    if(found || !child || !child.isObject3D) return;
                    const name = (child.name || '').toLowerCase();
                    if(!name.includes('gasket')) return;
                    if(type === 'vol' && (name.includes('-vol') || name.includes('_vol') || name.includes('vol'))){
                        found = child;
                    }
                    if(type === 'sync' && (name.includes('-sync') || name.includes('_sync') || name.includes('sync'))){
                        found = child;
                    }
                });
                gasketByType[type] = found;
                return found;
            };
            const findDetectorForType = (type) => {
                if(detectorByType[type]) return detectorByType[type];
                let found = null;
                model.traverse((child) => {
                    if(found || !child || !child.isObject3D) return;
                    const name = (child.name || '').toLowerCase();
                    if(!name.includes('detector')) return;
                    if(type === 'vol' && (name.includes('-vol') || name.includes('_vol') || name.includes('vol'))){
                        found = child;
                    }
                    if(type === 'sync' && (name.includes('-sync') || name.includes('_sync') || name.includes('sync'))){
                        found = child;
                    }
                });
                detectorByType[type] = found;
                return found;
            };
            settingsControllerBridge.knobVolNode = knobVolNode;
            settingsControllerBridge.knobSyncNode = knobSyncNode;
            settingsControllerBridge.knobDefaults = {
                vol: knobVolNode ? knobVolNode.position.clone() : null,
                sync: knobSyncNode ? knobSyncNode.position.clone() : null
            };
            const cornersFromBox = (box) => {
                const { min, max } = box;
                return [
                    new THREE.Vector3(min.x, min.y, min.z),
                    new THREE.Vector3(min.x, min.y, max.z),
                    new THREE.Vector3(min.x, max.y, min.z),
                    new THREE.Vector3(min.x, max.y, max.z),
                    new THREE.Vector3(max.x, min.y, min.z),
                    new THREE.Vector3(max.x, min.y, max.z),
                    new THREE.Vector3(max.x, max.y, min.z),
                    new THREE.Vector3(max.x, max.y, max.z)
                ];
            };
            const getAxisBoundsInParent = (object, parent, axis) => {
                if(!object || !parent) return null;
                object.updateMatrixWorld(true);
                parent.updateMatrixWorld(true);
                const values = [];
                object.traverse((mesh) => {
                    if(!mesh?.isMesh || !mesh.geometry) return;
                    mesh.geometry.computeBoundingBox();
                    const box = mesh.geometry.boundingBox;
                    if(!box) return;
                    cornersFromBox(box).forEach((corner) => {
                        const world = corner.applyMatrix4(mesh.matrixWorld);
                        values.push(parent.worldToLocal(world)[axis]);
                    });
                });
                if(!values.length) return null;
                return { min: Math.min(...values), max: Math.max(...values) };
            };
            const buildConstraint = (type, knobNode, fallbackRange) => {
                if(!knobNode || !knobNode.parent) return null;
                const axis = type === 'vol' ? 'x' : 'z';
                const rail = findDetectorForType(type) || findGasketForType(type);
                const railBounds = getAxisBoundsInParent(rail, knobNode.parent, axis);
                const knobBounds = getAxisBoundsInParent(knobNode, knobNode.parent, axis);
                if(!railBounds){
                    const base = knobNode.position[axis];
                    return { axis, min: base - fallbackRange * 0.5, max: base + fallbackRange * 0.5 };
                }
                const radiusInset = knobBounds ? Math.max(0, (knobBounds.max - knobBounds.min) * 0.5) : 0;
                let min = railBounds.min + radiusInset;
                let max = railBounds.max - radiusInset;
                if(!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-4){
                    const base = knobNode.position[axis];
                    min = base - fallbackRange * 0.5;
                    max = base + fallbackRange * 0.5;
                }
                return { axis, min, max };
            };
            settingsControllerBridge.knobConstraints = {
                vol: buildConstraint('vol', knobVolNode, KNOB_VOL_RANGE),
                sync: buildConstraint('sync', knobSyncNode, KNOB_SYNC_RANGE)
            };
            const addGasketHitbox = (type, gasketNode) => {
                if(!gasketNode || !gasketNode.parent) return null;
                const box = new THREE.Box3().setFromObject(gasketNode);
                const centerWorld = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                const offset = new THREE.Vector3(0, 0, 0);
                const hitSize = new THREE.Vector3(
                    Math.max(0.06, size.x * 1.12),
                    Math.max(0.06, size.y * 1.25),
                    Math.max(0.06, size.z * 1.12)
                );
                const hitbox = new THREE.Mesh(
                    new THREE.BoxGeometry(hitSize.x, hitSize.y, hitSize.z),
                    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
                );
                hitbox.name = `hitbox-gasket-${type}`;
                hitbox.userData.knobType = type;
                const localPos = model.worldToLocal(centerWorld.add(offset));
                hitbox.position.copy(localPos);
                model.add(hitbox);
                return hitbox;
            };
            settingsControllerBridge.knobHitboxes = {
                vol: addGasketHitbox('vol', findDetectorForType('vol') || findGasketForType('vol')),
                sync: addGasketHitbox('sync', findDetectorForType('sync') || findGasketForType('sync'))
            };
            updateKnobTransformsFromState();

            const primaryScreen = screenTextureTargets[0] || null;
            const uvBounds = primaryScreen ? findUvBounds(primaryScreen) : null;
            const screenAspect = primaryScreen ? getMeshAspect(primaryScreen) : null;
            const screenTextureBuilt = buildControlScreenTexture(clip, uvBounds, screenAspect, sortedAnimatedNodes);
            screenTexture = screenTextureBuilt;
            if(screenTexture){
                let applied = false;
                if(primaryScreen){
                    fitTextureToUV(primaryScreen, screenTexture);
                }
                screenTextureTargets.forEach((child) => {
                    const owned = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, side: THREE.DoubleSide });
                    child.material = owned;
                    applied = true;
                });
            if(!applied){
                console.warn('control-screen mesh not found for grid overlay');
            }
        }

        function findKnobType(node){
            let current = node;
            while(current){
                if(current.userData && (current.userData.knobType === 'vol' || current.userData.knobType === 'sync')){
                    return current.userData.knobType;
                }
                if(current === settingsControllerBridge.knobSyncNode) return 'sync';
                if(current === settingsControllerBridge.knobVolNode) return 'vol';
                const name = (current.name || '').toLowerCase();
                const isKnobOrGasket = name.includes('knob') || name.includes('gasket') || name.includes('detector');
                if(isKnobOrGasket && (name.includes('-sync') || name.includes('_sync') || name.includes('knobsync') || name.includes('sync'))){
                    return 'sync';
                }
                if(isKnobOrGasket && (name.includes('-vol') || name.includes('_vol') || name.includes('knobvol') || name.includes('volume') || name.includes('vol'))){
                    return 'vol';
                }
                current = current.parent;
            }
            return null;
        }

        function getKnobTFromClient(knobState, clientX, clientY){
            const rect = settingsControllerCanvas.getBoundingClientRect();
            const point = new THREE.Vector2(clientX - rect.left, clientY - rect.top);
            const ab = knobState.pMax.clone().sub(knobState.pMin);
            const abLenSq = Math.max(1e-6, ab.lengthSq());
            let t = point.clone().sub(knobState.pMin).dot(ab) / abLenSq;
            return t;
        }

        function resolveKnobTypeFromPointer(clientX, clientY, hitObject){
            const fallbackType = findKnobType(hitObject);
            const constraints = settingsControllerBridge.knobConstraints;
            if(!activeCamera || !settingsControllerCanvas || !constraints) return fallbackType;
            const rect = settingsControllerCanvas.getBoundingClientRect();
            if(!rect.width || !rect.height) return fallbackType;
            const point = new THREE.Vector2(clientX - rect.left, clientY - rect.top);
            const toScreen = (node, constraint) => {
                if(!node || !node.parent || !constraint) return null;
                const toPt = (axisValue) => {
                    const local = node.position.clone();
                    local[constraint.axis] = axisValue;
                    const world = node.parent.localToWorld(local.clone());
                    applyPanelProjection();
                    const ndc = world.clone().project(activeCamera);
                    if(activeCamera.view?.enabled) activeCamera.clearViewOffset();
                    return new THREE.Vector2(
                        ((ndc.x + 1) * 0.5) * rect.width,
                        ((1 - ndc.y) * 0.5) * rect.height
                    );
                };
                const p0 = toPt(constraint.min);
                const p1 = toPt(constraint.max);
                return { p0, p1 };
            };
            const distToSegment = (p, a, b) => {
                const ab = b.clone().sub(a);
                const abLenSq = Math.max(1e-6, ab.lengthSq());
                let t = p.clone().sub(a).dot(ab) / abLenSq;
                t = Math.max(0, Math.min(1, t));
                const proj = a.clone().add(ab.multiplyScalar(t));
                return p.distanceTo(proj);
            };

            const candidates = [];
            const addCandidate = (type, node, constraint) => {
                const seg = toScreen(node, constraint);
                if(!seg) return;
                const d = distToSegment(point, seg.p0, seg.p1);
                candidates.push({ type, d });
            };
            addCandidate('vol', settingsControllerBridge.knobVolNode, constraints.vol);
            addCandidate('sync', settingsControllerBridge.knobSyncNode, constraints.sync);
            if(!candidates.length) return fallbackType;
            candidates.sort((a, b) => a.d - b.d);
            const best = candidates[0];
            const hitRadius = Math.max(18, Math.min(42, Math.min(rect.width, rect.height) * 0.055));
            return best.d <= hitRadius ? best.type : fallbackType;
        }

        function getArrowActionFromHits(hits){
            const mappings = [
                { pattern: /arrow-vol-up(?:-plus)?/, type: 'vol', direction: 1 },
                { pattern: /arrow-vol-down(?:-minus)?/, type: 'vol', direction: -1 },
                { pattern: /arrow-sync-right(?:-plus)?/, type: 'sync', direction: 1 },
                { pattern: /arrow-sync-left(?:-minus)?/, type: 'sync', direction: -1 }
            ];
            for(const hit of hits){
                let current = hit.object;
                while(current){
                    const name = String(current.name || '').toLowerCase();
                    const mapping = mappings.find((item) => item.pattern.test(name));
                    if(mapping) return mapping;
                    current = current.parent;
                }
            }
            return null;
        }

        function getPointerHits(clientX, clientY){
            const rect = settingsControllerCanvas.getBoundingClientRect();
            if(!rect.width || !rect.height || lastWidth < 2 || lastHeight < 2 || !activeCamera) return [];
            pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            applyPanelProjection();
            try {
                activeCamera.updateMatrixWorld(true);
                raycaster.setFromCamera(pointer, activeCamera);
                return raycaster.intersectObjects(model.children, true).filter(hit => {
                    for(let node = hit.object; node; node = node.parent) if(node.visible === false) return false;
                    return true;
                });
            } finally {
                if(activeCamera.view?.enabled) activeCamera.clearViewOffset();
            }
        }

        function setControllerHoverHint(message = ''){
            if(controllerFlow.hoverHint === message) return;
            controllerFlow.hoverHint = message;
            settingsControllerBridge.renderScreen?.();
        }

        function updateControllerHoverHint(event){
            if(introActive){
                settingsControllerCanvas.style.cursor = '';
                setControllerHoverHint('');
                return;
            }
            const hits = getPointerHits(event.clientX, event.clientY);
            const firstHit = hits[0]?.object || null;
            const knobType = resolveKnobTypeFromPointer(event.clientX, event.clientY, firstHit);
            const buttonHit = hits.some(({ object }) => {
                for(let node = object; node; node = node.parent){
                    if(interactiveNames.has(node.name)) return true;
                }
                return false;
            });
            settingsControllerCanvas.style.cursor = knobType || getArrowActionFromHits(hits) || buttonHit ? 'pointer' : '';
            if(activeSettingsView !== 'audio'){
                setControllerHoverHint('');
                return;
            }
            setControllerHoverHint(knobType === 'sync'
                ? 'SYNC: 5 MS STEPS - USE ARROW KEYS TO FINE-TUNE'
                : '');
        }

        function isSameArrow(first, second){
            return !!first && !!second
                && first.type === second.type
                && first.direction === second.direction;
        }

        function rotateCameraFromPointerDelta(deltaX, deltaY){
            if(!controls || !activeCamera) return;
            const height = Math.max(1, settingsControllerCanvas.clientHeight);
            const offset = activeCamera.position.clone().sub(controls.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            const speed = Number.isFinite(controls.rotateSpeed) ? controls.rotateSpeed : 1;
            spherical.theta -= (2 * Math.PI * deltaX / height) * speed;
            spherical.phi -= (2 * Math.PI * deltaY / height) * speed;
            spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
            offset.setFromSpherical(spherical);
            activeCamera.position.copy(controls.target).add(offset);
            activeCamera.lookAt(controls.target);
            activeCamera.updateMatrixWorld(true);
            controls.update();
        }

        function applyArrowStep(action, pointerButton = 0){
            if(!action) return;
            dismissSavedState();
            const isRightClick = pointerButton === 2;
            if(action.type === 'vol'){
                const amount = isRightClick ? 5 : 1;
                if(activeSettingsView === 'audio'){
                    setVolumeFromPercent(Math.round(storedVolume * 100) + action.direction * amount);
                }else{
                    const next = Math.max(0, Math.min(1, getLuxValue() + action.direction * amount * 0.01));
                    applyLuxFromSource(next, 'arrow-step');
                }
            }else if(activeSettingsView === 'audio'){
                const amount = isRightClick ? 10 : 5;
                applySyncValue(Math.max(-3000, Math.min(3000, storedSync + action.direction * amount)));
            }else{
                const amount = isRightClick ? 5 : 1;
                const next = Math.max(0, Math.min(1, getContrastValue() + action.direction * amount * 0.01));
                applyEmiFromSource(next, 'arrow-step');
            }
            updateKnobTransformsFromState();
            updateControllerReadouts();
            syncAccessibleControllerUI();
        }

        function applyKeyboardStep(type, direction, shifted = false){
            dismissSavedState();
            const isContrast = type === 'sync';
            const amount = isContrast
                ? (shifted ? 10 : 5)
                : (shifted ? 5 : 1);
            if(type === 'vol'){
                if(activeSettingsView === 'audio'){
                    setVolumeFromPercent(Math.round(storedVolume * 100) + direction * amount);
                }else{
                    applyLuxFromSource(
                        Math.max(0, Math.min(1, getLuxValue() + direction * amount * 0.01)),
                        'keyboard-step'
                    );
                }
            }else if(activeSettingsView === 'audio'){
                applySyncValue(Math.max(-3000, Math.min(3000, storedSync + direction * amount)));
            }else{
                applyEmiFromSource(
                    Math.max(0, Math.min(1, getContrastValue() + direction * amount * 0.01)),
                    'keyboard-step'
                );
            }
            updateKnobTransformsFromState();
            updateControllerReadouts();
            syncAccessibleControllerUI();
        }

        function getActiveKnobT(type){
            if(type === 'vol'){
                return activeSettingsView === 'audio'
                    ? Math.max(0, Math.min(1, storedVolume))
                    : Math.max(0, Math.min(1, getLuxValue()));
            }
            return activeSettingsView === 'audio'
                ? Math.max(0, Math.min(1, (storedSync + 3000) / 6000))
                : Math.max(0, Math.min(1, mapContrastValueToKnob(getContrastValue())));
        }

        function applyKnobStateFromT(type, t){
            dismissSavedState();
            const clamped = Math.max(0, Math.min(1, t));
            if(type === 'vol'){
                settingsControllerBridge.knobAxisValues.vol = clamped;
                if(activeSettingsView === 'visuals'){
                    applyLuxFromSource(clamped, 'knob-drag');
                    updateKnobTransformsFromState();
                    updateLightingDebugLine('knob-drag', 'vol');
                    updateControllerReadouts();
                    syncAccessibleControllerUI();
                    return;
                }
                setVolumeFromPercent(Math.round(clamped * 100));
                updateKnobTransformsFromState();
                updateLightingDebugLine('knob-drag', 'vol');
                syncAccessibleControllerUI();
                return;
            }
            if(type === 'sync'){
                settingsControllerBridge.knobAxisValues.sync = clamped;
                if(activeSettingsView === 'visuals'){
                    applyEmiFromSource(mapContrastKnobToValue(clamped), 'knob-drag');
                    updateKnobTransformsFromState();
                    updateLightingDebugLine('knob-drag', 'sync');
                    updateControllerReadouts();
                    syncAccessibleControllerUI();
                    return;
                }
                const nextSync = Math.round(-3000 + (clamped * 6000));
                applySyncValue(nextSync);
                if(syncSlider) syncSlider.value = String(storedSync);
                if(modalSync) modalSync.value = String(storedSync);
                updateKnobTransformsFromState();
                updateLightingDebugLine('knob-drag', 'sync');
                syncAccessibleControllerUI();
                return;
            }
        }

        function updateKnobTransformsFromState({ immediate = null } = {}){
            const volNode = settingsControllerBridge.knobVolNode;
            const syncNode = settingsControllerBridge.knobSyncNode;
            const defaults = settingsControllerBridge.knobDefaults;
            const constraints = settingsControllerBridge.knobConstraints;
            if(!defaults) return;
            if(knobModeMotion && immediate) delete knobModeMotion.from[immediate];
            if(controllerFlow.animationAllowed === false || getSharedSettings().get().accessibility.reducedMotion){
                knobModeMotion = null;
            }
            const progress = knobModeMotion
                ? Math.min(1, Math.max(0, (performance.now() - knobModeMotion.startedAt) / knobModeMotion.durationMs)) : 1;
            const eased = progress * progress * (3 - 2 * progress);
            const positionFor = (type, target) => {
                const from = knobModeMotion?.from[type];
                return Number.isFinite(from) ? from + (target - from) * eased : target;
            };
            if(volNode && defaults.vol && constraints?.vol){
                const volNorm = activeSettingsView === 'audio'
                    ? Math.max(0, Math.min(1, storedVolume))
                    : Math.max(0, Math.min(1, getLuxValue()));
                const volRange = constraints.vol.max - constraints.vol.min;
                // Higher local x is the physical bottom/low endpoint.
                volNode.position[constraints.vol.axis] = positionFor('vol', constraints.vol.max - (volNorm * volRange));
                settingsControllerBridge.knobAxisValues.vol = volNorm;
            }
            if(syncNode && defaults.sync && constraints?.sync){
                const syncNorm = activeSettingsView === 'audio'
                    ? Math.max(0, Math.min(1, (storedSync + 3000) / 6000))
                    : Math.max(0, Math.min(1, mapContrastValueToKnob(getContrastValue())));
                const syncRange = constraints.sync.max - constraints.sync.min;
                // Higher local z is the physical left/low endpoint.
                syncNode.position[constraints.sync.axis] = positionFor('sync', constraints.sync.max - (syncNorm * syncRange));
                settingsControllerBridge.knobAxisValues.sync = syncNorm;
            }
            if(progress >= 1) knobModeMotion = null;
            updateControllerReadouts();
        }

        function handlePointerDown(event){
            if(event.button !== 0 && event.button !== 1 && event.button !== 2) return;
            const rect = settingsControllerCanvas.getBoundingClientRect();
            if(rect.width === 0 || rect.height === 0) return;
            const hits = getPointerHits(event.clientX, event.clientY);
            const ignoredHitNames = new Set([
                'txt-glow-on',
                'txt-glow-off',
                'btn-glow-on',
                'btn-glow-off',
                'btn-glow-on-2',
                'btn-glow-off-2'
            ]);
            const shouldIgnoreHit = (obj) => {
                const name = (obj?.name || '').toLowerCase();
                return ignoredHitNames.has(name);
            };
            const firstHit = hits.find((hit) => !shouldIgnoreHit(hit.object)) || null;
            if(event.button === 0 && !introActive && powerCat?.owns(firstHit?.object)){
                event.preventDefault(); event.stopPropagation();
                dismissSavedState();
                powerCat.activate();
                return;
            }
            if(event.button === 0 && powerCat?.busy) return;
            if(event.button === 2 && !introActive && controls?.enabled && targetTime === null){
                rightPointerState = { at: performance.now(), x: event.clientX, y: event.clientY, moved: 0 };
            }
            if(event.button === 1){
                if(introActive || !controls || !controls.enabled) return;
                event.preventDefault();
                controls.enablePan = true;
                middlePointerState = {
                    downAt: performance.now(),
                    x: event.clientX,
                    y: event.clientY,
                    point: firstHit ? firstHit.point.clone() : null
                };
                return;
            }
            if(!firstHit) return;
            const belongsToScreen = (object) => {
                let current = object;
                while(current){
                    const name = (current.name || '').toLowerCase();
                    if(name === 'control-screen' || name === 'control_screen') return true;
                    current = current.parent;
                }
                return false;
            };
            const pointInPolygon = (point, polygon) => {
                let inside = false;
                for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++){
                    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
                    if(((yi > point.y) !== (yj > point.y))
                        && point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi){
                        inside = !inside;
                    }
                }
                return inside;
            };
            if(event.button === 0 && firstHit.uv && belongsToScreen(firstHit.object)){
                const bounds = settingsControllerBridge.screenUvBounds;
                if(bounds){
                    const u = 1 - ((firstHit.uv.x - bounds.min.x) / Math.max(1e-9, bounds.max.x - bounds.min.x));
                    const v = (firstHit.uv.y - bounds.min.y) / Math.max(1e-9, bounds.max.y - bounds.min.y);
                    const region = controllerFlow.hitRegions.find((item) => pointInPolygon({ x: u, y: v }, item.polygon));
                    if(region?.kind === 'permission'){
                        controllerFlow.resolvePrompt?.(region.value);
                    }else if(region?.kind === 'save-confirm'){
                        resolveSaveConfirmation(region.value);
                    }else if(region?.kind === 'sync-start'){
                        startSyncExercise();
                    }else if(region?.kind === 'sync-commit'){
                        commitSyncExercise();
                    }else if(region?.kind === 'sync-cancel'){
                        resetSyncExercise();
                    }
                    if(region){
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                }
            }
            const readoutHit = event.button === 0 ? getReadoutHit(firstHit.object) : null;
            if(readoutHit){
                dismissSavedState();
                openReadoutEditor(readoutHit.type, readoutHit.target);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if(introActive) return;
            const arrowAction = getArrowActionFromHits(hits);
            if((event.button === 0 || event.button === 2) && arrowAction){
                dismissSavedState();
                arrowPointerState = {
                    pointerId: event.pointerId,
                    button: event.button,
                    action: arrowAction,
                    downAt: performance.now(),
                    x: event.clientX,
                    y: event.clientY,
                    lastX: event.clientX,
                    lastY: event.clientY,
                    moved: 0,
                    orbiting: false
                };
                if(controls) controls.enabled = false;
                try{ settingsControllerCanvas.setPointerCapture(event.pointerId); }catch{}
                // Keep OrbitControls out until a right drag has actually left
                // the arrow. This prevents short clicks from nudging the camera.
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // A right-button drag away from an arrow remains owned by OrbitControls.
            if(event.button === 2) return;
            if(event.button === 0 && controls){
                // A nearby rail's generous grab area must never steal a press
                // on a physical button, especially SAVE beside the lower rail.
                let buttonHit = firstHit.object;
                while(buttonHit && !interactiveNames.has(buttonHit.name)) buttonHit = buttonHit.parent;
                const knobType = buttonHit ? null : resolveKnobTypeFromPointer(event.clientX, event.clientY, firstHit.object);
                if(knobType){
                    updateLightingDebugLine('pointerdown', knobType);
                }
                if(knobType && settingsControllerBridge.knobDefaults){
                    dismissSavedState();
                    let knobNode = knobType === 'vol'
                        ? settingsControllerBridge.knobVolNode
                        : settingsControllerBridge.knobSyncNode;
                    const constraint = settingsControllerBridge.knobConstraints?.[knobType];
                    if(!knobNode || !knobNode.parent || !constraint) return;
                    const canvasRect = settingsControllerCanvas.getBoundingClientRect();
                    const makeScreenPoint = (axisValue) => {
                        const local = knobNode.position.clone();
                        local[constraint.axis] = axisValue;
                        const world = knobNode.parent.localToWorld(local.clone());
                        applyPanelProjection();
                        const ndc = world.clone().project(activeCamera);
                        if(activeCamera.view?.enabled) activeCamera.clearViewOffset();
                        return new THREE.Vector2(
                            ((ndc.x + 1) * 0.5) * canvasRect.width,
                            ((1 - ndc.y) * 0.5) * canvasRect.height
                        );
                    };
                    // Semantic zero is always left/bottom (the larger local
                    // coordinate in this asset); one is right/top.
                    const pMin = makeScreenPoint(constraint.max);
                    const pMax = makeScreenPoint(constraint.min);
                    knobDragState = {
                        type: knobType,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        startSync: storedSync,
                        grabOffset: getActiveKnobT(knobType) - getKnobTFromClient({ pMin, pMax }, event.clientX, event.clientY),
                        pMin,
                        pMax
                    };
                    controls.enabled = false;
                    try{ settingsControllerCanvas.setPointerCapture(event.pointerId); }catch{}
                    // Capture keeps the drag active outside the canvas without hiding or locking the cursor.
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
                let target = firstHit.object;
                while(target && !interactiveNames.has(target.name)){
                    target = target.parent;
                }
                if(!target) return;
                if(target.name === 'btn-accessibility'){
                    selectMode('audio');
                }else if(target.name === 'btn-vol-sync'){
                    selectMode('visuals');
                }else if(target.name === 'btn-save'){
                    // Keep the 3D Save control in sync with the accessible form button.
                    saveBtn?.click();
                }else if(target.name === 'btn-reset'){
                    pulseMomentaryButton('reset');
                    resetBtn?.click();
                }
        }

        function handlePointerMove(event){
            if(rightPointerState){
                rightPointerState.moved += Math.hypot(event.clientX-rightPointerState.x, event.clientY-rightPointerState.y);
                rightPointerState.x = event.clientX;
                rightPointerState.y = event.clientY;
            }
            if(arrowPointerState && event.pointerId === arrowPointerState.pointerId){
                arrowPointerState.moved = Math.max(
                    arrowPointerState.moved,
                    Math.hypot(event.clientX - arrowPointerState.x, event.clientY - arrowPointerState.y)
                );
                if(arrowPointerState.button === 2){
                    const currentArrow = getArrowActionFromHits(getPointerHits(event.clientX, event.clientY));
                    if(!arrowPointerState.orbiting && !isSameArrow(currentArrow, arrowPointerState.action)){
                        arrowPointerState.orbiting = true;
                        arrowPointerState.lastX = event.clientX;
                        arrowPointerState.lastY = event.clientY;
                    }else if(arrowPointerState.orbiting){
                        rotateCameraFromPointerDelta(
                            event.clientX - arrowPointerState.lastX,
                            event.clientY - arrowPointerState.lastY
                        );
                        arrowPointerState.lastX = event.clientX;
                        arrowPointerState.lastY = event.clientY;
                    }
                }
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if(!knobDragState){
                updateControllerHoverHint(event);
                return;
            }
            if(event.pointerId !== knobDragState.pointerId) return;
            if(!(event.buttons & 1)) { handlePointerCancel(event); return; }
            const rawT = getKnobTFromClient(knobDragState, event.clientX, event.clientY);
            let t = Math.max(0, Math.min(1, rawT + knobDragState.grabOffset));
            if(knobDragState.type === 'sync' && activeSettingsView === 'audio'){
                // Relative travel gives every CSS pixel a reachable 5 ms step,
                // independent of the controller's current zoom and track length.
                const axis = knobDragState.pMax.clone().sub(knobDragState.pMin).normalize();
                const pixels = (event.clientX - knobDragState.startX) * axis.x
                    + (event.clientY - knobDragState.startY) * axis.y;
                t = (snapSyncMs(knobDragState.startSync + Math.round(pixels) * 5) + 3000) / 6000;
            }
            applyKnobStateFromT(knobDragState.type, t);
            window.dispatchEvent(new CustomEvent('syncDragDebug', { detail: {
                control: knobDragState.type, mode: activeSettingsView, rawT: rawT.toFixed(4),
                appliedT: t.toFixed(4), trackPixels: knobDragState.pMin.distanceTo(knobDragState.pMax).toFixed(1),
                grabOffset: knobDragState.grabOffset.toFixed(4), pointerId: event.pointerId
            } }));
        }

        function handlePointerUp(event){
            if(arrowPointerState && event.pointerId === arrowPointerState.pointerId && event.button === arrowPointerState.button){
                const elapsed = performance.now() - arrowPointerState.downAt;
                const shouldStep = !arrowPointerState.orbiting
                    && elapsed <= 320
                    && arrowPointerState.moved <= 7;
                if(shouldStep) applyArrowStep(arrowPointerState.action, arrowPointerState.button);
                arrowPointerState = null;
                try{ settingsControllerCanvas.releasePointerCapture(event.pointerId); }catch{}
                if(controls) setUserCameraControlsEnabled(true);
                event.preventDefault();
                event.stopPropagation();
                rightPointerState = null;
                return;
            }
            if(event.button === 2 && rightPointerState){
                const now = performance.now();
                const state = rightPointerState;
                rightPointerState = null;
                if(now - state.at <= 240 && state.moved + Math.hypot(event.clientX-state.x, event.clientY-state.y) <= 6){
                    if(now - lastRightClickTime <= 320 && settledDefaultDirection && controls?.enabled){
                        const damping = controls.enableDamping;
                        controls.enableDamping = false;
                        controls.update();
                        const distance = activeCamera.position.distanceTo(controls.target);
                        activeCamera.position.copy(controls.target).addScaledVector(settledDefaultDirection, distance);
                        if(settledModelQuaternion && settingsControllerBridge.model){
                            settingsControllerBridge.model.quaternion.copy(settledModelQuaternion);
                        }
                        controls.update();
                        controls.enableDamping = damping;
                        lastRightClickTime = 0;
                        event.preventDefault();
                    }else lastRightClickTime = now;
                }else lastRightClickTime = 0;
            }
            if(event.button === 0 && knobDragState && event.pointerId === knobDragState.pointerId){
                knobDragState = null;
                settingsControllerScene.classList.remove('is-precision-adjusting');
                if(document.pointerLockElement === settingsControllerCanvas) document.exitPointerLock?.();
                try{ settingsControllerCanvas.releasePointerCapture(event.pointerId); }catch{}
                if(controls){
                    setUserCameraControlsEnabled(true);
                }
            }
            if(event.button !== 1) return;
            if(controls){
                controls.enablePan = false;
            }
            if(!middlePointerState || !controls || !controls.enabled){
                middlePointerState = null;
                return;
            }

            const now = performance.now();
            const duration = now - middlePointerState.downAt;
            const dx = event.clientX - middlePointerState.x;
            const dy = event.clientY - middlePointerState.y;
            const moved = Math.hypot(dx, dy);
            const isShortClick = duration <= 240 && moved <= 6;
            if(!isShortClick){
                middlePointerState = null;
                return;
            }

            const isDouble = (now - lastMiddleClickTime) <= 320;
            const clickPoint = middlePointerState.point ? middlePointerState.point.clone() : null;
            if(isDouble){
                if(pendingMiddleSingleClick){
                    clearTimeout(pendingMiddleSingleClick.timerId);
                    pendingMiddleSingleClick = null;
                }
                if(settledDefaultTarget) startFocusAnimation(settledDefaultTarget, { zoomToMin: false });
            }else if(clickPoint){
                pendingMiddleSingleClick = {
                    timerId: scope.timeout(() => {
                        if(sceneDisposed || scope.signal.aborted) return;
                        startFocusAnimation(clickPoint, { zoomToMin: false });
                        pendingMiddleSingleClick = null;
                    }, 320)
                };
            }
            lastMiddleClickTime = now;
            middlePointerState = null;
        }

        function handlePointerCancel(event){
            rightPointerState = null;
            lastRightClickTime = 0;
            const capturedId = knobDragState?.pointerId ?? arrowPointerState?.pointerId;
            if(arrowPointerState?.pointerId === event.pointerId){
                arrowPointerState = null;
                if(controls) setUserCameraControlsEnabled(true);
            }
            if(knobDragState){
                knobDragState = null;
                settingsControllerScene.classList.remove('is-precision-adjusting');
                if(document.pointerLockElement === settingsControllerCanvas) document.exitPointerLock?.();
                if(controls) setUserCameraControlsEnabled(true);
            }
            if(controls) controls.enablePan = false;
            middlePointerState = null;
            if(capturedId !== undefined && settingsControllerCanvas.hasPointerCapture(capturedId)){
                try{ settingsControllerCanvas.releasePointerCapture(capturedId); }catch{}
            }
        }

            listen(settingsControllerCanvas, 'pointerdown', handlePointerDown, { capture: true });
            listen(settingsControllerCanvas, 'pointerup', handlePointerUp);
            listen(window, 'pointerup', handlePointerUp);
            listen(settingsControllerCanvas, 'pointercancel', handlePointerCancel);
            listen(settingsControllerCanvas, 'pointermove', handlePointerMove);
            listen(settingsControllerCanvas, 'lostpointercapture', handlePointerCancel);
            listen(window, 'blur', () => handlePointerCancel({ pointerId: arrowPointerState?.pointerId }));
            listen(settingsControllerCanvas, 'pointerleave', () => {
                settingsControllerCanvas.style.cursor = '';
                setControllerHoverHint('');
            });
            listen(settingsControllerCanvas, 'contextmenu', (event) => {
                event.preventDefault();
            });
            listen(document, 'keydown', (event)=>{
                if(document.body.classList.contains('start-entry-active') || event.defaultPrevented || event.isComposing ||
                    event.ctrlKey || event.altKey || event.metaKey ||
                    [...document.querySelectorAll('dialog[open], [aria-modal="true"]:not(.hidden):not([hidden])')]
                        .some(modal => modal.getClientRects().length && getComputedStyle(modal).visibility !== 'hidden') ||
                    event.target?.closest?.('input, textarea, select, button, a, [contenteditable], [role="button"], [role="textbox"]')) return;
                const key = event.key.toLowerCase();
                if(key === 'p' && !event.repeat && !introActive){
                    event.preventDefault(); dismissSavedState(); powerCat?.activate();
                }else if(key === 'a'){
                    if(event.repeat) return;
                    selectMode('audio');
                }else if(key === 'v'){
                    if(event.repeat) return;
                    selectMode('visuals');
                }else if(key === 'arrowleft' || key === 'arrowright'){
                    event.preventDefault();
                    applyKeyboardStep('sync', key === 'arrowright' ? 1 : -1, event.shiftKey);
                }else if(key === 'arrowup' || key === 'arrowdown'){
                    event.preventDefault();
                    applyKeyboardStep('vol', key === 'arrowup' ? 1 : -1, event.shiftKey);
                }
            });

            settingsControllerScene.classList.remove('controller-loading');
            settingsControllerScene.classList.add('controller-ready');
            settingsControllerBridge.scene = scene;
            settingsControllerBridge.renderer = renderer;
            settingsControllerBridge.camera = activeCamera;
            settingsControllerBridge.model = model;
            settingsControllerBridge.revealController = (animateIn = true) => {
                if(model.visible) return;
                const homePosition = model.position.clone();
                const homeScale = model.scale.clone();
                const homeRotation = model.rotation.clone();
                model.updateMatrixWorld(true);
                const homeCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
                model.visible = true;
                if(!animateIn){
                    model.position.copy(homePosition);
                    model.scale.copy(homeScale);
                    model.rotation.copy(homeRotation);
                    controllerEntrance = null;
                    return;
                }
                controllerEntrance = {
                    model, homePosition, homeScale, homeRotation, homeCenter,
                    startedAt: performance.now(), durationMs: 850
                };
            };
            settingsControllerBridge.controls = controls;
            settingsControllerBridge.canvas = settingsControllerCanvas;
            settingsControllerBridge.updateKnobTransformsFromState = updateKnobTransformsFromState;
            powerCat = createPowerCat({ model, scene, animations: allClips,
                allowAnimation: () => controllerFlow.animationAllowed !== false && !getSharedSettings().get().accessibility.reducedMotion,
                onBlackout: () => { closeReadoutEditor({ commit: true }); resetSyncExercise(); },
                onChange: state => {
                    settingsControllerScene.dataset.power = state.powered ? 'on' : 'off';
                    settingsControllerScene.dataset.powerPhase = state.phase;
                    settingsControllerScene.style.boxShadow = state.powered ? '' : 'none';
                    settingsControllerScene.style.borderColor = state.powered ? '' : 'transparent';
                    if(accessiblePower){
                        accessiblePower.disabled = false;
                        accessiblePower.setAttribute('aria-pressed', String(state.powered));
                        accessiblePower.textContent = state.busy ? 'Restore lights now (P)' : 'Power switch (P)';
                    }
                    if(powerStatus) powerStatus.textContent = state.busy ? 'Lucky Cat is restoring the lights.' : 'Power on.';
                }
            });
            settingsControllerBridge.powerCat = powerCat;
            if(powerCat) scope.defer(() => powerCat.dispose());
            controllerAccents = createControllerAccents(model);
            scope.defer(() => controllerAccents.dispose());
            applySceneAppearance();
            if(lightingTargets?.emissiveTargets && emissiveList){
                buildEmissiveList(model, lightingTargets.emissiveTargets);
                applyEmissionControls();
                if(emissiveListPanel) emissiveListPanel.hidden = false;
            }
            updateKnobSidesLine();
            signalSettingsControllerReady();
        }, undefined, (error)=>{
            if(sceneDisposed || scope.signal.aborted) return;
            console.warn(controllerModelLoaded
                ? "Settings controller initialization failed"
                : "Settings controller GLB load failed", error);
            if(settingsControllerStatus){
                settingsControllerStatus.textContent = controllerModelLoaded
                    ? "Unable to initialize controller preview. Reload the page to try again."
                    : "Unable to load controller preview. Check your connection and reload the page.";
            }
            settingsControllerScene.classList.remove('controller-loading');
            settingsControllerScene.classList.remove('controller-ready');
            settingsControllerScene.classList.add('controller-fallback');
            controllerUnavailable = true;
            document.body.classList.add('start-controller-unavailable');
            setPortfolioEntryVisible(true);
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
    let vizPeakDb = -Infinity;
    let vizPeakColor = '#28a85b';
    let vizPeakClipped = false;
    let syncComparison = null;

    // State
    let storedVolume = getSharedSettings().get().audio.volume;
    let storedMuted = getSharedSettings().get().audio.muted;
    let welcomeJingle = null;
    let storedSync = getSyncOffsetMs();

    let jumpPlaybackRateIndex = SHARED_PLAYBACK_RATES.indexOf(1);
    if(jumpPlaybackRateIndex < 0) jumpPlaybackRateIndex = 0;
    let jumpPreservePitch = getStoredPreservePitch();

    getSharedSettings().subscribe((snapshot, change) => {
        const changed = change.changed;
        if(changed.includes('start.contrast')){
            lightingState.emi = snapshot.start.contrast;
            settingsControllerBridge.applyEmissionControls?.();
            syncEmiInputs();
            settingsControllerBridge.updateKnobTransformsFromState?.();
            settingsControllerBridge.updateSyncPercentLabel?.();
        }
        if(changed.includes('start.brightness')){
            lightingState.overlay = snapshot.start.brightness;
            settingsControllerBridge.applyBackgroundBrightness?.(snapshot.start.brightness);
        }
        if(changed.includes('start.backgroundContrast')) setBackgroundContrast(snapshot.start.backgroundContrast);
        if(changed.some(path => path.startsWith('start.look.'))){
            Object.assign(lookTuning, snapshot.start.look);
            settingsControllerBridge.applyReviewLook?.();
        }
        if(changed.some(path => path === 'audio.volume' || path === 'audio.muted')){
            storedVolume = snapshot.audio.volume;
            storedMuted = snapshot.audio.muted;
            applyVolumeAndMuted();
        }
        syncOverlayInputs();
        syncAccessibleControllerUI();
    }, { signal: scope.signal });

    // Initialize UI values
    syncSlider.value = storedSync;
    if(accessibleSync) accessibleSync.value = String(storedSync);
    if(modalSync) modalSync.value = storedSync;
    syncDisplay.textContent = `Sync: ${storedSync} ms`;

    function askControllerPermission(stage, title, signal){
        const previousFocus = document.activeElement;
        const screenPrompt = Boolean(settingsControllerBridge.model && !controllerUnavailable);
        const modalHome = permModal.parentNode;
        const nativeDetails = accessibleControllerControls.closest('details');
        const nativeDetailsWasOpen = nativeDetails?.open;
        const canvasRole = settingsControllerCanvas.getAttribute('role');
        const canvasTabIndex = settingsControllerCanvas.getAttribute('tabindex');
        const canvasLabel = settingsControllerCanvas.getAttribute('aria-label');
        if(screenPrompt){
            accessibleControllerControls.appendChild(permModal);
            accessibleControllerControls.inert = false;
            accessibleControllerControls.setAttribute('aria-hidden', 'false');
            accessibleControllerControls.classList.add('has-screen-permission');
            permModal.classList.add('controller-screen-permission');
            permModal.setAttribute('role', 'group');
            permModal.removeAttribute('aria-modal');
            settingsControllerCanvas.setAttribute('tabindex', '0');
            settingsControllerCanvas.setAttribute('role', 'img');
            settingsControllerCanvas.setAttribute('aria-label', title);
        }
        controllerFlow.stage = stage;
        settingsControllerBridge.renderScreen?.();
        const titleEl = document.getElementById('permTitle');
        if(titleEl) titleEl.textContent = title;
        if(permAllow) permAllow.textContent = 'Yes';
        if(permDeny) permDeny.textContent = 'No';
        permModal.classList.remove('hidden');
        permModal.style.display = '';
        return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
                if(settled) return;
                settled = true;
                permAllow.removeEventListener('click', allow);
                permDeny.removeEventListener('click', deny);
                permModal.removeEventListener('keydown', onKeydown);
                settingsControllerCanvas.removeEventListener('keydown', onCanvasKeydown);
                signal.removeEventListener('abort', cancel);
                if(controllerFlow.resolvePrompt === finish) controllerFlow.resolvePrompt = null;
                permModal.classList.add('hidden');
                permModal.style.display = 'none';
                if(screenPrompt){
                    modalHome.appendChild(permModal);
                    permModal.classList.remove('controller-screen-permission');
                    accessibleControllerControls.classList.remove('has-screen-permission');
                    if(nativeDetails && !nativeDetailsWasOpen) nativeDetails.open = false;
                    permModal.setAttribute('role', 'dialog');
                    permModal.setAttribute('aria-modal', 'true');
                    for(const [name, value] of [['role',canvasRole],['tabindex',canvasTabIndex],['aria-label',canvasLabel]]){
                        if(value === null) settingsControllerCanvas.removeAttribute(name);
                        else settingsControllerCanvas.setAttribute(name, value);
                    }
                }
                if(value !== null){
                    const focusTarget = previousFocus?.isConnected
                        && !previousFocus.closest?.('[hidden], [inert]')
                        && !permModal.contains(previousFocus)
                        ? previousFocus : nativeDetails?.querySelector('summary') || settingsControllerCanvas;
                    focusTarget.focus({ preventScroll: true });
                }
                resolve(value);
            };
            const allow = () => finish(true);
            const deny = () => finish(false);
            const cancel = () => finish(null);
            const onKeydown = (event) => {
                if(event.key === 'Escape') { event.preventDefault(); deny(); return; }
                if(event.key !== 'Tab') return;
                if(event.shiftKey && document.activeElement === permAllow) {
                    event.preventDefault(); permDeny.focus();
                } else if(!event.shiftKey && document.activeElement === permDeny) {
                    event.preventDefault(); permAllow.focus();
                }
            };
            const onCanvasKeydown = event => {
                if(event.key === 'Tab'){
                    event.preventDefault();
                    if(nativeDetails) nativeDetails.open = true;
                    permAllow.focus({ preventScroll: true });
                }
                else if(event.key === 'Escape'){ event.preventDefault(); deny(); }
            };
            controllerFlow.resolvePrompt = finish;
            signal.addEventListener('abort', cancel, { once: true });
            listen(permAllow, 'click', allow);
            listen(permDeny, 'click', deny);
            listen(permModal, 'keydown', onKeydown);
            if(screenPrompt) listen(settingsControllerCanvas, 'keydown', onCanvasKeydown);
            scope.timeout(() => {
                if(!scope.signal.aborted && !signal.aborted){
                    (screenPrompt ? settingsControllerCanvas : permAllow).focus({ preventScroll: true });
                }
            }, 0);
        });
    }

    function askControllerScreenPermission(stage, signal){
        // Keep the canvas choice mirrored by the existing keyboard-accessible
        // dialog so screen-reader and keyboard users can finish onboarding.
        return askControllerPermission(stage, stage === 'motion' ? 'Allow animations on this site?' : 'Allow audio on this site?', signal);
    }

    let onboardingPromise = null;
    let onboardingController = null;
    const waitForControllerReady = (signal) => new Promise((resolve, reject) => {
        if(signal.aborted) { resolve(null); return; }
        const onAbort = () => { signal.removeEventListener('abort', onAbort); resolve(null); };
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve(settingsControllerBridge.ready).then(
            (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
            (error) => { signal.removeEventListener('abort', onAbort); reject(error); }
        );
    });

    function enableTestingAudio(signal){
        const cleanup = () => {
            document.removeEventListener('pointerdown', activate, true);
            document.removeEventListener('keydown', activate, true);
            signal.removeEventListener('abort', cleanup);
        };
        const activate = () => {
            cleanup();
            if(signal.aborted) return;
            applyAudioPermission(true, { persist: false });
            if(!welcomeJingle || welcomeJingle.paused) playWelcomeJingle(true);
        };
        // Autoplay policy may still suspend audio. Retrying on the first real
        // gesture must never gate the model reveal or move its camera.
        listen(document, 'pointerdown', activate, { capture: true });
        listen(document, 'keydown', activate, { capture: true });
        signal.addEventListener('abort', cleanup, { once: true });
        playWelcomeJingle(true);
    }

    function showPermissionIfNeeded(){
        if(onboardingPromise) return onboardingPromise;
        const flow = new AbortController();
        onboardingController = flow;
        const isCurrent = () => !scope.signal.aborted && !flow.signal.aborted && onboardingController === flow;
        onboardingPromise = (async () => {
            // Temporary local testing defaults requested by the site owner.
            // Keep the visitor permission flow below available for production.
            if(isLocalHost){
                controllerFlow.animationAllowed = true;
                controllerFlow.soundAllowed = true;
                storedMuted = false;
                if(!(storedVolume > 0)) storedVolume = .25;
                controllerFlow.stage = 'gallery';
                permModal.classList.add('hidden');
                permModal.style.display = 'none';
                settingsControllerBridge.renderScreen?.();

                applyAudioPermission(true);
                enableTestingAudio(flow.signal);
                await waitForControllerReady(flow.signal);
                if(!isCurrent()) return null;
                settingsControllerBridge.finishOnboarding?.(!isLocalReview);
                if(isLocalReview && !rememberedStartView) settingsControllerBridge.selectMode?.(localReviewStartMode, { triggerEmissive: false, instant: true });
                settingsControllerBridge.renderScreen?.();
                return { soundAllowed: true, animationAllowed: true, testing: true, review: isLocalReview };
            }

            // Reveal a static controller before either question. The GLB screen
            // owns both choices; the native dialog is only a no-WebGL fallback.
            await waitForControllerReady(flow.signal);
            if(!isCurrent()) return null;
            settingsControllerBridge.revealController?.(false);
            const animationAllowed = await askControllerScreenPermission('motion', flow.signal);
            if(!isCurrent()) return null;
            localPreferences.setItem(ANIMATION_ALLOWED_KEY, String(animationAllowed));
            controllerFlow.animationAllowed = animationAllowed;

            const savedConsent = getAudioConsentState();
            const soundAllowed = savedConsent.shouldPrompt
                ? settingsControllerBridge.model
                    ? await askControllerScreenPermission('sound', flow.signal)
                    : await askControllerPermission('sound', 'Allow audio on this site?', flow.signal)
                : savedConsent.allowed;
            if(!isCurrent()) return null;
            controllerFlow.soundAllowed = soundAllowed;
            applyAudioPermission(soundAllowed, { persist: savedConsent.shouldPrompt });
            await waitForControllerReady(flow.signal);
            if(!isCurrent()) return null;
            controllerFlow.stage = 'gallery';
            if(soundAllowed) playWelcomeJingle();
            settingsControllerBridge.finishOnboarding?.(animationAllowed);
            settingsControllerBridge.renderScreen?.();
            return { soundAllowed, animationAllowed };
        })();
        return onboardingPromise;
    }

    function applyAudioPermission(allowed, options = {}){
        const persist = options.persist !== false;
        if(persist) setAudioConsentAllowed(allowed);
        if(allowed){
            if(!Number.isFinite(storedVolume)){
                storedVolume = 0.25;
            }
            ensureAudioRouting();
            applyVolumeAndMuted();
            if(audioCtx){
                audioCtx.resume().catch(()=>{});
            }
        }else{
            applyVolumeAndMuted();
        }
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
    }

    function offerSoundOnUnmute(){
        if(controllerFlow.soundAllowed) return;
        void ensureAudioConsentPrompt({
            requestAfterDeny: true,
            modalId: 'siteAudioConsentPrompt',
            allowButtonId: 'siteAudioConsentAllow',
            denyButtonId: 'siteAudioConsentDeny'
        }).then(state => {
            if(!state.allowed) return;
            controllerFlow.soundAllowed = true;
            applyAudioPermission(true);
        });
    }

    scope.defer(onAudioConsentChange(allowed => {
        // Review's opening sound choice is session-only, but an explicit
        // revocation must still stop a running comparison immediately.
        if(allowed || !controllerFlow.soundAllowed) return;
        controllerFlow.soundAllowed = false;
        applyVolumeAndMuted();
    }));

    // Create audio context and routing to apply delay to audio and visualizer
    function ensureAudioRouting(){
        if(audioCtx) return;
        if(!controllerFlow.soundAllowed) return;
        try{
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            mediaSource = audioCtx.createMediaElementSource(jumpAudio);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            delayNode = audioCtx.createDelay(3.0); // max 3s
            destinationGain = audioCtx.createGain();
            mediaSource.connect(delayNode);
            delayNode.connect(destinationGain);
            destinationGain.connect(analyser);
            analyser.connect(audioCtx.destination);
            applySyncValue(storedSync);
            applyVolumeAndMuted();
            startVisualizer();
        }catch{
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
        storedSync = snapSyncMs(ms);
        const preview = controllerFlow.syncExercise.active;
        if(preview) syncComparison?.setOffset(storedSync);
        else setSyncOffsetMs(storedSync);
        if(syncSlider) syncSlider.value = String(storedSync);
        if(modalSync) modalSync.value = String(storedSync);
        syncAccessibleControllerUI();
        syncDisplay.textContent = `${preview ? "Preview" : "Sync"}: ${storedSync} ms`;
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState({ immediate: 'sync' });
        }
        if(typeof settingsControllerBridge.updateSyncPercentLabel === 'function'){
            settingsControllerBridge.updateSyncPercentLabel();
        }

        if(window.siteConfig && !preview) window.siteConfig.audioSyncMs = storedSync;

        if(!audioCtx || !delayNode) return;
        const audioDelaySec = audioDelaySeconds(storedSync);
        delayNode.delayTime.value = audioDelaySec;
        if(isPlaying) syncWhilePlaying();
        syncAccessibleControllerUI();
    }

    function applyVolumeAndMuted(){
        const permissionMuted = !controllerFlow.soundAllowed;
        const effectivelyMuted = permissionMuted || storedMuted;
        // When WebAudio available use gain node and keep native element muted to avoid double audio.
        if(destinationGain){
            destinationGain.gain.value = effectivelyMuted ? 0 : storedVolume;
            try{ jumpAudio.muted = false; }catch{}

            try{ jumpVideo.muted = true; }catch{}
        }else{
            try{
                jumpVideo.muted = true;
                jumpAudio.muted = effectivelyMuted;
                jumpAudio.volume = storedVolume;
            }catch{}
        }
        if(permissionMuted){
            try{ jumpAudio.pause(); }catch{}
            if(controllerFlow.syncExercise.active) resetSyncExercise();
        }
        if(!isLocalReview){
            getSharedSettings().patch({ audio: { volume: storedVolume, muted: storedMuted } });
        }
        updateVolumeUI();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState({ immediate: 'vol' });
        }
        syncAccessibleControllerUI();
    }

    function updateVolumeUI(){
        if(volumeSlider){
            volumeSlider.value = Math.round(storedVolume * 100);
        }
        if(volumeDisplay){
            volumeDisplay.textContent = `Volume: ${Math.round(storedVolume * 100)}%`;
        }
    }

    function applyJumpPlaybackSettings(){
        const rate = SHARED_PLAYBACK_RATES[Math.max(0, Math.min(SHARED_PLAYBACK_RATES.length - 1, jumpPlaybackRateIndex))] || 1;
        try{ jumpVideo.playbackRate = rate; }catch{}
        try{ jumpAudio.playbackRate = rate; }catch{}
        setPreservePitchFlag(jumpVideo, jumpPreservePitch);
        setPreservePitchFlag(jumpAudio, jumpPreservePitch);
    }



    function playWelcomeJingle(forceUnmute = false){
        if(!forceUnmute && storedMuted) return;
        if(!welcomeJingle){
            welcomeJingle = new Audio(WELCOME_JINGLE_SRC);
            welcomeJingle.preload = 'auto';
        }
        const volume = Number.isFinite(storedVolume) ? storedVolume : 0.25;
        welcomeJingle.muted = !forceUnmute && storedMuted;
        welcomeJingle.volume = Math.max(0, Math.min(1, volume));
        try{ welcomeJingle.currentTime = 0; }catch{}
        welcomeJingle.play().catch(()=>{});
    }

    function setVolumeFromPercent(percent){
        const clamped = Math.max(0, Math.min(100, percent));
        storedVolume = clamped / 100;
        storedMuted = storedVolume === 0;
        if(!storedMuted) offerSoundOnUnmute();
        resumeAudioContext();
        applyVolumeAndMuted();
    }

    function resetPeakHold(){
        vizPeakDb = -Infinity;
        vizPeakColor = '#28a85b';
        vizPeakClipped = false;
        settingsControllerBridge.updateAudioMeter?.({ level: 0, peak: 0, clipped: false, peakClipped: false });
    }

    function clearSyncExerciseTimers(){ syncComparison?.stop(); }

    function resetSyncExercise(){
        if(controllerFlow.saveLatched){
            controllerFlow.saveLatched = false;
            settingsControllerBridge.setSaveLatched?.(false);
        }
        clearSyncExerciseTimers();
        const exercise = controllerFlow.syncExercise;
        exercise.active = false;
        exercise.result = '';
        exercise.runId = (exercise.runId || 0) + 1;
        controllerFlow.stage = 'gallery';
        applySyncValue(getSyncOffsetMs());
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    async function startSyncExercise(){
        resetSyncExercise();
        const exercise = controllerFlow.syncExercise;
        if(!controllerFlow.soundAllowed || storedMuted || storedVolume === 0){
            exercise.result = 'Enable sound and raise the volume to compare.';
            controllerFlow.stage = 'sync-running';
            settingsControllerBridge.renderScreen?.();
            syncAccessibleControllerUI();
            return;
        }
        ensureAudioRouting();
        if(!audioCtx || !destinationGain){
            exercise.result = 'Audio comparison is unavailable in this browser.';
            controllerFlow.stage = 'sync-running';
            settingsControllerBridge.renderScreen?.();
            syncAccessibleControllerUI();
            return;
        }
        resetPeakHold();
        settingsControllerBridge.selectMode?.('audio');
        exercise.active = true;
        exercise.result = 'Preparing the voice guide…';
        const runId = ++exercise.runId;
        controllerFlow.stage = 'sync-running';
        syncComparison ||= createSyncComparison({ context: audioCtx, output: destinationGain,
            guideUrl: SYNC_GUIDE_URL, signal: scope.signal,
            onChange: () => settingsControllerBridge.renderScreen?.() });
        settingsControllerBridge.syncComparison = syncComparison;
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
        try {
            const started = await syncComparison.start(storedSync);
            if(runId !== exercise.runId || scope.signal.aborted) return;
            if(started){ exercise.result = ''; syncComparison.setOffset(storedSync); }
            else { exercise.active = false; exercise.result = 'Audio could not start. Try again.'; }
        } catch {
            if(runId !== exercise.runId || scope.signal.aborted) return;
            exercise.active = false;
            exercise.result = 'Audio could not start. Try again.';
        }
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function commitSyncExercise(){
        if(!controllerFlow.syncExercise.active) return;
        const selected = storedSync;
        resetSyncExercise();
        applySyncValue(selected);
        controllerFlow.syncExercise.result = 'Saved ' + selected + ' ms';
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function loadVideo(key){
        controllerFlow.selectedMedia = key;
        const media = MEDIA[key];
        if(!media) return;
        resetPeakHold();
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

        // The MediaElementSource is created once for jumpAudio and remains
        // connected while its source URL changes.
        // apply persisted settings
        applyVolumeAndMuted();
        applySyncValue(storedSync);
        applyJumpPlaybackSettings();
        if(tabNumbers && tabAlphabet){
            const counts = key === 'counts';
            tabNumbers.classList.toggle('active', counts);
            tabAlphabet.classList.toggle('active', !counts);
            tabNumbers.setAttribute('aria-selected', String(counts));
            tabAlphabet.setAttribute('aria-selected', String(!counts));
        }
    }

    listen(jumpVideo, 'loadeddata', () => settingsControllerBridge.renderScreen?.());
    listen(jumpVideo, 'error', () => {
        setTabInfo('This sample could not be loaded. Choose the other clip or retry.');
        settingsControllerStatus && (settingsControllerStatus.textContent = 'Sample video unavailable; choose another clip.');
    });
    listen(jumpAudio, 'error', () => {
        if(controllerFlow.soundAllowed) setTabInfo('Video is available, but its paired audio could not be loaded.');
    });



    // Orchestrate playback so sync offset works both positive and negative
    let isPlaying = false;
    let audioStartTimer = null;
    function seekAudioForVideoTime(videoTime){
        const base = Math.max(0, Number(videoTime) || 0);
        const target = storedSync < 0 ? base + Math.abs(storedSync) / 1000 : base;
        try{
            const duration = Number.isFinite(jumpAudio.duration) ? jumpAudio.duration : 0;
            jumpAudio.currentTime = duration ? Math.min(target, Math.max(0, duration - 0.01)) : target;
        }catch{}
    }
    function startAudioForVideoPlayback(){
        if(!controllerFlow.soundAllowed){
            try{ jumpAudio.pause(); }catch{}
            return;
        }
        ensureAudioRouting();
        resumeAudioContext();
        const sync = storedSync;
        const ct = jumpVideo.currentTime || 0;
        if(sync >= 0){
            if(jumpAudio.readyState >= 1) seekAudioForVideoTime(ct);
            if(delayNode) delayNode.delayTime.value = sync / 1000;
        }else{
            if(delayNode) delayNode.delayTime.value = 0;

            if(jumpAudio.readyState >= 1){
                seekAudioForVideoTime(ct);
            }
        }
        if(audioStartTimer) clearTimeout(audioStartTimer);
        const nativeDelay = !delayNode && sync > 0 ? sync : 0;
        audioStartTimer = window.setTimeout(() => jumpAudio.play().catch(() => {
            setTabInfo('Video is playing without sound. Interact with the page and try again.');
        }), nativeDelay);
    }

    // When user presses the visible video's play control, intercept and orchestrate (if supported)
    listen(jumpVideo, 'play', ()=>{
        startAudioForVideoPlayback();
        isPlaying = true;
        syncAccessibleControllerUI();
    });
    listen(jumpVideo, 'pause', ()=>{
        if(audioStartTimer){ clearTimeout(audioStartTimer); audioStartTimer = null; }
        if(isPlaying){
            try{ jumpAudio.pause(); }catch{}
            isPlaying = false;
        }
        syncAccessibleControllerUI();
    });

    // When user seeks using visible video's UI, update audio currentTime
    listen(jumpVideo, 'seeked', ()=>{
        seekAudioForVideoTime(jumpVideo.currentTime);
    });
    listen(jumpVideo, 'ended', () => {
        if(audioStartTimer){ clearTimeout(audioStartTimer); audioStartTimer = null; }
        try{ jumpAudio.pause(); }catch{}
        isPlaying = false;
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    });

    // If sync changes while playing, adjust without restarting.
    function syncWhilePlaying(){
        if(!isPlaying || !controllerFlow.soundAllowed) return;
        const ct = jumpVideo.currentTime || 0;
        if(storedSync >= 0){
            if(delayNode) delayNode.delayTime.value = storedSync / 1000;
            seekAudioForVideoTime(ct);
        }else{
            if(delayNode) delayNode.delayTime.value = 0;
            const audioOffset = Math.abs(storedSync) / 1000;
            try{
                const target = ct + audioOffset;
                const duration = jumpAudio.duration || 0;
                jumpAudio.currentTime = duration ? Math.min(target, Math.max(0, duration - 0.05)) : target;
            }catch{}
        }
    }

    // Visualizer draw loop
    let vizAnimation = null;
    function startVisualizer(){
        if(!analyser || !canvasCtx) return;
        const bufferLength = analyser.fftSize;
        const dataArray = new Float32Array(bufferLength);
        const width = canvas.width;
        const height = canvas.height;
        const minDb = -54;
        const maxDb = 0;
        const silentThreshold = minDb;
        let smoothedNorm = 0;
        let previousFrameAt = performance.now();

        function draw(){
            analyser.getFloatTimeDomainData(dataArray);
            let peak = 0;
            for(let i=0;i<dataArray.length;i++){
                const abs = Math.abs(dataArray[i]);
                if(abs > peak) peak = abs;
            }
            const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
            const isSilent = !(Number.isFinite(db)) || db <= silentThreshold;
            const clampedDb = isSilent ? minDb : Math.max(minDb, Math.min(maxDb, db));
            const norm = (clampedDb - minDb) / (maxDb - minDb);
            const frameAt = performance.now();
            const frameMs = Math.max(1, Math.min(80, frameAt - previousFrameAt));
            previousFrameAt = frameAt;
            const responseMs = norm > smoothedNorm ? 42 : 190;
            const smoothing = 1 - Math.exp(-frameMs / responseMs);
            smoothedNorm += (norm - smoothedNorm) * smoothing;
            if(smoothedNorm < 0.001 && isSilent) smoothedNorm = 0;
            const level = smoothedNorm * height;

            const isClipped = peak >= 0.999;
            const meterColor = isClipped ? '#e3293f' : '#123b29';
            if(isClipped) vizPeakClipped = true;

            if(!isSilent && db > vizPeakDb){
                vizPeakDb = db;
                vizPeakColor = vizPeakClipped ? '#ff293f' : '#28a85b';
            }

            canvasCtx.clearRect(0,0,width,height);
            const meterGradient = canvasCtx.createLinearGradient(0, 0, width, 0);
            meterGradient.addColorStop(0, 'rgba(18,59,41,0)');
            meterGradient.addColorStop(0.18, meterColor);
            meterGradient.addColorStop(0.82, meterColor);
            meterGradient.addColorStop(1, 'rgba(18,59,41,0)');
            canvasCtx.fillStyle = meterGradient;
            canvasCtx.fillRect(0, height - level, width, level);

                if(Number.isFinite(vizPeakDb)){
                    const peakClamped = Math.max(minDb, Math.min(maxDb, vizPeakDb));
                    const peakNorm = (peakClamped - minDb) / (maxDb - minDb);
                const peakY = height - (peakNorm * height);
                canvasCtx.fillStyle = vizPeakColor;
                canvasCtx.fillRect(0, Math.max(0, peakY - 1), width, 2);
            }

            const peakClamped = Number.isFinite(vizPeakDb)
                ? Math.max(minDb, Math.min(maxDb, vizPeakDb))
                : minDb;
            settingsControllerBridge.updateAudioMeter?.({
                level: smoothedNorm,
                peak: (peakClamped - minDb) / (maxDb - minDb),
                clipped: isClipped,
                peakClipped: vizPeakClipped
            });

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
    listen(saveBtn, 'click', ()=>{
        if(dismissSavedState()) return;
        const reducedMotion = document.getElementById('a11y_reduced_motion').checked;
        const highContrast = document.getElementById('a11y_high_contrast').checked;
        const textScale = (document.querySelector('input[name="a11y_text"]:checked')?.value)||'normal';
        const focusOutline = document.getElementById('a11y_focus_outlines').checked ? 'always':'auto';
        try{ window.SiteA11y.set({ reducedMotion, highContrast, textScale, focusOutline }); }catch{}

        showSaveConfirmation();
    });

    listen(resetBtn, 'click', ()=>{
        // Stop an in-flight estimate before restoring the shared defaults, so
        // a late cue cannot replace the freshly reset audio offset.
        resetSyncExercise();
        const owner = getSharedSettings();
        owner.reset([
            'audio.volume', 'audio.muted', 'audio.syncMs', 'audio.preservePitch',
            'scene.lighting', 'start.contrast', 'start.brightness',
            'start.backgroundContrast', 'start.look.underlight', 'start.look.speakerPurple',
            'start.centerOnViewport'
        ]);
        window.SiteA11y.resetAccessibility();
        const defaults = owner.get();
        storedVolume = defaults.audio.volume;
        storedMuted = defaults.audio.muted;
        jumpPreservePitch = defaults.audio.preservePitch;
        applySyncValue(defaults.audio.syncMs);
        applyVolumeAndMuted();
        applyJumpPlaybackSettings();
        applyLuxFromSource(defaults.scene.lighting ?? DEFAULT_SLIDER_VALUE, 'reset');
        applyEmiFromSource(defaults.start.contrast, 'reset');
        applyOverlayFromSource(defaults.start.brightness, 'reset');
        setBackgroundContrast(defaults.start.backgroundContrast);
        lookTuning.underlight = defaults.start.look.underlight;
        lookTuning.speakerPurple = defaults.start.look.speakerPurple;
        settingsControllerBridge.applyReviewLook?.();
        syncOverlayInputs();
        resetPeakHold();
        hydrate();
        syncAccessibleControllerUI();
        updateA11yDebugFlags();
    });

    // Top tabs behavior
    listen(topTabA11y, 'click', ()=>{
        topTabA11y.classList.add('active'); topTabAudio.classList.remove('active');
        topTabA11y.setAttribute('aria-selected', 'true'); topTabAudio.setAttribute('aria-selected', 'false');
        a11ySection.style.display = 'block';
        jumpContainer.style.display = 'none';
        leadText.textContent = 'Let’s tune a few preferences so the site works best for you.';
        if(settingsControllerBridge?.setAccessibilityView){
            settingsControllerBridge.setAccessibilityView();
        }
    });
    listen(topTabAudio, 'click', ()=>{
        topTabAudio.classList.add('active'); topTabA11y.classList.remove('active');
        topTabAudio.setAttribute('aria-selected', 'true'); topTabA11y.setAttribute('aria-selected', 'false');
        a11ySection.style.display = 'none';
        jumpContainer.style.display = 'block';
        leadText.textContent = 'Please customize volume and audio sync for best comfort and accuracy.';
        showPermissionIfNeeded();
        if(settingsControllerBridge?.setAudioView){
            settingsControllerBridge.setAudioView();
        }
    });

    if(nextBtn){
        listen(nextBtn, 'click', ()=>{
            window.location.href = '_1-about/about.html';
        });
    }
    if(returnGalleryBtn){
        listen(returnGalleryBtn, 'click', resetSyncExercise);
    }
    listen(accessiblePower, 'click', () => { dismissSavedState(); settingsControllerBridge.powerCat?.activate(); });
    listen(accessibleControllerControls, 'pointerdown', event => {
        const control = event.target.closest?.('button, input, select');
        if(control && control !== accessibleConfirmYes && control !== accessibleConfirmNo) dismissSavedState();
    }, { capture: true });
    listen(accessibleAudioMode, 'click', () => settingsControllerBridge.selectMode?.('audio'));
    listen(accessibleVisualsMode, 'click', () => settingsControllerBridge.selectMode?.('visuals'));
    const editNativeSetting = (mode, apply) => event => {
        // Mode changes refresh the controls, so retain the input before selecting.
        const value = Number(event.target.value);
        dismissSavedState();
        if(activeSettingsView !== mode) settingsControllerBridge.selectMode?.(mode);
        apply(value);
    };
    listen(accessibleVolume, 'input', editNativeSetting('audio', setVolumeFromPercent));
    listen(accessibleSync, 'input', editNativeSetting('audio', applySyncValue));
    listen(accessibleBrightness, 'input', editNativeSetting('visuals', value => applyLuxFromSource(value / 100, 'accessible')));
    listen(accessibleContrast, 'input', editNativeSetting('visuals', value => applyEmiFromSource(value / 100, 'accessible')));
    listen(accessibleCounts, 'click', startSyncExercise);
    listen(accessiblePlayPause, 'click', commitSyncExercise);
    listen(accessibleGallery, 'click', resetSyncExercise);
    listen(accessibleConfirmYes, 'click', () => resolveSaveConfirmation(true));
    listen(accessibleConfirmNo, 'click', () => resolveSaveConfirmation(false));

    // Video tabs
    listen(tabNumbers, 'click', ()=>{ tabNumbers.classList.add('active'); tabAlphabet.classList.remove('active'); loadVideo('counts'); });
    listen(tabAlphabet, 'click', ()=>{ tabAlphabet.classList.add('active'); tabNumbers.classList.remove('active'); loadVideo('alphabet'); });

    function bindStepButton(button, leftDelta, rightDelta, handler){
        if(!button) return;
        listen(button, 'pointerup', (e)=>{
            if(e.button === 0){
                handler(leftDelta);
            }
        });
        listen(button, 'contextmenu', (e)=>{
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
    bindStepButton(syncLeft, -5, -10, changeSyncBy);
    bindStepButton(syncRight, 5, 10, changeSyncBy);

    // Volume arrows
    function changeVolumeBy(deltaPct){
        const currentPct = Math.round(storedVolume * 100);
        setVolumeFromPercent(currentPct + deltaPct);
    }
    bindStepButton(volDown, -1, -5, changeVolumeBy);
    bindStepButton(volUp, 1, 5, changeVolumeBy);

    // Sliders input
    listen(syncSlider, 'input', (e)=>{
        applySyncValue(e.target.value);
        if(modalSync) modalSync.value = e.target.value;
    });
    if(modalSync) listen(modalSync, 'input', (e)=>{
        applySyncValue(e.target.value);
        syncSlider.value = e.target.value;
    });
    listen(window, 'syncOffsetChanged', (e)=>{
        const ms = parseInt(e?.detail?.offsetMs, 10) || 0;
        storedSync = ms;
        syncSlider.value = ms;
        if(modalSync) modalSync.value = ms;
        syncDisplay.textContent = `Sync: ${ms} ms`;
        applySyncValue(ms);
    });
    if(volumeSlider) listen(volumeSlider, 'input', (e)=>{
        setVolumeFromPercent(parseInt(e.target.value, 10));
    });

    // When metadata loaded apply persisted settings
    listen(jumpVideo, 'loadedmetadata', ()=>{ applyVolumeAndMuted(); });
    listen(jumpAudio, 'loadedmetadata', ()=>{ applyVolumeAndMuted(); });

    // Fallback to native video playback if orchestration fails


    // Settings modal handlers
    if(settingsBtn && settingsModal){
        listen(settingsBtn, 'click', ()=>{ settingsModal.classList.add('open'); });
    }
    if(modalClose && settingsModal){
        listen(modalClose, 'click', ()=>{ settingsModal.classList.remove('open'); });
    }
    if(modalClose2 && settingsModal){
        listen(modalClose2, 'click', ()=>{ settingsModal.classList.remove('open'); });
    }

    listen(modalTabA11y, 'click', ()=>{
        modalTabA11y.classList.add('active'); modalTabAudio.classList.remove('active');
        modalA11yContent.classList.remove('hidden'); modalAudioContent.classList.add('hidden');
    });
    listen(modalTabAudio, 'click', ()=>{
        modalTabAudio.classList.add('active'); modalTabA11y.classList.remove('active');
        modalAudioContent.classList.remove('hidden'); modalA11yContent.classList.add('hidden');
    });

    listen(modalSaveA11y, 'click', ()=>{
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
        const val = s.textScale === 'large' || Number(s.textScale) > 1 ? 'large' : 'normal';
        [...document.querySelectorAll('input[name="a11y_text"]')].forEach(r=>{ r.checked = (r.value===val); });
        document.getElementById('a11y_focus_outlines').checked = (s.focusOutline === 'always');
    }

    function updateA11yDebugFlags(){
        if(typeof window.SiteA11y?.get !== 'function') return;
        const settings = window.SiteA11y.get();
        const flags = {
            'Reduced motion': settings.reducedMotion ? 'T' : 'F',
            'High contrast': settings.highContrast ? 'T' : 'F',
            'Large text': settings.textScale === 'large' || Number(settings.textScale) > 1 ? 'T' : 'F',
            'Always focus outlines': settings.focusOutline === 'always' ? 'T' : 'F',
        };
        const actions = {};
        if(saveBtn) actions['Save a11y prefs'] = () => saveBtn.click();
        if(resetBtn) actions['Reset a11y prefs'] = () => resetBtn.click();
        actions['Replay camera move'] = () => settingsControllerBridge.resetCustomCameraAnimation?.();
        if(typeof window.registerDebugHooks === 'function'){
            window.registerDebugHooks({ flags, actions });
        }
    }

    listen(window, 'debug-ui-ready', updateA11yDebugFlags);
    updateA11yDebugFlags();

    function registerLightingDebugActions(){
        if(typeof window.registerDebugHooks !== 'function') return;
        const actions = {
            'Toggle lux control': () => {
                settingsControllerBridge.luxControlEnabled = !settingsControllerBridge.luxControlEnabled;
                if(settingsControllerBridge.luxControlEnabled){
                    settingsControllerBridge.syncLuxValueToKnob?.();
                }
                settingsControllerBridge.syncLuxControlsToToggle?.(settingsControllerBridge.luxControlEnabled);
                registerLightingDebugActions();
            },
            'Toggle emission control': () => {
                settingsControllerBridge.emissionControlEnabled = !settingsControllerBridge.emissionControlEnabled;
                if(settingsControllerBridge.emissionControlEnabled){
                    settingsControllerBridge.syncEmissionValueToKnob?.();
                }
                settingsControllerBridge.syncEmissionControlsToToggle?.(settingsControllerBridge.emissionControlEnabled);
                registerLightingDebugActions();
            },
            'Toggle overlay blend': () => {
                toggleOverlayBlendForDebugShortcut();
            }
        };
        const flags = {
            'Lux control': settingsControllerBridge.luxControlEnabled ? 'T' : 'F',
            'Emission control': settingsControllerBridge.emissionControlEnabled ? 'T' : 'F'
        };
        window.registerDebugHooks({ actions, flags });
        updateLightingToggleLabels();
    }

    listen(window, 'debug-ui-ready', registerLightingDebugActions);
    registerLightingDebugActions();

    const nativeControlsPanel = document.getElementById('startNativeControls');
    const nativeControlsFolds = mountCollapsibleSections(document.body, {scope:'page:start:native-comfort',group:'comfort',headings:false,reorder:false,detailsSelector:'#startNativeControls'});
    scope.defer(() => nativeControlsFolds.dispose());
    const comfortPaths = ['audio.volume','audio.syncMs','audio.muted','start.brightness','start.contrast'];
    const nativeControlsTransfer = mountSettingsContextMenu(nativeControlsPanel, () => ({
        label:'Sound & visual controls', filename:'start-comfort.json',
        read:() => ({kind:'preferences-section',schemaVersion:1,page:'start',key:'comfort',values:Object.fromEntries(comfortPaths.map(path => [path,path.split('.').reduce((value,key) => value?.[key],getSharedSettings().get())]))}),
        apply:data => {
            if(data?.kind !== 'preferences-section' || data.schemaVersion !== 1 || data.page !== 'start' || data.key !== 'comfort' || !data.values || Array.isArray(data.values) || Object.keys(data.values).some(path => !comfortPaths.includes(path))) throw new TypeError('Choose a Sound & visual controls export');
            if(!getSharedSettings().patch(data.values).ok) throw new TypeError('Invalid comfort settings');
        }
    }));
    scope.defer(() => nativeControlsTransfer.dispose());
    const proceedToSite = document.getElementById('proceedToSite');
    const siteNavHost = document.getElementById('startSiteNavHost');
    const setSiteNavOpen = (open, restoreFocus = false) => {
        siteNavHost.hidden = !open;
        siteNavHost.inert = !open;
        proceedToSite.setAttribute('aria-expanded', String(open));
        proceedToSite.textContent = open ? 'Close site menu ×' : 'Proceed to site →';
        if(open) siteNavHost.querySelector('.navigation a')?.focus({preventScroll:true});
        else if(restoreFocus) proceedToSite.focus({preventScroll:true});
    };
    listen(proceedToSite, 'click', () => setSiteNavOpen(siteNavHost.hidden, !siteNavHost.hidden));
    listen(document, 'keydown', event => {
        if(event.key !== 'Escape' || event.defaultPrevented || siteNavHost.hidden || document.querySelector('dialog[open]')) return;
        event.preventDefault(); setSiteNavOpen(false, true);
    });
    listen(document, 'pointerdown', event => {
        if(!siteNavHost.hidden && !siteNavHost.contains(event.target) && !proceedToSite.contains(event.target)) setSiteNavOpen(false);
    });
    const projectOverlays = mountStartProjectOverlays({
        scope,
        onOpen() {
            setSiteNavOpen(false);
            projectOverlayOpen = true;
            if(audioStartTimer){ window.clearTimeout(audioStartTimer); audioStartTimer = null; }
            if(controllerFlow.syncExercise.active) resetSyncExercise();
            else clearSyncExerciseTimers();
            jumpVideo.pause();
            jumpAudio.pause();
            welcomeJingle?.pause();
            isPlaying = false;
            stopVisualizer();
            suspendScene();
        },
        onClose() {
            projectOverlayOpen = false;
            if(!scope.signal.aborted && !suspended) resumeScene();
        }
    });
    let startInitialized = false;
    let setupComplete = false;
    let setupCompletionFlow = null;
    function setPortfolioEntryVisible(visible){
        if(visible && !setupComplete && onboardingController){
            onboardingController.abort();
            onboardingController = null;
            onboardingPromise = null;
        }
        document.body.classList.toggle('start-entry-active', visible);
        portfolioEntry.hidden = !visible;
        portfolioEntry.inert = !visible;
        settingsControllerScene.inert = visible;
        settingsControllerScene.setAttribute('aria-hidden', String(visible));
        accessibleControllerControls.inert = visible;
        accessibleControllerControls.setAttribute('aria-hidden', String(visible));
        startControllerOverview.hidden = false;
        rememberCurrentView(true);
        if(visible){
            if(audioStartTimer){ window.clearTimeout(audioStartTimer); audioStartTimer = null; }
            if(controllerFlow.syncExercise.active) resetSyncExercise();
            else clearSyncExerciseTimers();
            jumpVideo.pause();
            jumpAudio.pause();
            isPlaying = false;
            welcomeJingle?.pause();
            document.getElementById('portfolioEntryTitle')?.focus({ preventScroll: true });
        }
    }
    const initializeStart = () => {
        if(scope.signal.aborted || startInitialized) return;
        startInitialized = true;
        initSettingsControllerScene();
        hydrate();
        // The consent flow can wait for user input. Show persisted audio values
        // immediately so the controls do not briefly display their HTML defaults.
        storedVolume = getSharedSettings().get().audio.volume;
        updateVolumeUI();
        syncAccessibleControllerUI();
        openComfortSettings.hidden = false;
        document.body.classList.add('start-entry-ready');
        if(!controllerUnavailable){
            setPortfolioEntryVisible(false);
            void completeStartSetup();
        }
    };
    const completeStartSetup = async () => {
        if(!startInitialized) initializeStart();
        if(setupComplete) return;
        const flowPromise = showPermissionIfNeeded();
        if(setupCompletionFlow === flowPromise) return;
        setupCompletionFlow = flowPromise;
        const result = await flowPromise;
        if(setupCompletionFlow === flowPromise) setupCompletionFlow = null;
        if(scope.signal.aborted || !result || onboardingPromise !== flowPromise
            || document.body.classList.contains('start-entry-active')) return;
        storedVolume = getSharedSettings().get().audio.volume;
        storedMuted = isLocalHost ? false : getSharedSettings().get().audio.muted;
        storedSync = getSyncOffsetMs();
        syncSlider.value = storedSync;
        if(modalSync) modalSync.value = storedSync;
        applySyncValue(storedSync);

        applyVolumeAndMuted();
        resetSyncExercise();
        setupComplete = true;
        if(controllerUnavailable) accessibleAudioMode.focus({ preventScroll: true });
    };
    listen(openComfortSettings, 'click', () => {
        setPortfolioEntryVisible(false);
        nativeControlsPanel.open = true;
        if(!setupComplete) void completeStartSetup();
        else if(controllerUnavailable) accessibleAudioMode.focus({ preventScroll: true });
        else nativeControlsPanel.querySelector('summary')?.focus({ preventScroll: true });
    });
    if(document.readyState === 'loading') listen(document, 'DOMContentLoaded', initializeStart, { once: true });
    else void initializeStart();
    scope.defer(async () => {
        onboardingController?.abort();
        controllerFlow.resolvePrompt?.(false);
        clearSyncExerciseTimers();
        stopVisualizer();
        if(audioStartTimer) window.clearTimeout(audioStartTimer);
        for(const media of [jumpVideo, jumpAudio, welcomeJingle]) {
            try{ media?.pause(); }catch{}
        }
        for(const media of [welcomeJingle]) {
            try{ media?.removeAttribute('src'); }catch{}
        }
        for(const node of [mediaSource, delayNode, destinationGain, analyser]) {
            try{ node?.disconnect(); }catch{}
        }
        if(audioCtx){
            // A MediaElementAudioSourceNode permanently binds its element, even
            // after the context closes. Replace the page-owned audio element so
            // an explicit dispose followed by mount can build a fresh graph.
            jumpAudio.replaceWith(jumpAudio.cloneNode(true));
            await audioCtx.close().catch(()=>{});
        }
    });
    scope.defer(() => rememberCurrentView(true));
    return {
        suspend() {
            rememberCurrentView(true);
            suspended = true;
            settingsControllerBridge.stickyAdapter?.suspend?.();
            projectOverlays.close();
            suspendScene();
            settingsControllerBridge.powerCat?.restore();
            if(controllerFlow.syncExercise.active) resetSyncExercise();
            restartVisualizer = !!vizAnimation;
            stopVisualizer();
        },
        resume() {
            if(!suspended || scope.signal.aborted) return;
            suspended = false;
            settingsControllerBridge.stickyAdapter?.resume?.();
            if(!projectOverlayOpen) resumeScene();
            if(restartVisualizer && audioCtx) startVisualizer();
            restartVisualizer = false;
        }
    };
}

if ("serviceWorker" in navigator) {
    if (isLocalHost) {
        const clearedKey = "sw_cleared_once";
        let workerAlreadyCleared = false;
        try { workerAlreadyCleared = !!sessionStorage.getItem(clearedKey); } catch { /* blocked storage */ }
        if (!workerAlreadyCleared) {
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

if(isLocalReview) loadDebugIfEnabled();

void bootstrapPage({ pageId: 'start', mount: mountStartPage }).catch(error => console.error('Shared bootstrap failed', error));
