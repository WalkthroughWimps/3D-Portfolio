"use strict";

// Local-first project persistence.  The editor always writes its working copy
// on this device first; /admin synchronizes compact snapshots when a network
// is available. Labs intentionally never contacts the shared draft endpoint.

const RV_PROJECT_SYNC_DB = "rv-project-sync-v1";
const RV_PROJECT_SYNC_STORE = "drafts";
const RV_PROJECT_SYNC_KEY = "current";
const RV_PROJECT_SYNC_DELAY = 45000;

const rvProjectSync = (() => {
  let snapshotProvider = null;
  let snapshotApplier = null;
  let timer = 0;
  let localTimer = 0;
  let syncing = false;
  let started = false;
  let status = "Saved on this device.";
  const listeners = new Set();

  const sharedAdmin = () => !RV_RUNTIME_ENVIRONMENT.labsLocalOnly
    && !RV_RUNTIME_ENVIRONMENT.publicSite
    && /^\/admin(?:\/|$)/i.test(globalThis.location?.pathname || "");

  function emit(next) {
    status = next;
    listeners.forEach(listener => listener(status));
    document.dispatchEvent(new CustomEvent("rvprojectsyncstatus", { detail: { status } }));
  }

  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(RV_PROJECT_SYNC_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(RV_PROJECT_SYNC_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readLocal() {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(RV_PROJECT_SYNC_STORE, "readonly").objectStore(RV_PROJECT_SYNC_STORE).get(RV_PROJECT_SYNC_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }

  async function writeLocal(snapshot) {
    const db = await database();
    try {
      await new Promise((resolve, reject) => {
        const request = db.transaction(RV_PROJECT_SYNC_STORE, "readwrite").objectStore(RV_PROJECT_SYNC_STORE).put(snapshot, RV_PROJECT_SYNC_KEY);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }

  async function saveLocal() {
    if (!snapshotProvider) return null;
    const snapshot = { version: 1, updatedAt: new Date().toISOString(), payload: snapshotProvider() };
    await writeLocal(snapshot);
    return snapshot;
  }

  async function syncNow() {
    if (!sharedAdmin() || !navigator.onLine || syncing || !snapshotProvider) return false;
    syncing = true;
    try {
      const local = await readLocal() || await saveLocal();
      if (!local?.payload) return false;
      emit("Syncing protected draft…");
      const response = await fetch("/admin/api/project-draft", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(local)
      });
      if (!response.ok) throw new Error(`Sync failed (${response.status})`);
      const result = await response.json();
      const time = result.updatedAt ? new Date(result.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
      emit(time ? `Protected draft synced at ${time}.` : "Protected draft synced.");
      return true;
    } catch (error) {
      console.warn("Project draft remains queued locally.", error);
      emit("Saved on this device · protected sync pending.");
      return false;
    } finally { syncing = false; }
  }

  async function publish() {
    if (!sharedAdmin() || !snapshotProvider) return false;
    try {
      await saveLocal();
      emit("Publishing to GitHub…");
      const response = await fetch("/admin/api/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, payload: snapshotProvider() })
      });
      if (!response.ok) throw new Error(`Publish failed (${response.status})`);
      const result = await response.json();
      emit(`Published to ${result.repository} · Cloudflare is deploying.`);
      return true;
    } catch (error) {
      console.warn("Project remains saved locally; publishing did not complete.", error);
      emit("Saved on this device · publishing needs attention.");
      return false;
    }
  }

  async function persistQueuedDraft() {
    try {
      await saveLocal();
      emit(sharedAdmin() ? (navigator.onLine ? "Saved on this device · protected sync queued." : "Saved on this device · offline changes queued.") : "Saved locally on this device.");
    } catch (error) {
      console.warn("Unable to persist local project draft.", error);
      emit("Changes are active, but this device could not save the draft.");
      return;
    }
    clearTimeout(timer);
    timer = window.setTimeout(syncNow, RV_PROJECT_SYNC_DELAY);
  }

  function queue() {
    // Inputs, sliders, and map drags can fire dozens of events per second.
    // Coalesce them before serializing anything, while still saving promptly.
    clearTimeout(localTimer);
    emit("Saving on this device…");
    localTimer = window.setTimeout(persistQueuedDraft, 800);
  }

  async function start() {
    if (started) return;
    started = true;
    if (!sharedAdmin() || !snapshotApplier || !navigator.onLine) return;
    try {
      const response = await fetch("/admin/api/project-draft", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 404) return;
      if (!response.ok) throw new Error(`Draft load failed (${response.status})`);
      const remote = await response.json();
      if (remote?.payload) {
        snapshotApplier(remote.payload);
        await writeLocal(remote);
        emit("Loaded the latest protected family draft.");
      }
    } catch (error) {
      console.warn("Using this device's local draft.", error);
      emit("Using this device's saved draft · protected sync pending.");
    }
  }

  window.addEventListener("online", () => { if (sharedAdmin()) syncNow(); });
  return {
    register({ getSnapshot, applySnapshot }) { snapshotProvider = getSnapshot; snapshotApplier = applySnapshot; },
    queue,
    syncNow,
    publish,
    start,
    subscribe(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener); },
    isSharedAdmin: sharedAdmin
  };
})();
