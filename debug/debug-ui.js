import { disableDebug, DEBUG_VISIBILITY_EVENT } from './debug-loader.js';

const HOOK_CATEGORIES = ['actions', 'flags', 'metrics'];
const EXTERNAL_CONTROL_TABS = [
  { id: 'controls-overview', label: 'Available Controls', slotId: null },
  { id: 'emissiveListPanel', label: 'Emissive Control', slotId: 'emissiveListPanel' },
  { id: 'startPageControls', label: 'Start Page Controls', slotId: 'startPageControls' },
  { id: 'instrumentLevelPanel', label: 'Instrument Levels', slotId: 'instrumentLevelPanel' },
  { id: 'uvModeControls', label: 'UV / Lighting Modes', slotId: 'uvModeControls' },
];

const emitVisibilityEvent = (show) => {
  window.dispatchEvent(new CustomEvent(DEBUG_VISIBILITY_EVENT, { detail: { show } }));
};

let panel = null;
let collapsed = false;
let hidden = false;
let rafId = null;
let lastFrameTs = performance.now();
let toggleBtnEl = null;
let visibilityBtnEl = null;
let colorFlipBtnEl = null;
let textShadowBtnEl = null;
let colorFlipped = false;
let textShadowEnabled = true;
let audioCtx = null;
let hasShownOnce = false;

const tabState = {
  left: 'summary',
  right: 'controls-overview',
};

const panelRefs = {
  tabs: {
    left: new Map(),
    right: new Map(),
  },
  panes: {
    left: new Map(),
    right: new Map(),
  },
  externalStatus: null,
};

const hookStore = {
  actions: {},
  flags: {},
  metrics: {},
};

function createStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #debug-panel.debug-panel {
      --dbg-shell: rgba(100, 53, 66, 0.95);
      --dbg-shell-2: rgba(77, 39, 50, 0.97);
      --dbg-pane: rgba(118, 64, 79, 0.94);
      --dbg-pane-2: rgba(93, 48, 61, 0.97);
      --dbg-text: #d9eeff;
      --dbg-subtle: rgba(217, 238, 255, 0.82);
      --dbg-accent: #9bd0ff;
      --dbg-accent-soft: #c7e5ff;
      --dbg-accent-ink: #eaf6ff;
      --dbg-edge-light: rgba(255, 216, 226, 0.26);
      --dbg-edge-dark: rgba(37, 17, 24, 0.62);
      --dbg-edge-strong: rgba(173, 111, 130, 0.75);
      --dbg-shadow: 0 18px 44px rgba(29, 7, 13, 0.42);
      --dbg-button-top: rgba(255, 224, 233, 0.22);
      --dbg-button-bottom: rgba(162, 93, 112, 0.34);
      --dbg-button-top-hover: rgba(255, 235, 242, 0.28);
      --dbg-button-bottom-hover: rgba(177, 103, 124, 0.42);
      --dbg-notice-bg: rgba(255, 236, 204, 0.72);
      --dbg-notice-border: rgba(255, 205, 135, 0.38);
      --dbg-notice-text: #ffe6b6;
      --dbg-pill-bg: rgba(255, 224, 233, 0.14);
      --dbg-pill-border: rgba(255, 220, 230, 0.22);
      --dbg-pill-ready-bg: rgba(147, 237, 210, 0.15);
      --dbg-pill-ready-border: rgba(147, 237, 210, 0.28);
      --dbg-pill-ready-text: #b9ffe9;
      --dbg-text-shadow-color: rgba(86, 209, 255, 0.34);
      --dbg-text-shadow-deep: rgba(28, 8, 15, 0.75);
      position: fixed;
      top: calc(var(--header-height, 72px) + 8px);
      bottom: 8px;
      left: 8px;
      right: 8px;
      width: auto;
      max-width: none;
      background: transparent;
      color: var(--dbg-text);
      border: 0;
      border-radius: 0;
      box-shadow: none;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 12px;
      line-height: 1.35;
      z-index: 10000;
      transition: opacity 0.18s ease;
      overflow: hidden;
      backdrop-filter: none;
      display: flex;
      flex-direction: column;
      pointer-events: none;
    }
    #debug-panel.debug-panel[data-color-flip="1"] {
      --dbg-shell: rgba(40, 61, 89, 0.95);
      --dbg-shell-2: rgba(27, 41, 64, 0.97);
      --dbg-pane: rgba(54, 79, 113, 0.94);
      --dbg-pane-2: rgba(38, 58, 87, 0.97);
      --dbg-text: #ffd8e4;
      --dbg-subtle: rgba(255, 216, 228, 0.84);
      --dbg-accent: #ffabc1;
      --dbg-accent-soft: #ffd6e3;
      --dbg-accent-ink: #ffe6ee;
      --dbg-edge-light: rgba(205, 230, 255, 0.22);
      --dbg-edge-dark: rgba(12, 22, 37, 0.65);
      --dbg-edge-strong: rgba(117, 152, 201, 0.75);
      --dbg-shadow: 0 18px 44px rgba(6, 14, 29, 0.46);
      --dbg-button-top: rgba(215, 234, 255, 0.22);
      --dbg-button-bottom: rgba(79, 114, 163, 0.34);
      --dbg-button-top-hover: rgba(228, 242, 255, 0.28);
      --dbg-button-bottom-hover: rgba(94, 130, 182, 0.42);
      --dbg-notice-bg: rgba(255, 229, 238, 0.18);
      --dbg-notice-border: rgba(255, 188, 210, 0.34);
      --dbg-notice-text: #ffe0ea;
      --dbg-pill-bg: rgba(215, 234, 255, 0.14);
      --dbg-pill-border: rgba(205, 230, 255, 0.24);
      --dbg-pill-ready-bg: rgba(141, 224, 255, 0.15);
      --dbg-pill-ready-border: rgba(141, 224, 255, 0.28);
      --dbg-pill-ready-text: #d4f7ff;
      --dbg-text-shadow-color: rgba(255, 152, 190, 0.32);
      --dbg-text-shadow-deep: rgba(8, 17, 32, 0.78);
    }
    html.a11y-contrast-high #debug-panel.debug-panel {
      --dbg-subtle: rgba(235, 245, 255, 0.94);
      --dbg-shadow: 0 20px 52px rgba(0, 0, 0, 0.54);
    }
    #debug-panel.debug-panel.collapsed {
      opacity: 0.28;
    }
    #debug-panel.debug-panel.is-hidden {
      opacity: 1;
    }
    #debug-panel.debug-panel.is-hidden .debug-panel__column--left {
      transform: translateX(calc(-100% - 20px));
    }
    #debug-panel.debug-panel.is-hidden .debug-panel__column--right {
      transform: translateX(calc(100% + 20px));
    }
    #debug-panel.debug-panel.is-hidden .debug-panel__footer {
      transform: translate(-50%, calc(100% + 10px));
      opacity: 0;
    }
    #debug-panel.debug-panel.is-bouncing .debug-panel__column--left {
      animation: debugSlideBounceLeft 460ms cubic-bezier(.2, .95, .25, 1.25);
    }
    #debug-panel.debug-panel.is-bouncing .debug-panel__column--right {
      animation: debugSlideBounceRight 460ms cubic-bezier(.2, .95, .25, 1.25);
    }
    @keyframes debugSlideBounceLeft {
      0% { transform: translateX(calc(-100% - 20px)); }
      72% { transform: translateX(10px); }
      100% { transform: translateX(0); }
    }
    @keyframes debugSlideBounceRight {
      0% { transform: translateX(calc(100% + 20px)); }
      72% { transform: translateX(-10px); }
      100% { transform: translateX(0); }
    }
    #debug-panel.debug-panel button {
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      color: inherit;
      padding: 5px 9px;
      background: linear-gradient(180deg, var(--dbg-button-top), var(--dbg-button-bottom));
      border: 1px solid var(--dbg-edge-dark);
      border-top-color: var(--dbg-edge-light);
      border-left-color: var(--dbg-edge-light);
      border-radius: 8px;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.45);
    }
    #debug-panel.debug-panel button:hover {
      border-color: var(--dbg-edge-strong);
      background: linear-gradient(180deg, var(--dbg-button-top-hover), var(--dbg-button-bottom-hover));
    }
    #debug-panel.debug-panel button:active {
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.18);
      transform: translateY(1px);
    }
    #debug-panel.debug-panel button:focus-visible {
      outline: 2px solid var(--dbg-accent);
      outline-offset: 1px;
    }
    .debug-panel__header,
    .debug-panel__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 12px;
      background: linear-gradient(180deg, rgba(255,255,255,0.34), rgba(255,255,255,0.08));
      border-bottom: 1px solid rgba(255,255,255,0.2);
      box-shadow: inset 0 -1px 0 rgba(60,72,90,0.14);
      pointer-events: auto;
    }
    .debug-panel__header {
      display: none;
    }
    .debug-panel__footer {
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      border: 1px solid var(--dbg-edge-dark);
      border-top-color: rgba(255,255,255,0.28);
      border-radius: 10px;
      box-shadow: var(--dbg-shadow);
      align-items: flex-start;
      flex-wrap: wrap;
      background: linear-gradient(180deg, var(--dbg-shell), var(--dbg-shell-2));
      transition: transform 280ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease;
    }
    .debug-panel__header-title strong {
      display: block;
      font-size: 12px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__header-title,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__column-header,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__card-title,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__footer-note,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__notice,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__info,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__metrics,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__hooks,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__hooks-summary,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__control-status,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__empty,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__tab,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__header button,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__footer button,
    #debug-panel.debug-panel.debug-panel--text-shadow .debug-panel__actions button {
      text-shadow:
        0 1px 0 var(--dbg-text-shadow-deep),
        0 0 6px var(--dbg-text-shadow-color);
    }
    .debug-panel__page-name {
      color: var(--dbg-subtle);
      font-size: 11px;
      max-width: 42ch;
      overflow-wrap: anywhere;
    }
    .debug-panel__body {
      padding: 0;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .debug-panel__layout {
      display: flex;
      justify-content: space-between;
      align-items: stretch;
      gap: 16px;
      height: 100%;
      min-height: 0;
      pointer-events: none;
    }
    .debug-panel__column {
      width: clamp(300px, 24vw, 390px);
      max-width: calc(50vw - 24px);
      min-width: 0;
      border: 1px solid rgba(255,255,255,0.28);
      border-radius: 10px;
      background: linear-gradient(180deg, var(--dbg-shell), var(--dbg-shell-2));
      box-shadow: var(--dbg-shadow), inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(54,66,84,0.08);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
      height: 100%;
      pointer-events: auto;
      overflow: hidden;
      transition: transform 320ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease;
      transform: translateX(0);
    }
    .debug-panel__column--left { margin-right: auto; }
    .debug-panel__column--right { margin-left: auto; }
    .debug-panel__column-header {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--dbg-subtle);
      padding: 0 2px;
    }
    .debug-panel__tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: stretch;
    }
    .debug-panel__tabs--left .debug-panel__tab {
      flex-basis: 140px;
    }
    .debug-panel__tabs--right .debug-panel__tab {
      flex-basis: 150px;
    }
    .debug-panel__tab {
      flex: 1 1 118px;
      min-height: 34px;
      text-align: left;
      white-space: normal;
      line-height: 1.15;
      overflow-wrap: anywhere;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }
    .debug-panel__tab.is-active {
      background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(210,221,235,0.96));
      border-color: var(--dbg-accent);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5);
    }
    .debug-panel__tab[hidden] {
      display: none !important;
    }
    .debug-panel__pane {
      display: none;
      min-width: 0;
      min-height: 0;
    }
    .debug-panel__pane.is-active {
      display: block;
      height: 100%;
    }
    .debug-panel__panes {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .debug-panel__stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      height: 100%;
    }
    .debug-panel__stack--single {
      height: 100%;
    }
    .debug-panel__stack--single > .debug-panel__card {
      height: 100%;
    }
    .debug-panel__card {
      background: linear-gradient(180deg, var(--dbg-pane), var(--dbg-pane-2));
      border: 1px solid var(--dbg-edge-dark);
      border-top-color: var(--dbg-edge-light);
      border-left-color: var(--dbg-edge-light);
      border-radius: 8px;
      padding: 8px;
      min-width: 0;
      height: 100%;
      overflow: auto;
    }
    .debug-panel__card--summary {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .debug-panel__card-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
      margin-bottom: 6px;
      color: var(--dbg-subtle);
      text-transform: uppercase;
    }
    .debug-panel__info,
    .debug-panel__metrics,
    .debug-panel__hooks,
    .debug-panel__actions,
    .debug-panel__external-slot,
    .debug-panel__control-status {
      min-width: 0;
    }
    .debug-panel__metrics {
      margin-top: 2px;
    }
    .debug-panel__info-row,
    .debug-panel__metric-line,
    .debug-panel__hook-item,
    .debug-panel__status-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: baseline;
      padding: 2px 0;
    }
    .debug-panel__info-row strong,
    .debug-panel__hook-item span:first-child,
    .debug-panel__status-row span:first-child {
      overflow-wrap: anywhere;
    }
    .debug-panel__metric-line {
      grid-template-columns: minmax(0, 1fr);
      font-size: 11px;
      color: var(--dbg-subtle);
    }
    .debug-panel__metric-line strong {
      color: var(--dbg-text);
      margin-left: 6px;
    }
    .debug-panel__hooks-summary {
      margin-top: 6px;
      font-size: 11px;
      color: var(--dbg-subtle);
    }
    .debug-panel__hook-item span:last-child {
      font-family: Consolas, 'Courier New', monospace;
      font-size: 11px;
      color: var(--dbg-subtle);
      max-width: 26ch;
      text-align: right;
      overflow-wrap: anywhere;
    }
    .debug-panel__hooks-section + .debug-panel__hooks-section {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed rgba(70,82,100,0.2);
    }
    .debug-panel__section-heading {
      font-weight: 700;
      font-size: 11px;
      margin-bottom: 4px;
      color: var(--dbg-subtle);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .debug-panel__actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .debug-panel__actions button {
      min-height: 32px;
      text-align: left;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .debug-panel__empty {
      font-size: 11px;
      color: var(--dbg-subtle);
      font-style: italic;
      padding: 2px 0;
    }
    .debug-panel__notice {
      margin-top: 2px;
      padding: 6px 8px;
      border-radius: 7px;
      border: 1px solid var(--dbg-notice-border);
      background: var(--dbg-notice-bg);
      color: var(--dbg-notice-text);
      font-weight: 700;
      letter-spacing: 0.01em;
    }
    html.a11y-contrast-high #debug-panel .debug-panel__notice {
      border-color: rgba(255, 241, 246, 0.34);
      background: rgba(255, 245, 249, 0.16);
      color: #fff0f6;
    }
    .debug-panel__footer-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .debug-panel__footer-note {
      font-size: 11px;
      color: var(--dbg-subtle);
      margin-left: auto;
    }
    .debug-panel__control-status .debug-panel__status-row + .debug-panel__status-row {
      border-top: 1px solid rgba(70,82,100,0.12);
      margin-top: 4px;
      padding-top: 5px;
    }
    .debug-panel__status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 62px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid var(--dbg-pill-border);
      background: var(--dbg-pill-bg);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .debug-panel__status-pill.is-ready {
      border-color: var(--dbg-pill-ready-border);
      background: var(--dbg-pill-ready-bg);
      color: var(--dbg-pill-ready-text);
    }
    .debug-panel__external-slot {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .debug-panel__external-slot > * {
      max-width: 100%;
      box-sizing: border-box;
    }
    #debug-panel .debug-panel__external-slot .instrument-level-panel,
    #debug-panel .debug-panel__external-slot .uv-mode-controls,
    #debug-panel .debug-panel__external-slot #startPageControls,
    #debug-panel .debug-panel__external-slot #emissiveListPanel {
      width: 100%;
      margin: 0;
      border-radius: 8px;
    }
    #emissiveListPanel:not(.debug-panel__external),
    #startPageControls:not(.debug-panel__external),
    #instrumentLevelPanel:not(.debug-panel__external),
    #uvModeControls:not(.debug-panel__external) {
      display: none !important;
    }
    #debug-panel .debug-panel__external-slot .uv-mode-controls {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
    @media (max-width: 980px) {
      #debug-panel.debug-panel {
        left: 9px;
        right: 9px;
        bottom: 9px;
      }
      .debug-panel__layout {
        flex-direction: column;
        gap: 10px;
      }
      .debug-panel__column {
        width: 100%;
        max-width: none;
        height: min(44vh, 420px);
      }
    }
    @media (max-width: 560px) {
      #debug-panel.debug-panel {
        top: calc(var(--header-height, 72px) + 18px);
        bottom: 6px;
        right: 6px;
        left: 6px;
        width: calc(100vw - 12px);
      }
      .debug-panel__tabs,
      .debug-panel__actions {
        grid-template-columns: 1fr;
      }
      .debug-panel__header,
      .debug-panel__footer {
        padding: 8px 10px;
      }
      .debug-panel__body {
        overflow: auto;
      }
      .debug-panel__layout {
        height: auto;
      }
      .debug-panel__column {
        height: min(48vh, 420px);
      }
      .debug-panel__footer-note {
        margin-left: 0;
        width: 100%;
      }
    }
  `;
  return style;
}

function cachePanelRefs() {
  if (!panel) return;

  panelRefs.tabs.left = new Map();
  panelRefs.tabs.right = new Map();
  panelRefs.panes.left = new Map();
  panelRefs.panes.right = new Map();

  panel.querySelectorAll('.debug-panel__tab[data-tab-group][data-tab-target]').forEach((btn) => {
    const group = btn.getAttribute('data-tab-group');
    const target = btn.getAttribute('data-tab-target');
    if (!group || !target || !panelRefs.tabs[group]) return;
    panelRefs.tabs[group].set(target, btn);
  });

  panel.querySelectorAll('.debug-panel__pane[data-pane-group][data-pane-id]').forEach((paneEl) => {
    const group = paneEl.getAttribute('data-pane-group');
    const paneId = paneEl.getAttribute('data-pane-id');
    if (!group || !paneId || !panelRefs.panes[group]) return;
    panelRefs.panes[group].set(paneId, paneEl);
  });

  panelRefs.externalStatus = panel.querySelector('.debug-panel__control-status');
}

function setActiveTab(group, paneId) {
  if (!panelRefs.tabs[group] || !panelRefs.panes[group]) return;
  const nextButton = panelRefs.tabs[group].get(paneId);
  if (!nextButton || nextButton.hidden) return;

  tabState[group] = paneId;

  panelRefs.tabs[group].forEach((btn, id) => {
    const active = id === paneId;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.setAttribute('tabindex', active ? '0' : '-1');
  });

  panelRefs.panes[group].forEach((paneEl, id) => {
    const active = id === paneId;
    paneEl.classList.toggle('is-active', active);
    paneEl.hidden = !active;
  });
}

function ensureVisibleActiveTab(group) {
  const tabs = panelRefs.tabs[group];
  if (!tabs || !tabs.size) return;
  const activeId = tabState[group];
  const activeBtn = tabs.get(activeId);
  if (activeBtn && !activeBtn.hidden) {
    setActiveTab(group, activeId);
    return;
  }
  const firstVisibleEntry = Array.from(tabs.entries()).find(([, btn]) => !btn.hidden);
  if (firstVisibleEntry) {
    setActiveTab(group, firstVisibleEntry[0]);
  }
}

function initTabs() {
  if (!panel) return;
  panel.querySelectorAll('.debug-panel__tab[data-tab-group][data-tab-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-tab-group');
      const target = btn.getAttribute('data-tab-target');
      if (!group || !target) return;
      setActiveTab(group, target);
    });
  });

  ensureVisibleActiveTab('left');
  ensureVisibleActiveTab('right');
}

function formatHookValue(value) {
  if (typeof value === 'function') return '[function]';
  if (value == null) return String(value);
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 80 ? `${json.slice(0, 77)}...` : json;
    } catch {
      return '[object]';
    }
  }
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function renderHookSection(container, category, entries) {
  const keys = Object.keys(entries);
  if (!keys.length) return false;

  const section = document.createElement('div');
  section.className = 'debug-panel__hooks-section';

  const title = document.createElement('div');
  title.className = 'debug-panel__section-heading';
  title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
  section.appendChild(title);

  keys.forEach((key) => {
    const item = document.createElement('div');
    item.className = 'debug-panel__hook-item';

    const label = document.createElement('span');
    label.textContent = key;

    const value = document.createElement('span');
    value.textContent = formatHookValue(entries[key]);

    item.appendChild(label);
    item.appendChild(value);
    section.appendChild(item);
  });

  container.appendChild(section);
  return true;
}

function updateLeftTabAvailability() {
  if (!panel) return;

  const actionsKeys = Object.keys(hookStore.actions || {}).filter(
    (key) => typeof hookStore.actions[key] === 'function'
  );
  const hooksCount = Object.keys(hookStore.flags || {}).length + Object.keys(hookStore.metrics || {}).length;

  const actionsTab = panelRefs.tabs.left.get('actions');
  const hooksTab = panelRefs.tabs.left.get('hooks');

  if (actionsTab) {
    actionsTab.hidden = actionsKeys.length === 0;
  }
  if (hooksTab) {
    hooksTab.hidden = hooksCount === 0;
  }

  ensureVisibleActiveTab('left');
}

function updateRightTabAvailability() {
  if (!panel) return;
  let availableCount = 0;

  EXTERNAL_CONTROL_TABS.forEach((tabDef) => {
    if (!tabDef.slotId) return;
    const btn = panelRefs.tabs.right.get(tabDef.id);
    const slot = panel.querySelector(`[data-external-slot="${tabDef.slotId}"]`);
    const present = !!slot && slot.childElementCount > 0;
    if (btn) {
      btn.hidden = !present;
    }
    if (present) availableCount += 1;
  });

  const overviewButton = panelRefs.tabs.right.get('controls-overview');
  if (overviewButton) {
    overviewButton.hidden = availableCount > 0 ? false : false;
  }

  ensureVisibleActiveTab('right');
}

function renderControlStatus() {
  if (!panelRefs.externalStatus) return;
  panelRefs.externalStatus.innerHTML = '';

  EXTERNAL_CONTROL_TABS.forEach((tabDef) => {
    if (!tabDef.slotId) return;
    const row = document.createElement('div');
    row.className = 'debug-panel__status-row';

    const label = document.createElement('span');
    label.textContent = tabDef.label;

    const pill = document.createElement('span');
    pill.className = 'debug-panel__status-pill';

    const slot = panel.querySelector(`[data-external-slot="${tabDef.slotId}"]`);
    const present = !!slot && slot.childElementCount > 0;

    if (present) {
      pill.textContent = 'Ready';
      pill.classList.add('is-ready');
    } else {
      pill.textContent = 'None';
    }

    row.appendChild(label);
    row.appendChild(pill);
    panelRefs.externalStatus.appendChild(row);
  });
}

function renderHooks() {
  if (!panel) return;

  const hooksContainer = panel.querySelector('.debug-panel__hooks');
  const actionsContainer = panel.querySelector('.debug-panel__actions');
  const hooksSummaryEl = panel.querySelector('.debug-panel__hooks-summary');

  if (!hooksContainer || !actionsContainer) return;

  hooksContainer.innerHTML = '';
  actionsContainer.innerHTML = '';

  let hasHookRows = false;
  hasHookRows = renderHookSection(hooksContainer, 'flags', hookStore.flags || {}) || hasHookRows;
  hasHookRows = renderHookSection(hooksContainer, 'metrics', hookStore.metrics || {}) || hasHookRows;

  if (!hasHookRows) {
    const empty = document.createElement('div');
    empty.className = 'debug-panel__empty';
    empty.textContent = 'No flags or metrics registered yet.';
    hooksContainer.appendChild(empty);
  }

  const actionEntries = hookStore.actions || {};
  const actionKeys = Object.keys(actionEntries).filter((key) => typeof actionEntries[key] === 'function');

  if (!actionKeys.length) {
    const empty = document.createElement('div');
    empty.className = 'debug-panel__empty';
    empty.textContent = 'No callable debug actions registered yet.';
    actionsContainer.appendChild(empty);
  } else {
    actionKeys.forEach((key) => {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.textContent = key;
      actionBtn.addEventListener('click', () => {
        try {
          actionEntries[key]();
        } catch (err) {
          console.warn('Debug action failed', key, err);
        }
      });
      actionsContainer.appendChild(actionBtn);
    });
  }

  if (hooksSummaryEl) {
    const flagsCount = Object.keys(hookStore.flags || {}).length;
    const metricsCount = Object.keys(hookStore.metrics || {}).length;
    hooksSummaryEl.textContent = `Hooks: ${flagsCount} flags, ${metricsCount} metrics, ${actionKeys.length} actions`;
  }

  updateLeftTabAvailability();
}

const attachExternalSection = (selectorId) => {
  if (!panel) return;
  const slot = panel.querySelector(`[data-external-slot="${selectorId}"]`);
  const section = document.getElementById(selectorId);
  if (!slot || !section || slot.contains(section)) return;

  section.classList.add('debug-panel__external');
  section.hidden = false;
  section.removeAttribute('hidden');
  section.style.removeProperty('display');
  slot.appendChild(section);

  updateRightTabAvailability();
  renderControlStatus();
};

const attachExternalSections = () => {
  ['emissiveListPanel', 'startPageControls', 'instrumentLevelPanel', 'uvModeControls'].forEach((id) => attachExternalSection(id));
  updateRightTabAvailability();
  renderControlStatus();
};

function startMetrics(displayEl) {
  if (!displayEl) return;
  const step = (timestamp) => {
    const delta = timestamp - lastFrameTs;
    lastFrameTs = timestamp;
    const fps = delta ? Math.round(1000 / delta) : 0;
    displayEl.textContent = `FPS ${fps} (${delta.toFixed(1)}ms frame)`;
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function stopMetrics() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function updateToggleButtonsText() {
  if (!toggleBtnEl || !visibilityBtnEl) return;
  toggleBtnEl.textContent = collapsed ? 'Show' : 'Hide';
  visibilityBtnEl.textContent = collapsed ? 'Expand' : 'Collapse';
}

function toggleCollapseState() {
  if (!panel) return;
  collapsed = !collapsed;
  panel.classList.toggle('collapsed', collapsed);
  updateToggleButtonsText();
}

function hidePanel() {
  if (!panel || hidden) return;
  panel.classList.add('is-hidden');
  hidden = true;
}

function showPanel() {
  if (!panel || !hidden) return;
  panel.classList.remove('is-hidden');
  hidden = false;
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    panel.classList.remove('is-bouncing');
    requestAnimationFrame(() => {
      if (!panel || hidden) return;
      panel.classList.add('is-bouncing');
      window.setTimeout(() => panel?.classList.remove('is-bouncing'), 520);
    });
  }
  if (hasShownOnce) {
    playSpringBoing();
  }
  hasShownOnce = true;
}

function togglePanelHidden() {
  if (hidden) {
    showPanel();
  } else {
    hidePanel();
  }
}

function playSpringBoing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1900, now);

    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(118, now + 0.17);
    osc2.frequency.setValueAtTime(680, now);
    osc2.frequency.exponentialRampToValueAtTime(180, now + 0.14);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(lowpass);
    lowpass.connect(audioCtx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.24);
    osc2.stop(now + 0.2);
  } catch {
    // Audio is optional; ignore failures.
  }
}

function playShortcutChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(176, now + 0.18);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  } catch {
    // Audio is optional; ignore failures.
  }
}

function buildPanelMarkup() {
  return `
    <div class="debug-panel__header">
      <div class="debug-panel__header-title">
        <strong>Debug Console</strong>
        <div class="debug-panel__page-name"></div>
      </div>
      <button class="debug-panel__toggle" type="button">Hide</button>
    </div>
    <div class="debug-panel__body">
      <div class="debug-panel__layout">
        <section class="debug-panel__column debug-panel__column--left" aria-label="Diagnostics tabs">
          <div class="debug-panel__column-header">Diagnostics</div>
          <div class="debug-panel__tabs debug-panel__tabs--left" role="tablist" aria-label="Diagnostics tabs">
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="left" data-tab-target="summary">Summary & Info</button>
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="left" data-tab-target="hooks">Flags & Metrics</button>
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="left" data-tab-target="actions">Actions</button>
          </div>
          <div class="debug-panel__panes">
            <section class="debug-panel__pane" data-pane-group="left" data-pane-id="summary">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card debug-panel__card--summary">
                  <div>
                    <div class="debug-panel__card-title">Session</div>
                    <div class="debug-panel__info"></div>
                  </div>
                  <div>
                    <div class="debug-panel__card-title">Live Performance</div>
                    <div class="debug-panel__metrics"></div>
                    <div class="debug-panel__hooks-summary"></div>
                  </div>
                  <div class="debug-panel__notice">Reminder: check copyright info is correct.</div>
                </div>
              </div>
            </section>
            <section class="debug-panel__pane" data-pane-group="left" data-pane-id="hooks">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">Registered Debug Values</div>
                  <div class="debug-panel__hooks"></div>
                </div>
              </div>
            </section>
            <section class="debug-panel__pane" data-pane-group="left" data-pane-id="actions">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">Callable Debug Actions</div>
                  <div class="debug-panel__actions"></div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section class="debug-panel__column debug-panel__column--right" aria-label="Control tabs">
          <div class="debug-panel__column-header">Controls</div>
          <div class="debug-panel__tabs debug-panel__tabs--right" role="tablist" aria-label="Control tabs">
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="right" data-tab-target="controls-overview">Available Controls</button>
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="right" data-tab-target="emissiveListPanel">Emissive Control</button>
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="right" data-tab-target="startPageControls">Start Page Controls</button>
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="right" data-tab-target="instrumentLevelPanel">Instrument Levels</button>
            <button class="debug-panel__tab" type="button" role="tab" data-tab-group="right" data-tab-target="uvModeControls">UV / Lighting Modes</button>
          </div>
          <div class="debug-panel__panes">
            <section class="debug-panel__pane" data-pane-group="right" data-pane-id="controls-overview">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">Page-Scoped Control Panels</div>
                  <div class="debug-panel__control-status"></div>
                </div>
              </div>
            </section>
            <section class="debug-panel__pane" data-pane-group="right" data-pane-id="emissiveListPanel">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">Emissive Control</div>
                  <div class="debug-panel__external-slot" data-external-slot="emissiveListPanel"></div>
                </div>
              </div>
            </section>
            <section class="debug-panel__pane" data-pane-group="right" data-pane-id="startPageControls">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">Start Page Controls</div>
                  <div class="debug-panel__external-slot" data-external-slot="startPageControls"></div>
                </div>
              </div>
            </section>
            <section class="debug-panel__pane" data-pane-group="right" data-pane-id="instrumentLevelPanel">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">Instrument Levels</div>
                  <div class="debug-panel__external-slot" data-external-slot="instrumentLevelPanel"></div>
                </div>
              </div>
            </section>
            <section class="debug-panel__pane" data-pane-group="right" data-pane-id="uvModeControls">
              <div class="debug-panel__stack debug-panel__stack--single">
                <div class="debug-panel__card">
                  <div class="debug-panel__card-title">UV / Lighting Modes</div>
                  <div class="debug-panel__external-slot" data-external-slot="uvModeControls"></div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
    <div class="debug-panel__footer">
      <div class="debug-panel__footer-actions">
        <button class="debug-panel__disable" type="button">Disable Debug Mode</button>
        <button class="debug-panel__visibility" type="button">Collapse</button>
        <button class="debug-panel__color-flip" type="button">Use Lapis BG</button>
        <button class="debug-panel__text-shadow-toggle" type="button">Text Glow On</button>
      </div>
      <div class="debug-panel__footer-note">Ctrl+Shift+Alt+D toggles panels; side tabs hide only</div>
    </div>
  `;
}

function setupPanel(pageName) {
  if (panel) return;

  panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.className = 'debug-panel';
  panel.innerHTML = buildPanelMarkup();

  document.head.appendChild(createStyles());
  document.body.appendChild(panel);
  panel.classList.add('is-hidden');
  hidden = true;
  cachePanelRefs();
  initTabs();

  const infoEl = panel.querySelector('.debug-panel__info');
  const pageEl = panel.querySelector('.debug-panel__page-name');
  const metricsEl = panel.querySelector('.debug-panel__metrics');
  toggleBtnEl = panel.querySelector('.debug-panel__toggle');
  visibilityBtnEl = panel.querySelector('.debug-panel__visibility');
  colorFlipBtnEl = panel.querySelector('.debug-panel__color-flip');
  textShadowBtnEl = panel.querySelector('.debug-panel__text-shadow-toggle');
  const disableBtn = panel.querySelector('.debug-panel__disable');

  if (pageEl) pageEl.textContent = pageName;
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="debug-panel__info-row"><strong>Page</strong><span>${pageName}</span></div>
      <div class="debug-panel__info-row"><strong>URL</strong><span>${window.location.href}</span></div>
      <div class="debug-panel__info-row"><strong>User Agent</strong><span>${navigator.userAgent}</span></div>
    `;
  }
  if (metricsEl) {
    metricsEl.innerHTML = '<div class="debug-panel__metric-line"><strong class="debug-panel__fps">Starting...</strong></div>';
  }

  attachExternalSections();
  renderHooks();
  startMetrics(panel.querySelector('.debug-panel__fps'));
  updateToggleButtonsText();
  applyVisualPrefs();
  showPanel();
  emitVisibilityEvent(true);

  if (toggleBtnEl) toggleBtnEl.hidden = true;
  if (visibilityBtnEl) visibilityBtnEl.hidden = true;
  colorFlipBtnEl?.addEventListener('click', () => {
    colorFlipped = !colorFlipped;
    applyVisualPrefs();
  });
  textShadowBtnEl?.addEventListener('click', () => {
    textShadowEnabled = !textShadowEnabled;
    applyVisualPrefs();
  });
  disableBtn?.addEventListener('click', () => {
    stopMetrics();
    disableDebug();
    window.location.reload();
  });

  const handleKeydown = (event) => {
    if (!(event.ctrlKey && event.shiftKey && event.altKey)) return;
    const isD = event.code === 'KeyD' || String(event.key || '').toLowerCase() === 'd';
    if (isD) {
      event.preventDefault();
      try {
        if (typeof window.toggleOverlayBlendForDebugShortcut === 'function') {
          window.toggleOverlayBlendForDebugShortcut();
        } else {
          playShortcutChime();
        }
      } catch {
        playShortcutChime();
      }
      togglePanelHidden();
      return;
    }
    if (event.code === 'Digit0') {
      event.preventDefault();
      emitVisibilityEvent(false);
    }
  };

  window.addEventListener('keydown', handleKeydown, true);
}

