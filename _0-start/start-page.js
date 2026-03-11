import { assetUrl, isLocalDev } from "../_7-shared-scripts/assets-config.js";
import { loadDebugIfEnabled, DEBUG_VISIBILITY_EVENT } from "../debug/debug-loader.js";
import { getSceneLightingValue, setSceneLightingValue, getLightScaleForValue, MAX_LIGHT_RATIO } from "../_7-shared-scripts/scene-lighting-sync.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const isLocalHost = isLocalDev();
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
    knobContrastNode: null,
    knobContrastNodes: [],
    knobDefaults: null,
    knobConstraints: null,
    knobHitboxes: null,
    knobAxisValues: { vol: 0, sync: 0, contrast: 0.5 },
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

function initStartPageUILayoutTabs() {
    const leftColumn = document.getElementById("uiLeftColumn");
    const rightColumn = document.getElementById("uiRightColumn");
    if (!rightColumn) return;
    rightColumn.classList.add("ui-right--debug-host");
    let debugPanelsShown = true;

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
                debugDockToggle.textContent = "HIDE PANEL";
                debugDockToggle.setAttribute("aria-label", "Hide debug control panel");
                debugPanelEl.appendChild(debugDockToggle);
                debugDockToggle.addEventListener("click", () => {
                    window.dispatchEvent(new CustomEvent(DEBUG_VISIBILITY_EVENT, { detail: { show: false } }));
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
                leftPanelHideToggle.textContent = "HIDE PANEL";
                leftPanelHideToggle.setAttribute("aria-label", "Hide debug info panel");
                leftInfoPanel.appendChild(leftPanelHideToggle);
                leftPanelHideToggle.addEventListener("click", () => {
                    window.dispatchEvent(new CustomEvent(DEBUG_VISIBILITY_EVENT, { detail: { show: false } }));
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
    const setDebugPanelsShown = (show) => {
        debugPanelsShown = !!show;
        const debugPanelEl = document.getElementById("debug-panel");
        const leftInfoPanel = document.querySelector(".cam-anim-debug-panel");
        if (debugPanelEl) {
            debugPanelEl.classList.toggle("debug-panel--dock-hidden-right", !debugPanelsShown);
        }
        if (leftInfoPanel) {
            leftInfoPanel.classList.toggle("cam-anim-debug-panel--hidden-left", !debugPanelsShown);
        }
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

    const observer = new MutationObserver(() => {
        dockDebugPanel();
        moveToLeftOverlay(".cam-anim-debug-panel");
        connectDebugPanelThemeObserver();
        ensureMergedDebugTabs();
        ensureHideButtons();
        setDebugPanelsShown(debugPanelsShown);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStartPageUILayoutTabs, { once: true });
} else {
    initStartPageUILayoutTabs();
}
// Bind controls to SiteA11y and implement jump UI with visualizer
(function(){
    // Helper storage keys
    const AUDIO_ALLOWED_KEY = 'site.audio.allowed';
    const AUDIO_VOLUME_KEY = 'site.audio.volume';
    const AUDIO_SYNC_KEY = 'site.audio.sync';
    const AUDIO_MUTED_KEY = 'site.audio.muted';
    const CONTRAST_VALUE_KEY = 'site.contrast.value';
    const BRIGHTNESS_VALUE_KEY = 'site.start.brightness';
    const lightingState = {
        lux: Number.NaN,
        emi: Number.NaN,
        overlay: Number.NaN
    };
    const clamp01Value = (value) => {
        const parsed = Number(value);
        if(!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.min(1, parsed));
    };
    const getLuxValue = () => {
        if(Number.isFinite(lightingState.lux)) return lightingState.lux;
        const fallback = clamp01Value(getSceneLightingValue());
        lightingState.lux = fallback ?? 1;
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
            const parsed = clamp01Value(localStorage.getItem(CONTRAST_VALUE_KEY));
            if(parsed === null){
                try{ localStorage.setItem(CONTRAST_VALUE_KEY, '0.5'); }catch(e){}
                lightingState.emi = 0.5;
                return lightingState.emi;
            }
            lightingState.emi = parsed;
            return lightingState.emi;
        }catch(e){
            lightingState.emi = 0.5;
            return lightingState.emi;
        }
    };
    const setEmiValue = (value) => {
        const next = clamp01Value(value);
        if(next === null) return getEmiValue();
        lightingState.emi = next;
        try{ localStorage.setItem(CONTRAST_VALUE_KEY, String(next)); }catch(e){}
        return next;
    };

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
    const bgOverlay = document.querySelector('.bg-overlay');
    const settingsControllerCanvas = document.getElementById('settingsControllerCanvas');
    const settingsControllerStatus = document.getElementById('settingsControllerStatus');
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
    let activeSettingsView = 'accessibility';
    const getBackgroundBrightness = () => {
        if(Number.isFinite(lightingState.overlay)){
            return Math.max(0, Math.min(1, lightingState.overlay));
        }
        try{
            const raw = localStorage.getItem(BRIGHTNESS_VALUE_KEY);
            const parsed = clamp01Value(raw);
            if(parsed === null){
                try{ localStorage.setItem(BRIGHTNESS_VALUE_KEY, '0'); }catch(e){}
                lightingState.overlay = 0;
                return 0;
            }
            lightingState.overlay = parsed;
            return lightingState.overlay;
        }catch(e){
            lightingState.overlay = 0;
            return 0;
        }
    };

        const setBackgroundBrightness = (value) => {
            const next = clamp01Value(value);
            if(next === null) return getBackgroundBrightness();
            lightingState.overlay = next;
            try{ localStorage.setItem(BRIGHTNESS_VALUE_KEY, String(next)); }catch(e){}
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
        if(overlayBlendSlider) overlayBlendSlider.value = value.toFixed(2);
        if(overlayBlendInput) overlayBlendInput.value = value.toFixed(2);
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
        const node = settingsControllerBridge.knobContrastNode;
        const constraints = settingsControllerBridge.knobConstraints;
        const constraint = constraints?.contrastAll?.get(node?.uuid) || constraints?.contrast || null;
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
    

    // Cache of "screen semantic" left/right mapping per knob so we can stay consistent
    // across transient states where camera / parent / rect isn't ready yet.
    const knobScreenSemanticCache = {
        contrast: null, // { leftValue, rightValue, axis }
        contrastAll: new Map() // uuid -> { leftValue, rightValue, axis }
    };

    function getSemanticConstraintLR(node, constraint, canvasRect, camera, cacheKey){
        const info = getConstraintScreenData(node, constraint, canvasRect, camera);
        if(info){
            const payload = { leftValue: info.leftValue, rightValue: info.rightValue, axis: constraint.axis };
            if(cacheKey === 'contrast'){
                knobScreenSemanticCache.contrast = payload;
            }else if(cacheKey && node?.uuid){
                knobScreenSemanticCache.contrastAll.set(node.uuid, payload);
            }
            return { ...info, axis: constraint.axis };
        }
        // Fallback to last known mapping
        if(cacheKey === 'contrast' && knobScreenSemanticCache.contrast){
            const c = knobScreenSemanticCache.contrast;
            return { leftValue: c.leftValue, rightValue: c.rightValue, axis: c.axis };
        }
        if(cacheKey && node?.uuid){
            const c = knobScreenSemanticCache.contrastAll.get(node.uuid);
            if(c) return { leftValue: c.leftValue, rightValue: c.rightValue, axis: c.axis };
        }
        return null;
    }

    function getKnobSideInfo(type){
        const canvas = settingsControllerCanvas;
        const camera = settingsControllerBridge.camera;
        const constraints = settingsControllerBridge.knobConstraints;
        let node = type === 'sync'
            ? settingsControllerBridge.knobSyncNode
            : (type === 'contrast' ? settingsControllerBridge.knobContrastNode : settingsControllerBridge.knobVolNode);
        let constraint = constraints?.[type];
        if(type === 'contrast' && (!node || !constraint)){
            const nodes = settingsControllerBridge.knobContrastNodes || [];
            const all = constraints?.contrastAll;
            const first = nodes.find((n) => all?.get(n.uuid));
            if(first){
                node = first;
                constraint = all.get(first.uuid);
            }
        }
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
        const contrastNodeName = settingsControllerBridge.knobContrastNode?.name || '(none)';
        lightingDebugLineEl.textContent =
            `DBG src:${lightingDebugState.source} knob:${lightingDebugState.knob} Lux:${lux.toFixed(2)} Emi:${emi.toFixed(2)} CNode:${contrastNodeName}`;
        updateContrastKnobTrackerLine();
        updateKnobSidesLine();
    }

    function syncEmiToEmissiveSliderRanges(value){
        const v = Math.max(0, Math.min(1, Number(value)));
        if(!Number.isFinite(v)) return;
        const emissiveState = settingsControllerBridge.emissiveControlState;
        const saveScales = settingsControllerBridge.saveEmissiveScales;
        if(!emissiveState || typeof saveScales !== 'function') return;
        const sliderList = document.getElementById('emissiveSliderList');
        if(!sliderList) return;
        let changed = false;
        sliderList.querySelectorAll('input[type="range"][data-path]').forEach((slider) => {
            const min = Number.isFinite(parseFloat(slider.min)) ? parseFloat(slider.min) : 0;
            const max = Number.isFinite(parseFloat(slider.max)) ? parseFloat(slider.max) : 1;
            const next = min + ((max - min) * v);
            slider.value = String(next);
            const path = slider.dataset.path;
            if(path){
                emissiveState.scales.set(path, next);
                changed = true;
            }
            const row = slider.closest('.emissive-slider-item');
            const valueEl = row ? row.querySelector('.emissive-slider-value') : null;
            if(valueEl) valueEl.textContent = next.toFixed(2);
        });
        if(changed) saveScales();
    }

    function applyLuxFromSource(value, source){
        const next = setLuxValue(value);
        applyLuxControls();
        syncLuxInputs();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
        }
        updateLightingDebugLine(source || 'lux', 'sync');
        return next;
    }

    function applyEmiFromSource(value, source){
        const next = setEmiValue(value);
        syncEmiToEmissiveSliderRanges(next);
        applyEmissionControls();
        syncEmiInputs();
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
        }
        applyContrastLockPose();
        updateLightingDebugLine(source || 'emi', 'contrast');
        return next;
    }

    function applyOverlayFromSource(value, source){
        const next = setBackgroundBrightness(value);
        applyBackgroundBrightness(next);
        syncOverlayInputs();
        updateLightingDebugLine(source || 'overlay', '-');
        return next;
    }

    function toggleOverlayBlendForDebugShortcut(){
        const current = Math.max(0, Math.min(1, getBackgroundBrightness()));
        const next = current >= 0.5 ? 0 : 1;
        return applyOverlayFromSource(next, 'debug-shortcut');
    }

    window.toggleOverlayBlendForDebugShortcut = toggleOverlayBlendForDebugShortcut;

    function bindAnimTuningControls(){
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
        const axesScene = new THREE.Scene();
        const axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
        axesCamera.position.set(0.8, 0.8, 2.2);
        axesCamera.lookAt(0, 0, 0);
        const axesRoot = new THREE.Group();
        axesRoot.add(new THREE.AxesHelper(0.6));
        axesScene.add(axesRoot);

        const fallbackCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        fallbackCamera.position.set(0, 1.6, 4);
        let activeCamera = fallbackCamera;

        const ambient = new THREE.HemisphereLight(0xffffff, 0x0f1115, 0.6);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
        dirLight.position.set(2, 4, 3);
        scene.add(ambient, dirLight);
        const lightingRig = [ambient, dirLight];
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
        let manualEmissiveDirection = 1;
        let loggedManualEmissives = false;
        const EMISSIVE_ANIM_NAME_MARKERS = ['emission', 'emissive', 'glow'];
        let syncPercentLabel = null;
        const syncPercentLabelTargets = [];
        let syncPercentLabelCtx = null;
        let syncPercentLabelTexture = null;

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

        let contrastLockPose = null;
        const storeContrastLockPose = () => {
            const node = settingsControllerBridge.knobContrastNode;
            if(!node) return;
            node.updateMatrixWorld(true);
            const quat = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const pos = new THREE.Vector3();
            node.matrixWorld.decompose(pos, quat, scale);
            contrastLockPose = { quat };
        };

        const applyContrastLockPose = () => {
            if(!contrastLockPose) return;
            const node = settingsControllerBridge.knobContrastNode;
            if(!node || !node.parent) return;
            node.parent.updateMatrixWorld(true);
            const parentQuat = node.parent.getWorldQuaternion(new THREE.Quaternion());
            const localQuat = parentQuat.invert().multiply(contrastLockPose.quat.clone());
            node.quaternion.copy(localQuat);
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

        function updateSyncPercentLabel(){
            if(!syncPercentLabel || !syncPercentLabelCtx || !syncPercentLabelTexture) return;
            const knobPos = Number.isFinite(settingsControllerBridge.knobAxisValues?.contrast)
                ? settingsControllerBridge.knobAxisValues.contrast
                : getContrastValue();
            const contrastValue = Math.round(Math.max(0, Math.min(1, knobPos)) * 100);
            const ctx = syncPercentLabelCtx;
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(0, 0, 0, 0)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ff2a2a';
            ctx.font = '64px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${contrastValue}`, w / 2, h / 2);
            syncPercentLabelTargets.forEach((mesh) => {
                if(!mesh || !mesh.isMesh || !mesh.material) return;
                if(mesh.material.map !== syncPercentLabelTexture){
                    mesh.material.map = syncPercentLabelTexture;
                    mesh.material.transparent = true;
                    mesh.material.depthWrite = false;
                    mesh.material.needsUpdate = true;
                }
            });
            syncPercentLabelTexture.needsUpdate = true;
        }
        settingsControllerBridge.updateSyncPercentLabel = updateSyncPercentLabel;

        const bindSyncPercentLabelMesh = (mesh) => {
            if(!mesh || !mesh.isMesh || !syncPercentLabelTexture) return;
            if(!mesh.material || Array.isArray(mesh.material)){
                mesh.material = new THREE.MeshBasicMaterial({
                    map: syncPercentLabelTexture,
                    transparent: true,
                    depthWrite: false
                });
            }else{
                mesh.material.map = syncPercentLabelTexture;
                mesh.material.transparent = true;
                mesh.material.depthWrite = false;
                mesh.material.needsUpdate = true;
            }
            if(!syncPercentLabelTargets.includes(mesh)){
                syncPercentLabelTargets.push(mesh);
            }
            if(!syncPercentLabel){
                syncPercentLabel = mesh;
            }
        };

        const initSyncPercentLabel = (node) => {
            if(!node) return;
            if(!syncPercentLabelTexture || !syncPercentLabelCtx){
                const canvas = document.createElement('canvas');
                canvas.width = 512;
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
                syncPercentLabelCtx = ctx;
                syncPercentLabelTexture = texture;
            }
            if(node.isMesh){
                bindSyncPercentLabelMesh(node);
                updateSyncPercentLabel();
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
            targets.forEach((mesh) => bindSyncPercentLabelMesh(mesh));
            updateSyncPercentLabel();
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
        const forceLuxAndContrastRight = () => {
            applyLuxFromSource(1, 'force-init');
            const tRight = 1;
            const emiAtRight = mapContrastKnobToValue(tRight);
            applyEmiFromSource(emiAtRight, 'force-init');
            const allContrast = settingsControllerBridge.knobContrastNodes || [];
            const allConstraints = settingsControllerBridge.knobConstraints?.contrastAll;
            const camera = settingsControllerBridge.camera || activeCamera;
            const canvasRect = settingsControllerCanvas?.getBoundingClientRect();
            allContrast.forEach((node) => {
                const c = allConstraints?.get(node.uuid);
                if(!node || !c) return;
                const info = getSemanticConstraintLR(node, c, canvasRect, camera, 'contrastAll');
                if(info){
                    node.position[c.axis] = info.rightValue;
                }
            });
            settingsControllerBridge.knobAxisValues.contrast = 1;
        };

        

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
                const raw = localStorage.getItem(EMISSIVE_EXCLUSIONS_KEY);
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
                const raw = localStorage.getItem(EMISSIVE_SCALES_KEY);
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
            localStorage.setItem(EMISSIVE_EXCLUSIONS_KEY, payload);
        };

        const saveEmissiveScales = () => {
            const payload = {};
            emissiveControlState.scales.forEach((value, key) => {
                payload[key] = value;
            });
            localStorage.setItem(EMISSIVE_SCALES_KEY, JSON.stringify(payload));
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

        const applyLuxValue = (value) => {
            if(!lightingTargets) return;
            const v = Math.max(0, Math.min(1, Number(value)));
            if(!Number.isFinite(v)) return;
            const lightScale = getLightScaleForValue(v);
            lightingTargets.lights.forEach((light) => {
                const maxIntensity = Number.isFinite(light?.userData?.maxIntensity)
                    ? light.userData.maxIntensity
                    : light.intensity / MAX_LIGHT_RATIO;
                light.intensity = maxIntensity * lightScale;
            });
        };

        const applyEmissiveValue = (value) => {
            if(!lightingTargets) return;
            const v = Math.max(0, Math.min(1, Number(value)));
            if(!Number.isFinite(v)) return;
            lightingTargets.emissiveTargets.forEach((target) => {
                const mat = target.material;
                const node = target.node;
                const controlNode = target.controlNode;
                if(!mat || !node || !controlNode) return;
                if(EMISSIVE_ANIM_MATERIALS.has((mat.name || '').toLowerCase())
                    || animatedEmissiveMaterials.has((mat.name || '').toLowerCase())){
                    return;
                }
                const path = getEmissiveNodePath(controlNode, settingsControllerBridge.model || controlNode);
                const meshPath = getEmissiveNodePath(node, settingsControllerBridge.model || node);
                const nodeNameLower = (node.name || '').toLowerCase();
                const controlNameLower = (controlNode.name || '').toLowerCase();
                const isEmissiveAnimated = emissiveAnimatedNodes.has(nodeNameLower)
                    || emissiveAnimatedNodes.has(controlNameLower)
                    || EMISSIVE_ANIM_NAME_MARKERS.some((marker) => nodeNameLower.includes(marker))
                    || EMISSIVE_ANIM_NAME_MARKERS.some((marker) => controlNameLower.includes(marker));
                if(isEmissiveAnimated){
                    return;
                }
                if(emissiveControlState.exclusions.has(path)){
                    mat.emissiveIntensity = 0;
                    mat.needsUpdate = true;
                    return;
                }
                const scale = emissiveControlState.scales.get(path);
                const maxEmissive = Number.isFinite(mat?.userData?.maxEmissiveIntensity)
                    ? mat.userData.maxEmissiveIntensity
                    : ((Number.isFinite(mat.emissiveIntensity) && mat.emissiveIntensity > 0) ? mat.emissiveIntensity : 1);
                if(isControlScreenPath(path)
                    || isControlScreenPath(meshPath)
                    || isControlScreenPath(node?.name)
                    || isSpeakerPlatePath(path)
                    || isSpeakerPlatePath(meshPath)
                    || isSpeakerPlatePath(node?.name)){
                    return;
                }
                const contrastLocked = mat?.userData?.contrastLocked === true || isButtonTextPath(path) || isButtonTextPath(meshPath);
                let contrastApplied = 1;
                if(!contrastLocked){
                    contrastApplied = 1;
                }
                const scaleApplied = Number.isFinite(scale) ? scale : 1;
                mat.emissiveIntensity = maxEmissive * v * contrastApplied * scaleApplied;
                mat.needsUpdate = true;
            });
            updateSyncPercentLabel();
        };

        const applySceneLightingValue = (value) => {
            applyLuxValue(value);
            applyEmissiveValue(value);
        };

        function applyLuxControls(){
            if(!settingsControllerBridge.luxControlEnabled) return;
            applyLuxValue(getLuxValue());
        }

        function applyEmissionControls(){
            if(!settingsControllerBridge.emissionControlEnabled) return;
            applyEmissiveValue(getEmiValue());
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
            if(!knobDragState || knobDragState.type !== 'contrast'){
                applyContrastLockPose();
            }
            updateLightingDebugLine('sceneLightingChanged', knobDragState?.type || '-');
        });

        const FORCE_CAMERA_UNLOCKED = true;
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
            controls.enabled = !!isEnabled;
            controls.enableRotate = !!isEnabled;
            controls.enableZoom = !!isEnabled;
            controls.enablePan = false;
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE
            };
            controls.update();
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
            controls.enabled = !!isEnabled;
            controls.enableZoom = !!isEnabled;
            controls.enableRotate = false;
            controls.enablePan = false;
            controls.mouseButtons = {
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.ROTATE
            };
            controls.update();
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
            camAnimDebugEl.className = 'cam-anim-debug-panel';
            document.body.appendChild(camAnimDebugEl);
        }
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
        const ACCESSIBILITY_FRAME = UI_START_FRAME;
        const AUDIO_FRAME = 45;
        const RETURN_FRAME = UI_END_FRAME;
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
        const interactiveNames = new Set(['btn-accessibility', 'btn-vol-sync', 'btn-save']);
        const glbBounds = new THREE.Box3();
        const glbCenter = new THREE.Vector3();
        const KNOB_VOL_RANGE = 0.56;
        const KNOB_SYNC_RANGE = 0.56;
        const KNOB_CONTRAST_RANGE = 0.56;
        const CAMERA_ANIM_FRAMES = 120;
        // Multiplier for manual camera tween length. 1 = original speed.
        const CAMERA_ANIM_SPEED_MULTIPLIER = 5;
        let shouldTrackControls = false;
        let lastControlsEnabled = null;
        const FORCE_MANUAL_CAMERA = true;
        const USE_CUSTOM_CAMERA_ANIM = false;
        const animTuning = {
            customDurationMs: 5000,
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
            const currentTarget = controls?.target ? controls.target.clone() : camPos.clone().add(camDir.multiplyScalar(2.5));
            const targetDistance = camPos.distanceTo(currentTarget);
            cameraTween = {
                frame: 0,
                targetDistance: Number.isFinite(targetDistance) && targetDistance > 0.001 ? targetDistance : 2.5
            };
            lastCameraFrame = 0;
            logCamEvent(`manual tween start camPos=${camPos.x.toFixed(3)},${camPos.y.toFixed(3)},${camPos.z.toFixed(3)}`);
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
                const animQuat = q0.slerp(q1, s);
                let finalQuat = animQuat;
                if(settingsControllerBridge.model){
                    const blendWindow = 0.12;
                    const blendStart = 1 - blendWindow;
                    const blendRaw = (t - blendStart) / blendWindow;
                    const blend = Math.min(1, Math.max(0, blendRaw));
                    if(blend > 0){
                        const box = new THREE.Box3().setFromObject(settingsControllerBridge.model);
                        const center = box.getCenter(new THREE.Vector3());
                        const lookQuat = computeLookAtQuaternion(activeCamera.position, center, activeCamera.up);
                        const eased = 1 - Math.pow(1 - blend, 3);
                        finalQuat = animQuat.slerp(lookQuat, eased);
                    }
                }
                activeCamera.quaternion.copy(finalQuat);
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
                activeCamera.position.copy(endPos);
                activeCamera.quaternion.copy(endQuat);
                activeCamera.updateMatrixWorld(true);
                cameraTween = null;
                lastCameraFrame = total - 1;
                shouldTrackControls = true;
                usesGltfCamera = false;
                if(pendingAudioAllowed !== null){
                    applyAudioPermission(pendingAudioAllowed);
                    pendingAudioAllowed = null;
                }
                cameraTween = null;
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
            manualEmissiveDirection = dir;
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

        function setAccessibilityView(options = {}){
            const { triggerEmissive = true } = options;
            activeSettingsView = 'accessibility';
            if(isAtUiStart()) return false;
            let started = false;
            if(isAtUiEnd()){
                startAnimationToFrame(UI_START_FRAME, null, { triggerEmissive });
                started = true;
            }
            if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
                settingsControllerBridge.updateKnobTransformsFromState();
            }
            updateSyncPercentLabel();
            return started;
        }

        function reverseVolSyncAnimation(){
            if(!uiAction || !clip) return;
            if(isAtUiEnd()){
                startAnimationToFrame(UI_START_FRAME, null);
                return;
            }
            if(isAtUiStart()) return;
            startAnimationToFrame(UI_START_FRAME, null);
        }

        function setAudioView(options = {}){
            const { triggerEmissive = true } = options;
            activeSettingsView = 'audio';
            if(isAtUiEnd()) return false;
            let started = false;
            if(isAtUiStart()){
                startAnimationToFrame(UI_END_FRAME, null, { triggerEmissive });
                started = true;
            }
            if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
                settingsControllerBridge.updateKnobTransformsFromState();
            }
            updateSyncPercentLabel();
            return started;
        }

        function toggleVolSyncAnimation(){
            if(!uiAction || !clip) return;
            if(isAtUiStart()){
                startAnimationToFrame(UI_END_FRAME, null);
                return;
            }
            if(isAtUiEnd()){
                startAnimationToFrame(UI_START_FRAME, null);
                return;
            }
            startAnimationToFrame(UI_END_FRAME, null);
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

            // Dark green test (to verify material tinting).
            ctx.fillStyle = '#021b02';
            ctx.fillRect(0, 0, size, height);

            ctx.strokeStyle = 'rgba(140, 216, 255, 0.65)';
            ctx.lineWidth = 1;
            const cols = 20;
            const rows = 12;
            const cellWidth = size / cols;
            const cellHeight = height / rows;
            const cornerX = cellWidth / 16;
            const cornerY = cellHeight / 16;
            for(let r = 0; r < rows; r++){
                const y0 = r * cellHeight;
                const y1 = y0 + cellHeight;
                for(let c = 0; c < cols; c++){
                    const x0 = c * cellWidth;
                    const x1 = x0 + cellWidth;
                    ctx.beginPath();
                    // Top-left corner
                    ctx.moveTo(x0, y0 + cornerY);
                    ctx.lineTo(x0, y0);
                    ctx.lineTo(x0 + cornerX, y0);
                    // Top-right corner
                    ctx.moveTo(x1 - cornerX, y0);
                    ctx.lineTo(x1, y0);
                    ctx.lineTo(x1, y0 + cornerY);
                    // Bottom-left corner
                    ctx.moveTo(x0, y1 - cornerY);
                    ctx.lineTo(x0, y1);
                    ctx.lineTo(x0 + cornerX, y1);
                    // Bottom-right corner
                    ctx.moveTo(x1 - cornerX, y1);
                    ctx.lineTo(x1, y1);
                    ctx.lineTo(x1, y1 - cornerY);
                    ctx.stroke();
                }
            }

            ctx.fillStyle = 'rgba(216, 196, 255, 0.28)';
            ctx.font = '14px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            for(let r = 0; r < rows; r++){
                for(let c = 0; c < cols; c++){
                    const label = `${String.fromCharCode(65 + c)}${r + 1}`;
                    const x = ((c / cols) * size) + 8;
                    const y = ((r / rows) * height) + 6;
                    ctx.fillText(label, x, y);
                }
            }

            const infoWidth = size * 0.86;
            const infoHeight = height * 0.74;
            const infoX = (size - infoWidth) * 0.5;
            const infoY = height * 0.12;
            // Keep info background transparent so grid labels remain visible.
            ctx.fillStyle = '#e5cafc';
            ctx.font = '34px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Hello, person', size * 0.5, infoY + infoHeight * 0.18);

            ctx.fillStyle = '#e5cafc';
            ctx.font = '26px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif';
            ctx.fillText('Allow audio for this site?', size * 0.5, infoY + infoHeight * 0.34);

            const allowX = allowAudioRect.x * size;
            const allowY = allowAudioRect.y * height;
            const allowW = allowAudioRect.w * size;
            const allowH = allowAudioRect.h * height;
            const muteX = muteAudioRect.x * size;
            const muteY = muteAudioRect.y * height;
            const muteW = muteAudioRect.w * size;
            const muteH = muteAudioRect.h * height;
            const shadowOffset = 3;
            ctx.fillStyle = 'rgba(170, 170, 180, 0.58)';
            ctx.fillRect(allowX + shadowOffset, allowY + shadowOffset, allowW, allowH);
            ctx.fillStyle = '#8cd8ff';
            ctx.fillRect(allowX, allowY, allowW, allowH);
            ctx.fillStyle = '#0b1440';
            ctx.font = '24px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif';
            ctx.fillText('OK', allowX + allowW / 2, allowY + allowH / 2);
            ctx.fillStyle = 'rgba(170, 170, 180, 0.58)';
            ctx.fillRect(muteX + shadowOffset, muteY + shadowOffset, muteW, muteH);
            ctx.fillStyle = '#f5b7d9';
            ctx.fillRect(muteX, muteY, muteW, muteH);
            ctx.fillStyle = '#3c1f54';
            ctx.font = '18px "Press Start 2P", "Segoe UI", Roboto, Arial, sans-serif';
            ctx.fillText('LEAVE SITE', muteX + muteW / 2, muteY + muteH / 2 - 14);
            ctx.fillText('MUTED', muteX + muteW / 2, muteY + muteH / 2 + 14);

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
            if(updateCustomCameraAnimation()){
                renderSceneWithAxes();
                requestAnimationFrame(animate);
                return;
            }
            if(updateFocusAnimation()){
                renderSceneWithAxes();
                requestAnimationFrame(animate);
                return;
            }
            if(controls && controls.enabled){
                controls.update();
            }
            const delta = clock.getDelta();
            if(uiMixer && uiAction){
                if(!uiAction.paused){
                    uiMixer.update(delta);
                }
                if(targetTime !== null && !uiAction.paused){
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
            if(manualEmissiveTargets.length && uiAction && clip){
                const startT = frameToTime(UI_START_FRAME);
                const endT = frameToTime(UI_END_FRAME);
                const span = Math.max(1e-6, endT - startT);
                const raw = (uiAction.time - startT) / span;
                const progress = Math.max(0, Math.min(1, raw));
                const forward = manualEmissiveDirection >= 0;
                const t = forward ? progress : (1 - progress);
                manualEmissiveTargets.forEach((entry) => {
                    const base = entry.base;
                    const value = entry.mode === 'on'
                        ? base * (1 - t)
                        : base * t;
                    entry.material.emissiveIntensity = value;
                    entry.material.needsUpdate = true;
                });
            }
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
            if(debugCameraPanel){
                ensureLightingDebugLine();
                updateContrastKnobTrackerLine();
            }
            renderSceneWithAxes();
            requestAnimationFrame(animate);
        }

        function renderSceneWithAxes(){
            if(lastWidth < 2 || lastHeight < 2) return;
            renderer.setViewport(0, 0, lastWidth, lastHeight);
            renderer.setScissor(0, 0, lastWidth, lastHeight);
            renderer.render(scene, activeCamera);
            if(settingsControllerBridge.model){
                settingsControllerBridge.model.getWorldQuaternion(axesRoot.quaternion);
            }
            const axisSize = Math.max(70, Math.round(Math.min(lastWidth, lastHeight) * 0.18));
            const axisPadding = Math.round(Math.max(10, axisSize * 0.15));
            const axisX = axisPadding;
            const axisY = Math.max(axisPadding, lastHeight - axisSize - axisPadding);
            renderer.setViewport(axisX, axisY, axisSize, axisSize);
            renderer.setScissor(axisX, axisY, axisSize, axisSize);
            renderer.clearDepth();
            renderer.render(axesScene, axesCamera);
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
            manualEmissiveTargets = [];
            const normalizeBaseName = (label) => {
                if(!label) return '';
                return String(label)
                    .toLowerCase()
                    .replace(/([._-])\d+$/,'')
                    .trim();
            };
            const classifyEmissiveMode = (label) => {
                if(!label) return null;
                const n = String(label).toLowerCase();
                const isGlow = n.includes('glow');
                const isTxt = n.includes('txt');
                const isBtn = n.includes('btn');
                const isOn = n.includes('-on') || n.endsWith('on') || n.includes('_on');
                const isOff = n.includes('-off') || n.endsWith('off') || n.includes('_off');
                if((isGlow || isTxt || isBtn) && isOn) return 'on';
                if((isGlow || isTxt || isBtn) && isOff) return 'off';
                return null;
            };
            if(lightingTargets?.emissiveTargets){
                lightingTargets.emissiveTargets.forEach((target) => {
                    const mat = target.material;
                    const node = target.node;
                    const controlNode = target.controlNode;
                    if(!mat) return;
                    const matName = mat.name || '';
                    const mode = classifyEmissiveMode(matName)
                        || classifyEmissiveMode(node?.name)
                        || classifyEmissiveMode(controlNode?.name);
                    if(mode){
                        const baseName = normalizeBaseName(matName || node?.name || controlNode?.name || '');
                        const base = Number.isFinite(mat?.userData?.maxEmissiveIntensity)
                            ? mat.userData.maxEmissiveIntensity
                            : ((Number.isFinite(mat.emissiveIntensity) && mat.emissiveIntensity > 0) ? mat.emissiveIntensity : 1);
                        manualEmissiveTargets.push({
                            material: mat,
                            mode,
                            base,
                            baseName
                        });
                    }
                });
            }
            if(!loggedManualEmissives){
                console.group('[Manual Emissive Targets]');
                console.log(manualEmissiveTargets.map((entry) => ({
                    material: entry.material?.name || '(unnamed)',
                    mode: entry.mode,
                    base: entry.base
                })));
                console.groupEnd();
                loggedManualEmissives = true;
            }
            if(lightingTargets?.emissiveTargets && emissiveList){
                buildEmissiveList(model, lightingTargets.emissiveTargets);
                syncEmiToEmissiveSliderRanges(getContrastValue());
                applyEmissionControls();
                if(emissiveListPanel) emissiveListPanel.hidden = false;
            }
            let percentSyncNode = null;
            model.traverse((child) => {
                if(percentSyncNode || !child || !child.isObject3D) return;
                const name = (child.name || '').toLowerCase();
                if(name === 'txt-percent-sync' || name.includes('txt-percent-sync')){
                    // Bind only to the text target, never to the parent/frame.
                    if(child.isMesh){
                        percentSyncNode = child;
                    }else{
                        let meshDesc = null;
                        child.traverse((desc) => {
                            if(meshDesc || !desc?.isMesh) return;
                            meshDesc = desc;
                        });
                        percentSyncNode = meshDesc || child;
                    }
                }
            });
            if(percentSyncNode){
                initSyncPercentLabel(percentSyncNode);
            }

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
                clips.forEach((clipItem) => {
                    if(!clipItem || !clipItem.tracks?.length) return;
                    clipItem.tracks.forEach((track) => {
                        const name = typeof track.name === 'string' ? track.name.toLowerCase() : '';
                        if(name.includes('emissive') || name.includes('emission') || name.includes('glow') || name.includes('materials/')){
                            emissiveTracks.push(track);
                        }
                    });
                    if(!cameraNode){
                        uiClips.push(clipItem);
                        return;
                    }
                    const uiTracks = clipItem.tracks.filter((track) => {
                        const name = typeof track.name === 'string' ? track.name : '';
                        const nodeName = name.split('.')[0].trim().toLowerCase();
                        const isContrastKnobTrack = nodeName.includes('knob') && nodeName.includes('contrast');
                        return !name.startsWith(`${cameraNode.name}.`) && !isContrastKnobTrack;
                    });
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
                uiAction = uiMixer.clipAction(uiClip);
                uiAction.clampWhenFinished = true;
                uiAction.setLoop(THREE.LoopOnce, 1);
                uiAction.play();
                setFrame(ACCESSIBILITY_FRAME);
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
            let knobContrastNode = null;
            const knobContrastNodes = [];
            const pushUniqueNode = (list, node) => {
                if(!node) return;
                if(!list.includes(node)) list.push(node);
            };
            model.traverse((child) => {
                if(!child || !child.isObject3D) return;
                const name = (child.name || '').toLowerCase();
                if(!knobVolNode && (name.includes('knob-vol') || name.includes('knob_vol') || name.includes('knobvol'))){
                    knobVolNode = child;
                }
                if(!knobSyncNode && (name.includes('knob-sync') || name.includes('knob_sync') || name.includes('knobsync'))){
                    knobSyncNode = child;
                }
                if(name.includes('knob-contrast') || name.includes('knob_contrast') || name.includes('knobcontrast')){
                    if(!knobContrastNode){
                        knobContrastNode = child;
                    }
                    pushUniqueNode(knobContrastNodes, child);
                }
            });
            const gasketByType = { vol: null, sync: null, contrast: null };
            const detectorByType = { vol: null, sync: null, contrast: null };
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
                    if(type === 'contrast' && (name.includes('-contrast') || name.includes('_contrast') || name.includes('contrast'))){
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
                    if(type === 'contrast' && (name.includes('-contrast') || name.includes('_contrast') || name.includes('contrast'))){
                        found = child;
                    }
                });
                detectorByType[type] = found;
                return found;
            };
            const findClosestKnobToType = (type) => {
                const gasket = findGasketForType(type) || findDetectorForType(type);
                if(!gasket) return null;
                const target = new THREE.Box3().setFromObject(gasket).getCenter(new THREE.Vector3());
                let best = null;
                let bestDistSq = Infinity;
                model.traverse((child) => {
                    if(!child || !child.isObject3D) return;
                    const name = (child.name || '').toLowerCase();
                    if(!name.includes('knob')) return;
                    if(name.includes('gasket') || name.includes('detector') || name.includes('hitbox')) return;
                    const center = new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3());
                    const distSq = center.distanceToSquared(target);
                    if(!Number.isFinite(distSq)) return;
                    if(distSq < bestDistSq){
                        bestDistSq = distSq;
                        best = child;
                    }
                });
                return best;
            };
            // Some GLB revisions use generic knob names, so include the physically nearest knob.
            const inferredContrastKnob = findClosestKnobToType('contrast');
            if(inferredContrastKnob){
                pushUniqueNode(knobContrastNodes, inferredContrastKnob);
                if(!knobContrastNode) knobContrastNode = inferredContrastKnob;
            }
            settingsControllerBridge.knobVolNode = knobVolNode;
            settingsControllerBridge.knobSyncNode = knobSyncNode;
            settingsControllerBridge.knobContrastNode = knobContrastNode;
            settingsControllerBridge.knobContrastNodes = knobContrastNodes;
            settingsControllerBridge.knobDefaults = {
                vol: knobVolNode ? knobVolNode.position.clone() : null,
                sync: knobSyncNode ? knobSyncNode.position.clone() : null,
                contrast: knobContrastNode ? knobContrastNode.position.clone() : null
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
            const getAxisFromGasket = (gasketNode, knobNode) => {
                if(!gasketNode || !knobNode || !knobNode.parent) return null;
                const gasketBox = new THREE.Box3().setFromObject(gasketNode);
                const localCorners = cornersFromBox(gasketBox).map((corner) => knobNode.parent.worldToLocal(corner.clone()));
                const ranges = {
                    x: Math.max(...localCorners.map((p) => p.x)) - Math.min(...localCorners.map((p) => p.x)),
                    y: Math.max(...localCorners.map((p) => p.y)) - Math.min(...localCorners.map((p) => p.y)),
                    z: Math.max(...localCorners.map((p) => p.z)) - Math.min(...localCorners.map((p) => p.z))
                };
                const axis = Object.entries(ranges).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
                return axis;
            };
            const buildConstraint = (type, knobNode, fallbackRange) => {
                if(!knobNode || !knobNode.parent) return null;
                let axis = type === 'vol' ? 'x' : 'z';
                if(type === 'contrast'){
                    axis = getAxisFromGasket(findGasketForType('contrast'), knobNode) || 'x';
                }
                const gasket = findGasketForType(type);
                if(!gasket){
                    const base = knobNode.position[axis];
                    return { axis, min: base - fallbackRange * 0.5, max: base + fallbackRange * 0.5 };
                }
                const gasketBox = new THREE.Box3().setFromObject(gasket);
                const localVals = cornersFromBox(gasketBox).map((corner) => {
                    const local = knobNode.parent.worldToLocal(corner.clone());
                    return local[axis];
                });
                let min = Math.min(...localVals);
                let max = Math.max(...localVals);
                if(!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-4){
                    const base = knobNode.position[axis];
                    min = base - fallbackRange * 0.5;
                    max = base + fallbackRange * 0.5;
                }
                return { axis, min, max };
            };
            const contrastConstraints = new Map();
            knobContrastNodes.forEach((node) => {
                const constraint = buildConstraint('contrast', node, KNOB_CONTRAST_RANGE);
                if(constraint) contrastConstraints.set(node.uuid, constraint);
            });
            settingsControllerBridge.knobConstraints = {
                vol: buildConstraint('vol', knobVolNode, KNOB_VOL_RANGE),
                sync: buildConstraint('sync', knobSyncNode, KNOB_SYNC_RANGE),
                contrast: buildConstraint('contrast', knobContrastNode, KNOB_CONTRAST_RANGE),
                contrastAll: contrastConstraints
            };
            const addGasketHitbox = (type, gasketNode) => {
                if(!gasketNode || !gasketNode.parent) return null;
                const box = new THREE.Box3().setFromObject(gasketNode);
                const centerWorld = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const modelCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
                let offset = new THREE.Vector3(0, 0, 0);
                if(type === 'contrast'){
                    const outward = centerWorld.clone().sub(modelCenter).normalize();
                    offset = Number.isFinite(outward.lengthSq()) && outward.lengthSq() > 0
                        ? outward.multiplyScalar(0.05)
                        : new THREE.Vector3(0, 0.05, 0);
                }
                const hitSize = new THREE.Vector3(
                    Math.max(0.06, size.x * 1.45),
                    Math.max(0.06, size.y * 1.8),
                    Math.max(0.06, size.z * 1.45)
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
                sync: addGasketHitbox('sync', findDetectorForType('sync') || findGasketForType('sync')),
                contrast: addGasketHitbox('contrast', findDetectorForType('contrast') || findGasketForType('contrast'))
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
                // Force horizontal flip only (UVs already rotated in the asset).
                flipTextureX(screenTexture);
                screenTextureTargets.forEach((child) => {
                    const material = child.material;
                    if(Array.isArray(material)){
                        material.forEach((mat) => {
                            if(mat && 'map' in mat){
                                mat.map = screenTexture;
                                if('color' in mat && mat.color){
                                    mat.color.set(0xffffff);
                                }
                                mat.needsUpdate = true;
                            }
                        });
                    }else if(material && 'map' in material){
                        material.map = screenTexture;
                        if('color' in material && material.color){
                            material.color.set(0xffffff);
                        }
                        material.needsUpdate = true;
                    }
                    applied = true;
                });
            if(!applied){
                console.warn('control-screen mesh not found for grid overlay');
            }
        }

        function findKnobType(node){
            let current = node;
            while(current){
                if(current.userData && (current.userData.knobType === 'vol' || current.userData.knobType === 'sync' || current.userData.knobType === 'contrast')){
                    return current.userData.knobType;
                }
                if(current === settingsControllerBridge.knobContrastNode) return 'contrast';
                if(current === settingsControllerBridge.knobSyncNode) return 'sync';
                if(current === settingsControllerBridge.knobVolNode) return 'vol';
                if((settingsControllerBridge.knobContrastNodes || []).includes(current)) return 'contrast';
                const name = (current.name || '').toLowerCase();
                const isKnobOrGasket = name.includes('knob') || name.includes('gasket') || name.includes('detector');
                if(isKnobOrGasket && (name.includes('-contrast') || name.includes('_contrast') || name.includes('knobcontrast') || name.includes('contrast'))){
                    return 'contrast';
                }
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
            if(settingsControllerBridge.knobContrastNodes?.length && constraints.contrastAll){
                settingsControllerBridge.knobContrastNodes.forEach((node) => {
                    const c = constraints.contrastAll.get(node.uuid);
                    addCandidate('contrast', node, c);
                });
            }else{
                addCandidate('contrast', settingsControllerBridge.knobContrastNode, constraints.contrast);
            }
            if(!candidates.length) return fallbackType;
            candidates.sort((a, b) => a.d - b.d);
            const best = candidates[0];
            return best.d <= 90 ? best.type : fallbackType;
        }

        function applyKnobStateFromT(type, t){
            const clamped = Math.max(0, Math.min(1, t));
            if(type === 'vol'){
                if(activeSettingsView === 'accessibility'){
                    settingsControllerBridge.knobAxisValues.vol = clamped;
                    applyOverlayFromSource(1 - clamped, 'knob-drag');
                    updateKnobTransformsFromState();
                    updateLightingDebugLine('knob-drag', 'vol');
                    return;
                }
                settingsControllerBridge.knobAxisValues.vol = clamped;
                setVolumeFromPercent(Math.round(clamped * 100));
                updateKnobTransformsFromState();
                updateLightingDebugLine('knob-drag', 'vol');
                return;
            }
            if(type === 'sync'){
                if(activeSettingsView === 'accessibility'){
                    settingsControllerBridge.knobAxisValues.sync = clamped;
                    if(settingsControllerBridge.luxControlEnabled){
                        applyLuxFromSource(clamped, 'knob-drag');
                    }
                    updateKnobTransformsFromState();
                    updateLightingDebugLine('knob-drag', 'sync');
                    return;
                }
                settingsControllerBridge.knobAxisValues.sync = clamped;
                const nextSync = Math.round(-3000 + (clamped * 6000));
                applySyncValue(nextSync);
                if(syncSlider) syncSlider.value = String(storedSync);
                if(modalSync) modalSync.value = String(storedSync);
                updateKnobTransformsFromState();
                updateLightingDebugLine('knob-drag', 'sync');
                return;
            }
            if(type === 'contrast'){
                settingsControllerBridge.knobAxisValues.contrast = clamped;
                if(settingsControllerBridge.emissionControlEnabled){
                    applyEmiFromSource(mapContrastKnobToValue(clamped), 'knob-drag');
                }
                updateKnobTransformsFromState();
                storeContrastLockPose();
                updateLightingDebugLine('knob-drag', 'contrast');
                return;
            }
        }

        function updateKnobTransformsFromState(){
            const volNode = settingsControllerBridge.knobVolNode;
            const syncNode = settingsControllerBridge.knobSyncNode;
            const contrastNode = settingsControllerBridge.knobContrastNode;
            const contrastNodes = settingsControllerBridge.knobContrastNodes || [];
            const defaults = settingsControllerBridge.knobDefaults;
            const constraints = settingsControllerBridge.knobConstraints;
            if(!defaults) return;
            if(volNode && defaults.vol && constraints?.vol){
                const volNorm = Math.max(0, Math.min(1, storedVolume));
                const volRange = constraints.vol.max - constraints.vol.min;
                volNode.position.x = constraints.vol.min + (volNorm * volRange);
                settingsControllerBridge.knobAxisValues.vol = volNorm;
            }
            if(syncNode && defaults.sync && constraints?.sync){
                const syncNorm = activeSettingsView === 'accessibility'
                    ? (settingsControllerBridge.luxControlEnabled
                        ? Math.max(0, Math.min(1, getLuxValue()))
                        : (Number.isFinite(settingsControllerBridge.knobAxisValues?.sync)
                            ? settingsControllerBridge.knobAxisValues.sync
                            : 0.5))
                    : Math.max(0, Math.min(1, (storedSync + 3000) / 6000));
                const syncRange = constraints.sync.max - constraints.sync.min;
                syncNode.position.z = constraints.sync.min + (syncNorm * syncRange);
                settingsControllerBridge.knobAxisValues.sync = syncNorm;
            }
            if(volNode && defaults.vol && constraints?.vol && activeSettingsView === 'accessibility'){
                const volNorm = 1 - getBackgroundBrightness();
                const volRange = constraints.vol.max - constraints.vol.min;
                volNode.position.x = constraints.vol.min + (volNorm * volRange);
                settingsControllerBridge.knobAxisValues.vol = volNorm;
            }
            if(contrastNode && defaults.contrast && constraints?.contrast){
                const contrastNorm = Math.max(0, Math.min(1, mapContrastValueToKnob(getContrastValue())));
                const info = getSemanticConstraintLR(
                    contrastNode,
                    constraints.contrast,
                    settingsControllerCanvas?.getBoundingClientRect(),
                    settingsControllerBridge.camera || activeCamera,
                    'contrast'
                );
                if(info){
                    const contrastRange = info.rightValue - info.leftValue;
                    contrastNode.position[constraints.contrast.axis] = info.leftValue + (contrastNorm * contrastRange);
                }else{
                    const contrastRange = constraints.contrast.max - constraints.contrast.min;
                    contrastNode.position[constraints.contrast.axis] = constraints.contrast.min + (contrastNorm * contrastRange);
                }
                settingsControllerBridge.knobAxisValues.contrast = contrastNorm;
            }
            if(contrastNodes.length && constraints?.contrastAll){
                const contrastNorm = Math.max(0, Math.min(1, mapContrastValueToKnob(getContrastValue())));
                contrastNodes.forEach((node) => {
                    const constraint = constraints.contrastAll.get(node.uuid);
                    if(!constraint) return;
                    const info = getSemanticConstraintLR(
                        node,
                        constraint,
                        settingsControllerCanvas?.getBoundingClientRect(),
                        settingsControllerBridge.camera || activeCamera,
                        'contrastAll'
                    );
                    if(info){
                        const contrastRange = info.rightValue - info.leftValue;
                        node.position[constraint.axis] = info.leftValue + (contrastNorm * contrastRange);
                    }else{
                        const contrastRange = constraint.max - constraint.min;
                        node.position[constraint.axis] = constraint.min + (contrastNorm * contrastRange);
                    }
                });
                settingsControllerBridge.knobAxisValues.contrast = contrastNorm;
            }
        }

        function handlePointerDown(event){
            if(event.button !== 0 && event.button !== 1) return;
            const rect = settingsControllerCanvas.getBoundingClientRect();
            if(rect.width === 0 || rect.height === 0) return;
            pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, activeCamera);
            const hits = raycaster.intersectObjects(model.children, true);
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
            if(introActive){
                if(event.button !== 0) return;
                const hit = firstHit;
                const findOkNode = (node) => {
                    let current = node;
                    while(current){
                        const name = (current.name || '').toLowerCase();
                        if(name.includes('ok')) return true;
                        current = current.parent;
                    }
                    return false;
                };
                let allowHit = false;
                let muteHit = false;
                if(hit.uv && screenTexture && screenTexture.repeat){
                    let u = hit.uv.x * screenTexture.repeat.x + screenTexture.offset.x;
                    let v = hit.uv.y * screenTexture.repeat.y + screenTexture.offset.y;
                    u = ((u % 1) + 1) % 1;
                    v = ((v % 1) + 1) % 1;
                    const withinAllow = u >= allowAudioRect.x && u <= allowAudioRect.x + allowAudioRect.w
                        && v >= allowAudioRect.y && v <= allowAudioRect.y + allowAudioRect.h;
                    const withinMute = u >= muteAudioRect.x && u <= muteAudioRect.x + muteAudioRect.w
                        && v >= muteAudioRect.y && v <= muteAudioRect.y + muteAudioRect.h;
                    allowHit = withinAllow || findOkNode(hit.object);
                    muteHit = withinMute;
                    if((allowHit || muteHit) && cameraAction && !FORCE_MANUAL_CAMERA){
                        introActive = false;
                        setPreIntroZoomEnabled(false);
                        pendingAudioAllowed = allowHit;
                        if(allowHit){
                            playWelcomeJingle(true);
                        }
                        if(USE_CUSTOM_CAMERA_ANIM){
                            startCustomCameraAnimation(model);
                        }else{
                            setUserCameraControlsEnabled(false);
                            cameraAction.enabled = true;
                            cameraAction.reset();
                            cameraAction.paused = false;
                            cameraTargetTime = getCameraHoldTime(cameraAction.getClip());
                            cameraAction.play();
                        }
                        return;
                    }
                }
                if(introActive && (allowHit || muteHit)){
                    introActive = false;
                    setPreIntroZoomEnabled(false);
                    pendingAudioAllowed = allowHit;
                    if(allowHit){
                        playWelcomeJingle(true);
                    }
                    if(USE_CUSTOM_CAMERA_ANIM){
                        startCustomCameraAnimation(model);
                    }else{
                        startManualCameraTween();
                    }
                }
                return;
            }
            if(event.button === 0 && controls){
                const knobType = resolveKnobTypeFromPointer(event.clientX, event.clientY, firstHit.object);
                if(knobType){
                    updateLightingDebugLine('pointerdown', knobType);
                }
                if(knobType && settingsControllerBridge.knobDefaults){
                    let knobNode = knobType === 'vol'
                        ? settingsControllerBridge.knobVolNode
                        : knobType === 'sync'
                            ? settingsControllerBridge.knobSyncNode
                            : settingsControllerBridge.knobContrastNode;
                    if(knobType === 'contrast'){
                        let current = firstHit.object;
                        const allContrast = settingsControllerBridge.knobContrastNodes || [];
                        while(current){
                            if(allContrast.includes(current)){
                                knobNode = current;
                                break;
                            }
                            current = current.parent;
                        }
                    }
                    const constraint = knobType === 'contrast'
                        ? (settingsControllerBridge.knobConstraints?.contrastAll?.get(knobNode?.uuid)
                            || settingsControllerBridge.knobConstraints?.contrast)
                        : settingsControllerBridge.knobConstraints?.[knobType];
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
                    const screenInfo = knobType === 'contrast'
                        ? getSemanticConstraintLR(
                            knobNode,
                            constraint,
                            canvasRect,
                            settingsControllerBridge.camera || activeCamera,
                            'contrastAll'
                        )
                        : null;
                    const pMin = screenInfo ? makeScreenPoint(screenInfo.leftValue) : makeScreenPoint(constraint.min);
                    const pMax = screenInfo ? makeScreenPoint(screenInfo.rightValue) : makeScreenPoint(constraint.max);
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
                        lastRawT: getKnobTFromClient({ pMin, pMax }, event.clientX, event.clientY)
                    };
                    controls.enabled = false;
                    return;
                }
            }
                let target = firstHit.object;
                while(target && !interactiveNames.has(target.name)){
                    target = target.parent;
                }
                if(!target) return;
                if(target.name === 'btn-accessibility'){
                    reverseVolSyncAnimation();
                }else if(target.name === 'btn-vol-sync' || target.name === 'btn-save'){
                    toggleVolSyncAnimation();
                }
        }

        function handlePointerMove(event){
            if(!knobDragState) return;
            const dx = event.clientX - knobDragState.startX;
            const dy = event.clientY - knobDragState.startY;
            const moved = Math.hypot(dx, dy);
            if(!knobDragState.isDragging){
                if(moved < 10) return;
                knobDragState.isDragging = true;
            }
            const rawT = getKnobTFromClient(knobDragState, event.clientX, event.clientY);
            const t = knobDragState.pointerInvert ? (1 - rawT) : rawT;
            knobDragState.lastRawT = rawT;
            applyKnobStateFromT(knobDragState.type, t);
        }

        function handlePointerUp(event){
            if(event.button === 0 && knobDragState){
                if(!knobDragState.isDragging){
                    const rawT = getKnobTFromClient(knobDragState, event.clientX, event.clientY);
                    const t = knobDragState.pointerInvert ? (1 - rawT) : rawT;
                    applyKnobStateFromT(knobDragState.type, t);
                }
                knobDragState = null;
                if(controls){
                    controls.enabled = true;
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

            settingsControllerCanvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
            settingsControllerCanvas.addEventListener('pointerup', handlePointerUp);
            settingsControllerCanvas.addEventListener('pointercancel', handlePointerUp);
            settingsControllerCanvas.addEventListener('pointermove', handlePointerMove);
            settingsControllerCanvas.addEventListener('contextmenu', (event) => {
                event.preventDefault();
            });
            document.addEventListener('keydown', (event)=>{
                if(event.repeat) return;
                if(event.target && /input|textarea|select/i.test(event.target.tagName)) return;
                const key = event.key.toLowerCase();
                if(key === 'a'){
                    const started = setAccessibilityView({ triggerEmissive: false });
                    if(started){
                        playEmissionActions(-1);
                    }
                }else if(key === 'v'){
                    const started = setAudioView({ triggerEmissive: false });
                    if(started){
                        playEmissionActions(1);
                    }
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
            if(!contrastLockPose){
                storeContrastLockPose();
            }
            forceLuxAndContrastRight();
            updateKnobSidesLine();
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
    let welcomeJingle = null;
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
            permModal.classList.add('hidden');
            permModal.style.display = 'none';
        }
    }

    function applyAudioPermission(allowed){
        localStorage.setItem(AUDIO_ALLOWED_KEY, allowed ? 'true' : 'false');
        if(allowed){
            localStorage.setItem(AUDIO_MUTED_KEY, 'false');
            storedMuted = false;
            if(!Number.isFinite(storedVolume)){
                storedVolume = 0.25;
            }
            localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
            ensureAudioRouting();
            applyVolumeAndMuted();
            if(audioCtx){
                audioCtx.resume().catch(()=>{});
            }
        }else{
            localStorage.setItem(AUDIO_MUTED_KEY, 'true');
            storedMuted = true;
            applyVolumeAndMuted();
        }
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
    }

    permAllow.addEventListener('click', async ()=>{
        applyAudioPermission(true);
    });
    permDeny.addEventListener('click', ()=>{
        applyAudioPermission(false);
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
        if(typeof settingsControllerBridge.updateKnobTransformsFromState === 'function'){
            settingsControllerBridge.updateKnobTransformsFromState();
        }
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
            window.location.href = '_1-about/about.html';
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
        actions['Reset camera anim'] = () => resetCustomCameraAnimation();
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

    document.addEventListener('DOMContentLoaded', ()=>{
        initSettingsControllerScene();
        bindAnimTuningControls();
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
