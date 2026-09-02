"use strict";

// Durable media records, presentation defaults, layout presets, and storage.

// Phone-selected files are kept as Blobs in IndexedDB. Object URLs alone die
// on refresh; this local asset store keeps previews available while travelling
// offline. Publishing these files to GitHub/R2 is deliberately separate.
const RV_MEDIA_ASSET_DB = "rv-media-assets-v1";
const RV_MEDIA_ASSET_STORE = "files";
const rvMediaObjectUrls = new Map();

function rvMediaDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RV_MEDIA_ASSET_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RV_MEDIA_ASSET_STORE)) request.result.createObjectStore(RV_MEDIA_ASSET_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rvMediaStoreFile(file) {
  if (!(file instanceof Blob)) throw new Error("Choose an image, video, or audio file.");
  const assetId = `media-file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const db = await rvMediaDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(RV_MEDIA_ASSET_STORE, "readwrite");
      transaction.objectStore(RV_MEDIA_ASSET_STORE).put(file, assetId);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
  const url = URL.createObjectURL(file);
  rvMediaObjectUrls.set(assetId, url);
  return { assetId, url };
}

async function rvMediaAssetUrl(assetId) {
  if (!assetId) return "";
  if (rvMediaObjectUrls.has(assetId)) return rvMediaObjectUrls.get(assetId);
  const db = await rvMediaDatabase();
  try {
    const file = await new Promise((resolve, reject) => {
      const request = db.transaction(RV_MEDIA_ASSET_STORE, "readonly").objectStore(RV_MEDIA_ASSET_STORE).get(assetId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (!file) return "";
    const url = URL.createObjectURL(file);
    rvMediaObjectUrls.set(assetId, url);
    return url;
  } finally { db.close(); }
}

async function rvMediaHydrateLocalAssets() {
  const records = [];
  (state?.trips || []).forEach(trip => {
    (trip.days || []).forEach(route => records.push(...(route.media || [])));
    (trip.stops || []).forEach(stop => {
      records.push(...(stop.media || []));
      Object.values(stop.dayContent || {}).forEach(content => records.push(...(content?.media || [])));
    });
  });
  await Promise.all(records.filter(item => item?.assetId && !item.url).map(async item => {
    item.url = await rvMediaAssetUrl(item.assetId);
  }));
  return records.length;
}

function mediaKindFromType(type = "") {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "blog";
}

function revokeTemporaryMediaUrl(url) {
  if (typeof url === "string" && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function normalizeTripMedia(item = {}) {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  const kind = ["youtube", "null"].includes(item.kind) ? item.kind : (item.kind || mediaKindFromType(item.type));
  const presetSlots = Object.fromEntries(Object.entries(item.presetSlots || {}).slice(0, 24).map(([id, slot]) => [String(id), {
    kind: ["text", "image", "video", "preset", "media"].includes(slot?.kind) ? slot.kind : "text",
    text: String(slot?.text || ""),
    name: String(slot?.name || ""),
    url: typeof slot?.url === "string" ? slot.url : "",
    layoutId: typeof slot?.layoutId === "string" ? slot.layoutId : "",
    mediaId: typeof slot?.mediaId === "string" ? slot.mediaId : "",
    spanX: Math.max(1, Math.min(6, Math.round(Number(slot?.spanX) || 1))),
    spanY: Math.max(1, Math.min(6, Math.round(Number(slot?.spanY) || 1))),
    slots: slot?.slots && typeof slot.slots === "object" ? slot.slots : {}
  }]));
  return {
    id: item.id || `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: item.name || item.title || "Untitled media",
    kind,
    type: item.type || (kind === "youtube" ? "text/youtube" : kind === "null" ? "application/x-rv-null" : kind === "blog" ? "text/plain" : ""),
    text: item.text || "",
    assetId: String(item.assetId || ""),
    notePrimed: Boolean(item.notePrimed),
    url: item.url || null,
    thumbnailUrl: item.thumbnailUrl || "",
    customThumbnailUrl: typeof item.customThumbnailUrl === "string" && item.customThumbnailUrl.startsWith("data:image/")
      ? item.customThumbnailUrl
      : "",
    customThumbnailName: String(item.customThumbnailName || ""),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    address: item.address || "",
    sourceLat: Number.isFinite(Number(item.sourceLat)) ? Number(item.sourceLat) : null,
    sourceLon: Number.isFinite(Number(item.sourceLon)) ? Number(item.sourceLon) : null,
    stopPositionCustom: Boolean(item.stopPositionCustom),
    routeAnchor: ["start", "end"].includes(item.routeAnchor) ? item.routeAnchor : null,
    pinType: ["letter", "symbol", "preview", "number", "blank"].includes(item.pinType)
      ? item.pinType
      : kind === "image" ? "preview" : "symbol",
    pinColor: /^#[0-9a-f]{6}$/i.test(item.pinColor || "") ? item.pinColor : (MEDIA_PIN_COLORS?.[kind] || "#1f7a5c"),
    pinStyle: ["default", "slot-1", "slot-2"].includes(item.pinStyle) ? item.pinStyle : "default",
    mapObjectType: ["pin", "sticker", "standalone", "timeline"].includes(item.mapObjectType) ? item.mapObjectType : "pin",
    stickerId: typeof item.stickerId === "string" ? item.stickerId : "",
    activation: ["either", "automatic", "click", "timeline"].includes(item.activation) ? item.activation : (kind === "null" ? "timeline" : "either"),
    layoutId: typeof item.layoutId === "string" ? item.layoutId : "default",
    presetSlots,
    timelineAt: clamp(Number(item.timelineAt ?? 0.5), 0, 1)
    ,layoutInstance: item.layoutInstance && typeof item.layoutInstance === "object" ? (() => {
      const instance = {
        x: clamp(Number(item.layoutInstance.x) || 0.04, 0, .88),
        y: clamp(Number(item.layoutInstance.y) || 0.04, 0, .88),
        width: clamp(Number(item.layoutInstance.width) || .92, .12, 1),
        height: clamp(Number(item.layoutInstance.height) || .92, .12, 1)
      };
      // Historical defaults were serialized as per-item overrides.  Remove
      // only those known values so existing deliberate custom placement stays.
      const historicalDefault = (instance.x === .04 && instance.y === .04 && instance.width === .92 && instance.height === .92)
        || (instance.x === .01 && instance.y === .02 && instance.width === .98 && instance.height === .96);
      return historicalDefault ? null : instance;
    })() : null
  };
}