function applyVisualPrefs() {
  if (!panel) return;
  panel.setAttribute('data-color-flip', colorFlipped ? '1' : '0');
  panel.classList.toggle('debug-panel--text-shadow', textShadowEnabled);
  if (colorFlipBtnEl) {
    colorFlipBtnEl.textContent = colorFlipped ? 'Use Rose BG' : 'Use Lapis BG';
  }
  if (textShadowBtnEl) {
    textShadowBtnEl.textContent = textShadowEnabled ? 'Text Glow On' : 'Text Glow Off';
  }
}

export function initDebugUI(options = {}) {
  if (panel) {
    return;
  }
  const pageName = options.pageName || document.title || window.location.pathname;
  setupPanel(pageName);
  window.dispatchEvent(new CustomEvent('debug-ui-ready', { detail: { pageName } }));
}

export function registerDebugHooks(payload = {}) {
  HOOK_CATEGORIES.forEach((category) => {
    if (payload[category] && typeof payload[category] === 'object') {
      hookStore[category] = {
        ...hookStore[category],
        ...payload[category],
      };
    }
  });
  renderHooks();
}

window.DEBUG_HOOKS = hookStore;
window.registerDebugHooks = registerDebugHooks;

const handleDebugPanelVisibility = (event) => {
  if (!event?.detail) return;
  if (event.detail.show) {
    showPanel();
  } else {
    hidePanel();
  }
};

window.addEventListener(DEBUG_VISIBILITY_EVENT, handleDebugPanelVisibility);
