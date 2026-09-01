"use strict";

async function readJsonFile(file) {
  if (!file || typeof file.text !== "function") {
    throw new TypeError("A readable JSON file is required.");
  }
  return JSON.parse(await file.text());
}

function openTripsBackupDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRIPS_BACKUP_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TRIPS_BACKUP_STORE)) {
        database.createObjectStore(TRIPS_BACKUP_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberTripsBackup(rawPayload) {
  if (!rawPayload) return;
  try {
    const payload = JSON.parse(rawPayload);
    if (!isValidTripsPayload(payload)) return;
    const database = await openTripsBackupDatabase();
    const records = await new Promise((resolve, reject) => {
      const transaction = database.transaction(TRIPS_BACKUP_STORE, "readonly");
      const store = transaction.objectStore(TRIPS_BACKUP_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    if (records.at(-1)?.payload === rawPayload) {
      database.close();
      return;
    }
    const transaction = database.transaction(TRIPS_BACKUP_STORE, "readwrite");
    const store = transaction.objectStore(TRIPS_BACKUP_STORE);
    store.add({
      savedAt: new Date().toISOString(),
      summary: payload.trips.map(trip => `${trip.name}: ${trip.days.length} day${trip.days.length === 1 ? "" : "s"}`).join(", "),
      payload: rawPayload
    });
    records.slice(0, Math.max(0, records.length - MAX_TRIP_BACKUPS + 1))
      .forEach(record => store.delete(record.id));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  } catch {
    // A backup failure must never block the primary save.
  }
}

async function latestTripsBackup() {
  const database = await openTripsBackupDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(TRIPS_BACKUP_STORE, "readonly");
      const store = transaction.objectStore(TRIPS_BACKUP_STORE);
      const request = store.openCursor(null, "prev");
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
