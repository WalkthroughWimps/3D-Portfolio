"use strict";

// Project paths, persistence keys, service endpoints, and global limits.

const KML_PATH = "trips/Laverne to Colorado Springs Loop.kml";
const THEME_SETTINGS_MAP_PATH = "trips/settings/ThemeSettingsMap.gpx";
const DEFAULT_ROUTE_FILES = [
  { label: "Day 1", summary: "Edmond to Denver", path: "trips/testers/1.gpx", color: "#d9442e" },
  { label: "Day 2", summary: "Denver to Salt Lake City", path: "trips/testers/2.gpx", color: "#2f6fbb" },
  { label: "Day 3", summary: "Salt Lake City to Reno", path: "trips/testers/3.gpx", color: "#1f7a5c" }
];
const STATE_LINES_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";
const ROUTE_COLOR = "#d9442e";
const COMPLETED_ROUTE_COLOR = "#2777d8";
const UNVISITED_ROUTE_COLOR = "#d9442e";
const HOVER_ROUTE_COLOR = "#111111";
const HOVER_FAINT_ROUTE_COLOR = "#2f8f46";
const DEFAULT_ROUTE_DISPLAY_COLORS = Object.freeze({
  selected: HOVER_FAINT_ROUTE_COLOR,
  preceding: COMPLETED_ROUTE_COLOR,
  following: UNVISITED_ROUTE_COLOR,
  fill: HOVER_ROUTE_COLOR
});

const STYLE_PRESETS_KEY = "rv-map-style-presets";
const ROUTE_THEMES_KEY = "rv-map-route-themes";
const THEME_PRESETS_KEY = "rv-map-theme-presets-v1";
const THEME_PRESET_DEFAULT_KEY = "rv-map-theme-preset-default-v1";
const RECENT_COLORS_KEY = "rv-map-recent-colors";
const SAVED_COLORS_KEY = "rv-map-saved-colors";
const ROUTE_ANIMATION_ICON_RECENTS_KEY = "rv-map-route-animation-icon-recents";
const TOWN_MARKER_IMAGE_RECENTS_KEY = "rv-map-town-marker-image-recents";
const PANEL_SECTION_ORDER_KEY = "rv-map-panel-section-order";
const PANEL_SECTION_WORKFLOW_VERSION_KEY = "rv-map-panel-section-workflow-version";
const PANEL_SECTION_GROUPS_KEY = "rv-map-panel-section-groups";
const PANEL_SECTION_PIN_KEY = "rv-map-panel-section-pin";
const PANEL_SECTION_DIVIDERS_KEY = "rv-map-panel-section-dividers";
const PANEL_SECTION_COLOR_LOOP_KEY = "rv-map-panel-section-color-loop-v2";
const PANEL_SECTION_COLOR_WRAP_TABS_KEY = "rv-map-panel-section-color-wrap-tabs-v1";
const PINNED_SECTION_COLORS_KEY = "rv-map-pinned-section-colors-v1";
const PINNED_SECTION_VISIBILITY_KEY = "rv-map-pinned-section-visibility";
const PINNED_TOOLS_DETAILS_KEY = "rv-map-pinned-tools-details-open";
const PINNED_SECTION_SPEED_KEY = "rv-map-pinned-section-animation-speed";
const HELP_TOOLTIP_SETTINGS_KEY = "rv-map-help-tooltip-settings-v1";
const PANEL_TAB_SETTINGS_KEY = "rv-map-panel-tab-settings-v1";
const SITE_MODE_STORAGE_KEY = "rvMapSiteMode";
const USER_MATERIAL_STORAGE_KEY = "rvMapUserMaterial";
const LOCAL_ROAD_SOURCE_KEY = "rv-map-local-road-source";
const LANDMARK_DEFAULTS_KEY = "rv-map-landmark-default-settings";
const LANDMARK_DEFAULT_DIALOG_KEY = "rv-map-landmark-default-dialog";
const USERS_SHELL_LEATHER_COLOR_KEY = "rvMapUsersShellLeatherColor";
const USER_FRAME_GEOMETRY_KEY = "rvUserFrameGeometry";
const USER_LAYOUT_PRESETS_KEY = "rvUserLayoutPresets";
const USER_BUILDER_STATE_KEY = "rvUserBuilderState";
const USER_CONTROL_APPEARANCE_KEY = "rvUserControlAppearance";
const MEDIA_PRESENTATION_KEY = "rvMediaPresentationV1";
const TRIP_DAY_LIST_MODE_KEY = "rv-trip-day-list-mode";
const TRIP_STOP_LIST_MODE_KEY = "rv-trip-stop-list-mode";
const TOGGLE_PRESETS_KEY = "rv-map-toggle-presets";
const ROUTE_THEME_DRAFTS_KEY = "rvMapThemeDrafts";
const SFX_SETTINGS_KEY = "rv-map-sfx-settings-v1";
const MUSIC_SETTINGS_KEY = "rv-map-music-settings-v1";
const PUBLISH_CONFIG_STORAGE_KEY = "rv-map-publish-config-v1";
const TRIPS_STORAGE_KEY = "rv-map-trips-v1";
const TRIPS_BACKUP_DB_NAME = "rv-map-trip-backups";
const TRIPS_BACKUP_STORE = "backups";
const MAX_TRIP_BACKUPS = 10;
const USER_BUILDER_STATE_VERSION = 2;

