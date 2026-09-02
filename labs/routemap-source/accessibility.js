(() => {
  const STORAGE_KEY = "rv-keyboard-only-mode";

  function keyboardOnlyEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function persistKeyboardOnlyMode(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Accessibility mode remains active for this session when storage is unavailable.
    }
  }

  function refreshKeyboardOnlyTabStops(enabled = keyboardOnlyEnabled()) {
    document.querySelectorAll("[data-keyboard-only-tab]").forEach(element => {
      if (enabled) {
        element.removeAttribute("tabindex");
      } else {
        element.tabIndex = -1;
      }
    });
  }

  function applyKeyboardOnlyMode(enabled, persist = true) {
    document.documentElement.dataset.keyboardOnly = String(enabled);
    const toggle = document.querySelector("#keyboardOnlyToggle");
    toggle?.setAttribute("aria-pressed", String(enabled));
    toggle?.setAttribute("aria-label", `${enabled ? "Disable" : "Enable"} keyboard-only mode`);
    toggle?.setAttribute("title", `${enabled ? "Disable" : "Enable"} keyboard-only mode`);
    refreshKeyboardOnlyTabStops(enabled);
    if (persist) persistKeyboardOnlyMode(enabled);
    document.dispatchEvent(new CustomEvent("rv:keyboard-only-change", { detail: { enabled } }));
  }

  document.querySelector("#keyboardOnlyToggle")?.addEventListener("click", () => {
    applyKeyboardOnlyMode(!keyboardOnlyEnabled());
  });

  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
    if (event.target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    applyKeyboardOnlyMode(!keyboardOnlyEnabled());
  });

  window.RVAccessibility = {
    applyKeyboardOnlyMode,
    keyboardOnlyEnabled,
    refreshKeyboardOnlyTabStops
  };

  applyKeyboardOnlyMode(keyboardOnlyEnabled(), false);
})();