function serializeTripMediaRecord(item = {}) {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    type: item.type,
    text: item.text,
    assetId: item.assetId || "",
    notePrimed: Boolean(item.notePrimed),
    url: typeof item.url === "string" && !item.url.startsWith("blob:") ? item.url : null,
    thumbnailUrl: item.thumbnailUrl || "",
    customThumbnailUrl: item.customThumbnailUrl || "",
    customThumbnailName: item.customThumbnailName || "",
    lat: item.lat,
    lon: item.lon,
    address: item.address,
    sourceLat: item.sourceLat,
    sourceLon: item.sourceLon,
    stopPositionCustom: Boolean(item.stopPositionCustom),
    routeAnchor: item.routeAnchor,
    pinType: item.pinType,
    pinColor: item.pinColor,
    pinStyle: item.pinStyle,
    mapObjectType: item.mapObjectType,
    stickerId: item.stickerId,
    activation: item.activation,
    layoutId: item.layoutId,
    presetSlots: item.presetSlots || {},
    timelineAt: item.timelineAt,
    layoutInstance: item.layoutInstance || null
  };
}

async function optimizeMediaThumbnailUpload(file, maxDimension = 384) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose an image file for the thumbnail.");
  const sourceUrl = await blobToDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const candidate = new Image();
    candidate.addEventListener("load", () => resolve(candidate), { once: true });
    candidate.addEventListener("error", () => reject(new Error("The thumbnail image could not be read.")), { once: true });
    candidate.src = sourceUrl;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The thumbnail could not be prepared.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  return {
    name: file.name || "Custom thumbnail",
    url: canvas.toDataURL("image/webp", 0.86)
  };
}



const MEDIA_PIN_COLORS = {
  image: "#2f6fbb",
  video: "#b42318",
  youtube: "#c91523",
  audio: "#7a4fd6",
  blog: "#1f7a5c",
  null: "#6d767b"
};

const MEDIA_PIN_SYMBOLS = {
  image: "P",
  video: "V",
  youtube: "Y",
  audio: "A",
  blog: "T",
  null: "NULL"
};

function youtubeEmbedUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text.startsWith("http") ? text : `https://${text}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      id = url.searchParams.get("v") || "";
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        const marker = parts.findIndex(part => ["embed", "shorts", "live"].includes(part));
        if (marker >= 0) id = parts[marker + 1] || "";
      }
    }
    if (!/^[\w-]{6,20}$/.test(id)) return "";
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return "";
  }
}

function youtubeVideoId(value) {
  const embedUrl = youtubeEmbedUrl(value);
  return embedUrl ? embedUrl.split("/").pop()?.split(/[?#]/)[0] || "" : "";
}

function youtubeThumbnailUrl(value) {
  const id = youtubeVideoId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

async function youtubeMetadata(value) {
  const id = youtubeVideoId(value);
  const fallback = {
    title: id ? `YouTube · ${id}` : "YouTube video",
    thumbnailUrl: youtubeThumbnailUrl(value)
  };
  if (!id) return fallback;
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`);
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      title: String(data.title || fallback.title),
      thumbnailUrl: String(data.thumbnail_url || fallback.thumbnailUrl)
    };
  } catch {
    return fallback;
  }
}

const MEDIA_STYLE_TYPES = ["youtube", "video", "image", "audio", "text"];
const MEDIA_BASE_STYLE = Object.freeze({
  useDefault: false,
  // New media begins as an inset, map-viewport autofit. Individual media can
  // still be moved and resized afterwards without changing this default.
  x: 0.04,
  y: 0.04,
  width: 0.92,
  height: 0.92,
  background: "#111827",
  border: "#e8dec8",
  text: "#fff8e8",
  radius: 14,
  borderWidth: 2,
  padding: 12,
  shadow: 0.55,
  fit: "contain",
  fullscreen: true,
  fullscreenTarget: "map"
});
const MEDIA_LAYOUT_SLOT_DEFAULTS = Object.freeze({
  story: [{ kind: "image", label: "Picture" }, { kind: "text", label: "Caption" }],
  split: [{ kind: "image", label: "Picture" }, { kind: "text", label: "Story" }],
  postcard: [{ kind: "image", label: "Picture" }, { kind: "text", label: "Caption" }],
  journal: [{ kind: "image", label: "Picture 1" }, { kind: "image", label: "Picture 2" }, { kind: "text", label: "Journal" }],
  gallery: [{ kind: "image", label: "Picture 1" }, { kind: "image", label: "Picture 2" }, { kind: "image", label: "Picture 3" }, { kind: "text", label: "Caption" }],
  feature: [{ kind: "image", label: "Feature image" }, { kind: "text", label: "Story" }, { kind: "text", label: "Details" }],
  "video-note": [{ kind: "video", label: "Video" }, { kind: "text", label: "Notes" }],
  "audio-story": [{ kind: "image", label: "Picture" }, { kind: "audio", label: "Audio" }, { kind: "text", label: "Story" }]
});

function normalizeMediaLayoutSlots(slots, template = "split") {
  const fallback = MEDIA_LAYOUT_SLOT_DEFAULTS[template] || MEDIA_LAYOUT_SLOT_DEFAULTS.split;
  const source = Array.isArray(slots) && slots.length ? slots : fallback;
  return source.slice(0, 12).map((slot, index) => ({
    id: String(slot?.id || `slot-${index + 1}`),
    kind: ["image", "video", "audio", "text"].includes(slot?.kind) ? slot.kind : "text",
    label: String(slot?.label || `Content ${index + 1}`).slice(0, 60)
  }));
}

function cloneMediaLayout(layout = {}) {
  return { ...layout, slots: normalizeMediaLayoutSlots(layout.slots, layout.template) };
}
const MEDIA_LAYOUT_DEFAULTS = Object.freeze([
  { id: "story", name: "Picture with caption below", template: "story", columns: 1, gap: 7, frame: true, framePadding: 12, frameRadius: 14, builtin: true },
  { id: "split", name: "Picture with side text", template: "split", columns: 2, gap: 8, frame: true, framePadding: 12, frameRadius: 14, builtin: true },
  { id: "postcard", name: "Picture with overlaid caption", template: "postcard", columns: 1, gap: 0, frame: true, framePadding: 8, frameRadius: 16, builtin: true },
  { id: "journal", name: "Two pictures with journal text", template: "journal", columns: 2, gap: 7, frame: true, framePadding: 10, frameRadius: 12, builtin: true },
  { id: "gallery", name: "Picture gallery with caption", template: "gallery", columns: 3, gap: 6, frame: false, framePadding: 8, frameRadius: 10, builtin: true },
  { id: "feature", name: "Large feature with notes", template: "feature", columns: 2, gap: 9, frame: true, framePadding: 14, frameRadius: 18, builtin: true },
  { id: "video-note", name: "Video with nearby notes", template: "video-note", columns: 2, gap: 8, frame: true, framePadding: 10, frameRadius: 12, builtin: true },
  { id: "audio-story", name: "Audio story with picture", template: "audio-story", columns: 2, gap: 7, frame: true, framePadding: 10, frameRadius: 12, builtin: true }
]);

