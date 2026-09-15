import { localPreferences } from '../_7-shared-scripts/local-preferences.js';
import { createCameraTransition } from './camera-transition.js';
import { assetUrl, isLocalDev } from "../_7-shared-scripts/assets-config.js";
import { loadDebugIfEnabled, DEBUG_VISIBILITY_EVENT } from "../debug/debug-loader.js";
import { getSceneLightingValue, setSceneLightingValue, getLightScaleForValue, MAX_LIGHT_RATIO } from "../_7-shared-scripts/scene-lighting-sync.js";
import { setAudioConsentAllowed } from "../_7-shared-scripts/audio-consent.js";
import { applyStartPageMouseControlMode } from "../_7-shared-scripts/shared-glb-mouse-controls.js";
import { createVideoControlsUI, getStoredPreservePitch, setStoredPreservePitch, setPreservePitchFlag, playbackRates as SHARED_PLAYBACK_RATES } from "../_7-shared-scripts/shared-video-controls.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const isLocalHost = isLocalDev();
const localReviewParams = new URLSearchParams(window.location.search);
const isLocalReview = isLocalHost && localReviewParams.get('review') === '1';
const localReviewStartMode = localReviewParams.get('mode') === 'audio' ? 'audio' : 'visuals';
document.documentElement.classList.toggle('is-local-review', isLocalReview);
const SETTINGS_CONTROLLER_GLB = assetUrl("glb/settings-controller.glb");
const WELCOME_JINGLE_SRC = assetUrl("music/welcome-jingle.wav");
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
    const leftColumn = document.getElementById("uiLeftColumn");
    const rightColumn = document.getElementById("uiRightColumn");
    if (!rightColumn) return;
    rightColumn.classList.add("ui-right--debug-host");
    let debugPanelsShown = true;
    let leftPanelShown = false;

    const tabs = Array.from(rightColumn.querySelectorAll(".ui-tab[data-panel]"));
    const panels = Array.from(rightColumn.querySelectorAll(".ui-panel[id]"));
    if (!tabs.length || !panels.length) return;

    const rightTabsShell = rightColumn.querySelector(".ui-right-tabs");
    if (rightTabsShell) rightTabsShell.hidden = true;
    panels.forEach((panelEl) => {
        panelEl.hidden = true;
        panelEl.classList.remove("is-active");
    });

    const moveIfPresent = (selector, targetId) => {
        const node = document.querySelector(selector);
        const target = document.getElementById(targetId);
        if (!node || !target) return false;
        if (target.contains(node)) return true;
        target.appendChild(node);
        return true;
    };
    const dockDebugPanel = () => {
        const node = document.getElementById("debug-panel");
        if (!node) return false;
        if (node.parentElement === rightColumn) return true;
        rightColumn.appendChild(node);
        return true;
    };

    const moveToLeftOverlay = (selector) => {
        if (!leftColumn) return false;
        const node = document.querySelector(selector);
        if (!node) return false;
        if (leftColumn.contains(node)) return true;
        leftColumn.appendChild(node);
        return true;
    };

    dockDebugPanel();
    moveToLeftOverlay(".cam-anim-debug-panel");

    const camTab = rightColumn.querySelector('.ui-tab[data-panel="panel-cam"]');
    const camPanel = document.getElementById("panel-cam");
    if (camTab) camTab.hidden = true;
    if (camPanel) camPanel.hidden = true;

    let mergedTabsObserver = null;
    const ensureMergedDebugTabs = () => {
        const debugPanelEl = document.getElementById("debug-panel");
        if (!debugPanelEl || !rightColumn.contains(debugPanelEl)) return false;
        debugPanelEl.classList.add("debug-panel--start-docked-single");

        const bodyEl = debugPanelEl.querySelector(".debug-panel__body");
        if (!bodyEl) return false;

        let mergedStrip = debugPanelEl.querySelector(".debug-panel__tabs-merged");
        if (!mergedStrip) {
            mergedStrip = document.createElement("div");
            mergedStrip.className = "debug-panel__tabs debug-panel__tabs-merged";
            mergedStrip.setAttribute("role", "tablist");
            mergedStrip.setAttribute("aria-label", "Debug tabs");
            debugPanelEl.insertBefore(mergedStrip, bodyEl);
        }

        const sourceButtons = Array.from(debugPanelEl.querySelectorAll(
            ".debug-panel__tabs--left .debug-panel__tab[data-tab-group][data-tab-target], .debug-panel__tabs--right .debug-panel__tab[data-tab-group][data-tab-target]"
        ));
        if (!sourceButtons.length) return false;

        const sourceKeySet = new Set(sourceButtons.map((btn) => `${btn.dataset.tabGroup}:${btn.dataset.tabTarget}`));
        const existingMerged = Array.from(mergedStrip.querySelectorAll(".debug-panel__tab[data-source-key]"));
        const existingKeySet = new Set(existingMerged.map((btn) => btn.dataset.sourceKey));
        const needsRebuild = sourceButtons.length !== existingMerged.length
            || Array.from(sourceKeySet).some((key) => !existingKeySet.has(key));

        if (needsRebuild) {
            mergedStrip.innerHTML = "";
            sourceButtons.forEach((srcBtn) => {
                const key = `${srcBtn.dataset.tabGroup}:${srcBtn.dataset.tabTarget}`;
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "debug-panel__tab";
                btn.dataset.sourceKey = key;
                btn.dataset.sourceGroup = srcBtn.dataset.tabGroup || "";
                btn.dataset.sourceTarget = srcBtn.dataset.tabTarget || "";
                btn.setAttribute("role", "tab");
                btn.textContent = (srcBtn.textContent || "").trim();
                btn.addEventListener("click", () => {
                    srcBtn.click();
                    syncMergedDebugTabs();
                });
                mergedStrip.appendChild(btn);
            });
        }

        const syncMergedDebugTabs = () => {
            const currentSources = Array.from(debugPanelEl.querySelectorAll(
                ".debug-panel__tabs--left .debug-panel__tab[data-tab-group][data-tab-target], .debug-panel__tabs--right .debug-panel__tab[data-tab-group][data-tab-target]"
            ));
            let activeGroup = "right";
            currentSources.forEach((srcBtn) => {
                const key = `${srcBtn.dataset.tabGroup}:${srcBtn.dataset.tabTarget}`;
                const mergedBtn = mergedStrip.querySelector(`.debug-panel__tab[data-source-key="${key}"]`);
                if (!mergedBtn) return;
                const active = srcBtn.classList.contains("is-active");
                mergedBtn.hidden = !!srcBtn.hidden;
                mergedBtn.classList.toggle("is-active", active);
                mergedBtn.setAttribute("aria-selected", active ? "true" : "false");
                mergedBtn.setAttribute("tabindex", active ? "0" : "-1");
                if (active) activeGroup = srcBtn.dataset.tabGroup || activeGroup;
            });
            debugPanelEl.dataset.activeDebugGroup = activeGroup;
        };

        syncMergedDebugTabs();
        if (mergedTabsObserver) mergedTabsObserver.disconnect();
        mergedTabsObserver = new MutationObserver(() => {
            ensureMergedDebugTabs();
        });
        mergedTabsObserver.observe(debugPanelEl, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class", "hidden", "aria-selected"]
        });
        return true;
    };

    let debugDockToggle = null;
    let leftPanelHideToggle = null;
    const ensureHideButtons = () => {
        const legacyDockToggle = rightColumn.querySelector(":scope > .ui-debug-panels-toggle");
        if (legacyDockToggle && legacyDockToggle.parentElement === rightColumn) {
            legacyDockToggle.remove();
        }
        const debugPanelEl = document.getElementById("debug-panel");
        if (debugPanelEl) {
            debugDockToggle = debugPanelEl.querySelector(".ui-debug-panels-toggle");
            if (!debugDockToggle) {
                debugDockToggle = document.createElement("button");
                debugDockToggle.type = "button";
                debugDockToggle.className = "ui-debug-panels-toggle ui-debug-panels-toggle--right";
                debugDockToggle.textContent = "HIDE DEBUG";
                debugDockToggle.setAttribute("aria-label", "Hide debug control panel");
                debugPanelEl.appendChild(debugDockToggle);
                debugDockToggle.addEventListener("click", () => {
                    window.dispatchEvent(new CustomEvent(DEBUG_VISIBILITY_EVENT, { detail: { show: !debugPanelsShown } }));
                });
            }
        }
        const leftInfoPanel = document.querySelector(".cam-anim-debug-panel");
        if (leftInfoPanel) {
            leftPanelHideToggle = leftInfoPanel.querySelector(".ui-debug-panels-toggle--left");
            if (!leftPanelHideToggle) {
                leftPanelHideToggle = document.createElement("button");
                leftPanelHideToggle.type = "button";
                leftPanelHideToggle.className = "ui-debug-panels-toggle ui-debug-panels-toggle--left";
                leftPanelHideToggle.textContent = "HIDE DEBUG";
                leftPanelHideToggle.setAttribute("aria-label", "Hide debug info panel");
                leftInfoPanel.appendChild(leftPanelHideToggle);
                leftPanelHideToggle.addEventListener("click", () => {
                    leftPanelShown = !leftPanelShown;
                    syncLeftPanel();
                });
            }
        }
        return !!(debugPanelEl || leftInfoPanel);
    };
    const applyDebugDockToggleTheme = () => {
        const debugPanelEl = document.getElementById("debug-panel");
        const isLapis = debugPanelEl?.getAttribute("data-color-flip") === "1";
        const nextTheme = isLapis ? "rose" : "lapis";
        if (debugDockToggle) debugDockToggle.dataset.theme = nextTheme;
        if (leftPanelHideToggle) leftPanelHideToggle.dataset.theme = nextTheme;
    };
    const syncLeftPanel = () => {
        const panel = document.querySelector('.cam-anim-debug-panel');
        if (!panel) return;
        panel.classList.toggle('cam-anim-debug-panel--hidden-left', !leftPanelShown);
        panel.querySelector('.cam-anim-debug-content')?.setAttribute('aria-hidden', String(!leftPanelShown));
        if (leftPanelHideToggle) {
            const label = leftPanelShown ? 'HIDE DEBUG' : 'SHOW DEBUG';
            if (leftPanelHideToggle.textContent !== label) leftPanelHideToggle.textContent = label;
            leftPanelHideToggle.setAttribute('aria-label', leftPanelShown ? 'Hide debug info panel' : 'Show debug info panel');
            leftPanelHideToggle.setAttribute('aria-expanded', String(leftPanelShown));
            leftPanelHideToggle.setAttribute('aria-controls', 'camAnimDebugContent');
        }
    };
    const setDebugPanelsShown = (show) => {
        debugPanelsShown = !!show;
        const debugPanelEl = document.getElementById("debug-panel");
        if (debugPanelEl) {
            debugPanelEl.classList.toggle("debug-panel--dock-hidden-right", !debugPanelsShown);
        }
        if(debugDockToggle){
            debugDockToggle.textContent = debugPanelsShown ? 'HIDE DEBUG' : 'SHOW DEBUG';
            debugDockToggle.setAttribute('aria-label', debugPanelsShown ? 'Hide debug control panel' : 'Show debug control panel');
            debugDockToggle.setAttribute('aria-expanded', String(debugPanelsShown));
        }
        if (!debugPanelsShown) leftPanelShown = false;
        syncLeftPanel();
        applyDebugDockToggleTheme();
    };
    ensureHideButtons();
    applyDebugDockToggleTheme();

    let debugPanelThemeObserver = null;
    const connectDebugPanelThemeObserver = () => {
        const debugPanelEl = document.getElementById("debug-panel");
        if (!debugPanelEl) return false;
        if (debugPanelThemeObserver) {
            debugPanelThemeObserver.disconnect();
        }
        debugPanelThemeObserver = new MutationObserver(applyDebugDockToggleTheme);
        debugPanelThemeObserver.observe(debugPanelEl, { attributes: true, attributeFilter: ["data-color-flip"] });
        applyDebugDockToggleTheme();
        return true;
    };
    connectDebugPanelThemeObserver();
    ensureMergedDebugTabs();
    ensureHideButtons();
    setDebugPanelsShown(true);

    window.addEventListener(DEBUG_VISIBILITY_EVENT, (event) => {
        if (!event?.detail) return;
        setDebugPanelsShown(!!event.detail.show);
    });

    const observer = new MutationObserver((records) => {
        if (records.every((record) => record.target.closest?.('.cam-anim-debug-content'))) return;
        dockDebugPanel();
        moveToLeftOverlay(".cam-anim-debug-panel");
        connectDebugPanelThemeObserver();
        ensureMergedDebugTabs();
        ensureHideButtons();
        setDebugPanelsShown(debugPanelsShown);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

if (isLocalReview) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initStartPageUILayoutTabs, { once: true });
    } else {
        initStartPageUILayoutTabs();
    }
}
// Bind controls to SiteA11y and implement jump UI with visualizer
(function(){
    // Helper storage keys
    const AUDIO_VOLUME_KEY = 'site.audio.volume';
    const AUDIO_SYNC_KEY = 'site.audio.sync';
    const AUDIO_MUTED_KEY = 'site.audio.muted';
    const ANIMATION_ALLOWED_KEY = 'site.start.animation.allowed';
    const CONTRAST_VALUE_KEY = 'site.contrast.value';
    const BRIGHTNESS_VALUE_KEY = 'site.start.brightness';
    const BACKGROUND_CONTRAST_KEY = 'site.start.background.contrast';
    const UNDERLIGHT_TUNING_KEY = 'site.start.look.underlight';
    const SPEAKER_PURPLE_TUNING_KEY = 'site.start.look.speaker-purple';
    const SCENE_LIGHTING_VALUE_KEY = 'site.scene.lighting';
    const DEFAULT_SLIDER_VALUE = 0.5;
    const DEFAULT_LOOK_TUNING = Object.freeze({
        underlight: 0.65,
        speakerPurple: 0.65
    });
    const lightingState = {
        lux: Number.NaN,
        emi: Number.NaN,
        overlay: Number.NaN
    };
    const clamp01Value = (value) => {
        if(value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        if(!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.min(1, parsed));
    };
    const clampLookTuning = (value) => {
        if(value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        if(!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.min(3, parsed));
    };
    const readLookTuning = (key, fallback) => {
        try{
            const stored = clampLookTuning(localPreferences.getItem(key));
            if(stored !== null) return stored;
        }catch(e){}
        return fallback;
    };
    const lookTuning = {
        underlight: readLookTuning(UNDERLIGHT_TUNING_KEY, DEFAULT_LOOK_TUNING.underlight),
        speakerPurple: readLookTuning(SPEAKER_PURPLE_TUNING_KEY, DEFAULT_LOOK_TUNING.speakerPurple)
    };
    const getLuxValue = () => {
        if(Number.isFinite(lightingState.lux)) return lightingState.lux;
        let stored = null;
        try{ stored = clamp01Value(localPreferences.getItem(SCENE_LIGHTING_VALUE_KEY)); }catch(e){}
        if(stored === null){
            stored = DEFAULT_SLIDER_VALUE;
            setSceneLightingValue(stored);
        }
        lightingState.lux = stored;
        return lightingState.lux;
    };
    const setLuxValue = (value) => {
        const next = clamp01Value(value);
        if(next === null) return getLuxValue();
        lightingState.lux = next;
        setSceneLightingValue(next);
        return next;
    };
    const getEmiValue = () => {
        if(Number.isFinite(lightingState.emi)) return lightingState.emi;
        try{
            const parsed = clamp01Value(localPreferences.getItem(CONTRAST_VALUE_KEY));
            if(parsed === null){
                try{ localPreferences.setItem(CONTRAST_VALUE_KEY, String(DEFAULT_SLIDER_VALUE)); }catch(e){}
                lightingState.emi = DEFAULT_SLIDER_VALUE;
                return lightingState.emi;
            }
            lightingState.emi = parsed;
            return lightingState.emi;
        }catch(e){
            lightingState.emi = DEFAULT_SLIDER_VALUE;
            return lightingState.emi;
        }
    };
    const setEmiValue = (value) => {
        const next = clamp01Value(value);
        if(next === null) return getEmiValue();
        lightingState.emi = next;
        try{ localPreferences.setItem(CONTRAST_VALUE_KEY, String(next)); }catch(e){}
        return next;
    };

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
    const SYNC_VOICE_URL = assetUrl('_0-start/audio/sync-voice.wav');
    const SYNC_TICKS_URL = assetUrl('_0-start/audio/sync-ticks.wav');
    const SYNC_BEAT_MS = 800;
    const SYNC_REACTION_ALLOWANCE_MS = 180;
    const SYNC_WORDS = ['GO', '3', '2', '1', 'GO'];
    const SYNC_CUE_OFFSETS_MS = [3200, 4000, 4800, 5600, 6400];

    // Elements
    const saveBtn = document.getElementById('save_a11y');
    const resetBtn = document.getElementById('reset_a11y');
    const permModal = document.getElementById('permissionModal');
    const permAllow = document.getElementById('permAllow');
    const permDeny = document.getElementById('permDeny');
    const jumpContainer = document.getElementById('jumpContainer');
    const jumpVideo = document.getElementById('jumpVideo');
    const videoWrapper = document.getElementById('videoWrapper');
    const jumpAudio = document.getElementById('jumpAudio');
    const syncVoiceAudio = new Audio(SYNC_VOICE_URL);
    const syncTicksAudio = new Audio(SYNC_TICKS_URL);
    syncVoiceAudio.preload = 'auto';
    syncTicksAudio.preload = 'auto';
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
    const settingsControllerGridCols = null;
    const settingsControllerGridRows = null;
    const settingsControllerInfo = null;
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
        resolvePrompt: null,
        hoverHint: '',
        syncExercise: {
            active: false,
            startedAt: 0,
            taps: [],
            litCount: 0,
            litLines: new Set(),
            result: ''
        },
        hitRegions: [],
        thumbnails: new Map()
    };
    settingsControllerBridge.controllerFlow = controllerFlow;
    function syncAccessibleControllerUI(){
        accessibleAudioMode?.setAttribute('aria-pressed', String(activeSettingsView === 'audio'));
        accessibleVisualsMode?.setAttribute('aria-pressed', String(activeSettingsView === 'visuals'));
        if(accessibleVolume) accessibleVolume.value = String(Math.round(storedVolume * 100));
        if(accessibleSync) accessibleSync.value = String(storedSync);
        if(accessibleBrightness) accessibleBrightness.value = String(Math.round(getLuxValue() * 100));
        if(accessibleContrast) accessibleContrast.value = String(Math.round(getEmiValue() * 100));
        const syncRunning = controllerFlow.stage === 'sync-running';
        const syncActive = syncRunning && controllerFlow.syncExercise.active;
        if(accessibleCounts){
            accessibleCounts.hidden = syncActive;
            accessibleCounts.textContent = syncRunning ? 'Try audio sync exercise again' : 'Start audio sync exercise';
        }
        if(accessibleAlphabet) accessibleAlphabet.hidden = true;
        if(accessiblePlayPause){
            accessiblePlayPause.hidden = !syncActive;
            accessiblePlayPause.textContent = `Tap ${SYNC_WORDS[Math.min(controllerFlow.syncExercise.taps.length, SYNC_WORDS.length - 1)]} sync cue`;
        }
        if(accessibleGallery) accessibleGallery.hidden = !syncRunning;
        if(accessibleConfirmYes) accessibleConfirmYes.hidden = controllerFlow.stage !== 'confirm';
        if(accessibleConfirmNo) accessibleConfirmNo.hidden = controllerFlow.stage !== 'confirm';
    }

    function showSaveConfirmation(){
        if(controllerFlow.stage !== 'confirm'){
            controllerFlow.returnStage = controllerFlow.stage === 'playing' ? 'playing' : 'gallery';
        }
        try{ jumpVideo.pause(); }catch(e){}
        try{ jumpAudio.pause(); }catch(e){}
        controllerFlow.stage = 'confirm';
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function resolveSaveConfirmation(accepted){
        if(accepted){
            window.location.href = '_1-about/about.html';
            return;
        }
        controllerFlow.stage = controllerFlow.returnStage || 'gallery';
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }
    const getBackgroundBrightness = () => {
        if(Number.isFinite(lightingState.overlay)){
            return Math.max(0, Math.min(1, lightingState.overlay));
        }
        try{
            const raw = localPreferences.getItem(BRIGHTNESS_VALUE_KEY);
            const parsed = clamp01Value(raw);
            if(parsed === null){
                try{ localPreferences.setItem(BRIGHTNESS_VALUE_KEY, String(DEFAULT_SLIDER_VALUE)); }catch(e){}
                lightingState.overlay = DEFAULT_SLIDER_VALUE;
                return DEFAULT_SLIDER_VALUE;
            }
            lightingState.overlay = parsed;
            return lightingState.overlay;
        }catch(e){
            lightingState.overlay = DEFAULT_SLIDER_VALUE;
            return DEFAULT_SLIDER_VALUE;
        }
    };

        const setBackgroundBrightness = (value) => {
            const next = clamp01Value(value);
            if(next === null) return getBackgroundBrightness();
            lightingState.overlay = next;
            try{ localPreferences.setItem(BRIGHTNESS_VALUE_KEY, String(next)); }catch(e){}
            return next;
        };

        const getBackgroundContrast = () => {
            try{
                const parsed = clamp01Value(localPreferences.getItem(BACKGROUND_CONTRAST_KEY));
                if(parsed !== null) return parsed;
                localPreferences.setItem(BACKGROUND_CONTRAST_KEY, String(DEFAULT_SLIDER_VALUE));
            }catch(e){}
            return DEFAULT_SLIDER_VALUE;
        };

        const setBackgroundContrast = (value) => {
            const next = clamp01Value(value);
            if(next === null) return getBackgroundContrast();
            try{ localPreferences.setItem(BACKGROUND_CONTRAST_KEY, String(next)); }catch(e){}
            const contrastFactor = 0.45 + (1.9 * next);
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
        const animShiftStart = document.getElementById('animShiftStart');
        const animShiftStartValue = document.getElementById('animShiftStartValue');
        const animEasePower = document.getElementById('animEasePower');
        const animEasePowerValue = document.getElementById('animEasePowerValue');
        let contrastKnobTrackerEl = document.getElementById('contrastKnobTrackerLine');
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
        try{ localPreferences.setItem(storageKey, String(next)); }catch(e){}
        settingsControllerBridge.applyReviewLook?.();
        syncOverlayInputs();
    }

    function bindBackgroundLookControls(){
        if(backgroundLookToggle && backgroundLookPanel){
            backgroundLookToggle.addEventListener('click', () => {
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
            backgroundToneSlider.addEventListener('input', () => {
                applyOverlayFromSource(Number(backgroundToneSlider.value) / 100, 'background-panel');
            });
        }
        if(backgroundContrastSlider){
            backgroundContrastSlider.addEventListener('input', () => {
                setBackgroundContrast(Number(backgroundContrastSlider.value) / 100);
                syncOverlayInputs();
            });
        }
        if(undersideLightSlider){
            undersideLightSlider.addEventListener('input', () => {
                setLookTuning('underlight', Number(undersideLightSlider.value) / 100, UNDERLIGHT_TUNING_KEY);
            });
        }
        if(speakerPurpleSlider){
            speakerPurpleSlider.addEventListener('input', () => {
                setLookTuning('speakerPurple', Number(speakerPurpleSlider.value) / 100, SPEAKER_PURPLE_TUNING_KEY);
            });
        }
        if(backgroundToneReset){
            backgroundToneReset.addEventListener('click', () => {
                applyOverlayFromSource(0.5, 'background-reset');
                setBackgroundContrast(0.5);
                lookTuning.underlight = DEFAULT_LOOK_TUNING.underlight;
                lookTuning.speakerPurple = DEFAULT_LOOK_TUNING.speakerPurple;
                try{
                    localPreferences.setItem(UNDERLIGHT_TUNING_KEY, String(lookTuning.underlight));
                    localPreferences.setItem(SPEAKER_PURPLE_TUNING_KEY, String(lookTuning.speakerPurple));
                }catch(e){}
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
        if(!contrastKnobTrackerEl || !contrastKnobTrackerEl.isConnected){
            const tracker = document.createElement('div');
            tracker.id = 'contrastKnobTrackerLine';
            tracker.className = 'debug-camera-value';
            tracker.style.marginBottom = '4px';
            tracker.style.fontSize = '12px';
            tracker.style.opacity = '0.95';
            tracker.style.whiteSpace = 'normal';
            tracker.textContent = 'Contrast knob loc: pending';
            debugCameraPanel.insertBefore(tracker, debugCameraPanel.firstChild);
            contrastKnobTrackerEl = tracker;
        }
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

    function updateContrastKnobTrackerLine(){
        if(!contrastKnobTrackerEl) return;
        const node = settingsControllerBridge.knobSyncNode;
        const constraints = settingsControllerBridge.knobConstraints;
        const constraint = constraints?.sync || null;
        const canvas = settingsControllerCanvas;
        const camera = settingsControllerBridge.camera;
        if(!node || !constraint || !node.parent){
            contrastKnobTrackerEl.textContent = 'Contrast knob loc: unavailable';
            return;
        }
        const axis = constraint.axis;
        const raw = node.position[axis];
        const denom = Math.max(1e-6, (constraint.max - constraint.min));
        const t = Math.max(0, Math.min(1, (raw - constraint.min) / denom));
        let sx = Number.NaN;
        let sy = Number.NaN;
        if(canvas && camera){
            const rect = canvas.getBoundingClientRect();
            if(rect.width > 0 && rect.height > 0){
                const world = node.parent.localToWorld(node.position.clone());
                const ndc = world.project(camera);
                sx = ((ndc.x + 1) * 0.5) * rect.width;
                sy = ((1 - ndc.y) * 0.5) * rect.height;
            }
        }
        contrastKnobTrackerEl.textContent =
            `Contrast knob loc: node=${node.name || '(unnamed)'} axis=${axis} raw=${raw.toFixed(4)} t=${t.toFixed(3)} local=(${node.position.x.toFixed(3)},${node.position.y.toFixed(3)},${node.position.z.toFixed(3)}) screen=(${Number.isFinite(sx) ? sx.toFixed(1) : '?'},${Number.isFinite(sy) ? sy.toFixed(1) : '?'})`;
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
        updateContrastKnobTrackerLine();
        updateKnobSidesLine();
    }

    function applyLuxFromSource(value, source){
        const next = setLuxValue(value);
        settingsControllerBridge.applyLuxControls?.();
        syncLuxInputs();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
        }
        updateLightingDebugLine(source || 'lux', 'sync');
        return next;
    }

    function applyEmiFromSource(value, source){
        const next = setEmiValue(value);
        settingsControllerBridge.applyEmissionControls?.();
        syncEmiInputs();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
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

    function bindAnimTuningControls({ animTuning, uiAnimTuning, resetCustomCameraAnimation }){
        ensureLightingDebugLine();
        if(uiAnimSpeedSlider && uiAnimSpeedValue){
            uiAnimSpeedSlider.value = String(uiAnimTuning.speed.toFixed(2));
            uiAnimSpeedValue.textContent = `${uiAnimTuning.speed.toFixed(2)}x`;
            uiAnimSpeedSlider.addEventListener('input', () => {
                uiAnimTuning.speed = Math.max(0.05, parseFloat(uiAnimSpeedSlider.value) || 1);
                uiAnimSpeedValue.textContent = `${uiAnimTuning.speed.toFixed(2)}x`;
            });
        }
        if(luxControlSlider){
            luxControlSlider.addEventListener('input', () => {
                const next = clamp01(parseFloat(luxControlSlider.value));
                if(next === null) return;
                applyLuxFromSource(next, 'lux-slider');
            });
        }
        if(luxControlInput){
            luxControlInput.addEventListener('change', () => {
                const next = clamp01(parseFloat(luxControlInput.value));
                if(next === null) return;
                applyLuxFromSource(next, 'lux-input');
            });
        }
        if(emiControlSlider){
            emiControlSlider.addEventListener('input', () => {
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
            emiControlInput.addEventListener('input', applyEmiInputValue);
            emiControlInput.addEventListener('change', applyEmiInputValue);
        }
        if(overlayBlendSlider){
            overlayBlendSlider.addEventListener('input', () => {
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
            overlayBlendInput.addEventListener('input', applyOverlayInputValue);
            overlayBlendInput.addEventListener('change', applyOverlayInputValue);
        }
        if(toggleBrightnessControl){
            toggleBrightnessControl.addEventListener('click', () => {
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
            toggleEmissionControl.addEventListener('click', () => {
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
            animDurationCustom.addEventListener('input', () => {
                animTuning.customDurationMs = parseInt(animDurationCustom.value, 10) || animTuning.customDurationMs;
                animDurationCustomValue.textContent = `${animTuning.customDurationMs}ms`;
            });
        }
        if(resetCameraAnim){
            resetCameraAnim.addEventListener('click', () => resetCustomCameraAnimation());
        }
        if(animDurationFocus && animDurationFocusValue){
            animDurationFocus.value = String(animTuning.focusDurationMs);
            animDurationFocusValue.textContent = `${animTuning.focusDurationMs}ms`;
            animDurationFocus.addEventListener('input', () => {
                animTuning.focusDurationMs = parseInt(animDurationFocus.value, 10) || animTuning.focusDurationMs;
                animDurationFocusValue.textContent = `${animTuning.focusDurationMs}ms`;
            });
        }
        if(animShiftStart && animShiftStartValue){
            animShiftStart.value = String(animTuning.focusShiftStart.toFixed(2));
            animShiftStartValue.textContent = animTuning.focusShiftStart.toFixed(2);
            animShiftStart.addEventListener('input', () => {
                animTuning.focusShiftStart = parseFloat(animShiftStart.value) || animTuning.focusShiftStart;
                animShiftStartValue.textContent = animTuning.focusShiftStart.toFixed(2);
            });
        }
        if(animEasePower && animEasePowerValue){
            animEasePower.value = String(animTuning.easePower.toFixed(1));
            animEasePowerValue.textContent = animTuning.easePower.toFixed(1);
            animEasePower.addEventListener('input', () => {
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

        const renderer = new THREE.WebGLRenderer({
            canvas: settingsControllerCanvas,
            antialias: true,
            alpha: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x0f1115, 0);
        renderer.setScissorTest(true);

        const scene = new THREE.Scene();

        const fallbackCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        fallbackCamera.position.set(0, 1.6, 4);
        let activeCamera = fallbackCamera;

        const ambient = new THREE.HemisphereLight(0xffffff, 0x0f1115, 0.6);
        // This ground-only hemisphere is a separate underside fill: brightness
        // scales it with the scene, while its black sky leaves the top key intact.
        const undersideLight = new THREE.HemisphereLight(0x000000, 0x75469a, 0.22);
        undersideLight.userData.lookRole = 'underside';
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(2, 4, 3);
        scene.add(ambient, undersideLight, dirLight);
        const lightingRig = [ambient, undersideLight, dirLight];
        let lightingTargets = null;
        const emissiveControlState = {
            exclusions: new Set(),
            scales: new Map()
        };
        settingsControllerBridge.emissiveControlState = emissiveControlState;
        const EMISSIVE_EXCLUSIONS_KEY = 'scene.emissive.exclusions';
        const EMISSIVE_SCALES_KEY = 'scene.emissive.scales';
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
        let emissiveAnimatedNodes = new Set();
        let animatedEmissiveMaterials = new Set();
        let emissiveStrengthBindings = [];
        let loggedEmissiveTracks = false;
        let manualEmissiveTargets = [];
        let loggedManualEmissives = false;
        const EMISSIVE_ANIM_NAME_MARKERS = ['emission', 'emissive', 'glow'];
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

        const EMISSIVE_ANIM_MATERIALS = new Set([
            'btn-glow-off',
            'btn-glow-on',
            'txt-active',
            'txt-glow-off',
            'txt-glow-on'
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

        const isButtonTextPath = (path) => {
            if(!path) return false;
            return String(path)
                .toLowerCase()
                .split('/')
                .some((segment) => isButtonTextName(segment));
        };

        const captureLightingTargets = (model) => {
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
                const contrastLocked = CONTRAST_EMISSIVE_LOCK.has(controlName)
                    || CONTRAST_EMISSIVE_LOCK.has(nodeName)
                    || animatedNodeNames.has(controlName)
                    || animatedNodeNames.has(nodeName)
                    || isButtonTextName(controlName)
                    || isButtonTextName(nodeName);
                materials.forEach((mat, idx) => {
                    if(!mat || !('emissiveIntensity' in mat)) return;
                    if(contrastLocked){
                        const cloned = mat.clone();
                        cloned.userData = { ...(mat.userData || {}), contrastLocked: true };
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
                    emissiveTargets.push({ node: child, material: mat, controlNode });
                });
            });
            lightingRig.forEach((light) => {
                if(!light || typeof light.intensity !== 'number') return;
                if(!light.userData) light.userData = {};
                if(!Number.isFinite(light.userData.maxIntensity)){
                    light.userData.maxIntensity = light.intensity / MAX_LIGHT_RATIO;
                }
            });
            return { emissiveTargets, lights: [...lightingRig] };
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

        readoutEditor.addEventListener('pointerdown', (event) => event.stopPropagation());
        readoutEditorInput.addEventListener('input', () => {
            if(readoutEditState) applyReadoutNumber(readoutEditState.type, readoutEditorInput.value);
        });
        readoutEditorInput.addEventListener('keydown', (event) => {
            if(event.key === 'Enter'){
                event.preventDefault();
                closeReadoutEditor({ commit: true });
            }else if(event.key === 'Escape'){
                event.preventDefault();
                closeReadoutEditor();
            }
        });
        readoutEditorInput.addEventListener('blur', () => closeReadoutEditor({ commit: true }));

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

        const setContrastValue = (value) => {
            return setEmiValue(value);
        };

        settingsControllerBridge.luxControlEnabled = true;
        settingsControllerBridge.emissionControlEnabled = true;

        const isControlScreenPath = (value) => {
            const name = (value || '').toLowerCase();
            return name.includes('control-screen') || name.includes('control_screen');
        };
        const isSpeakerPlatePath = (value) => {
            const name = (value || '').toLowerCase();
            return name.includes('speaker-plate') || name.includes('speaker_plate');
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
                const parsed = raw ? JSON.parse(raw) : [];
                if(Array.isArray(parsed)){
                    emissiveControlState.exclusions = new Set(parsed.map(String));
                }
            }catch(e){
                emissiveControlState.exclusions = new Set();
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
            }catch(e){
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

        const buildEmissiveList = (model, emissiveTargets) => {
            if(!emissiveList) return;
            emissiveList.innerHTML = '';
            const sliderList = document.getElementById('emissiveSliderList');
            if(sliderList){
                sliderList.innerHTML = '';
            }
            const seen = new Map();
            emissiveTargets.forEach((entry) => {
                if(!entry?.controlNode) return;
                const path = getEmissiveNodePath(entry.controlNode, model);
                if(seen.has(path)) return;
                seen.set(path, entry.controlNode);
            });
            const entries = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            if(entries.length && entries.every(([path]) => emissiveControlState.exclusions.has(path))){
                // Recovery path: if everything is excluded, restore a visible default.
                emissiveControlState.exclusions.clear();
                saveEmissiveExclusions();
            }
            if(emissiveControlState.exclusions.size === 0){
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
                input.addEventListener('change', () => {
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
                    slider.addEventListener('input', () => {
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
            emissiveTabSelect.addEventListener('click', () => setEmissiveTab('select'));
        }
        if(emissiveTabAdjust){
            emissiveTabAdjust.addEventListener('click', () => setEmissiveTab('adjust'));
        }

        if(emissiveSelectAll){
            emissiveSelectAll.addEventListener('click', () => {
                if(!emissiveList) return;
                emissiveList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                    if(input.checked) return;
                    input.checked = true;
                    input.dispatchEvent(new Event('change'));
                });
            });
        }

        if(emissiveSelectNone){
            emissiveSelectNone.addEventListener('click', () => {
                if(!emissiveList) return;
                emissiveList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
                    if(!input.checked) return;
                    input.checked = false;
                    input.dispatchEvent(new Event('change'));
                });
            });
        }

        if(emissiveOutputBtn && emissiveOutput){
            emissiveOutputBtn.addEventListener('click', () => {
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
                const { material: mat, node, controlNode } = target;
                if(!mat || !node || !controlNode || mat.userData?.controllerOwned) return;
                const path = getEmissiveNodePath(controlNode, settingsControllerBridge.model || controlNode);
                const meshPath = getEmissiveNodePath(node, settingsControllerBridge.model || node);
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
                const userScale = emissiveControlState.scales.get(path);
                const scale = Number.isFinite(userScale) ? userScale : 1;
                const effectiveScale = intentional ? Math.max(0.65, scale) : scale;
                const lowContrastHighlight = 0.08;
                const highContrastHighlight = 2.4;
                const lowContrastSpeaker = 0.16;
                const highContrastSpeaker = 0.4 + (0.9 * lookTuning.speakerPurple);
                const factor = intentional
                    ? lowContrastHighlight + (highContrastHighlight - lowContrastHighlight) * contrastEase
                    : speakerAccent
                        ? lowContrastSpeaker + (highContrastSpeaker - lowContrastSpeaker) * contrastEase
                        : 0.025;
                mat.emissiveIntensity = base * factor * effectiveScale;
                mat.needsUpdate = true;
            });
            applyModeButtonAppearance();
        };
        settingsControllerBridge.applyReviewLook = applySceneAppearance;

        const applyLuxValue = (value) => {
            if(!lightingTargets) return;
            const v = Math.max(0, Math.min(1, Number(value)));
            if(!Number.isFinite(v)) return;
            applySceneAppearance();
        };

        const applyEmissiveValue = (value) => {
            const v = Math.max(0, Math.min(1, Number(value)));
            if(!Number.isFinite(v)) return;
            applySceneAppearance();
            updateControllerReadouts();
        };

        const applySceneLightingValue = (value) => {
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

        window.addEventListener('sceneLightingChanged', (event) => {
            const nextValue = clamp01Value(event?.detail?.value ?? getSceneLightingValue());
            if(nextValue !== null) lightingState.lux = nextValue;
            applyLuxControls();
            syncLuxInputs();
            if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
                settingsControllerBridge.updateKnobTransformsFromState();
            }
            updateLightingDebugLine('sceneLightingChanged', knobDragState?.type || '-');
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
        let catAction = null;
        let emissiveAction = null;
        let emissionActions = [];
        let cameraAction = null;
        let cameraTargetTime = null;
        let targetTime = null;
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
        let screenCanvas = null;
        let screenCtx = null;
        let screenTexture = null;
        let animationInfoLines = [];
        let allowAudioRect = { x: 0.27, y: 0.66, w: 0.24, h: 0.18 };
        let muteAudioRect = { x: 0.53, y: 0.66, w: 0.24, h: 0.18 };
        let pendingAudioAllowed = null;
        const clock = new THREE.Clock();
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const interactiveNames = new Set(['btn-accessibility', 'btn-vol-sync', 'btn-save', 'btn-reset']);
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

        function createMeterFeatherTexture(){
            const featherCanvas = document.createElement('canvas');
            featherCanvas.width = 64;
            featherCanvas.height = 256;
            const featherCtx = featherCanvas.getContext('2d');
            const image = featherCtx.createImageData(featherCanvas.width, featherCanvas.height);
            const smoothstep = (value) => {
                const x = Math.max(0, Math.min(1, value));
                return x * x * (3 - 2 * x);
            };
            for(let y = 0; y < featherCanvas.height; y++){
                for(let x = 0; x < featherCanvas.width; x++){
                    const edgeX = Math.min(x, featherCanvas.width - 1 - x) / (featherCanvas.width * 0.22);
                    const edgeY = Math.min(y, featherCanvas.height - 1 - y) / (featherCanvas.height * 0.055);
                    const alpha = Math.round(255 * smoothstep(Math.min(edgeX, edgeY)));
                    const offset = (y * featherCanvas.width + x) * 4;
                    image.data[offset] = alpha;
                    image.data[offset + 1] = alpha;
                    image.data[offset + 2] = alpha;
                    image.data[offset + 3] = 255;
                }
            }
            featherCtx.putImageData(image, 0, 0);
            const texture = new THREE.CanvasTexture(featherCanvas);
            texture.needsUpdate = true;
            return texture;
        }

        function prepareAudioMeter(node){
            if(!node?.isMesh || !node.geometry || !node.parent) return;
            node.geometry.computeBoundingBox();
            const bounds = node.geometry.boundingBox;
            if(!bounds || bounds.isEmpty()) return;
            const featherTexture = createMeterFeatherTexture();
            const materials = (Array.isArray(node.material) ? node.material : [node.material]).map((source) => {
                const material = source.clone();
                material.userData = { ...(source.userData || {}), controllerOwned: true, contrastLocked: true };
                material.map = null;
                material.alphaMap = featherTexture;
                material.transparent = true;
                material.opacity = 0.88;
                material.depthWrite = false;
                material.color?.set(0x123b29);
                material.emissive?.set(0x082317);
                if('emissiveIntensity' in material) material.emissiveIntensity = 0.42;
                material.needsUpdate = true;
                return material;
            });
            node.material = Array.isArray(node.material) ? materials : materials[0];
            const basePosition = node.position.clone();
            const baseScale = node.scale.clone();
            const length = Math.max(0.0001, bounds.max.z - bounds.min.z);
            const width = Math.max(0.0001, bounds.max.x - bounds.min.x);
            const peakMaterial = new THREE.MeshBasicMaterial({
                color: 0x28a85b,
                toneMapped: false,
                depthTest: true,
                depthWrite: false
            });
            peakMaterial.userData = { controllerOwned: true, contrastLocked: true };
            const peakLine = new THREE.Mesh(
                new THREE.BoxGeometry(width * baseScale.x, 0.008, Math.max(0.012, length * baseScale.z * 0.014)),
                peakMaterial
            );
            peakLine.name = 'runtime-volume-peak-line';
            peakLine.position.set(
                basePosition.x + ((bounds.min.x + bounds.max.x) * 0.5 * baseScale.x),
                basePosition.y - 0.006,
                basePosition.z
            );
            peakLine.visible = false;
            node.parent.add(peakLine);
            audioMeterState = { node, materials, peakLine, bounds: bounds.clone(), basePosition, baseScale, length };
            settingsControllerBridge.updateAudioMeter?.({ level: 0, peak: 0, clipped: false, peakClipped: false });
        }

        settingsControllerBridge.updateAudioMeter = ({ level = 0, peak = 0, clipped = false, peakClipped = false } = {}) => {
            if(!audioMeterState) return;
            const { node, materials, peakLine, bounds, basePosition, baseScale, length } = audioMeterState;
            const fill = Math.max(0, Math.min(1, level));
            const peakFill = Math.max(0, Math.min(1, peak));
            const visibleFill = Math.max(0.001, fill);
            node.scale.set(baseScale.x, baseScale.y, baseScale.z * visibleFill);
            node.position.copy(basePosition);
            // The authored meter's positive-Z end is the physical bottom.
            // Keep that end fixed so the signal rises upward from the base.
            node.position.z = basePosition.z + (bounds.max.z * baseScale.z * (1 - visibleFill));
            node.visible = fill > 0.001;
            const fillColor = clipped ? 0xc91f2d : 0x123b29;
            const fillEmissive = clipped ? 0x7d0711 : 0x082317;
            materials.forEach((material) => {
                material.color?.set(fillColor);
                material.emissive?.set(fillEmissive);
                if('emissiveIntensity' in material) material.emissiveIntensity = clipped ? 0.8 : 0.42;
            });
            peakLine.visible = peakFill > 0.001;
            peakLine.position.z = basePosition.z
                + ((bounds.max.z - length * peakFill) * baseScale.z);
            peakLine.material.color.set(peakClipped ? 0xff293f : 0x28a85b);
        };

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
            const pulse = momentaryButtonPulses.get(kind);
            if(!pulse) return 0;
            const elapsed = now - pulse.startedAt;
            const downDuration = 70;
            const upDuration = 110;
            if(elapsed >= downDuration + upDuration){
                momentaryButtonPulses.delete(kind);
                return 0;
            }
            const raw = elapsed <= downDuration
                ? elapsed / downDuration
                : 1 - ((elapsed - downDuration) / upDuration);
            return raw * raw * (3 - 2 * raw);
        }

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
            const buttonProgress = modeProgress * modeProgress * (3 - 2 * modeProgress);
            if(audioVisualizationPanel){
                if(audioVisualizationRotation && clip){
                    const rotation = audioVisualizationRotation.evaluate(modeProgress * clip.duration);
                    audioVisualizationPanel.quaternion.fromArray(rotation);
                }
                audioVisualizationPanel.visible = true;
            }
            if(audioBody) audioBody.position.y = releasedY + ((pressedY - releasedY) * buttonProgress);
            if(visualsBody) visualsBody.position.y = pressedY + ((releasedY - pressedY) * buttonProgress);
            applyButtonState(audioBody, controllerButtonNodes.get('audioText'), buttonProgress, glowScale);
            applyButtonState(visualsBody, controllerButtonNodes.get('visualsText'), 1 - buttonProgress, glowScale);
            const now = performance.now();
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
        const USE_CUSTOM_CAMERA_ANIM = false;
        const animTuning = {
            customDurationMs: 6000,
            focusDurationMs: 520,
            focusShiftStart: 0.75,
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
        let customCameraAnim = null;
        let middlePointerState = null;
        let lastMiddleClickTime = 0;
        let pendingMiddleSingleClick = null;
        let knobDragState = null;
        let arrowPointerState = null;
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

        function frameToClipTime(frame, clipItem, startFrame, endFrame){
            if(!clipItem) return 0;
            const span = Math.max(1, endFrame - startFrame);
            const clamped = Math.min(Math.max(frame, startFrame), endFrame);
            return ((clamped - startFrame) / span) * clipItem.duration;
        }

        function getCameraHoldTime(clipItem){
            if(!clipItem) return 0;
            const base = frameToClipTime(CAMERA_END_FRAME, clipItem, CAMERA_START_FRAME, CAMERA_END_FRAME);
            const end = Math.max(0, clipItem.duration - 1e-4);
            return Math.min(base, end);
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

        function easeInOutCubic(t){
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function easeInOutPower(t, power){
            const p = Math.max(0.5, Math.min(6, power || 3));
            return t < 0.5
                ? Math.pow(2 * t, p) / 2
                : 1 - Math.pow(-2 * t + 2, p) / 2;
        }

        function easeOutBack(t){
            const s = 1.4;
            const c3 = s + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
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

        function getComfortFocusPoint(model){
            const comfort = findMeshByName(model, (name) => name.includes('comfort') || name.includes('custom'));
            if(comfort){
                const box = new THREE.Box3().setFromObject(comfort);
                return box.getCenter(new THREE.Vector3());
            }
            const bounds = new THREE.Box3().setFromObject(model);
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            return center.add(new THREE.Vector3(0, size.y * 0.2, 0));
        }

        function startCustomCameraAnimation(model){
            if(!activeCamera || !controls || !model) return;
            const glbBounds = new THREE.Box3().setFromObject(model);
            const glbCenter = glbBounds.getCenter(new THREE.Vector3());
            const screenTarget = getScreenFocusPoint(model);
            const comfortTarget = getComfortFocusPoint(model);
            const startTarget = controls.target.clone();
            const startPos = activeCamera.position.clone();
            const dir = startPos.clone().sub(startTarget).normalize();
            const startDistance = startPos.distanceTo(startTarget);
            const endDistance = controls.maxDistance || 12;

            customCameraAnim = {
                startTime: performance.now(),
                durationMs: animTuning.customDurationMs,
                startTarget,
                screenTarget,
                comfortTarget,
                glbCenter,
                dir,
                startDistance,
                endDistance
            };
            controls.enabled = false;
        }

        function updateCustomCameraAnimation(){
            if(!customCameraAnim || !activeCamera || !controls) return false;
            const now = performance.now();
            const t = (now - customCameraAnim.startTime) / customCameraAnim.durationMs;
            const k = Math.min(1, Math.max(0, t));
            const zoomEase = easeInOutPower(k, animTuning.easePower);
            const distance = customCameraAnim.startDistance
                + (customCameraAnim.endDistance - customCameraAnim.startDistance) * zoomEase;

            const shiftStart = Math.min(1, Math.max(0.5, animTuning.focusShiftStart));
            const shiftDenom = Math.max(0, 1 - shiftStart);
            const targetPhase = k < shiftStart
                ? easeInOutPower(k / shiftStart, animTuning.easePower)
                : easeInOutPower((k - shiftStart) / shiftDenom, animTuning.easePower);
            const target = k < shiftStart
                ? customCameraAnim.screenTarget.clone().lerp(customCameraAnim.comfortTarget, targetPhase)
                : customCameraAnim.comfortTarget.clone().lerp(customCameraAnim.glbCenter, targetPhase);

            controls.target.copy(target);
            activeCamera.position.copy(target.clone().add(customCameraAnim.dir.clone().multiplyScalar(distance)));
            activeCamera.lookAt(target);
            activeCamera.updateMatrixWorld(true);

            if(k >= 1){
                customCameraAnim = null;
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

        function resetCustomCameraAnimation(){
            const model = settingsControllerBridge.model;
            if(!model || !activeCamera || !controls) return;
            focusAnim = null;
            customCameraAnim = null;
            cameraTween = null;
            cameraTargetTime = null;
            pendingAudioAllowed = null;

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
            setUserCameraControlsEnabled(false);
            introActive = true;
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

        function computeLookAtQuaternion(position, target, up){
            const m = new THREE.Matrix4().lookAt(position, target, up);
            return new THREE.Quaternion().setFromRotationMatrix(m);
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
            const model = settingsControllerBridge.model;
            const target = model
                ? new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
                : controls.target.clone();
            cameraTween = {
                frame: 0,
                transition: createCameraTransition(activeCamera, controls, CAMERA_ANIM_POS, CAMERA_ANIM_ROT,
                    target, animTuning.customDurationMs, performance.now())
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
                lastControlsEnabled = controls.enabled;
                if(pendingAudioAllowed !== null){
                    applyAudioPermission(pendingAudioAllowed);
                    pendingAudioAllowed = null;
                }
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

        function isAtUiStart(){
            if(!uiAction || !clip) return false;
            return Math.abs((uiAction.time || 0) - frameToTime(UI_START_FRAME)) <= FRAME_EPSILON;
        }

        function isAtUiEnd(){
            if(!uiAction || !clip) return false;
            return Math.abs((uiAction.time || 0) - frameToTime(UI_END_FRAME)) <= FRAME_EPSILON;
        }

        function selectMode(mode, options = {}){
            const { triggerEmissive = true } = options;
            closeReadoutEditor({ commit: true });
            const nextMode = mode === 'audio' ? 'audio' : 'visuals';
            activeSettingsView = nextMode;
            controllerFlow.hoverHint = '';
            const targetFrame = nextMode === 'audio' ? AUDIO_FRAME : VISUALS_FRAME;
            const started = !isAtFrame(targetFrame);
            // Always retarget from the current pose; this also handles rapid
            // changes while the previous direction is still playing.
            if(controllerFlow.animationAllowed === false){
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
            if(!introActive && !cameraTween && !focusAnim && !customCameraAnim){
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
            controllerFlow.stage = 'gallery';
            settingsControllerBridge.renderScreen?.();
            if(catAction){
                if(allowAnimation){
                    catAction.enabled = true;
                    catAction.paused = false;
                    catAction.setLoop(THREE.LoopRepeat, Infinity);
                    catAction.play();
                }else{
                    catAction.paused = true;
                    catAction.time = 0;
                }
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
            }
        };

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
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            // The asset's screen U direction is reversed. Apply the same
            // normalized transform to rendering and raycast hit testing.
            texture.repeat.set(-1 / rangeU, 1 / rangeV);
            texture.offset.set(1 + (minU / rangeU), -minV / rangeV);
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
            const tracePolygon = (points) => {
                ctx.beginPath();
                points.forEach(([x, y], index) => {
                    const px = x * size;
                    const py = y * height;
                    if(index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.closePath();
            };
            const drawCover = (source, points) => {
                if(!source) return false;
                const sw = source.videoWidth || source.width || 0;
                const sh = source.videoHeight || source.height || 0;
                if(!sw || !sh) return false;
                const xs = points.map((p) => p[0] * size);
                const ys = points.map((p) => p[1] * height);
                const x = Math.min(...xs), y = Math.min(...ys);
                const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
                const scale = Math.max(w / sw, h / sh);
                const dw = sw * scale, dh = sh * scale;
                ctx.save();
                tracePolygon(points);
                ctx.clip();
                ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
                ctx.restore();
                return true;
            };
            const leftPoly = [[0.04,0.06],[0.48,0.06],[0.48,0.42],[0.51,0.42],[0.51,0.94],[0.04,0.94]];
            const rightPoly = [[0.52,0.06],[0.96,0.06],[0.96,0.94],[0.49,0.94],[0.49,0.58],[0.52,0.58]];
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
                    ctx.font = '32px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText(soundStep ? 'ALLOW SOUND?' : 'ALLOW ANIMATION?', size * 0.5, height * 0.32);
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
                    ctx.fillStyle = '#0b2a58';
                    ctx.font = '18px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText('PRESS THE BUTTON IN TIME TO SYNC AUDIO.', size * 0.5, height * 0.20);
                    ctx.fillText('LISTEN FOR READY-SET-GO.', size * 0.5, height * 0.29);
                    const button = { x: 0.30, y: 0.48, w: 0.40, h: 0.30 };
                    ctx.fillStyle = '#a94710';
                    ctx.beginPath();
                    ctx.roundRect(button.x * size, button.y * height, button.w * size, button.h * height, 24);
                    ctx.fill();
                    ctx.fillStyle = '#f3a449';
                    ctx.font = '64px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText('SYNC', size * 0.5, height * 0.63);
                    controllerFlow.hitRegions.push({ kind: 'sync-start', value: true, polygon: [[button.x,button.y],[button.x+button.w,button.y],[button.x+button.w,button.y+button.h],[button.x,button.y+button.h]] });
                }else if(controllerFlow.stage === 'sync-running'){
                    const exercise = controllerFlow.syncExercise;
                    ctx.fillStyle = '#8cd8ff';
                    ctx.fillRect(size * 0.035, height * 0.08, size * 0.93, height * 0.25);
                    ctx.fillStyle = '#0b2a58';
                    ctx.font = '17px "Press Start 2P", "Segoe UI", sans-serif';
                    ctx.fillText('PRESS THE BUTTON IN TIME TO SYNC AUDIO.', size * 0.5, height * 0.16);
                    ctx.fillText('LISTEN FOR READY-SET-GO.', size * 0.5, height * 0.25);
                    const centers = [0.10, 0.285, 0.47, 0.655, 0.875];
                    const lineY = height * 0.61;
                    for(let index = 0; index < SYNC_WORDS.length - 1; index++){
                        const lineStart = (centers[index] + (index === 0 ? 0.065 : 0.045)) * size;
                        const lineEnd = (centers[index + 1] - (index === 3 ? 0.095 : 0.045)) * size;
                        ctx.strokeStyle = exercise.litLines.has(index) ? '#8cd8ff' : '#a94710';
                        ctx.lineWidth = exercise.litLines.has(index) ? 12 : 8;
                        ctx.beginPath();
                        ctx.moveTo(lineStart, lineY);
                        ctx.lineTo(lineEnd, lineY);
                        ctx.stroke();
                    }
                    SYNC_WORDS.forEach((word, index) => {
                        ctx.fillStyle = index < exercise.litCount ? '#8cd8ff' : '#d56519';
                        ctx.font = '54px "Press Start 2P", "Segoe UI", sans-serif';
                        ctx.fillText(word, centers[index] * size, lineY);
                    });
                    if(exercise.result){
                        ctx.fillStyle = '#0b2a58';
                        ctx.font = '18px "Press Start 2P", "Segoe UI", sans-serif';
                        ctx.fillText(exercise.result, size * 0.5, height * 0.82);
                        const again = { x: 0.37, y: 0.87, w: 0.26, h: 0.09 };
                        ctx.fillStyle = '#a94710';
                        ctx.fillRect(again.x * size, again.y * height, again.w * size, again.h * height);
                        ctx.fillStyle = '#8cd8ff';
                        ctx.font = '16px "Press Start 2P", "Segoe UI", sans-serif';
                        ctx.fillText('TRY AGAIN', size * 0.5, height * 0.915);
                        controllerFlow.hitRegions.push({ kind: 'sync-start', value: true, polygon: [[again.x,again.y],[again.x+again.w,again.y],[again.x+again.w,again.y+again.h],[again.x,again.y+again.h]] });
                    }else{
                        ctx.fillStyle = '#f3a449';
                        ctx.font = '16px "Press Start 2P", "Segoe UI", sans-serif';
                        ctx.fillText('TAP EACH WORD WHEN YOU HEAR IT', size * 0.5, height * 0.83);
                        controllerFlow.hitRegions.push({ kind: 'sync-tap', value: true, polygon: [[0,0.34],[1,0.34],[1,1],[0,1]] });
                    }
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
            updateReadoutEditorPosition();
            if(controllerFlow.stage === 'playing' && jumpVideo.readyState >= 2){
                settingsControllerBridge.renderScreen?.();
            }
            if(updateCustomCameraAnimation()){
                renderScene();
                requestAnimationFrame(animate);
                return;
            }
            if(updateFocusAnimation()){
                renderScene();
                requestAnimationFrame(animate);
                return;
            }
            if(controls && controls.enabled && !cameraTween){
                controls.update();
            }
            const delta = clock.getDelta();
            if(uiMixer){
                if((uiAction && !uiAction.paused) || (catAction && !catAction.paused)){
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
                        if(!introActive && !cameraTween && !focusAnim && !customCameraAnim){
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
                updateContrastKnobTrackerLine();
            }
            renderScene();
            requestAnimationFrame(animate);
        }

        function renderScene(){
            if(lastWidth < 2 || lastHeight < 2) return;
            renderer.setViewport(0, 0, lastWidth, lastHeight);
            renderer.setScissor(0, 0, lastWidth, lastHeight);
            renderer.render(scene, activeCamera);
        }

        resizeScene();
        settingsControllerBridge.resetCustomCameraAnimation = resetCustomCameraAnimation;
        bindAnimTuningControls({ animTuning, uiAnimTuning, resetCustomCameraAnimation });
        const resizeObserver = new ResizeObserver(resizeScene);
        resizeObserver.observe(settingsControllerScene);
        window.addEventListener('resize', resizeScene);
        window.addEventListener('orientationchange', resizeScene);
        animate();

        const loader = new GLTFLoader();
        let controllerModelLoaded = false;
        loader.load(SETTINGS_CONTROLLER_GLB, (gltf)=>{
            controllerModelLoaded = true;
            const model = gltf.scene;
            if(!model) return;
            scene.add(model);
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
                        emissiveAnimNodes.add(nodeName);
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
            emissiveAnimatedNodes = new Set([...emissiveAnimNodes].map((name) => name.toLowerCase()));
            animatedEmissiveMaterials = new Set([...emissiveAnimMaterials]);
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

            lightingTargets = captureLightingTargets(model);
            applyLuxControls();
            applyEmissionControls();
            applyBackgroundBrightness(getBackgroundBrightness());
            // Button appearance is node-owned and deterministic; do not infer
            // color changes from shared material names or playback direction.
            manualEmissiveTargets = [];
            if(lightingTargets?.emissiveTargets && emissiveList){
                buildEmissiveList(model, lightingTargets.emissiveTargets);
                applyEmissionControls();
                if(emissiveListPanel) emissiveListPanel.hidden = false;
            }
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
                const modelCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
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
            t = Math.max(0, Math.min(1, t));
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
                    const ndc = world.clone().project(activeCamera);
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
            if(!rect.width || !rect.height || !activeCamera) return [];
            pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, activeCamera);
            return raycaster.intersectObjects(model.children, true);
        }

        function setControllerHoverHint(message = ''){
            if(controllerFlow.hoverHint === message) return;
            controllerFlow.hoverHint = message;
            settingsControllerBridge.renderScreen?.();
        }

        function updateControllerHoverHint(event){
            if(introActive || activeSettingsView !== 'visuals'){
                setControllerHoverHint('');
                return;
            }
            const hits = getPointerHits(event.clientX, event.clientY);
            const firstHit = hits[0]?.object || null;
            const knobType = resolveKnobTypeFromPointer(event.clientX, event.clientY, firstHit);
            setControllerHoverHint(knobType === 'sync'
                ? 'MOVE THE KNOB SLOWLY TO FINE-TUNE CONTRAST'
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
            const isContrast = type === 'sync' && activeSettingsView === 'visuals';
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

        function updateKnobTransformsFromState(){
            const volNode = settingsControllerBridge.knobVolNode;
            const syncNode = settingsControllerBridge.knobSyncNode;
            const defaults = settingsControllerBridge.knobDefaults;
            const constraints = settingsControllerBridge.knobConstraints;
            if(!defaults) return;
            if(volNode && defaults.vol && constraints?.vol){
                const volNorm = activeSettingsView === 'audio'
                    ? Math.max(0, Math.min(1, storedVolume))
                    : Math.max(0, Math.min(1, getLuxValue()));
                const volRange = constraints.vol.max - constraints.vol.min;
                // Higher local x is the physical bottom/low endpoint.
                volNode.position[constraints.vol.axis] = constraints.vol.max - (volNorm * volRange);
                settingsControllerBridge.knobAxisValues.vol = volNorm;
            }
            if(syncNode && defaults.sync && constraints?.sync){
                const syncNorm = activeSettingsView === 'audio'
                    ? Math.max(0, Math.min(1, (storedSync + 3000) / 6000))
                    : Math.max(0, Math.min(1, mapContrastValueToKnob(getContrastValue())));
                const syncRange = constraints.sync.max - constraints.sync.min;
                // Higher local z is the physical left/low endpoint.
                syncNode.position[constraints.sync.axis] = constraints.sync.max - (syncNorm * syncRange);
                settingsControllerBridge.knobAxisValues.sync = syncNorm;
            }
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
            if(event.button === 1){
                if(introActive || targetTime !== null || !controls || !controls.enabled) return;
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
                    }else if(region?.kind === 'sync-tap'){
                        registerSyncExerciseTap();
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
                openReadoutEditor(readoutHit.type, readoutHit.target);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if(introActive) return;
            const arrowAction = getArrowActionFromHits(hits);
            if((event.button === 0 || event.button === 2) && arrowAction){
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
                try{ settingsControllerCanvas.setPointerCapture(event.pointerId); }catch(e){}
                // Keep OrbitControls out until a right drag has actually left
                // the arrow. This prevents short clicks from nudging the camera.
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            // A right-button drag away from an arrow remains owned by OrbitControls.
            if(event.button === 2) return;
            const catClip = allClips.find((clipItem) => clipItem.tracks?.some((track) => {
                const nodeName = String(track.name || '').split('.')[0].toLowerCase();
                return nodeName.includes('manekinekoh');
            }));
            if(catClip){
                catAction = uiMixer.clipAction(catClip);
                catAction.enabled = true;
                catAction.paused = true;
                catAction.time = 0;
                catAction.play();
            }
            if(event.button === 0 && controls){
                const knobType = resolveKnobTypeFromPointer(event.clientX, event.clientY, firstHit.object);
                if(knobType){
                    updateLightingDebugLine('pointerdown', knobType);
                }
                if(knobType && settingsControllerBridge.knobDefaults){
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
                        const ndc = world.clone().project(activeCamera);
                        return new THREE.Vector2(
                            ((ndc.x + 1) * 0.5) * canvasRect.width,
                            ((1 - ndc.y) * 0.5) * canvasRect.height
                        );
                    };
                    // Semantic zero is always left/bottom (the larger local
                    // coordinate in this asset); one is right/top.
                    const pMin = makeScreenPoint(constraint.max);
                    const pMax = makeScreenPoint(constraint.min);
                    const axisVec = pMax.clone().sub(pMin);
                    const pointerInvert = false;
                    knobDragState = {
                        type: knobType,
                        pMin,
                        pMax,
                        axisDir: axisVec.clone().normalize(),
                        startX: event.clientX,
                        startY: event.clientY,
                        isDragging: false,
                        pointerInvert,
                        lastRawT: getKnobTFromClient({ pMin, pMax }, event.clientX, event.clientY),
                        lastX: event.clientX,
                        lastY: event.clientY,
                        lastMoveAt: performance.now(),
                        slowMs: 0,
                        precision: null,
                        pointerLocked: false,
                        relativeValue: getActiveKnobT(knobType),
                        dragDistance: 0
                    };
                    controls.enabled = false;
                    try{ settingsControllerCanvas.setPointerCapture(event.pointerId); }catch(e){}
                    // Request relative mouse input while the initiating gesture
                    // still has browser activation. This gives knob drags
                    // effectively unlimited travel at the screen edges.
                    try{
                        const lockRequest = settingsControllerCanvas.requestPointerLock?.();
                        lockRequest?.catch?.(() => {});
                    }catch(e){}
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
                    pulseMomentaryButton('save');
                    // Keep the 3D Save control in sync with the accessible form button.
                    saveBtn?.click();
                }else if(target.name === 'btn-reset'){
                    pulseMomentaryButton('reset');
                    resetBtn?.click();
                }
        }

        function handlePointerMove(event){
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
            const dx = event.clientX - knobDragState.startX;
            const dy = event.clientY - knobDragState.startY;
            const locked = document.pointerLockElement === settingsControllerCanvas;
            const initialMoveX = locked ? event.movementX : event.clientX - knobDragState.lastX;
            const initialMoveY = locked ? event.movementY : event.clientY - knobDragState.lastY;
            knobDragState.dragDistance += Math.hypot(initialMoveX, initialMoveY);
            const moved = locked ? knobDragState.dragDistance : Math.hypot(dx, dy);
            if(!knobDragState.isDragging){
                if(moved < 10) return;
                knobDragState.isDragging = true;
            }
            const rawT = getKnobTFromClient(knobDragState, event.clientX, event.clientY);
            const semanticRawT = knobDragState.pointerInvert ? (1 - rawT) : rawT;
            const now = performance.now();
            knobDragState.pointerLocked = locked;
            const moveX = locked ? event.movementX : event.clientX - knobDragState.lastX;
            const moveY = locked ? event.movementY : event.clientY - knobDragState.lastY;
            const stepDistance = Math.hypot(moveX, moveY);
            const elapsed = Math.max(1, now - knobDragState.lastMoveAt);
            let relativePixels = (moveX * knobDragState.axisDir.x) + (moveY * knobDragState.axisDir.y);
            if(knobDragState.pointerInvert) relativePixels *= -1;
            const trackPixels = Math.max(40, knobDragState.pMin.distanceTo(knobDragState.pMax));
            const normalT = locked
                ? Math.max(0, Math.min(1, knobDragState.relativeValue + (relativePixels / trackPixels)))
                : semanticRawT;
            const semanticMovement = Math.abs(normalT - knobDragState.relativeValue);
            const insideTrack = normalT > 0.0001 && normalT < 0.9999;
            const slowDeliberateMovement = stepDistance > 0
                && stepDistance <= 4
                && (stepDistance / elapsed) <= 0.12
                && semanticMovement > 1e-6
                && insideTrack;
            knobDragState.slowMs = slowDeliberateMovement
                ? knobDragState.slowMs + Math.min(elapsed, 40)
                : 0;
            if(!knobDragState.precision && knobDragState.slowMs >= 220){
                knobDragState.precision = {
                    value: normalT,
                    justStarted: true
                };
                settingsControllerScene.classList.add('is-precision-adjusting');
            }
            let t = normalT;
            if(knobDragState.precision){
                if(!knobDragState.precision.justStarted){
                    const relativeSpeed = Math.abs(relativePixels) / elapsed;
                    // Fine motion is one millisecond per pixel for AUDIO SYNC,
                    // or one tenth of a percent per pixel for other controls.
                    // Faster movement accelerates smoothly so a deliberate
                    // fling can still cross the complete slider range.
                    const baseSensitivity = knobDragState.type === 'sync' && activeSettingsView === 'audio'
                        ? (1 / 6000)
                        : 0.001;
                    const acceleration = relativeSpeed <= 0.20
                        ? 1
                        : Math.min(10, 1 + ((relativeSpeed - 0.20) * 7.5));
                    knobDragState.precision.value = Math.max(0, Math.min(1,
                        knobDragState.precision.value + (relativePixels * baseSensitivity * acceleration)
                    ));
                }
                knobDragState.precision.justStarted = false;
                t = knobDragState.precision.value;
            }
            knobDragState.relativeValue = t;
            knobDragState.lastRawT = rawT;
            knobDragState.lastSemanticT = t;
            knobDragState.lastX = event.clientX;
            knobDragState.lastY = event.clientY;
            knobDragState.lastMoveAt = now;
            applyKnobStateFromT(knobDragState.type, t);
        }

        function handlePointerUp(event){
            if(arrowPointerState && event.pointerId === arrowPointerState.pointerId && event.button === arrowPointerState.button){
                const elapsed = performance.now() - arrowPointerState.downAt;
                const shouldStep = !arrowPointerState.orbiting
                    && elapsed <= 320
                    && arrowPointerState.moved <= 7;
                if(shouldStep) applyArrowStep(arrowPointerState.action, arrowPointerState.button);
                arrowPointerState = null;
                try{ settingsControllerCanvas.releasePointerCapture(event.pointerId); }catch(e){}
                if(controls) setUserCameraControlsEnabled(true);
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if(event.button === 0 && knobDragState){
                if(!knobDragState.isDragging){
                    const rawT = getKnobTFromClient(knobDragState, event.clientX, event.clientY);
                    const t = knobDragState.pointerInvert ? (1 - rawT) : rawT;
                    applyKnobStateFromT(knobDragState.type, t);
                }
                knobDragState = null;
                settingsControllerScene.classList.remove('is-precision-adjusting');
                if(document.pointerLockElement === settingsControllerCanvas) document.exitPointerLock?.();
                try{ settingsControllerCanvas.releasePointerCapture(event.pointerId); }catch(e){}
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
                const bounds = new THREE.Box3().setFromObject(model);
                const centerPoint = bounds.getCenter(new THREE.Vector3());
                startFocusAnimation(centerPoint, { zoomToMin: false, durationMs: 320 });
            }else if(clickPoint){
                pendingMiddleSingleClick = {
                    timerId: setTimeout(() => {
                        startFocusAnimation(clickPoint, { zoomToMin: false, durationMs: 320 });
                        pendingMiddleSingleClick = null;
                    }, 320)
                };
            }
            lastMiddleClickTime = now;
            middlePointerState = null;
        }

        function handlePointerCancel(event){
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
        }

            settingsControllerCanvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
            settingsControllerCanvas.addEventListener('pointerup', handlePointerUp);
            settingsControllerCanvas.addEventListener('pointercancel', handlePointerCancel);
            settingsControllerCanvas.addEventListener('pointermove', handlePointerMove);
            settingsControllerCanvas.addEventListener('pointerleave', () => setControllerHoverHint(''));
            settingsControllerCanvas.addEventListener('contextmenu', (event) => {
                event.preventDefault();
            });
            document.addEventListener('keydown', (event)=>{
                if(event.target && /input|textarea|select/i.test(event.target.tagName)) return;
                const key = event.key.toLowerCase();
                if(key === 'a'){
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
            settingsControllerBridge.controls = controls;
            settingsControllerBridge.canvas = settingsControllerCanvas;
            settingsControllerBridge.updateKnobTransformsFromState = updateKnobTransformsFromState;
            applyModeButtonAppearance();
            updateKnobSidesLine();
            signalSettingsControllerReady();
        }, undefined, (error)=>{
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
    let syncVoiceSource = null;
    let syncTicksSource = null;
    let syncVoiceGain = null;
    let syncTicksGain = null;
    let analyser = null;
    let delayNode = null;
    let destinationGain = null;
    let vizPeakDb = -Infinity;
    let vizPeakColor = '#28a85b';
    let vizPeakClipped = false;
    let syncExerciseTimers = [];

    // State
    let currentVideoKey = 'counts';
    let storedVolume = parseFloat(localPreferences.getItem(AUDIO_VOLUME_KEY) || '0.25');
    let storedMuted = (localPreferences.getItem(AUDIO_MUTED_KEY) === 'true');
    let welcomeJingle = null;
    let storedSync = parseInt(localPreferences.getItem(AUDIO_SYNC_KEY) || '0', 10);
    let isOrchestrating = false;
    let jumpPlaybackRateIndex = SHARED_PLAYBACK_RATES.indexOf(1);
    if(jumpPlaybackRateIndex < 0) jumpPlaybackRateIndex = 0;
    let jumpPreservePitch = getStoredPreservePitch();

    // Initialize UI values
    syncSlider.value = storedSync;
    if(modalSync) modalSync.value = storedSync;
    syncDisplay.textContent = `Sync: ${storedSync} ms`;

    function askControllerPermission(stage, title, message){
        controllerFlow.stage = stage;
        settingsControllerBridge.renderScreen?.();
        const titleEl = document.getElementById('permTitle');
        const messageEl = permModal?.querySelector('p');
        if(titleEl) titleEl.textContent = title;
        if(messageEl) messageEl.textContent = message;
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
                controllerFlow.resolvePrompt = null;
                permModal.classList.add('hidden');
                permModal.style.display = 'none';
                resolve(!!value);
            };
            const allow = () => finish(true);
            const deny = () => finish(false);
            controllerFlow.resolvePrompt = finish;
            permAllow.addEventListener('click', allow);
            permDeny.addEventListener('click', deny);
            window.setTimeout(() => permAllow.focus(), 0);
        });
    }

    let onboardingPromise = null;

    function waitForLocalReviewGesture(){
        return new Promise((resolve) => {
            const finish = () => {
                document.removeEventListener('pointerdown', onPointerDown, true);
                document.removeEventListener('keydown', onKeyDown, true);
                controllerFlow.soundAllowed = true;
                applyAudioPermission(true, { persist: false });
                playWelcomeJingle(true);
                resolve();
            };
            const onPointerDown = () => finish();
            const onKeyDown = (event) => {
                if(event.key === 'Enter' || event.key === ' ') finish();
            };
            document.addEventListener('pointerdown', onPointerDown, { once: true, capture: true });
            document.addEventListener('keydown', onKeyDown, { capture: true });
        });
    }

    function showPermissionIfNeeded(){
        if(onboardingPromise) return onboardingPromise;
        onboardingPromise = (async () => {
            if(isLocalReview){
                controllerFlow.animationAllowed = true;
                controllerFlow.soundAllowed = null;
                controllerFlow.stage = 'gallery';
                permModal.classList.add('hidden');
                permModal.style.display = 'none';
                settingsControllerBridge.renderScreen?.();

                // The first real interaction provides the browser gesture needed
                // to resume Web Audio. Review choices remain session-only, and
                // the opening camera sequence is skipped without disabling the
                // controller's later mode/button animations.
                await waitForLocalReviewGesture();
                await settingsControllerBridge.ready;
                settingsControllerBridge.finishOnboarding?.(false);
                settingsControllerBridge.selectMode?.(localReviewStartMode, { triggerEmissive: false });
                settingsControllerBridge.renderScreen?.();
                return { soundAllowed: true, animationAllowed: true, review: true };
            }

            // Both choices are per-visit gates and are mirrored on the GLB
            // screen. Ask about motion first, but do not start it until sound has
            // also been explicitly accepted or rejected.
            const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            const animationAllowed = await askControllerPermission(
                'motion',
                'Allow animation?',
                reduced
                    ? 'Your device prefers reduced motion. Allow the optional controller and camera animation anyway?'
                    : 'Allow the optional controller and camera introduction animation?'
            );
            localPreferences.setItem(ANIMATION_ALLOWED_KEY, String(animationAllowed));
            controllerFlow.animationAllowed = animationAllowed;

            const soundAllowed = await askControllerPermission(
                'sound',
                'Allow sound?',
                'Allow sound for the paired sample-video audio? No media will start automatically.'
            );
            controllerFlow.soundAllowed = soundAllowed;
            applyAudioPermission(soundAllowed);
            await settingsControllerBridge.ready;
            controllerFlow.stage = 'gallery';
            if(soundAllowed) playWelcomeJingle(true);
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
            if(persist) localPreferences.setItem(AUDIO_MUTED_KEY, 'false');
            storedMuted = false;
            if(!Number.isFinite(storedVolume)){
                storedVolume = 0.25;
            }
            if(persist) localPreferences.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
            ensureAudioRouting();
            applyVolumeAndMuted();
            if(audioCtx){
                audioCtx.resume().catch(()=>{});
            }
        }else{
            if(persist) localPreferences.setItem(AUDIO_MUTED_KEY, 'true');
            storedMuted = true;
            applyVolumeAndMuted();
        }
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
    }

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
            syncVoiceSource = audioCtx.createMediaElementSource(syncVoiceAudio);
            syncTicksSource = audioCtx.createMediaElementSource(syncTicksAudio);
            syncVoiceGain = audioCtx.createGain();
            syncTicksGain = audioCtx.createGain();
            syncVoiceGain.gain.value = 1;
            syncTicksGain.gain.value = 0.48;
            // route: mediaSource -> delayNode -> destinationGain -> analyser -> audioCtx.destination
            mediaSource.connect(delayNode);
            delayNode.connect(destinationGain);
            // Calibration assets remain separate so voice/tick balance can be
            // tuned independently. They bypass the user's current sync delay:
            // the exercise measures a fresh system latency estimate.
            syncVoiceSource.connect(syncVoiceGain);
            syncTicksSource.connect(syncTicksGain);
            syncVoiceGain.connect(destinationGain);
            syncTicksGain.connect(destinationGain);
            destinationGain.connect(analyser);
            analyser.connect(audioCtx.destination);
            applySyncValue(storedSync);
            applyVolumeAndMuted();
            startVisualizer();
        }catch(e){
            // WebAudio not supported or blocked
            audioCtx = null;
            mediaSource = null;
            syncVoiceSource = null;
            syncTicksSource = null;
            syncVoiceGain = null;
            syncTicksGain = null;
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
        localPreferences.setItem(AUDIO_SYNC_KEY, String(storedSync));
        syncDisplay.textContent = `Sync: ${storedSync} ms`;
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
        }
        if(typeof settingsControllerBridge.updateSyncPercentLabel === 'function'){
            settingsControllerBridge.updateSyncPercentLabel();
        }

        if(window.siteConfig) window.siteConfig.audioSyncMs = storedSync;

        if(!audioCtx || !delayNode) return;
        const audioDelaySec = Math.max(0, storedSync/1000);
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
            try{ jumpAudio.muted = false; }catch(e){}
            try{ syncVoiceAudio.muted = false; syncTicksAudio.muted = false; }catch(e){}
            try{ jumpVideo.muted = true; }catch(e){}
        }else{
            try{
                jumpVideo.muted = true;
                jumpAudio.muted = effectivelyMuted;
                jumpAudio.volume = storedVolume;
            }catch(e){}
        }
        if(permissionMuted){
            try{ jumpAudio.pause(); }catch(e){}
            try{ syncVoiceAudio.pause(); syncTicksAudio.pause(); }catch(e){}
        }
        if(!isLocalReview){
            localPreferences.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
            localPreferences.setItem(AUDIO_MUTED_KEY, storedMuted ? 'true':'false');
        }
        updateVolumeUI();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
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
        try{ jumpVideo.playbackRate = rate; }catch(e){}
        try{ jumpAudio.playbackRate = rate; }catch(e){}
        setPreservePitchFlag(jumpVideo, jumpPreservePitch);
        setPreservePitchFlag(jumpAudio, jumpPreservePitch);
    }

    function setupJumpSharedControls(){
        if(!videoWrapper || !jumpVideo) return null;
        try{ jumpVideo.controls = false; jumpVideo.removeAttribute('controls'); }catch(e){}
        const controlsCanvas = document.createElement('canvas');
        controlsCanvas.className = 'jump-video-controls';
        controlsCanvas.setAttribute('aria-hidden', 'true');
        videoWrapper.appendChild(controlsCanvas);
        const controlsCtx = controlsCanvas.getContext('2d');
        const ui = createVideoControlsUI();
        ui.setViewportRectProvider(() => {
            const rect = videoWrapper.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        });
        const resizeControlsCanvas = () => {
            const rect = videoWrapper.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if(controlsCanvas.width !== w || controlsCanvas.height !== h){
                controlsCanvas.width = w;
                controlsCanvas.height = h;
            }
            controlsCanvas.style.width = `${Math.max(1, Math.round(rect.width))}px`;
            controlsCanvas.style.height = `${Math.max(1, Math.round(rect.height))}px`;
        };
        const getTitle = () => {
            const media = MEDIA[currentVideoKey];
            return media?.label || (currentVideoKey === 'alphabet' ? 'Alphabet A-B-C' : 'Numbers 1-2-3');
        };
        const setJumpVolume = (volume) => {
            storedVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
            storedMuted = storedVolume <= 0.001;
            resumeAudioContext();
            applyVolumeAndMuted();
        };
        const toggleJumpMute = () => {
            storedMuted = !storedMuted;
            if(!storedMuted && storedVolume <= 0.001) storedVolume = 0.25;
            resumeAudioContext();
            applyVolumeAndMuted();
        };
        ui.onAction = (action) => {
            if(!action || !action.type) return;
            if(action.type === 'togglePlay'){
                if(jumpVideo.paused) jumpVideo.play().catch(()=>{});
                else jumpVideo.pause();
            }else if(action.type === 'seekToRatio'){
                const duration = Number.isFinite(jumpVideo.duration) ? jumpVideo.duration : 0;
                if(duration > 0){
                    try{ jumpVideo.currentTime = duration * Math.max(0, Math.min(1, action.ratio || 0)); }catch(e){}
                }
            }else if(action.type === 'toggleMute'){
                toggleJumpMute();
            }else if(action.type === 'setVolume'){
                setJumpVolume(action.volume);
            }else if(action.type === 'cyclePlaybackRate'){
                jumpPlaybackRateIndex = (jumpPlaybackRateIndex + 1) % SHARED_PLAYBACK_RATES.length;
                applyJumpPlaybackSettings();
            }else if(action.type === 'togglePitch'){
                jumpPreservePitch = setStoredPreservePitch(!jumpPreservePitch);
                applyJumpPlaybackSettings();
            }else if(action.type === 'setSyncMs'){
                applySyncValue(action.value);
                if(syncSlider) syncSlider.value = String(storedSync);
                if(modalSync) modalSync.value = String(storedSync);
            }
        };
        controlsCanvas.addEventListener('pointerdown', (event) => {
            if(event.button !== 0) return;
            resizeControlsCanvas();
            const handled = ui.handlePointerEvent(event, {
                canvasWidth: controlsCanvas.width,
                canvasHeight: controlsCanvas.height
            });
            if(!handled){
                if(jumpVideo.paused) jumpVideo.play().catch(()=>{});
                else jumpVideo.pause();
            }
            event.preventDefault();
            event.stopPropagation();
        });
        controlsCanvas.addEventListener('contextmenu', (event) => event.preventDefault());
        const draw = () => {
            resizeControlsCanvas();
            const rate = SHARED_PLAYBACK_RATES[Math.max(0, Math.min(SHARED_PLAYBACK_RATES.length - 1, jumpPlaybackRateIndex))] || 1;
            ui.setState({
                title: getTitle(),
                playing: !jumpVideo.paused && !jumpVideo.ended,
                muted: storedMuted,
                volume: storedMuted ? 0 : storedVolume,
                currentTime: Number.isFinite(jumpVideo.currentTime) ? jumpVideo.currentTime : 0,
                duration: Number.isFinite(jumpVideo.duration) ? jumpVideo.duration : 0,
                playbackRate: rate,
                canPlay: !!(jumpVideo.currentSrc || jumpVideo.querySelector('source')),
                canSeek: Number.isFinite(jumpVideo.duration) && jumpVideo.duration > 0,
                preservePitch: jumpPreservePitch,
                syncMs: Number.isFinite(storedSync) ? storedSync : 0,
                controls: {
                    exit: false,
                    play: true,
                    mute: true,
                    volume: true,
                    seek: Number.isFinite(jumpVideo.duration) && jumpVideo.duration > 0,
                    speed: true,
                    pitch: true,
                    sync: true,
                    tablet: false
                }
            });
            controlsCtx.clearRect(0, 0, controlsCanvas.width, controlsCanvas.height);
            ui.draw(controlsCtx, { alpha: 1 });
            requestAnimationFrame(draw);
        };
        applyJumpPlaybackSettings();
        requestAnimationFrame(draw);
        window.addEventListener('resize', resizeControlsCanvas);
        return ui;
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
        try{ welcomeJingle.currentTime = 0; }catch(e){}
        welcomeJingle.play().catch(()=>{});
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
        vizPeakColor = '#28a85b';
        vizPeakClipped = false;
        settingsControllerBridge.updateAudioMeter?.({ level: 0, peak: 0, clipped: false, peakClipped: false });
    }

    function clearSyncExerciseTimers(){
        syncExerciseTimers.forEach((timerId) => window.clearTimeout(timerId));
        syncExerciseTimers = [];
    }

    function stopSyncExerciseAudio(){
        try{ syncVoiceAudio.pause(); syncVoiceAudio.currentTime = 0; }catch(e){}
        try{ syncTicksAudio.pause(); syncTicksAudio.currentTime = 0; }catch(e){}
    }

    function resetSyncExercise(){
        clearSyncExerciseTimers();
        stopSyncExerciseAudio();
        const exercise = controllerFlow.syncExercise;
        exercise.active = false;
        exercise.startedAt = 0;
        exercise.taps = [];
        exercise.litCount = 0;
        exercise.litLines = new Set();
        exercise.result = '';
        exercise.runId = (exercise.runId || 0) + 1;
        controllerFlow.stage = 'gallery';
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function startSyncExercise(){
        if(!controllerFlow.soundAllowed){
            controllerFlow.syncExercise.result = 'SOUND MUST BE ENABLED TO SYNC';
            controllerFlow.stage = 'sync-running';
            settingsControllerBridge.renderScreen?.();
            syncAccessibleControllerUI();
            return;
        }
        clearSyncExerciseTimers();
        stopSyncExerciseAudio();
        ensureAudioRouting();
        resumeAudioContext();
        resetPeakHold();
        settingsControllerBridge.selectMode?.('audio');
        const exercise = controllerFlow.syncExercise;
        exercise.active = true;
        exercise.startedAt = performance.now();
        exercise.taps = [];
        exercise.litCount = 0;
        exercise.litLines = new Set();
        exercise.result = '';
        exercise.runId = (exercise.runId || 0) + 1;
        const runId = exercise.runId;
        controllerFlow.stage = 'sync-running';
        const markPlaybackOrigin = () => {
            if(exercise.runId !== runId) return;
            exercise.startedAt = performance.now() - ((syncVoiceAudio.currentTime || 0) * 1000);
        };
        syncVoiceAudio.addEventListener('playing', markPlaybackOrigin, { once: true });
        try{ syncVoiceAudio.currentTime = 0; syncTicksAudio.currentTime = 0; }catch(e){}
        Promise.all([syncVoiceAudio.play(), syncTicksAudio.play()]).catch(() => {
            if(exercise.runId !== runId) return;
            exercise.active = false;
            exercise.result = 'AUDIO COULD NOT START - TRY AGAIN';
            settingsControllerBridge.renderScreen?.();
            syncAccessibleControllerUI();
        });
        const endTimerId = window.setTimeout(() => {
            if(exercise.runId !== runId || !exercise.active) return;
            exercise.active = false;
            exercise.result = 'MISSED A CUE - TRY AGAIN';
            settingsControllerBridge.renderScreen?.();
            syncAccessibleControllerUI();
        }, 7600);
        syncExerciseTimers.push(endTimerId);
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function registerSyncExerciseTap(){
        const exercise = controllerFlow.syncExercise;
        const index = exercise.taps.length;
        if(!exercise.active || index >= SYNC_WORDS.length) return;
        const observedOffset = performance.now()
            - exercise.startedAt
            - SYNC_CUE_OFFSETS_MS[index]
            - SYNC_REACTION_ALLOWANCE_MS;
        exercise.taps.push(observedOffset);
        exercise.litCount = index + 1;
        const runId = exercise.runId;
        if(index < SYNC_WORDS.length - 1){
            const timerId = window.setTimeout(() => {
                if(exercise.runId !== runId) return;
                exercise.litLines.add(index);
                settingsControllerBridge.renderScreen?.();
            }, SYNC_BEAT_MS);
            syncExerciseTimers.push(timerId);
        }
        if(exercise.taps.length === SYNC_WORDS.length){
            exercise.active = false;
            const sorted = [...exercise.taps].sort((a, b) => a - b);
            const medianOffset = sorted[Math.floor(sorted.length / 2)];
            const calibratedSync = Math.max(-3000, Math.min(3000, Math.round(-medianOffset)));
            applySyncValue(calibratedSync);
            exercise.result = Math.abs(calibratedSync) < 5
                ? 'SYNCED NEAR 0 MS'
                : `ESTIMATED ${calibratedSync > 0 ? '+' : ''}${calibratedSync} MS OFFSET`;
        }
        settingsControllerBridge.renderScreen?.();
        syncAccessibleControllerUI();
    }

    function loadVideo(key){
        currentVideoKey = key;
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

    jumpVideo.addEventListener('loadeddata', () => settingsControllerBridge.renderScreen?.());
    jumpVideo.addEventListener('error', () => {
        setTabInfo('This sample could not be loaded. Choose the other clip or retry.');
        settingsControllerStatus && (settingsControllerStatus.textContent = 'Sample video unavailable; choose another clip.');
    });
    jumpAudio.addEventListener('error', () => {
        if(controllerFlow.soundAllowed) setTabInfo('Video is available, but its paired audio could not be loaded.');
    });

    function preloadMedia(){
        Object.entries(MEDIA).forEach(([key, media])=>{
            const image = new Image();
            image.onload = () => {
                controllerFlow.thumbnails.set(key, image);
                settingsControllerBridge.renderScreen?.();
            };
            image.onerror = () => setTabInfo(`Thumbnail unavailable for ${media.label}.`);
            image.src = media.thumbnail;
        });
    }

    // Orchestrate playback so sync offset works both positive and negative
    let isPlaying = false;
    let audioStartTimer = null;
    function seekAudioForVideoTime(videoTime){
        const base = Math.max(0, Number(videoTime) || 0);
        const target = storedSync < 0 ? base + Math.abs(storedSync) / 1000 : base;
        try{
            const duration = Number.isFinite(jumpAudio.duration) ? jumpAudio.duration : 0;
            jumpAudio.currentTime = duration ? Math.min(target, Math.max(0, duration - 0.01)) : target;
        }catch(e){}
    }
    function startAudioForVideoPlayback(){
        if(!controllerFlow.soundAllowed){
            try{ jumpAudio.pause(); }catch(e){}
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
            const audioOffset = Math.abs(sync) / 1000;
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
    jumpVideo.addEventListener('play', (e)=>{
        startAudioForVideoPlayback();
        isPlaying = true;
        syncAccessibleControllerUI();
    });
    jumpVideo.addEventListener('pause', ()=>{
        if(audioStartTimer){ clearTimeout(audioStartTimer); audioStartTimer = null; }
        if(isPlaying){
            try{ jumpAudio.pause(); }catch(e){}
            isPlaying = false;
        }
        syncAccessibleControllerUI();
    });

    // When user seeks using visible video's UI, update audio currentTime
    jumpVideo.addEventListener('seeked', ()=>{
        seekAudioForVideoTime(jumpVideo.currentTime);
    });
    jumpVideo.addEventListener('ended', () => {
        if(audioStartTimer){ clearTimeout(audioStartTimer); audioStartTimer = null; }
        try{ jumpAudio.pause(); }catch(e){}
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
            }catch(e){}
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
    saveBtn.addEventListener('click', ()=>{
        const reducedMotion = document.getElementById('a11y_reduced_motion').checked;
        const highContrast = document.getElementById('a11y_high_contrast').checked;
        const textScale = (document.querySelector('input[name="a11y_text"]:checked')?.value)||'normal';
        const focusOutline = document.getElementById('a11y_focus_outlines').checked ? 'always':'auto';
        try{ window.SiteA11y.set({ reducedMotion, highContrast, textScale, focusOutline }); }catch(e){}

        showSaveConfirmation();
    });

    resetBtn.addEventListener('click', ()=>{
        try { localPreferences.removeItem('site.a11y.settings'); } catch {}
        window.SiteA11y.apply(window.SiteA11y.get());
        hydrate();
        updateA11yDebugFlags();
    });

    // Top tabs behavior
    topTabA11y.addEventListener('click', ()=>{
        topTabA11y.classList.add('active'); topTabAudio.classList.remove('active');
        topTabA11y.setAttribute('aria-selected', 'true'); topTabAudio.setAttribute('aria-selected', 'false');
        a11ySection.style.display = 'block';
        jumpContainer.style.display = 'none';
        leadText.textContent = 'Letâ€™s tune a few preferences so the site works best for you.';
        if(settingsControllerBridge?.setAccessibilityView){
            settingsControllerBridge.setAccessibilityView();
        }
    });
    topTabAudio.addEventListener('click', ()=>{
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
        nextBtn.addEventListener('click', ()=>{
            window.location.href = '_1-about/about.html';
        });
    }
    if(returnGalleryBtn){
        returnGalleryBtn.addEventListener('click', resetSyncExercise);
    }
    accessibleAudioMode?.addEventListener('click', () => settingsControllerBridge.selectMode?.('audio'));
    accessibleVisualsMode?.addEventListener('click', () => settingsControllerBridge.selectMode?.('visuals'));
    accessibleVolume?.addEventListener('input', (event) => setVolumeFromPercent(Number(event.target.value)));
    accessibleSync?.addEventListener('input', (event) => applySyncValue(Number(event.target.value)));
    accessibleBrightness?.addEventListener('input', (event) => applyLuxFromSource(Number(event.target.value) / 100, 'accessible'));
    accessibleContrast?.addEventListener('input', (event) => applyEmiFromSource(Number(event.target.value) / 100, 'accessible'));
    accessibleCounts?.addEventListener('click', startSyncExercise);
    accessiblePlayPause?.addEventListener('click', registerSyncExerciseTap);
    accessibleGallery?.addEventListener('click', resetSyncExercise);
    accessibleConfirmYes?.addEventListener('click', () => resolveSaveConfirmation(true));
    accessibleConfirmNo?.addEventListener('click', () => resolveSaveConfirmation(false));

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
    syncSlider.addEventListener('input', (e)=>{
        applySyncValue(e.target.value);
        if(modalSync) modalSync.value = e.target.value;
    });
    if(modalSync) modalSync.addEventListener('input', (e)=>{
        applySyncValue(e.target.value);
        syncSlider.value = e.target.value;
    });
    window.addEventListener('syncOffsetChanged', (e)=>{
        const ms = parseInt(e?.detail?.offsetMs, 10) || 0;
        storedSync = ms;
        syncSlider.value = ms;
        if(modalSync) modalSync.value = ms;
        syncDisplay.textContent = `Sync: ${ms} ms`;
        applySyncValue(ms);
    });
    if(volumeSlider) volumeSlider.addEventListener('input', (e)=>{
        setVolumeFromPercent(parseInt(e.target.value, 10));
    });

    // When metadata loaded apply persisted settings
    jumpVideo.addEventListener('loadedmetadata', ()=>{ applyVolumeAndMuted(); });
    jumpAudio.addEventListener('loadedmetadata', ()=>{ applyVolumeAndMuted(); });

    // Fallback to native video playback if orchestration fails
    function fallbackToNativePlayback(){
        try{
            jumpVideo.muted = true;
            jumpAudio.muted = !controllerFlow.soundAllowed || storedMuted;
            jumpAudio.volume = storedVolume;
            jumpVideo.play().catch(()=>{});
            if(controllerFlow.soundAllowed) startAudioForVideoPlayback();
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
        actions['Reset camera anim'] = () => settingsControllerBridge.resetCustomCameraAnimation?.();
        if(typeof window.registerDebugHooks === 'function'){
            window.registerDebugHooks({ flags, actions });
        }
    }

    window.addEventListener('debug-ui-ready', updateA11yDebugFlags);
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

    window.addEventListener('debug-ui-ready', registerLightingDebugActions);
    registerLightingDebugActions();

    document.addEventListener('DOMContentLoaded', async ()=>{
        initSettingsControllerScene();
        hydrate();
        await showPermissionIfNeeded();
        storedVolume = parseFloat(localPreferences.getItem(AUDIO_VOLUME_KEY) || storedVolume);
        storedMuted = isLocalReview ? false : (localPreferences.getItem(AUDIO_MUTED_KEY) === 'true');
        storedSync = parseInt(localPreferences.getItem(AUDIO_SYNC_KEY) || storedSync, 10);
        syncSlider.value = storedSync;
        if(modalSync) modalSync.value = storedSync;
        applySyncValue(storedSync);
        syncVoiceAudio.load();
        syncTicksAudio.load();
        applyVolumeAndMuted();
        resetSyncExercise();
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

if(isLocalReview) loadDebugIfEnabled();
