"use strict";

// Immutable editor defaults and option catalogs shared across map, journey,
// marker, route-animation, and Users controls.

const DEFAULT_ZONE_SETTINGS = Object.freeze({
  displayType: "rectangle",
  size: 34,
  shape: "rect",
  routeSize: 22,
  routeOffset: 0,
  verticalSize: 1,
  horizontalSize: 1,
  verticalOffset: 0,
  horizontalOffset: 0
});
const ZONE_SHAPES = new Set(["rect", "rounded", "ellipse", "diamond", "route-hull"]);
const ZONE_DISPLAY_TYPES = new Set(["rectangle", "route"]);
const MARKER_SHAPES = new Set(["circle", "pin", "square", "diamond", "star", "heart", "triangle", "hexagon", "octagon", "cross", "shield", "capsule"]);
const MARKER_SIZE_SLIDER_MAX = 100;
const MARKER_SIZE_INTERNAL_MAX = 2.5;
const LANDMARK_SIZE_INTERNAL_MAX = MARKER_SIZE_INTERNAL_MAX * 4;
const LANDMARK_RENDER_SIZE_INTERNAL_MAX = LANDMARK_SIZE_INTERNAL_MAX * 4;
const IMAGE_SIZE_SLIDER_MAX = 200;
const DEFAULT_MARKER_SETTINGS = Object.freeze({
  shape: "circle",
  size: 1,
  imageUrl: "",
  imageName: "",
  imageDisplay: "before",
  imageSize: 56,
  shapeSize: 100,
  fillEnabled: true,
  fillColor: "#111827",
  strokes: Object.freeze([
    Object.freeze({ id: "stroke-inner", color: "#fffdf8", size: 1 })
  ]),
  imageStrokes: Object.freeze([])
});
const DEFAULT_LANDMARK_IMAGE_URL = "assets/landmarks/Fredonia, AZ.png";
const LANDMARK_IMAGE_EXTENSIONS = Object.freeze(["png", "jpg", "jpeg", "webp"]);
const DEFAULT_LANDMARK_SETTINGS = Object.freeze({
  enabled: true,
  imageDisplay: "always",
  perStopShapes: false,
  useDefaultForAll: false,
  scale: 1,
  marker: Object.freeze({
    ...DEFAULT_MARKER_SETTINGS,
    size: 5,
    imageUrl: "assets/landmarks/Edmond, OK.png",
    imageName: "Edmond, OK.png",
    imageDisplay: "always",
    imageSize: 220,
    shapeSize: 100,
    shapeEnabled: false,
    fillColor: "#d9442e",
    strokes: Object.freeze([
      Object.freeze({ id: "landmark-shape-stroke", color: "#fffdf8", size: 2 })
    ]),
    imageStrokes: Object.freeze([
      Object.freeze({ id: "landmark-image-stroke-light", color: "#ffffff", size: 2 }),
      Object.freeze({ id: "landmark-image-stroke-dark", color: "#25313d", size: 1 })
    ])
  }),
  stops: Object.freeze({})
});
const DEFAULT_ROUTE_ANIMATION_ICON = Object.freeze({
  enabled: true,
  hideAtTown: "none",
  imageUrl: "assets/icons/truck and RV.png",
  imageName: "truck and RV.png",
  size: 100,
  imageSize: 220,
  backgroundEnabled: false,
  backgroundShape: "circle",
  backgroundSize: 100,
  fillEnabled: true,
  fillMode: "shape",
  backgroundFill: "#d9442e",
  strokes: Object.freeze([
    Object.freeze({ id: "route-icon-stroke-inner", color: "#fffdf8", size: 2 })
  ]),
  imageStrokes: Object.freeze([
    Object.freeze({ id: "route-icon-image-stroke-light", color: "#ffffff", size: 2 }),
    Object.freeze({ id: "route-icon-image-stroke-red", color: "#9f2d1e", size: 1 })
  ])
});
const MAX_ROUTE_ANIMATION_ICON_RECENTS = 8;
const ROUTE_ANIMATION_ICON_MAX_SOURCE_PX = 256;
const ROUTE_ANIMATION_REFERENCE_PATH_PX = 500;
const ROUTE_ANIMATION_MIN_DURATION = 0.12;
const ROUTE_ANIMATION_MAX_DURATION = 8;
const ROUTE_ANIMATION_IMAGE_SIZE_MAX = 440;
const ROUTE_ANIMATION_SHAPE_SIZE_MAX = 140;
const ROUTE_ANIMATION_HIDE_TARGETS = new Set(["none", "marker", "landmark", "both"]);
const DEFAULT_DAY_NAME_PATTERN = "day {day#}";
const DEFAULT_TERMINOLOGY = Object.freeze({
  trip: "Trip",
  journey: "Journey",
  day: "Day",
  stop: "Stop",
  route: "Route",
  waypoint: "Waypoint",
  media: "Media",
  sticker: "Sticker"
});
const DEFAULT_JOURNEY_STYLE = Object.freeze({
  routeColor: "#d1495b",
  usRouteWidth: 6,
  outlineColor: "#fffdf8",
  outlineWidth: 4,
  outlineOpacity: 0.9,
  routeLabelVisibility: "hover",
  routeLabelContent: "all",
  usFeatures: Object.freeze({
    route: true,
    labels: true,
    landmarks: false,
    stopMarkers: false,
    mediaPins: false,
    stickers: true
  })
});
const DEFAULT_STICKER_VISIBILITY = "reached";
const STICKER_VISIBILITY_OPTIONS = Object.freeze(["always", "never", "reached", "before", "hover"]);
const EXTRA_STICKER_EMOJIS = Object.freeze([
  ["rv", "RV", "🚐"], ["tent", "Tent", "⛺"], ["hiking", "Hiking", "🥾"], ["kayak", "Kayak", "🛶"],
  ["sun", "Sunny", "☀️"], ["rain", "Rain", "🌧️"], ["snow", "Snow", "❄️"], ["storm", "Storm", "⛈️"],
  ["paw", "Wildlife", "🐾"], ["bear", "Bear", "🐻"], ["deer", "Deer", "🦌"], ["bird", "Bird", "🦅"],
  ["fox", "Fox", "🦊"], ["owl", "Owl", "🦉"], ["butterfly", "Butterfly", "🦋"], ["fish", "Fish", "🐟"],
  ["moose", "Moose", "🫎"], ["bison", "Bison", "🦬"], ["raccoon", "Raccoon", "🦝"], ["wolf", "Wolf", "🐺"],
  ["beaver", "Beaver", "🦫"], ["turtle", "Turtle", "🐢"], ["yeti", "Yeti tracks", "👣"], ["dragon", "Dragon", "🐉"],
  ["wind", "Windy", "💨"], ["cloud", "Cloudy", "☁️"], ["rainbow", "Rainbow", "🌈"], ["tornado", "Tornado", "🌪️"],
  ["climb", "Climbing", "🧗"], ["swim", "Swimming", "🏊"], ["ski", "Skiing", "⛷️"], ["stargaze", "Stargazing", "🔭"],
  ["food", "Food", "🍔"], ["beer", "Brewery", "🍺"], ["wine", "Wine", "🍷"], ["market", "Market", "🛒"],
  ["hospital", "Hospital", "🏥"], ["fuel", "Fuel", "⛽"], ["repair", "Repair", "🛠️"], ["parking", "Parking", "🅿️"],
  ["photo", "Photo", "📷"], ["art", "Art", "🎨"], ["book", "Books", "📚"], ["star", "Favorite", "⭐"],
  ["beach", "Beach", "🏖️"], ["mountain", "Peak", "🏔️"], ["bridge", "Bridge", "🌉"], ["city", "City", "🏙️"],
  ["home", "Home", "🏠"], ["fire", "Firewood", "🪵"], ["bike", "Biking", "🚲"], ["balloon", "Balloon", "🎈"]
]);
function stickerEmojiUrl(emoji) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><text x="48" y="69" text-anchor="middle" font-size="62">${emoji}</text></svg>`)}`;
}
const DEFAULT_STICKER_LIBRARY = Object.freeze([
  // NULL is a timeline/media cue, not a visible decorative graphic.
  Object.freeze({ id: "null-cue", label: "NULL cue", objectClass: "null", category: "random" }),
  Object.freeze({ id: "evergreen", label: "Evergreen", url: "assets/stickers/evergreen.svg", category: "nature" }),
  Object.freeze({ id: "mountains", label: "Mountains", url: "assets/stickers/mountains.svg", category: "nature" }),
  Object.freeze({ id: "campfire", label: "Campfire", url: "assets/stickers/campfire.svg", category: "activity" }),
  Object.freeze({ id: "binoculars", label: "Binoculars", url: "assets/stickers/binoculars.svg", category: "activity" }),
  Object.freeze({ id: "coffee", label: "Coffee stop", url: "assets/stickers/coffee.svg", category: "places" }),
  Object.freeze({ id: "sasquatch", label: "Sasquatch", url: "assets/stickers/sasquatch.svg", category: "animals" }),
  Object.freeze({ id: "camper", label: "Camper", url: "assets/stickers/camper.svg", category: "places" }),
  Object.freeze({ id: "compass", label: "Compass", url: "assets/stickers/compass.svg", category: "activity" }),
  Object.freeze({ id: "camera", label: "Camera", url: "assets/stickers/camera.svg", category: "activity" }),
  Object.freeze({ id: "picnic", label: "Picnic", url: "assets/stickers/picnic.svg", category: "activity" }),
  Object.freeze({ id: "fishing", label: "Fishing", url: "assets/stickers/fishing.svg", category: "activity" }),
  Object.freeze({ id: "wildflower", label: "Wildflower", url: "assets/stickers/wildflower.svg", category: "nature" }),
  Object.freeze({ id: "lighthouse", label: "Lighthouse", url: "assets/stickers/lighthouse.svg", category: "places" }),
  Object.freeze({ id: "cactus", label: "Cactus", url: "assets/stickers/cactus.svg", category: "nature" }),
  Object.freeze({ id: "heart", label: "Favorite place", url: "assets/stickers/heart.svg", category: "random" }),
  Object.freeze({ id: "music", label: "Live music", url: "assets/stickers/music.svg", category: "activity" }),
  // Shape objects start empty: their color, content, style slot, and stroke
  // stacks are set in Stickers FX after they are placed on the map.
  Object.freeze({ id: "round-shape", label: "Round", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "round", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "square-shape", label: "Square", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "square", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "teardrop-shape", label: "Teardrop", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "teardrop", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "arrow-shape", label: "Arrow", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "arrow", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "heart-shape", label: "Heart", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "heart", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "plus-shape", label: "Plus", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "plus", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "speech-shape", label: "Speech bubble", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "speech", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "note-shape", label: "Note", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "note", variant: "down-middle", color: "#f6df70", noteText: "" } }),
  Object.freeze({ id: "diamond-shape", label: "Diamond", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "diamond", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "hexagon-shape", label: "Hexagon", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "hexagon", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "octagon-shape", label: "Octagon", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "octagon", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "star-shape", label: "Star", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "star", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "notched-square-shape", label: "Notched square", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "notched-square", variant: "down-middle", color: "#2f6f55" } }),
  Object.freeze({ id: "capsule-shape", label: "Capsule", objectClass: "pin", category: "shapes", pin: { style: "blank", shape: "capsule", variant: "down-middle", color: "#2f6f55" } }),
  ...EXTRA_STICKER_EMOJIS.map(([id, label, emoji]) => Object.freeze({ id, label, url: stickerEmojiUrl(emoji), category: ({ sun: "weather", rain: "weather", snow: "weather", storm: "weather", wind: "weather", cloud: "weather", rainbow: "weather", tornado: "weather", paw: "animals", bear: "animals", deer: "animals", bird: "animals", fox: "animals", owl: "animals", butterfly: "animals", fish: "animals", moose: "animals", bison: "animals", raccoon: "animals", wolf: "animals", beaver: "animals", turtle: "animals", yeti: "animals", dragon: "animals", hiking: "activity", kayak: "activity", bike: "activity", climb: "activity", swim: "activity", ski: "activity", stargaze: "activity", tent: "places", rv: "places", food: "places", beer: "places", wine: "places", market: "places", hospital: "places", fuel: "places", repair: "places", parking: "places", photo: "random", art: "random", book: "random", star: "random", beach: "nature", mountain: "nature", bridge: "places", city: "places", home: "places", fire: "nature", balloon: "random" })[id] || "random" }))
]);
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const OVERVIEW_ZONE_COLOR = "#25313d";
const OVERVIEW_ZONE_MUTED = "#8a929b";
const STREET_DETAIL_SWITCH_ZOOM = 7;
const STREET_DETAIL_ZOOMED_OUT = "highways";
const STREET_DETAIL_ZOOMED_IN = "arterials";
const STREET_DETAIL_OPTIONS = [
  { value: "none", label: "None", classes: [] },
  { value: "interstates", label: "Interstates only", classes: ["motorway"] },
  { value: "highways", label: "Highways", classes: ["motorway", "trunk"] },
  { value: "primary", label: "Primary roads", classes: ["motorway", "trunk", "primary"] },
  { value: "arterials", label: "Arterials", classes: ["motorway", "trunk", "primary", "secondary"] }
];
const OSM_ROAD_CLASS_ORDER = ["motorway", "trunk", "primary", "secondary"];
const OSM_CITY_POPULATION_MIN = 200000;
const OSM_TOWN_POPULATION_MIN = 50000;
const OSM_PLACE_FETCH_DELAY = 420;
const OSM_PLACE_CACHE_LIMIT = 18;
const ENABLE_OVERPASS_PLACE_LABELS = false;
const ENABLE_WEBGL_ROAD_RENDERER = true;
const ENABLE_LIVE_OSM_ROADS = true;
const LIVE_OSM_ROAD_MIN_ZOOM = 4.2;
const LIVE_OSM_ROAD_ENDPOINT_TIMEOUT = 6500;

