"use strict";

// Guarded browser storage primitives. Domain-specific schemas and migrations
// remain with their owning state modules.

function rvStorageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function rvStorageSet(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function rvStorageRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function rvStorageReadJson(key, fallback = null) {
  const raw = rvStorageGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function rvStorageWriteJson(key, value) {
  try {
    return rvStorageSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
