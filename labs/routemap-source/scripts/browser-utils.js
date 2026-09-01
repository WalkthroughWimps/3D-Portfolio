"use strict";

// Small browser primitives shared across imports, exports, previews, and panels.

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJson(filename, data) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

// Browsers may write a user-selected file through the File System Access API.
// They cannot choose a project directory or overwrite a web host autonomously.
async function saveJsonToChosenFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  if (typeof window.showSaveFilePicker !== "function") {
    downloadBlob(filename, blob);
    return { method: "download" };
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "JSON settings", accept: { "application/json": [".json"] } }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { method: "file", name: handle.name };
  } catch (error) {
    if (error?.name === "AbortError") return { method: "cancelled" };
    console.warn("Native settings save failed; downloading instead.", error);
    downloadBlob(filename, blob);
    return { method: "download" };
  }
}

function safeDownloadName(value = "RV trip") {
  return String(value || "RV trip")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 90) || "RV trip";
}
