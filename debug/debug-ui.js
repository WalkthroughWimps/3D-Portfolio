import { disableDebug } from './debug-loader.js';
const HOOK_CATEGORIES = ['actions', 'flags', 'metrics'];

let panel = null;
let collapsed = false;
let hidden = false;
let rafId = null;
let lastFrameTs = performance.now();
let toggleBtnEl = null;
let visibilityBtnEl = null;

const hookStore = {
  actions: {},
  flags: {},
  metrics: {},
};

function createStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #debug-panel.debug-panel {
      position: fixed;
      top: 16px;
      right: 16px;
      width: 320px;
      background: rgba(8, 8, 12, 0.95);
      color: #e0f7ff;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65);
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      z-index: 10000;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    #debug-panel.debug-panel.collapsed {
      transform: translateX(calc(100% - 32px));
      opacity: 0.7;
    }
    #debug-panel.debug-panel button {
      font-size: 11px;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
      color: inherit;
      padding: 4px 8px;
      cursor: pointer;
    }
    .debug-panel__header,
    .debug-panel__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .debug-panel__body {
      padding: 8px 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .debug-panel__info div,
    .debug-panel__hooks div,
    .debug-panel__metrics div {
      margin-bottom: 4px;
    }
    .debug-panel__hooks-section {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 6px;
    }
    .debug-panel__hook-item {
      display: flex;
      justify-content: space-between;
    }
    .debug-panel__actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .debug-panel__actions button {
      text-align: left;
    }
    .debug-panel__metrics {
      font-size: 11px;
      opacity: 0.85;
    }
  `;
  return style;
}

function renderHooks() {
  if (!panel) return;
  const hooksContainer = panel.querySelector('.debug-panel__hooks');
  const actionsContainer = panel.querySelector('.debug-panel__actions');
  hooksContainer.innerHTML = '';
  actionsContainer.innerHTML = '';

  HOOK_CATEGORIES.forEach((category) => {
    const entries = hookStore[category] || {};
    const keys = Object.keys(entries);
    if (!keys.length) {
      return;
    }
    const section = document.createElement('div');
    section.className = 'debug-panel__hooks-section';
    const title = document.createElement('div');
    title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    title.style.fontWeight = '700';
    title.style.fontSize = '11px';
    section.appendChild(title);
    keys.forEach((key) => {
      const item = document.createElement('div');
      item.className = 'debug-panel__hook-item';
      const label = document.createElement('span');
      label.textContent = key;
      const value = document.createElement('span');
      value.textContent = String(entries[key]);
      item.appendChild(label);
      item.appendChild(value);
      section.appendChild(item);

      if (category === 'actions' && typeof entries[key] === 'function') {
        const actionBtn = document.createElement('button');
        actionBtn.textContent = key;
        actionBtn.addEventListener('click', () => {
          try {
            entries[key]();
          } catch (err) {
            console.warn('Debug action failed', key, err);
          }
        });
        actionsContainer.appendChild(actionBtn);
      }
    });
    hooksContainer.appendChild(section);
  });
}

function startMetrics(displayEl) {
  if (!displayEl) return;
  const step = (timestamp) => {
    const delta = timestamp - lastFrameTs;
    lastFrameTs = timestamp;
    const fps = delta ? Math.round(1000 / delta) : 0;
    displayEl.textContent = `FPS: ${fps} (${delta.toFixed(1)}ms)`;
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
  const label = collapsed ? 'Show' : 'Hide';
  const visLabel = collapsed ? 'Expand' : 'Collapse';
  toggleBtnEl.textContent = label;
  visibilityBtnEl.textContent = visLabel;
}

function toggleCollapseState() {
  if (!panel) return;
  collapsed = !collapsed;
  panel.classList.toggle('collapsed', collapsed);
  updateToggleButtonsText();
}

function hidePanel() {
  if (!panel || hidden) return;
  panel.style.display = 'none';
  hidden = true;
}

function showPanel() {
  if (!panel || !hidden) return;
  panel.style.display = '';
  hidden = false;
}

function togglePanelHidden() {
  if (hidden) {
    showPanel();
  } else {
    hidePanel();
  }
}

function setupPanel(pageName) {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.className = 'debug-panel';
  panel.innerHTML = `
    <div class="debug-panel__header">
      <div>
        <strong>Debug Mode</strong>
        <div class="debug-panel__page-name"></div>
      </div>
      <button class="debug-panel__toggle" type="button">Hide</button>
    </div>
    <div class="debug-panel__body">
      <div class="debug-panel__info"></div>
      <div class="debug-panel__hooks"></div>
      <div class="debug-panel__metrics"></div>
      <div class="debug-panel__actions"></div>
    </div>
    <div class="debug-panel__footer">
      <button class="debug-panel__disable" type="button">Disable Debug Mode</button>
      <button class="debug-panel__visibility" type="button">Collapse</button>
    </div>
  `;
  document.head.appendChild(createStyles());
  document.body.appendChild(panel);

  const infoEl = panel.querySelector('.debug-panel__info');
  const pageEl = panel.querySelector('.debug-panel__page-name');
  const metricsEl = panel.querySelector('.debug-panel__metrics');
  toggleBtnEl = panel.querySelector('.debug-panel__toggle');
  visibilityBtnEl = panel.querySelector('.debug-panel__visibility');
  const disableBtn = panel.querySelector('.debug-panel__disable');

  pageEl.textContent = pageName;
  infoEl.innerHTML = `
    <div><strong>Page:</strong> ${pageName}</div>
    <div><strong>URL:</strong> ${window.location.href}</div>
    <div><strong>UA:</strong> ${navigator.userAgent}</div>
  `;

  renderHooks();
  startMetrics(metricsEl);
  updateToggleButtonsText();

  toggleBtnEl.addEventListener('click', toggleCollapseState);
  visibilityBtnEl.addEventListener('click', toggleCollapseState);
  disableBtn.addEventListener('click', () => {
    disableDebug();
    window.location.reload();
  });

  const handleKeydown = (event) => {
    if (!(event.ctrlKey && event.shiftKey && event.altKey)) return;
    if (event.code === 'KeyD') {
      event.preventDefault();
      togglePanelHidden();
      return;
    }
    if (event.code === 'Digit0') {
      event.preventDefault();
      hidePanel();
      return;
    }
  };
  document.addEventListener('keydown', handleKeydown);
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
