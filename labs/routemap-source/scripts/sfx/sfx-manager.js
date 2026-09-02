"use strict";

// Shared sound-effect assignments for theme events, placed Gizmos, and stickers.
// Audio blobs live in IndexedDB; lightweight assignment metadata lives with the
// project setting or object that owns it.

const SFX_EVENT_CATALOG = Object.freeze([
  { group: "Permission", id: "permission.allow", label: "Sound and video allowed" },
  { group: "Map views", id: "view.us", label: "Enter US view" },
  { group: "Map views", id: "view.journey", label: "Enter journey view" },
  { group: "Map views", id: "view.route", label: "Enter route view" },
  { group: "Map views", id: "view.stop", label: "Enter stop view" },
  { group: "Journey", id: "journey.change", label: "Change journey" },
  { group: "Journey", id: "route.start", label: "Leave a stop / start route" },
  { group: "Journey", id: "route.reverse", label: "Reverse along route" },
  { group: "Journey", id: "route.complete", label: "Complete route" },
  { group: "Journey", id: "stop.reached", label: "Reach a stop" },
  { group: "Journey", id: "stop.previous", label: "Previous stop" },
  { group: "Journey", id: "stop.next", label: "Next stop" },
  { group: "Map controls", id: "map.zoomIn", label: "Zoom in" },
  { group: "Map controls", id: "map.zoomOut", label: "Zoom out" },
  { group: "Map controls", id: "map.pan", label: "Pan map" },
  { group: "Map controls", id: "map.reset", label: "Reset view" },
  { group: "Map controls", id: "map.saveView", label: "Set view" },
  { group: "Map controls", id: "map.feature", label: "Toggle map feature" },
  { group: "Media", id: "media.open", label: "Open media" },
  { group: "Media", id: "media.close", label: "Close media" },
  { group: "Media", id: "media.play", label: "Play media" },
  { group: "Media", id: "media.pause", label: "Pause media" },
  { group: "User site", id: "site.enter", label: "Enter User site" },
  { group: "User site", id: "site.leave", label: "Leave User site" },
  { group: "User site", id: "gizmo.activate", label: "Activate a Gizmo" },
  { group: "User site", id: "gizmo.change", label: "Change a Gizmo value" },
  { group: "User site", id: "gizmo.toggleOn", label: "Turn a Gizmo on" },
  { group: "User site", id: "gizmo.toggleOff", label: "Turn a Gizmo off" },
  { group: "Stickers", id: "sticker.appear", label: "Sticker appears" },
  { group: "Stickers", id: "sticker.hover", label: "Hover a hidden sticker" }
]);

const SFX_DB_NAME = "rv-map-sfx-assets";
const SFX_DB_STORE = "audio";
const SFX_DRAG_TYPE = "application/x-rv-sfx-assignment";
const SFX_STICKER_LIST_MODE_KEY = "rv-map-sticker-sfx-list-mode";
const SFX_MAX_VOLUME = 0.65;
// Sound remains opt-in and follows the Welcome gate's Allow / Don't allow
// choice for a normal visitor session.
const SFX_CONSENT_BYPASS = false;
let sfxAudioAllowed = SFX_CONSENT_BYPASS;
let sfxSelectedStickerId = "";
let sfxStickerClassFilter = "all";
let sfxSettings = { volume: 0.8, events: {}, assets: {} };
const sfxObjectUrls = new Map();
const sfxMenuAudios = new Set();
const sfxMenuStopHooks = new Set();

function sfxNormalizeAssignment(value) {
  if (!value || typeof value !== "object" || !value.assetId) return null;
  return {
    assetId: String(value.assetId),
    name: String(value.name || "Sound effect"),
    type: String(value.type || "audio/*"),
    volume: Math.max(0, Math.min(SFX_MAX_VOLUME, Number(value.volume ?? SFX_MAX_VOLUME))),
    muted: Boolean(value.muted),
    loopDelay: Math.max(0, Math.min(10, Number(value.loopDelay ?? 0.5)))
  };
}

function sfxLoadSettings() {
  const saved = rvStorageReadJson(SFX_SETTINGS_KEY, null);
  sfxSettings = {
    volume: Math.max(0, Math.min(1, Number(saved?.volume ?? 0.8))),
    events: Object.fromEntries(Object.entries(saved?.events || {}).map(([key, value]) => [key, sfxNormalizeAssignment(value)]).filter(([, value]) => value)),
    assets: saved?.assets && typeof saved.assets === "object" ? saved.assets : {}
  };
  return sfxSettings;
}

function sfxSaveSettings() {
  rvStorageWriteJson(SFX_SETTINGS_KEY, sfxSettings);
  if (typeof markProjectDirty === "function") markProjectDirty("ui");
}

function sfxExportState() {
  return JSON.parse(JSON.stringify(sfxSettings));
}

function sfxApplySettings(value) {
  if (!value || typeof value !== "object") return;
  rvStorageWriteJson(SFX_SETTINGS_KEY, value);
  sfxLoadSettings();
  sfxRenderGlobalEventList();
}

function sfxOpenDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SFX_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SFX_DB_STORE)) request.result.createObjectStore(SFX_DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function sfxStoreAudioFile(file) {
  if (!(file instanceof Blob) || !String(file.type || "").startsWith("audio/")) throw new Error("Choose an audio file.");
  const assetId = `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const db = await sfxOpenDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SFX_DB_STORE, "readwrite");
    transaction.objectStore(SFX_DB_STORE).put(file, assetId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  const assignment = { assetId, name: String(file.name || "Sound effect").slice(0, 120), type: file.type || "audio/*" };
  sfxSettings.assets[assetId] = { ...assignment, size: Number(file.size) || 0 };
  sfxSaveSettings();
  return assignment;
}

function sfxPublishedAudioUrl(assetId) {
  const url = String(sfxSettings.assets?.[assetId]?.url || "").trim();
  // Published project audio has a stable URL. Using it directly also keeps
  // playback inside the user's Allow/Preview click, which Firefox requires.
  return /^(?:assets\/|https?:\/\/)/i.test(url) ? url : "";
}

async function sfxAudioUrl(assetId) {
  const publishedUrl = sfxPublishedAudioUrl(assetId);
  if (publishedUrl) return publishedUrl;
  if (sfxObjectUrls.has(assetId)) return sfxObjectUrls.get(assetId);
  const db = await sfxOpenDatabase();
  const blob = await new Promise((resolve, reject) => {
    const request = db.transaction(SFX_DB_STORE, "readonly").objectStore(SFX_DB_STORE).get(assetId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  sfxObjectUrls.set(assetId, url);
  return url;
}

async function sfxPlayAssignment(assignment, { force = false } = {}) {
  const normalized = sfxNormalizeAssignment(assignment);
  if (!normalized || (!sfxAudioAllowed && !force)) return false;
  try {
    // Do not await IndexedDB before playing a bundled sound: that would lose
    // Firefox's user-activation token for the welcome Allow button.
    const publishedUrl = sfxPublishedAudioUrl(normalized.assetId);
    const url = publishedUrl || await sfxAudioUrl(normalized.assetId);
    if (!url) return false;
    const audio = new Audio(url);
    audio.volume = sfxEffectiveVolume(normalized);
    await audio.play();
    return true;
  } catch (error) {
    console.warn("Unable to play SFX:", error);
    return false;
  }
}

function sfxEffectiveVolume(assignment) {
  if (assignment?.muted) return 0;
  return Math.min(SFX_MAX_VOLUME, Math.max(0, Number(sfxSettings.volume ?? 0.8) * Number(assignment?.volume ?? SFX_MAX_VOLUME)));
}

function sfxStopMenuSounds() {
  sfxMenuAudios.forEach(audio => { audio.onended = null; audio.pause(); });
  sfxMenuAudios.clear();
  sfxMenuStopHooks.forEach(stop => stop());
}

async function sfxPlayMenuAssignment(assignment) {
  const normalized = sfxNormalizeAssignment(assignment);
  if (!normalized) return false;
  sfxStopMenuSounds();
  const publishedUrl = sfxPublishedAudioUrl(normalized.assetId);
  const url = publishedUrl || await sfxAudioUrl(normalized.assetId);
  if (!url) return false;
  const audio = new Audio(url);
  audio.volume = sfxEffectiveVolume(normalized);
  audio.onended = () => sfxMenuAudios.delete(audio);
  sfxMenuAudios.add(audio);
  try { await audio.play(); return true; } catch { sfxMenuAudios.delete(audio); return false; }
}

function sfxPlayEvent(eventId) {
  return sfxPlayAssignment(sfxSettings.events[eventId]);
}

async function sfxPrimeEvent(eventId) {
  const assignment = sfxNormalizeAssignment(sfxSettings.events[eventId]);
  if (!assignment) return false;
  return Boolean(await sfxAudioUrl(assignment.assetId));
}

function sfxGrantAudioPermission() {
  sfxAudioAllowed = true;
  return sfxPlayEvent("permission.allow");
}

function sfxPlayStickerEvent(sticker, slot) {
  return sfxPlayAssignment(sfxStickerAssignment(sticker, slot) || sfxSettings.events[`sticker.${slot}`]);
}

function sfxAssignmentLabel(assignment) {
  return sfxNormalizeAssignment(assignment)?.name || "No sound assigned";
}

function sfxCopyAssignmentToTarget(payload, current, apply) {
  const assignment = sfxNormalizeAssignment(payload?.assignment);
  if (!assignment) return false;
  if (current && !window.confirm(`Replace “${sfxAssignmentLabel(current)}” with “${assignment.name}”?`)) return false;
  apply(assignment);
  return true;
}

function sfxCreateAssignmentEditor({ label, eventId = "", slot = eventId, getAssignment, setAssignment, compact = false, kind = "SFX" }) {
  const row = document.createElement("div");
  row.className = `sfx-assignment-row${compact ? " is-compact" : ""}`;
  row.dataset.sfxSlot = slot;
  const heading = document.createElement("div");
  heading.className = "sfx-assignment-heading";
  const title = document.createElement("strong");
  title.textContent = label;
  const soundSlot = document.createElement("div");
  soundSlot.className = "sfx-sound-slot";
  const filename = document.createElement("span");
  const actions = document.createElement("div");
  actions.className = "sfx-assignment-actions";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*";
  input.hidden = true;
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "▶";
  preview.title = "Preview sound";
  const loop = document.createElement("button");
  loop.type = "button";
  loop.className = "sfx-loop-button";
  loop.title = "Loop this sound; right-click to set the delay";
  loop.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">repeat</span>';
  let looping = false;
  let loopAudio = null;
  let loopTimer = null;
  const stopLoop = () => {
    looping = false;
    clearTimeout(loopTimer);
    loopAudio?.pause();
    if (loopAudio) sfxMenuAudios.delete(loopAudio);
    loopAudio = null;
    loop.classList.remove("is-looping");
  };
  sfxMenuStopHooks.add(stopLoop);
  const playLoop = async () => {
    const assigned = sfxNormalizeAssignment(getAssignment());
    if (!looping || !assigned) return stopLoop();
    const url = await sfxAudioUrl(assigned.assetId);
    if (!url || !looping) return stopLoop();
    loopAudio = new Audio(url);
    sfxMenuAudios.add(loopAudio);
    loopAudio.volume = sfxEffectiveVolume(assigned);
    loopAudio.onended = () => {
      sfxMenuAudios.delete(loopAudio);
      if (looping) loopTimer = window.setTimeout(playLoop, assigned.loopDelay * 1000);
    };
    try { await loopAudio.play(); } catch { stopLoop(); }
  };
  const volumeButton = document.createElement("button");
  volumeButton.type = "button";
  volumeButton.className = "sfx-volume-button";
  volumeButton.title = "Mute or unmute this sound\nScroll to adjust volume";
  const volumeControl = document.createElement("div");
  volumeControl.className = "sfx-volume-control";
  const volume = document.createElement("input");
  volume.type = "range";
  volume.min = "0";
  volume.max = String(SFX_MAX_VOLUME);
  volume.step = "0.05";
  volume.className = "sfx-row-volume";
  const refresh = () => {
    const assigned = sfxNormalizeAssignment(getAssignment());
    filename.textContent = sfxAssignmentLabel(assigned);
    preview.disabled = !assigned;
    loop.disabled = !assigned;
    volume.disabled = !assigned;
    volume.value = String(assigned?.volume ?? SFX_MAX_VOLUME);
    volumeButton.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${assigned?.muted ? "volume_off" : "volume_up"}</span>`;
    volumeButton.disabled = !assigned;
    soundSlot.draggable = Boolean(assigned);
    soundSlot.title = assigned
      ? `Click to replace ${kind}. Right-click to remove. Drag to assign this sound elsewhere.`
      : `Click to add ${kind}. Drop a sound here to assign it.`;
    row.classList.toggle("has-sfx", Boolean(assigned));
    if (!assigned) row.classList.remove("is-volume-open");
  };
  let dragStarted = false;
  soundSlot.addEventListener("click", event => {
    if (dragStarted) { event.preventDefault(); return; }
    input.click();
  });
  soundSlot.addEventListener("contextmenu", event => {
    event.preventDefault();
    if (!sfxNormalizeAssignment(getAssignment())) return;
    stopLoop();
    setAssignment(null);
    refresh();
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const assignment = await sfxStoreAudioFile(file);
      setAssignment(assignment);
      refresh();
    } catch (error) {
      window.alert(error.message || "That sound could not be stored.");
    } finally {
      input.value = "";
    }
  });
  preview.addEventListener("click", () => sfxPlayMenuAssignment(getAssignment()));
  loop.addEventListener("click", () => {
    if (looping) stopLoop();
    else { sfxStopMenuSounds(); looping = true; loop.classList.add("is-looping"); void playLoop(); }
  });
  loop.addEventListener("contextmenu", event => {
    event.preventDefault();
    const assigned = sfxNormalizeAssignment(getAssignment());
    if (!assigned) return;
    const entered = window.prompt("Loop delay in seconds", String(assigned.loopDelay));
    if (entered === null) return;
    const delay = Number(entered);
    if (!Number.isFinite(delay)) return;
    setAssignment({ ...assigned, loopDelay: Math.max(0, Math.min(10, delay)) });
    refresh();
  });
  volumeButton.addEventListener("click", () => {
    const assigned = sfxNormalizeAssignment(getAssignment());
    if (!assigned) return;
    setAssignment({ ...assigned, muted: !assigned.muted });
    refresh();
  });
  volume.addEventListener("input", () => {
    const assigned = sfxNormalizeAssignment(getAssignment());
    if (!assigned) return;
    setAssignment({ ...assigned, volume: Number(volume.value), muted: Number(volume.value) <= 0 });
    refresh();
  });
  volumeButton.addEventListener("wheel", event => {
    const assigned = sfxNormalizeAssignment(getAssignment());
    if (!assigned) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(SFX_MAX_VOLUME, assigned.volume + (event.deltaY < 0 ? 0.05 : -0.05)));
    setAssignment({ ...assigned, volume: next, muted: next <= 0 });
    refresh();
  }, { passive: false });
  soundSlot.addEventListener("dragstart", event => {
    const assignment = sfxNormalizeAssignment(getAssignment());
    if (!assignment) return event.preventDefault();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(SFX_DRAG_TYPE, JSON.stringify({ assignment, slot }));
    dragStarted = true;
    soundSlot.classList.add("is-dragging");
  });
  soundSlot.addEventListener("dragend", () => {
    soundSlot.classList.remove("is-dragging");
    window.setTimeout(() => { dragStarted = false; }, 0);
  });
  row.addEventListener("dragover", event => {
    if (!event.dataTransfer.types.includes(SFX_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  row.addEventListener("drop", event => {
    const raw = event.dataTransfer.getData(SFX_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();
    try {
      const payload = JSON.parse(raw);
      if (sfxCopyAssignmentToTarget(payload, getAssignment(), assignment => setAssignment(assignment))) refresh();
    } catch {}
  });
  soundSlot.append(filename);
  heading.append(title, soundSlot);
  [preview, loop].forEach(button => button.classList.add("sfx-action-main"));
  volumeControl.append(volumeButton, volume);
  actions.append(volumeControl, preview, loop, input);
  row.append(heading, actions);
  refresh();
  return row;
}

function sfxRenderGlobalEventList() {
  const host = document.querySelector("#sfxEventList");
  if (!host) return;
  host.replaceChildren();
  let groupName = "";
  SFX_EVENT_CATALOG.forEach(eventDefinition => {
    if (eventDefinition.group !== groupName) {
      groupName = eventDefinition.group;
      const heading = document.createElement("h3");
      heading.textContent = groupName;
      host.append(heading);
    }
    host.append(sfxCreateAssignmentEditor({
      label: eventDefinition.label,
      eventId: eventDefinition.id,
      getAssignment: () => sfxSettings.events[eventDefinition.id],
      setAssignment: assignment => {
        if (assignment) sfxSettings.events[eventDefinition.id] = assignment;
        else delete sfxSettings.events[eventDefinition.id];
        sfxSaveSettings();
      }
    }));
  });
}

function sfxStickerRecordsForCurrentView() {
  if (typeof state === "undefined" || typeof activeTrip !== "function") return [];
  const trips = state.contiguousUsMode ? state.trips : [activeTrip()].filter(Boolean);
  return trips.flatMap(trip => (trip.stickers || [])
    .map(sticker => ({ trip, sticker })));
}

function sfxCreateStickerMediaEventEditor(sticker, slot, label) {
  const row = document.createElement("div");
  row.className = "sfx-assignment-row sticker-media-event-row";
  row.dataset.mediaEventSlot = slot;
  const heading = document.createElement("div");
  heading.className = "sfx-assignment-heading";
  const title = document.createElement("strong");
  title.textContent = label;
  const mediaId = sticker.mediaEvents?.[slot] || "";
  const record = typeof findTripMediaRecord === "function" && mediaId ? findTripMediaRecord(mediaId) : null;
  const mediaSlot = document.createElement("div");
  mediaSlot.className = "sticker-media-event-slot";
  mediaSlot.draggable = Boolean(mediaId);
  const filename = document.createElement("span");
  filename.textContent = record?.item?.name || "No media assigned";
  mediaSlot.append(filename);
  mediaSlot.title = record?.item ? `Click to preview ${record.item.name}. Right-click to remove. Drag to another event or preset frame.` : "Click to choose media for this event.";
  mediaSlot.addEventListener("click", () => {
    if (record?.item) {
      openJourneyMedia?.(record.item, { ...playbackOptions(), eventContext: { sticker, slot } });
    } else if (typeof openStickerMediaEventDialog === "function") openStickerMediaEventDialog(sticker, slot);
  });
  mediaSlot.addEventListener("contextmenu", event => {
    event.preventDefault();
    if (typeof assignStickerMediaEvent === "function") assignStickerMediaEvent(sticker, slot, "");
  });
  mediaSlot.addEventListener("dragstart", event => {
    if (!mediaId) return event.preventDefault();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-rv-sticker-media-event", JSON.stringify({ mediaId }));
    event.dataTransfer.setData("application/x-rv-preset-media", JSON.stringify({ mediaId }));
    mediaSlot.classList.add("is-dragging");
  });
  mediaSlot.addEventListener("dragend", () => mediaSlot.classList.remove("is-dragging"));
  row.addEventListener("dragover", event => {
    if (!event.dataTransfer.types.includes("application/x-rv-sticker-media-event")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  row.addEventListener("drop", event => {
    const raw = event.dataTransfer.getData("application/x-rv-sticker-media-event");
    if (!raw) return;
    event.preventDefault();
    try { const payload = JSON.parse(raw); if (payload.mediaId && typeof assignStickerMediaEvent === "function") assignStickerMediaEvent(sticker, slot, payload.mediaId); } catch {}
  });
  const actions = document.createElement("div");
  actions.className = "sfx-assignment-actions";
  const playbackOptions = () => ({ volume: 1, muted: false, loop: false, ...(sticker.mediaEventOptions?.[slot] || {}) });
  const setPlaybackOptions = patch => {
    sticker.mediaEventOptions ||= {};
    sticker.mediaEventOptions[slot] = { ...playbackOptions(), ...patch };
    saveTrips?.(); markProjectDirty?.("journeys");
  };
  const supportsPlayback = ["audio", "video"].includes(record?.item?.kind);
  const volumeButton = document.createElement("button");
  volumeButton.type = "button"; volumeButton.className = "sfx-volume-button";
  const volume = document.createElement("input");
  volume.type = "range"; volume.min = "0"; volume.max = "1"; volume.step = "0.05"; volume.className = "sfx-row-volume";
  const preview = document.createElement("button");
  preview.type = "button"; preview.textContent = "▶"; preview.title = "Preview media";
  const loop = document.createElement("button");
  loop.type = "button"; loop.className = "sfx-loop-button"; loop.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">repeat</span>'; loop.title = "Toggle repeat";
  const refresh = () => {
    const options = playbackOptions();
    filename.textContent = record?.item?.name || "No media assigned";
    row.classList.toggle("has-sfx", Boolean(record?.item));
    mediaSlot.draggable = Boolean(mediaId);
    volume.disabled = volumeButton.disabled = loop.disabled = !supportsPlayback;
    preview.disabled = !record?.item;
    volume.value = String(options.volume);
    volumeButton.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${options.muted ? "volume_off" : "volume_up"}</span>`;
    loop.classList.toggle("is-looping", Boolean(options.loop));
  };
  volumeButton.addEventListener("click", () => { const options = playbackOptions(); setPlaybackOptions({ muted: !options.muted }); refresh(); });
  volume.addEventListener("input", () => { setPlaybackOptions({ volume: Number(volume.value), muted: Number(volume.value) <= 0 }); refresh(); });
  preview.addEventListener("click", () => { if (record?.item) openJourneyMedia?.(record.item, { ...playbackOptions(), eventContext: { sticker, slot } }); });
  loop.addEventListener("click", () => { setPlaybackOptions({ loop: !playbackOptions().loop }); refresh(); });
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "sticker-media-event-clear";
  clear.textContent = "×";
  clear.title = "Remove event media";
  clear.disabled = !mediaId;
  clear.addEventListener("click", () => { if (typeof assignStickerMediaEvent === "function") assignStickerMediaEvent(sticker, slot, ""); });
  const edit = document.createElement("button");
  edit.type = "button"; edit.className = "sticker-media-event-edit"; edit.textContent = "✎"; edit.title = "Choose or replace event media";
  edit.addEventListener("click", () => { if (typeof openStickerMediaEventDialog === "function") openStickerMediaEventDialog(sticker, slot); });
  // The assignment row is a convenient editing target.  Controls retain
  // their own actions, while its remaining surface always opens the media.
  row.addEventListener("click", event => {
    if (event.target.closest("button, input, select, textarea, .sticker-media-event-slot")) return;
    if (record?.item) openJourneyMedia?.(record.item, { ...playbackOptions(), eventContext: { sticker, slot } });
    else if (typeof openStickerMediaEventDialog === "function") openStickerMediaEventDialog(sticker, slot);
  });
  heading.append(title, mediaSlot);
  actions.append(edit, volumeButton, volume, preview, loop, clear);
  row.append(heading, actions);
  if (["image", "video", "youtube", "blog", "preset"].includes(record?.item?.kind)) {
    const placement = document.createElement("fieldset");
    placement.className = "sticker-media-instance-controls";
    placement.innerHTML = "<legend>Map preview instance</legend>";
    const styleDefaults = typeof mediaPresentationStyleForKind === "function"
      ? mediaPresentationStyleForKind(record?.item?.kind)
      : null;
    const defaults = {
      x: Number(styleDefaults?.x) || .12,
      y: Number(styleDefaults?.y) || .12,
      width: Number(styleDefaults?.width) || .76,
      height: Number(styleDefaults?.height) || .68
    };
    const instance = () => ({ ...defaults, ...(playbackOptions().layoutInstance || {}) });
    [["X", "x"], ["Y", "y"], ["Width", "width"], ["Height", "height"]].forEach(([label, key]) => {
      const control = document.createElement("label");
      control.textContent = `${label} `;
      const input = document.createElement("input");
      input.type = "range"; input.min = "0"; input.max = "1"; input.step = ".01"; input.value = String(instance()[key]);
      const output = document.createElement("output"); output.textContent = `${Math.round(instance()[key] * 100)}%`;
      input.addEventListener("input", () => {
        const next = instance();
        next[key] = Number(input.value);
        if (key === "x") next.width = Math.min(next.width, 1 - next.x);
        if (key === "y") next.height = Math.min(next.height, 1 - next.y);
        if (key === "width") next.width = Math.min(next.width, 1 - next.x);
        if (key === "height") next.height = Math.min(next.height, 1 - next.y);
        setPlaybackOptions({ layoutInstance: next });
        output.textContent = `${Math.round(next[key] * 100)}%`;
        if (!els.mediaViewer?.hidden) openJourneyMedia?.(record.item, playbackOptions());
      });
      control.append(input, output); placement.append(control);
    });
    row.append(placement);
  }
  refresh();
  return row;
}

function sfxStickerAssignment(sticker, slot) {
  return sfxNormalizeAssignment(sticker?.sfx?.[slot]);
}

function sfxSetStickerAssignment(trip, sticker, slot, assignment) {
  sticker.sfx = { ...(sticker.sfx || {}) };
  if (assignment) sticker.sfx[slot] = sfxNormalizeAssignment(assignment);
  else delete sticker.sfx[slot];
  if (typeof saveTrips === "function") saveTrips();
  if (typeof markProjectDirty === "function") markProjectDirty("journeys");
  sfxRenderStickerEditor();
}

function sfxRenderStickerEditor() {
  const grid = document.querySelector("#stickerSfxGrid");
  const editor = document.querySelector("#stickerSfxEditor");
  const dropdown = document.querySelector("#stickerSfxDropdown");
  const modeSelect = document.querySelector("#stickerSfxListMode");
  if (!grid || !editor || !dropdown || !modeSelect) return;
  const records = sfxStickerRecordsForCurrentView()
    .filter(record => sfxStickerClassFilter === "all" || (record.sticker.objectClass || "sticker") === sfxStickerClassFilter)
    .sort((a, b) => a.sticker.label.localeCompare(b.sticker.label));
  if (!records.some(record => record.sticker.id === sfxSelectedStickerId)) sfxSelectedStickerId = records[0]?.sticker.id || "";
  const mode = modeSelect.value || "scroll";
  grid.hidden = mode === "dropdown";
  grid.classList.toggle("is-expanded", mode === "expand");
  dropdown.hidden = mode !== "dropdown";
  dropdown.replaceChildren(...records.map(({ sticker }) => new Option(sticker.label, sticker.id, false, sticker.id === sfxSelectedStickerId)));
  grid.replaceChildren();
  records.forEach(({ trip, sticker }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sticker-sfx-tile";
    button.dataset.stickerId = sticker.id;
    button.classList.toggle("is-selected", sticker.id === sfxSelectedStickerId);
    const visual = sticker.objectClass === "null" ? '<b class="sticker-fx-null-tile">NULL</b>' : sticker.objectClass === "pin" ? `<b class="sticker-fx-pin-tile is-${escapeHtml(sticker.pin?.variant || "down-middle")}" style="--object-pin-color:${escapeHtml(sticker.pin?.color || "#1f7a5c")}">${sticker.pin?.style === "graphic" && sticker.pin?.graphicUrl ? `<img src="${escapeHtml(sticker.pin.graphicUrl)}" alt="">` : escapeHtml(sticker.pin?.style === "letter" ? sticker.label.slice(0, 1) : sticker.pin?.style === "blank" ? "" : sticker.pin?.symbol || "•")}</b>` : `<img src="${escapeHtml(sticker.imageUrl)}" alt="">`;
    button.innerHTML = `${visual}<span>${escapeHtml(sticker.label)}</span><i>${sticker.sfx && Object.keys(sticker.sfx).length ? "♪" : ""}</i>`;
    button.addEventListener("click", () => { sfxSelectedStickerId = sticker.id; sfxRenderStickerEditor(); });
    button.addEventListener("dragover", event => {
      if (event.dataTransfer.types.includes(SFX_DRAG_TYPE)) event.preventDefault();
    });
    button.addEventListener("drop", event => {
      const raw = event.dataTransfer.getData(SFX_DRAG_TYPE);
      if (!raw) return;
      event.preventDefault();
      try {
        const payload = JSON.parse(raw);
        const slot = ["appear", "hover"].includes(payload.slot) ? payload.slot : "appear";
        sfxCopyAssignmentToTarget(payload, sfxStickerAssignment(sticker, slot), assignment => sfxSetStickerAssignment(trip, sticker, slot, assignment));
      } catch {}
    });
    grid.append(button);
  });
  const selected = records.find(record => record.sticker.id === sfxSelectedStickerId);
  editor.hidden = !selected;
  editor.replaceChildren();
  if (selected) {
    const heading = document.createElement("strong");
    heading.textContent = selected.sticker.label;
    const inspector = document.createElement("div");
    inspector.className = "sticker-fx-object-inspector";
    const classLabel = document.createElement("label");
    classLabel.textContent = "Class ";
    const classSelect = document.createElement("select");
    ["sticker", "pin", "media", "null"].forEach(value => classSelect.append(new Option(value[0].toUpperCase() + value.slice(1), value, false, (selected.sticker.objectClass || "sticker") === value)));
    classSelect.addEventListener("change", () => { selected.sticker.objectClass = classSelect.value; if (classSelect.value === "null") selected.sticker.activation = "timeline"; saveTrips?.(); renderStickers?.(); sfxRenderStickerEditor(); });
    classLabel.append(classSelect);
    const activationLabel = document.createElement("label");
    activationLabel.textContent = "Trigger ";
    const activationSelect = document.createElement("select");
    [["either", "Automatic or click"], ["automatic", "Automatic"], ["click", "Click / tap"], ["timeline", "Timeline cue"], ["arrival", "Arriving (day 0)"], ["departure", "Leaving (last day + 1)"]].forEach(([value, label]) => activationSelect.append(new Option(label, value, false, (selected.sticker.activation || "either") === value)));
    activationSelect.disabled = selected.sticker.objectClass === "null";
    activationSelect.addEventListener("change", () => { selected.sticker.activation = activationSelect.value; syncStickerMediaEvent?.(selected.sticker); saveTrips?.(); });
    activationLabel.append(activationSelect);
    inspector.append(classLabel, activationLabel);
    if (selected.sticker.objectClass !== "null") {
      const customView = document.createElement("fieldset");
      customView.className = "sticker-fx-custom-view";
      customView.innerHTML = "<legend>Custom view</legend>";
      const enabled = document.createElement("label"); enabled.textContent = "Use custom view ";
      const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = Boolean(selected.sticker.customViewEnabled);
      const delay = document.createElement("label"); delay.textContent = "Trigger delay ";
      const delayInput = document.createElement("input"); delayInput.type = "range"; delayInput.min = "0"; delayInput.max = "12"; delayInput.step = ".25"; delayInput.value = String(selected.sticker.customViewDelay || 0);
      const delayOutput = document.createElement("output"); delayOutput.textContent = `${Number(delayInput.value).toFixed(2).replace(/0$/, "")}s`;
      const note = document.createElement("small"); note.textContent = selected.sticker.customView ? "Use Set sticker view to replace the saved camera." : "Select this, then use Set sticker view on the map.";
      toggle.addEventListener("change", () => { selected.sticker.customViewEnabled = toggle.checked; saveTrips?.(); markProjectDirty?.("journeys"); updateSetMapViewState?.(); sfxRenderStickerEditor(); });
      delayInput.addEventListener("input", () => { selected.sticker.customViewDelay = Number(delayInput.value); delayOutput.textContent = `${Number(delayInput.value).toFixed(2).replace(/0$/, "")}s`; saveTrips?.(); markProjectDirty?.("journeys"); });
      enabled.append(toggle); delay.append(delayInput, delayOutput); customView.append(enabled, delay, note); inspector.append(customView);
    }
    if (selected.sticker.objectClass === "media") {
      const mediaLabel = document.createElement("label");
      mediaLabel.textContent = "Media ";
      const mediaSelect = document.createElement("select");
      mediaSelect.append(new Option("No media assigned", "", false, !selected.sticker.mediaId));
      (typeof stickerMediaRecordsForSticker === "function" ? stickerMediaRecordsForSticker(selected.sticker) : [])
        .forEach(record => mediaSelect.append(new Option(typeof stickerMediaRecordLabel === "function" ? stickerMediaRecordLabel(record) : record.item.name, record.item.id, false, record.item.id === selected.sticker.mediaId)));
      mediaSelect.addEventListener("change", () => { if (typeof assignMediaToSticker === "function") assignMediaToSticker(selected.sticker, mediaSelect.value); });
      mediaLabel.append(mediaSelect); inspector.append(mediaLabel);
    }
    {
      selected.sticker.pin ||= {};
      const supportsImage = selected.sticker.objectClass !== "null";
      if (selected.sticker.objectClass !== "pin") selected.sticker.pin.shapeEnabled = Boolean(selected.sticker.pin.shapeEnabled);
      const updatePin = () => { saveTrips?.(); markProjectDirty?.("journeys"); renderStickers?.(); sfxRenderStickerEditor(); };
      let shapeLayerLabel = null;
      if (selected.sticker.objectClass !== "pin") {
        shapeLayerLabel = document.createElement("label");
        shapeLayerLabel.textContent = "Shape layer ";
        const shapeLayer = document.createElement("input"); shapeLayer.type = "checkbox"; shapeLayer.checked = Boolean(selected.sticker.pin.shapeEnabled);
        shapeLayer.addEventListener("change", () => { selected.sticker.pin.shapeEnabled = shapeLayer.checked; updatePin(); });
        shapeLayerLabel.append(shapeLayer);
      }
      const pinTypeLabel = document.createElement("label");
      pinTypeLabel.textContent = "Content style ";
      const pinType = document.createElement("select");
      [["graphic", "Graphic"], ["letter", "First letter"], ["preview", "Media preview"], ["number", "Number"], ["blank", "Blank"]].forEach(([value, label]) => pinType.append(new Option(label, value, false, (selected.sticker.pin.style || "graphic") === value)));
      pinType.addEventListener("change", () => { selected.sticker.pin.style = pinType.value; updatePin(); });
      pinTypeLabel.append(pinType);
      const pinColorLabel = document.createElement("label");
      pinColorLabel.textContent = "Shape color ";
      const pinColor = document.createElement("input"); pinColor.type = "color"; pinColor.value = selected.sticker.pin.color || "#1f7a5c";
      pinColor.addEventListener("input", () => { selected.sticker.pin.color = pinColor.value; if (typeof rememberPinLibraryColor === "function") rememberPinLibraryColor(pinColor.value); updatePin(); });
      pinColorLabel.append(pinColor);
      const pinVariantLabel = document.createElement("label");
      pinVariantLabel.textContent = "Speech tail ";
      const pinVariant = document.createElement("select");
      [["down-left", "Down-left"], ["down-middle", "Down-middle"], ["down-right", "Down-right"]].forEach(([value, label]) => pinVariant.append(new Option(label, value, false, (selected.sticker.pin.variant || "down-middle") === value)));
      pinVariant.addEventListener("change", () => { selected.sticker.pin.variant = pinVariant.value; updatePin(); });
      pinVariantLabel.hidden = (selected.sticker.pin.shape || "round") !== "speech";
      pinVariantLabel.append(pinVariant);
      const pinShapeLabel = document.createElement("label");
      pinShapeLabel.textContent = "Shape ";
      const pinShape = document.createElement("select");
      [["round", "Round"], ["square", "Square"], ["teardrop", "Teardrop"], ["arrow", "Arrow"], ["heart", "Heart"], ["plus", "Plus"], ["speech", "Speech bubble"], ["note", "Sticky note"], ["diamond", "Diamond"], ["hexagon", "Hexagon"], ["octagon", "Octagon"], ["star", "Star"], ["notched-square", "Notched square"], ["capsule", "Capsule"]].forEach(([value, label]) => pinShape.append(new Option(label, value, false, (selected.sticker.pin.shape || "round") === value)));
      pinShape.addEventListener("change", () => { selected.sticker.pin.shape = pinShape.value; updatePin(); });
      pinShapeLabel.append(pinShape);
      const graphicLabel = document.createElement("label");
      graphicLabel.textContent = "Graphic ";
      const graphicSelect = document.createElement("select");
      graphicSelect.append(new Option(selected.sticker.objectClass === "sticker" ? "Use sticker graphic" : "No graphic", "", false, !selected.sticker.pin.graphicUrl));
      (typeof allStickerLibraryItems === "function" ? allStickerLibraryItems() : []).filter(item => item.url && item.objectClass !== "pin").forEach(item => graphicSelect.append(new Option(item.label, item.url, false, item.url === selected.sticker.pin.graphicUrl)));
      graphicSelect.disabled = pinType.value !== "graphic";
      graphicLabel.hidden = pinType.value !== "graphic";
      graphicSelect.addEventListener("change", () => { selected.sticker.pin.graphicUrl = graphicSelect.value; updatePin(); });
      graphicLabel.append(graphicSelect);
      const graphicSizeLabel = document.createElement("label");
      graphicSizeLabel.textContent = "Graphic size ";
      const graphicSize = document.createElement("input"); graphicSize.type = "range"; graphicSize.min = "0.15"; graphicSize.max = "1.5"; graphicSize.step = "0.05"; graphicSize.value = String(selected.sticker.pin.graphicScale ?? .62);
      graphicSize.addEventListener("input", () => { selected.sticker.pin.graphicScale = Number(graphicSize.value); updatePin(); });
      graphicSizeLabel.hidden = pinType.value !== "graphic"; graphicSizeLabel.append(graphicSize);
      const graphicUpload = document.createElement("input");
      graphicUpload.type = "file"; graphicUpload.accept = "image/*"; graphicUpload.hidden = true;
      const graphicUploadButton = document.createElement("button");
      graphicUploadButton.type = "button"; graphicUploadButton.textContent = "Upload graphic";
      graphicUploadButton.hidden = pinType.value !== "graphic";
      graphicUploadButton.addEventListener("click", () => graphicUpload.click());
      graphicUpload.addEventListener("change", () => {
        const file = graphicUpload.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.addEventListener("load", () => { selected.sticker.pin.graphicUrl = String(reader.result || ""); updatePin(); });
        reader.readAsDataURL(file); graphicUpload.value = "";
      });
      // The hidden picker travels with the Image subsection when applicable.
      let noteLabel = null;
      if ((selected.sticker.pin.shape || "round") === "note") {
        noteLabel = document.createElement("label");
        noteLabel.className = "sticker-note-control";
        noteLabel.textContent = "Note text ";
        const note = document.createElement("textarea");
        note.rows = 4;
        note.placeholder = "Write a note…";
        note.value = selected.sticker.pin.noteText || "";
        note.addEventListener("input", () => { selected.sticker.pin.noteText = note.value.slice(0, 8000); updatePin(); });
        noteLabel.append(note);
      }
      const imageDetails = document.createElement("details"); imageDetails.className = "sticker-fx-subsection"; imageDetails.open = true;
      imageDetails.innerHTML = "<summary>Image</summary>";
      const imageHost = document.createElement("div"); imageHost.className = "sticker-fx-subsection-body"; imageDetails.append(imageHost);
      const shapeDetails = document.createElement("details"); shapeDetails.className = "sticker-fx-subsection"; shapeDetails.open = true;
      shapeDetails.innerHTML = "<summary>Shape</summary>";
      const shapeHost = document.createElement("div"); shapeHost.className = "sticker-fx-subsection-body"; shapeDetails.append(shapeHost);
      const addStrokeStack = (label, key, fallbackColor, fallbackSize, host) => {
        const stack = Array.isArray(selected.sticker.pin[key]) && selected.sticker.pin[key].length
          ? selected.sticker.pin[key]
          : [{ id: `pin-${key}-${Date.now()}`, color: fallbackColor, size: fallbackSize, hidden: fallbackSize <= 0 }];
        selected.sticker.pin[key] = stack;
        const wrap = document.createElement("div"); wrap.className = "pin-stroke-control";
        const head = document.createElement("div"); head.className = "marker-stroke-head";
        const title = document.createElement("span"); title.textContent = `${label} strokes`;
        const add = document.createElement("button"); add.type = "button"; add.textContent = `Add ${label.toLowerCase()} stroke`;
        const list = document.createElement("div"); list.className = "marker-stroke-list";
        const commit = () => { updatePin(); };
        const renderRows = () => {
          list.replaceChildren();
          stack.forEach((stroke, index) => {
            const row = document.createElement("div"); row.className = "marker-stroke-row"; row.dataset.strokeId = stroke.id; row.classList.toggle("is-stroke-hidden", Boolean(stroke.hidden));
            const grip = document.createElement("span"); grip.className = "marker-stroke-grip"; grip.draggable = true; grip.setAttribute("aria-hidden", "true");
            const color = document.createElement("input"); color.type = "color"; color.value = stroke.color || fallbackColor;
            const visibility = document.createElement("button"); visibility.type = "button"; visibility.className = "stroke-visibility-toggle";
            const divider = document.createElement("span"); divider.className = "marker-stroke-divider";
            const width = document.createElement("input"); width.type = "range"; width.min = "0"; width.max = "12"; width.step = "1"; width.value = String(stroke.size ?? fallbackSize);
            const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete";
            const isShown = () => !stroke.hidden && Number(stroke.size) > 0;
            const refresh = () => { const shown = isShown(); visibility.setAttribute("aria-pressed", String(shown)); if (typeof setStrokeVisibilityIcon === "function") setStrokeVisibilityIcon(visibility, stroke.size); else visibility.textContent = shown ? stroke.size : "×"; row.classList.toggle("is-stroke-hidden", !shown); };
            color.addEventListener("input", () => { stroke.color = color.value; commit(); });
            width.addEventListener("input", () => { stroke.size = Number(width.value); stroke.hidden = stroke.size <= 0; refresh(); commit(); });
            visibility.addEventListener("click", () => { stroke.hidden = isShown(); if (!stroke.hidden && Number(stroke.size) <= 0) stroke.size = 1; width.value = String(stroke.size); refresh(); commit(); });
            remove.addEventListener("click", () => { stack.splice(index, 1); if (!stack.length) stack.push({ id: `pin-${key}-${Date.now()}`, color: fallbackColor, size: 0, hidden: true }); renderRows(); commit(); });
            grip.addEventListener("dragstart", event => { event.dataTransfer.setData("text/plain", stroke.id); event.dataTransfer.effectAllowed = "move"; });
            row.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; });
            row.addEventListener("drop", event => { event.preventDefault(); const from = stack.findIndex(item => item.id === event.dataTransfer.getData("text/plain")); if (from < 0 || from === index) return; const [moved] = stack.splice(from, 1); stack.splice(index, 0, moved); renderRows(); commit(); });
            row.append(grip, color, visibility, divider, width, remove); refresh(); list.append(row);
          });
        };
        add.addEventListener("click", () => { stack.push({ id: `pin-${key}-${Date.now()}`, color: fallbackColor, size: 1, hidden: false }); renderRows(); commit(); });
        head.append(title, add); wrap.append(head, list); renderRows(); host.append(wrap);
      };
      if (supportsImage) addStrokeStack("Image", "graphicStrokes", selected.sticker.pin.graphicStrokeColor || "#ffffff", selected.sticker.pin.graphicStrokeWidth ?? 0, imageHost);
      addStrokeStack("Shape", "bodyStrokes", selected.sticker.pin.bodyStrokeColor || "#ffffff", selected.sticker.pin.bodyStrokeWidth ?? 3, shapeHost);
      if (supportsImage) imageHost.append(pinTypeLabel, graphicLabel, graphicSizeLabel, graphicUpload, graphicUploadButton);
      if (shapeLayerLabel) shapeHost.append(shapeLayerLabel);
      shapeHost.append(pinColorLabel, pinVariantLabel, pinShapeLabel);
      if (noteLabel) shapeHost.append(noteLabel);
      if (supportsImage) inspector.append(imageDetails);
      inspector.append(shapeDetails);
    }
    // These are deliberately static transform controls: a one-value keyframe
    // is safely kept in sync, while a property with genuinely different
    // keyframes stays owned by the Timeline editor.
    const animation = typeof stickerAnimation === "function" ? stickerAnimation(selected.sticker) : selected.sticker.animation;
    if (animation) {
      const transforms = document.createElement("fieldset");
      transforms.className = "sticker-fx-transforms";
      transforms.innerHTML = "<legend>Static transforms</legend>";
      const properties = [
        ["opacity", "Opacity", 0, 1, .05, value => `${Math.round(value * 100)}%`],
        ["scale", "Scale", .1, 2, .05, value => `${Math.round(value * 100)}%`],
        ["rotation", "Rotation", -180, 180, 5, value => `${value}°`],
        ["positionX", "Position X", -100, 100, 1, value => String(value)],
        ["positionY", "Position Y", -100, 100, 1, value => String(value)]
      ];
      properties.forEach(([property, label, min, max, step, format]) => {
        const frames = Array.isArray(animation.keyframes?.[property]) ? animation.keyframes[property] : [];
        const values = new Set(frames.map(frame => Number(frame.value).toFixed(5)));
        const locked = values.size > 1;
        const row = document.createElement("label"); row.className = "sticker-fx-transform";
        const title = document.createElement("span"); title.textContent = label;
        const input = document.createElement("input"); input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(animation[property] ?? (property === "scale" ? 1 : 0)); input.disabled = locked;
        const output = document.createElement("output"); output.textContent = locked ? "Keyframed" : format(Number(input.value));
        if (locked) {
          row.title = "This property has multiple keyframed values and can only be edited in Timeline. Press Alt+T to open it.";
          row.classList.add("is-keyframed");
        }
        input.addEventListener("input", () => {
          const value = Number(input.value);
          animation[property] = value;
          frames.forEach(frame => { frame.value = value; });
          selected.sticker.animation = animation;
          output.textContent = format(value);
          saveTrips?.(); markProjectDirty?.("journeys"); renderStickers?.(); renderRouteTimeline?.();
        });
        row.append(title, input, output); transforms.append(row);
      });
      inspector.append(transforms);
    }
    editor.append(
      heading,
      inspector,
      sfxCreateStickerMediaEventEditor(selected.sticker, "appear", selected.sticker.objectClass === "null" ? "When NULL cue is reached" : "When object appears"),
      ...(selected.sticker.objectClass === "null" ? [] : [
        sfxCreateStickerMediaEventEditor(selected.sticker, "click", "When object is clicked"),
        sfxCreateStickerMediaEventEditor(selected.sticker, "hover", "When hidden object is hovered")
      ])
    );
  }
}

function sfxCreateGizmoSection(placement, { compact = false } = {}) {
  const section = document.createElement("section");
  section.className = `users-gizmo-sfx-section${compact ? " is-compact" : " panel-section"}`;
  const heading = document.createElement(compact ? "strong" : "div");
  heading.className = compact ? "" : "section-label";
  heading.textContent = "Gizmo SFX";
  const config = () => normalizeUserLayoutControlConfig(placement.item.controlConfig);
  const set = (slot, assignment) => {
    placement.item.controlConfig = normalizeUserLayoutControlConfig({
      ...placement.item.controlConfig,
      sfx: { ...(config().sfx || {}), [slot]: assignment || null }
    });
    if (typeof renderUserFrameLayout === "function") renderUserFrameLayout();
    if (typeof pushUserBuilderHistory === "function") pushUserBuilderHistory(`Update ${userLayoutControlDisplayLabel(placement.item)} Gizmo SFX`);
  };
  section.append(
    heading,
    sfxCreateAssignmentEditor({ label: "Activate", slot: "activate", compact, getAssignment: () => config().sfx?.activate, setAssignment: assignment => set("activate", assignment) }),
    sfxCreateAssignmentEditor({ label: "Change value", slot: "change", compact, getAssignment: () => config().sfx?.change, setAssignment: assignment => set("change", assignment) })
  );
  return section;
}

function sfxGizmoAssignment(controlId, slot) {
  if (typeof findUserLayoutControl !== "function") return null;
  const placement = findUserLayoutControl(controlId);
  return placement ? normalizeUserLayoutControlConfig(placement.item.controlConfig).sfx?.[slot] : null;
}

function sfxRequestConsent() {
  const dialog = document.querySelector("#sfxConsentDialog");
  if (SFX_CONSENT_BYPASS) {
    sfxAudioAllowed = true;
    if (dialog) dialog.hidden = true;
    return;
  }
  if (dialog) dialog.hidden = false;
}

// Visual media remains open only while its event is the current working
// target. Clicking elsewhere in an editor panel returns the map to normal.
document.addEventListener("pointerdown", event => {
  if (els.mediaViewer?.hidden || event.target.closest("#mediaViewer, .sticker-media-event-row")) return;
  if (event.target.closest(".panel, .users-appearance-admin-panel, .users-staging-admin-panel")) closeJourneyMedia?.();
}, true);

function sfxInitializeUi() {
  sfxLoadSettings();
  // Loading is harmless before consent and ensures the consent click can
  // start audio immediately instead of waiting on IndexedDB first.
  void sfxPrimeEvent("permission.allow");
  const volume = document.querySelector("#sfxMasterVolume");
  if (volume) {
    volume.value = String(sfxSettings.volume);
    volume.addEventListener("input", () => { sfxSettings.volume = Number(volume.value); sfxSaveSettings(); });
  }
  const mode = document.querySelector("#stickerSfxListMode");
  if (mode) {
    mode.value = rvStorageGet(SFX_STICKER_LIST_MODE_KEY, "scroll");
    mode.addEventListener("change", () => { rvStorageSet(SFX_STICKER_LIST_MODE_KEY, mode.value); sfxRenderStickerEditor(); });
  }
  document.querySelector("#stickerFxClassTabs")?.addEventListener("click", event => {
    const button = event.target.closest("[data-fx-class]");
    if (!button) return;
    sfxStickerClassFilter = button.dataset.fxClass || "sticker";
    document.querySelectorAll("#stickerFxClassTabs [data-fx-class]").forEach(tab => tab.setAttribute("aria-selected", String(tab === button)));
    sfxRenderStickerEditor();
  });
  document.querySelector("#stickerSfxDropdown")?.addEventListener("change", event => { sfxSelectedStickerId = event.target.value; sfxRenderStickerEditor(); });
  document.querySelector("#sfxConsentAllow")?.addEventListener("click", () => {
    sfxGrantAudioPermission();
    document.querySelector("#sfxConsentDialog").hidden = true;
  });
  document.querySelector("#sfxConsentDecline")?.addEventListener("click", () => { document.querySelector("#sfxConsentDialog").hidden = true; });
  sfxRenderGlobalEventList();
  sfxRenderStickerEditor();

  document.addEventListener("click", event => {
    const gizmo = event.target.closest?.(".user-layout-control-object[data-control-id]");
    if (gizmo && !event.target.closest(".user-layout-control-remove, .user-gizmo-settings-button")) {
      sfxPlayAssignment(sfxGizmoAssignment(gizmo.dataset.controlId, "activate") || sfxSettings.events["gizmo.activate"]);
    }
    const id = event.target.closest?.("button")?.id;
    const eventId = {
      zoomIn: "map.zoomIn", zoomOut: "map.zoomOut", panLeft: "map.pan", panRight: "map.pan",
      resetView: "map.reset", setMapView: "map.saveView", featureToggleMarkers: "map.feature",
      featureToggleStopNames: "map.feature", featureToggleRoute: "map.feature",
      featureToggleRouteIcon: "map.feature", featureToggleLandmarks: "map.feature"
    }[id];
    if (eventId) sfxPlayEvent(eventId);
  }, true);
  document.addEventListener("change", event => {
    const gizmo = event.target.closest?.(".user-layout-control-object[data-control-id]");
    if (!gizmo) return;
    const toggle = event.target.matches?.("input[type='checkbox']")
      ? sfxSettings.events[event.target.checked ? "gizmo.toggleOn" : "gizmo.toggleOff"]
      : null;
    const assignment = sfxGizmoAssignment(gizmo.dataset.controlId, "change") || toggle || sfxSettings.events["gizmo.change"];
    sfxPlayAssignment(assignment);
  }, true);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sfxInitializeUi, { once: true });
  else sfxInitializeUi();
}