const PROJECT_FILES_BASE_URL = "assets/files/";
const STYLE_EXPORT_NAME = "rv-map-styles.json";
const UI_SETTINGS_EXPORT_NAME = "rv-map-ui-settings.json";
const JOURNEYS_EXPORT_NAME = "rv-map-journeys.json";
const TEXTURE_MANIFEST_EXPORT_NAME = "rv-map-textures-manifest.json";
const ROAD_PACKAGE_MANIFEST_EXPORT_NAME = "rv-road-package-manifest.json";
const DEFAULT_STYLE_URL = `${PROJECT_FILES_BASE_URL}styles/${STYLE_EXPORT_NAME}`;
const DEFAULT_UI_SETTINGS_URL = `${PROJECT_FILES_BASE_URL}settings/${UI_SETTINGS_EXPORT_NAME}`;
const DEFAULT_JOURNEY_URLS = Object.freeze([
  "trips/rv-map-journeys.json",
  `${PROJECT_FILES_BASE_URL}journeys/rv-map-trips-generated.json`
]);
const ROAD_PACKAGE_BASE_URL = "roads_package/";
const LOCAL_ROAD_PACKAGE_MANIFEST_URL = `${ROAD_PACKAGE_BASE_URL}${ROAD_PACKAGE_MANIFEST_EXPORT_NAME}`;
const LOCAL_ROAD_PACKAGE_FILES = [
  "us-major-roads.pmtiles",
  "trip-corridor-roads.pmtiles",
  "us-major-roads.geojson",
  "trip-corridor-roads.geojson",
  "theme-settings-roads.geojson"
];
const LOCAL_ROAD_SOURCE_LAYERS = ["transportation", "roads", "road"];

const DISPLAY_POSITIONS_VERSION = 2;
const DISPLAY_NUDGE_STEP_PX = 4;
const DISPLAY_NUDGE_FAST_MULTIPLIER = 5;
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const WIKIMEDIA_COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const ROUTE_WAYPOINT_SNAP_METERS = 140;
const OVERPASS_ENDPOINTS = Object.freeze([
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass-api.de/api/interpreter"
]);
const OVERVIEW_FIT_PADDING = [128, 104];
const ROUTE_FIT_DURATION = 1.2;
const VIEW_PRELOAD_TIMEOUT = 1800;
const MAPLIBRE_PRELOAD_REQUEST_LIMIT = 72;
const MAPLIBRE_PRELOAD_CORRIDOR_STEPS = 4;
const ROAD_FADE_MIN_ZOOM = 4.1;
const ROAD_FADE_MAX_ZOOM = 5.9;
