import {
  loadDebugIfEnabled,
  getPageDebugState,
  normalizePageIdentifier,
  togglePageDebugState,
  DEBUG_VISIBILITY_EVENT,
} from "./debug-loader.js";

const BUTTON_ID = "debugToggleBtn";
const POLL_TIMEOUT = 2000;

const pageId = normalizePageIdentifier(window.location.pathname);
const pageName = document.title || pageId;

let buttonEl = null;
let isWaiting = false;

const updateButtonState = (enabled) => {
  if (!buttonEl) return;
  buttonEl.setAttribute("aria-pressed", String(enabled));
  buttonEl.classList.toggle("nav-icon--active", enabled);
};

const dispatchVisibility = (show) => {
  window.dispatchEvent(new CustomEvent(DEBUG_VISIBILITY_EVENT, { detail: { show } }));
};

const handleClick = async (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!buttonEl) return;
  const enabled = togglePageDebugState(pageId);
  updateButtonState(enabled);
  if (enabled) {
    await loadDebugIfEnabled({ pageId, pageName });
    dispatchVisibility(true);
  } else {
    dispatchVisibility(false);
  }
};

const attachButton = () => {
  const candidate = document.getElementById(BUTTON_ID);
  if (!candidate) {
    return false;
  }
  buttonEl = candidate;
  buttonEl.removeEventListener("click", handleClick);
  buttonEl.addEventListener("click", handleClick);
  updateButtonState(getPageDebugState(pageId));
  return true;
};

const waitForButton = () => {
  if (attachButton()) {
    return;
  }
  if (isWaiting) return;
  isWaiting = true;
  const start = performance.now();
  const poll = () => {
    if (attachButton()) {
      isWaiting = false;
      return;
    }
    if (performance.now() - start > POLL_TIMEOUT) {
      isWaiting = false;
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
};

waitForButton();
