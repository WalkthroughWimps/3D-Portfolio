"use strict";

// Static metadata for controls that can be exposed in the user-facing layout.
// Live DOM access and side effects belong to runtime adapters in the app.

const EXPLICIT_USER_CONTROL_CATALOG = Object.freeze([
  Object.freeze({ id: "route.animateHovered", label: "Animate hovered routes", userLabel: "Animate routes", tab: "Route Display", section: "Routes", controlType: "checkbox", exportKey: "controls.animateOverviewRoutes", defaultValue: true, userSafe: true, userGroup: "Playback", userPanel: "bottom" }),
  Object.freeze({ id: "route.animationTime", label: "Animation time", userLabel: "Animation time", tab: "Route Display", section: "Routes", controlType: "range", exportKey: "controls.overviewRouteAnimationTime", defaultValue: 0.6, userSafe: true, userGroup: "Playback", userPanel: "bottom" }),
  Object.freeze({ id: "route.zoomedDaySpeed", label: "Zoomed day animation speed", userLabel: "Route speed", tab: "Route Display", section: "Routes", controlType: "range", exportKey: "controls.playbackSpeed", defaultValue: 1, userSafe: true, userGroup: "Playback", userPanel: "bottom" }),
  Object.freeze({ id: "route.selectedColor", label: "Selected route color", userLabel: "Selected route color", tab: "Route Display", section: "Routes", controlType: "color", exportKey: "controls.routeDisplayColors.selected", defaultValue: DEFAULT_ROUTE_DISPLAY_COLORS.selected, userSafe: true, userGroup: "Route colors", userPanel: "bottom" }),
  Object.freeze({ id: "route.precedingColor", label: "Preceding route color", userLabel: "Previous route color", tab: "Route Display", section: "Routes", controlType: "color", exportKey: "controls.routeDisplayColors.preceding", defaultValue: DEFAULT_ROUTE_DISPLAY_COLORS.preceding, userSafe: true, userGroup: "Route colors", userPanel: "bottom" }),
  Object.freeze({ id: "route.followingColor", label: "Following route color", userLabel: "Next route color", tab: "Route Display", section: "Routes", controlType: "color", exportKey: "controls.routeDisplayColors.following", defaultValue: DEFAULT_ROUTE_DISPLAY_COLORS.following, userSafe: true, userGroup: "Route colors", userPanel: "bottom" }),
  Object.freeze({ id: "route.fillColor", label: "Route fill color", userLabel: "Route fill color", tab: "Route Display", section: "Routes", controlType: "color", exportKey: "controls.routeDisplayColors.fill", defaultValue: DEFAULT_ROUTE_DISPLAY_COLORS.fill, userSafe: true, userGroup: "Route colors", userPanel: "bottom" }),
  Object.freeze({ id: "marker.imageDisplay", label: "Marker image display", userLabel: "Marker image display", tab: "Route Display", section: "Start / End Markers", controlType: "select", exportKey: "markerSettings.imageDisplay", defaultValue: "before", userSafe: true, userGroup: "Markers", userPanel: "bottom" }),
  Object.freeze({ id: "landmark.enabled", label: "Show landmarks", userLabel: "Show landmarks", tab: "Journeys", section: "Landmarks", controlType: "checkbox", exportKey: "landmarkSettings.enabled", defaultValue: false, userSafe: true, userGroup: "Landmarks", userPanel: "bottom" }),
  Object.freeze({ id: "landmark.imageDisplay", label: "Landmark image display", userLabel: "Landmark image display", tab: "Journeys", section: "Landmarks", controlType: "select", exportKey: "landmarkSettings.imageDisplay", defaultValue: DEFAULT_LANDMARK_SETTINGS.imageDisplay, userSafe: true, userGroup: "Landmarks", userPanel: "bottom" }),
  Object.freeze({ id: "dayStats.showGps", label: "Show GPS coordinates", userLabel: "Show GPS coordinates", tab: "Route Display", section: "Day", controlType: "checkbox", exportKey: "ui.dayStats.showGps", defaultValue: false, userSafe: true, userGroup: "Day stats", userPanel: "bottom" })
]);

const EXPLICIT_USER_CONTROL_IDS = new Set(EXPLICIT_USER_CONTROL_CATALOG.map(control => control.id));