function defaultMediaPresentationState() {
  return {
    defaultStyle: { ...MEDIA_BASE_STYLE },
    types: Object.fromEntries(MEDIA_STYLE_TYPES.map(type => [type, { ...MEDIA_BASE_STYLE, useDefault: true }])),
    map: { visibility: "dimmed", blend: "normal", opacity: 0.62, blur: 2 },
    layouts: MEDIA_LAYOUT_DEFAULTS.map(cloneMediaLayout),
    selectedLayout: "story"
  };
}

function normalizeMediaStyle(style = {}, fallback = MEDIA_BASE_STYLE) {
  return {
    ...fallback,
    ...style,
    useDefault: Boolean(style.useDefault),
    x: clamp(Number(style.x ?? fallback.x), 0, 0.96),
    y: clamp(Number(style.y ?? fallback.y), 0, 0.96),
    width: clamp(Number(style.width ?? fallback.width), 0.08, 1),
    height: clamp(Number(style.height ?? fallback.height), 0.08, 1),
    radius: clamp(Number(style.radius ?? fallback.radius), 0, 80),
    borderWidth: clamp(Number(style.borderWidth ?? fallback.borderWidth), 0, 16),
    padding: clamp(Number(style.padding ?? fallback.padding), 0, 48),
    shadow: clamp(Number(style.shadow ?? fallback.shadow), 0, 1),
    fit: ["contain", "cover", "fill"].includes(style.fit) ? style.fit : fallback.fit,
    fullscreen: Boolean(style.fullscreen),
    fullscreenTarget: style.fullscreenTarget === "browser" ? "browser" : "map"
  };
}

function loadMediaPresentationState() {
  const base = defaultMediaPresentationState();
  const saved = rvStorageReadJson(MEDIA_PRESENTATION_KEY, null);
  if (saved) {
    base.defaultStyle = normalizeMediaStyle(saved.defaultStyle, base.defaultStyle);
    MEDIA_STYLE_TYPES.forEach(type => {
      base.types[type] = normalizeMediaStyle(saved.types?.[type], base.types[type]);
    });
    base.map = {
      visibility: ["visible", "dimmed", "hidden"].includes(saved.map?.visibility) ? saved.map.visibility : base.map.visibility,
      blend: ["normal", "multiply", "screen", "soft-light"].includes(saved.map?.blend) ? saved.map.blend : base.map.blend,
      opacity: clamp(Number(saved.map?.opacity ?? base.map.opacity), 0, 1),
      blur: clamp(Number(saved.map?.blur ?? base.map.blur), 0, 30)
    };
    if (Array.isArray(saved.layouts) && saved.layouts.length) {
      const customLayouts = saved.layouts.filter(layout => !layout.builtin).map((layout, index) => ({
        id: String(layout.id || `layout-${index + 1}`),
        name: String(layout.name || `Layout ${index + 1}`),
        columns: clamp(Math.round(Number(layout.columns) || 1), 1, 6),
        gap: clamp(Number(layout.gap) || 0, 0, 80),
        template: String(layout.template || "split"),
        frame: layout.frame !== false,
        framePadding: clamp(Number(layout.framePadding) || 0, 0, 80),
        frameRadius: clamp(Number(layout.frameRadius) || 0, 0, 80),
        builtin: Boolean(layout.builtin),
        slots: normalizeMediaLayoutSlots(layout.slots, layout.template)
      }));
      base.layouts = [...MEDIA_LAYOUT_DEFAULTS.map(cloneMediaLayout), ...customLayouts];
    }
    base.selectedLayout = base.layouts.some(layout => layout.id === saved.selectedLayout) ? saved.selectedLayout : base.layouts[0].id;
  }
  return base;
}

let mediaPresentationState = loadMediaPresentationState();
let mediaStyleEditingDefault = false;
let mediaLayoutPreviewMode = false;

function saveMediaPresentationState() {
  rvStorageWriteJson(MEDIA_PRESENTATION_KEY, mediaPresentationState);
}