const MAP_TEXT_TYPEFACES = [
  { value: "noto-sans", label: "Noto Sans", css: '"Noto Sans", "Segoe UI", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "open-sans", label: "Open Sans", css: '"Open Sans", "Segoe UI", Arial, sans-serif', vector: ["Open Sans Regular", "Noto Sans Regular"] },
  { value: "source-sans", label: "Source Sans 3", css: '"Source Sans 3", "Segoe UI", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "segoe-ui", label: "Segoe UI", css: '"Segoe UI", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif", vector: ["Noto Sans Regular"] },
  { value: "trebuchet", label: "Trebuchet MS", css: '"Trebuchet MS", "Segoe UI", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "georgia", label: "Georgia Serif", css: 'Georgia, "Times New Roman", serif', vector: ["Noto Sans Regular"] },
  { value: "garamond", label: "Garamond", css: 'Garamond, "EB Garamond", Georgia, serif', vector: ["Noto Sans Regular"] },
  { value: "palatino", label: "Palatino", css: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif', vector: ["Noto Sans Regular"] },
  { value: "cambria", label: "Cambria", css: "Cambria, Georgia, serif", vector: ["Noto Sans Regular"] },
  { value: "rockwell", label: "Rockwell Slab", css: 'Rockwell, "Roboto Slab", Georgia, serif', vector: ["Noto Sans Regular"] },
  { value: "arial-narrow", label: "Arial Narrow", css: '"Arial Narrow", "Roboto Condensed", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "franklin", label: "Franklin Gothic", css: '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "century-gothic", label: "Century Gothic", css: '"Century Gothic", "Avenir Next", Arial, sans-serif', vector: ["Noto Sans Regular"] },
  { value: "arial-black", label: "Arial Black", css: '"Arial Black", Impact, sans-serif', vector: ["Noto Sans Bold", "Noto Sans Regular"] },
  { value: "impact", label: "Impact", css: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', vector: ["Noto Sans Bold", "Noto Sans Regular"] },
  { value: "monospace", label: "Mono", css: '"Roboto Mono", Consolas, monospace', vector: ["Noto Sans Regular"] },
  { value: "courier", label: "Courier New", css: '"Courier New", Courier, monospace', vector: ["Noto Sans Regular"] }
];

const USER_MATERIALS = Object.freeze([
  { id: "leather", label: "Leather", color: "#6b3f2a", opacity: 0.52, blend: "multiply" },
  { id: "wood", label: "Wood", color: "#75502d", opacity: 0.5, blend: "multiply" },
  { id: "metal", label: "Metal", color: "#56616d", opacity: 0.28, blend: "screen" },
  { id: "plastic", label: "Plastic", color: "#263f66", opacity: 0.34, blend: "multiply" }
]);
