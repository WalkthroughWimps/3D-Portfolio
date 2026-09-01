"use strict";

// Authoritative cross-domain state. Domain-heavy state remains with its future
// owner until that phase is extracted from map.js.

const APP_STATE_VERSION = 1;

const ADMIN_USER_PREVIEW_PATH = /^\/admin\/users\/?$/i.test(globalThis.location?.pathname || "");
const LOCAL_USER_PREVIEW = /(?:^|[?&])preview=user(?:&|$)/.test(globalThis.location?.search || "");

const appState = Object.seal({
  version: APP_STATE_VERSION,
  // /admin/ is always the editor. Visitor preview is deliberate only at the
  // protected /admin/users/ URL, never a remembered local-session mode.
  siteMode: RV_RUNTIME_ENVIRONMENT.publicSite || ADMIN_USER_PREVIEW_PATH || LOCAL_USER_PREVIEW ? "user" : "edit",
  userMaterial: rvStorageGet(USER_MATERIAL_STORAGE_KEY, "leather")
});

function readAppState() {
  return { ...appState };
}

function updateAppState(patch = {}, { persist = true } = {}) {
  if (Object.hasOwn(patch, "siteMode")) {
    appState.siteMode = RV_RUNTIME_ENVIRONMENT.publicSite || patch.siteMode === "user" ? "user" : "edit";
    if (persist) rvStorageSet(SITE_MODE_STORAGE_KEY, appState.siteMode);
  }
  if (Object.hasOwn(patch, "userMaterial")) {
    const value = String(patch.userMaterial || "leather").trim();
    appState.userMaterial = value || "leather";
    if (persist) rvStorageSet(USER_MATERIAL_STORAGE_KEY, appState.userMaterial);
  }
  return readAppState();
}
