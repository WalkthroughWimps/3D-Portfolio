"use strict";

let tripSaveTimer = null;

function saveTrips() {
  try {
    const activeGroup = state.tripGroups?.[state.activeTripGroupIndex];
    if (activeGroup) {
      activeGroup.journeys = state.trips;
      activeGroup.activeJourneyIndex = state.activeTripIndex;
    }
    const payload = JSON.stringify({
      version: 3,
      itineraryRevision: state.itineraryRevision || "",
      activeTripGroupIndex: state.activeTripGroupIndex || 0,
      activeTripIndex: state.activeTripIndex,
      activeRouteIndex: state.activeRouteIndex,
      projectDefaults: normalizeProjectDefaults(state.projectDefaults),
      tripGroups: (state.tripGroups || []).map(group => ({
        id: group.id,
        name: group.name,
        activeJourneyIndex: group.activeJourneyIndex || 0,
        journeys: serializeTrips(group.journeys)
      }))
    });
    const previousPayload = rvStorageGet(TRIPS_STORAGE_KEY);
    if (previousPayload && previousPayload !== payload) rememberTripsBackup(previousPayload);
    if (!rvStorageSet(TRIPS_STORAGE_KEY, payload)) throw new Error("Journey storage is unavailable.");
    return true;
  } catch {
    setTripStatus("Trip changes are active, but this browser could not save them.", true);
    return false;
  }
}

function scheduleTripsSave() {
  clearTimeout(tripSaveTimer);
  tripSaveTimer = window.setTimeout(() => {
    tripSaveTimer = null;
    saveTrips();
  }, 260);
}

function flushScheduledTripsSave() {
  if (!tripSaveTimer) return false;
  clearTimeout(tripSaveTimer);
  tripSaveTimer = null;
  return saveTrips();
}

function restoreSavedTrips() {
  const rawSaved = rvStorageGet(TRIPS_STORAGE_KEY);
  if (!rawSaved) return { restored: false, error: null };
  try {
    applyTripsPayload(JSON.parse(rawSaved));
    return { restored: true, error: null };
  } catch (error) {
    rememberTripsBackup(rawSaved);
    return { restored: false, error };
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushScheduledTripsSave);
}
