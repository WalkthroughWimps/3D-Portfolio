"use strict";

// Provider style metadata only. Runtime renderer state and style application
// remain in the map renderer until that subsystem is extracted.

const STADIA_STYLES = [
  { id: "parchment", label: "Parchment", description: "Stamen Watercolor", tileStyle: "stamen_watercolor", swatch: ["#efe0b8", "#9db8a2"], filter: "sepia(0.22) saturate(0.92) contrast(0.98)", contours: 0.14, blend: 0.5 },
  { id: "pirate", label: "Pirate Map", description: "Watercolor, aged", tileStyle: "stamen_watercolor", swatch: ["#e2c27c", "#7d6a42"], filter: "sepia(0.7) saturate(0.78) contrast(1.16) brightness(0.94)", contours: 0.28, blend: 0.22 },
  { id: "plastic", label: "Plastic Toy", description: "Molded terrain, glossy", tileStyle: "stamen_terrain", swatch: ["#62e6ff", "#ffe044"], filter: "sepia(0.02) saturate(2.15) contrast(1.32) brightness(1.18) hue-rotate(8deg)", contours: 0.72, blend: 0.08 },
  { id: "storybook", label: "Storybook", description: "Terrain, warm", tileStyle: "stamen_terrain", swatch: ["#ded19c", "#95ad7a"], filter: "sepia(0.24) saturate(1.18) contrast(1.02)", contours: 0.34, blend: 0.36 },
  { id: "ink", label: "Ink", description: "Stamen Toner", tileStyle: "stamen_toner", swatch: ["#f4f0e6", "#242424"], filter: "sepia(0.08) contrast(0.96) brightness(1.08)", contours: 0.58, blend: 0.12 },
  { id: "outdoors", label: "Outdoors", description: "Stadia Outdoors", tileStyle: "outdoors", swatch: ["#dbe7bd", "#7ca46c"], filter: "saturate(1.03) contrast(0.98)", contours: 0.3, blend: 0.32 },
  { id: "smooth", label: "Smooth", description: "Alidade Smooth", tileStyle: "alidade_smooth", swatch: ["#edf0eb", "#a7b6bd"], filter: "saturate(0.88) contrast(0.98)", contours: 0.08, blend: 0.74 },
  { id: "night", label: "Night", description: "Alidade Dark", tileStyle: "alidade_smooth_dark", swatch: ["#15202b", "#536170"], filter: "saturate(0.94) contrast(1.02)", textColor: "#111827", textBg: "#ffffff", textBgOpacity: 0.78, contours: 0.2, blend: 0.28 },
  { id: "candy", label: "Candy Relief", description: "Glossy pastel terrain", tileStyle: "stamen_terrain", swatch: ["#ff9ee8", "#7de3ff"], filter: "sepia(0.01) saturate(2.35) contrast(1.22) brightness(1.2) hue-rotate(12deg)", contours: 0.62, blend: 0.12 },
  { id: "blueprint", label: "Blueprint", description: "Cool contour map", tileStyle: "stamen_toner", swatch: ["#d8f3ff", "#244e7a"], filter: "sepia(0.04) saturate(1.6) contrast(1.18) brightness(1.03) hue-rotate(18deg)", textColor: "#111827", textBg: "#ffffff", textBgOpacity: 0.82, contours: 0.72, blend: 0.1 },
  { id: "sage", label: "Sage Mold", description: "Soft pressed relief", tileStyle: "stamen_terrain", swatch: ["#dbe8c2", "#7a9b73"], filter: "sepia(0.18) saturate(0.92) contrast(1.08) brightness(1.05)", contours: 0.42, blend: 0.46 },
  { id: "sunset", label: "Sunset", description: "Warm toy atlas", tileStyle: "outdoors", swatch: ["#ffd37c", "#dd7a7a"], filter: "sepia(0.2) saturate(1.65) contrast(1.12) brightness(1.08) hue-rotate(-8deg)", contours: 0.28, blend: 0.26 }
];

const STADIA_ATTRIBUTION = '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

const STADIA_TILE_STYLE_OPTIONS = [
  { value: "stamen_watercolor", label: "Stamen Watercolor" },
  { value: "stamen_terrain", label: "Stamen Terrain" },
  { value: "stamen_toner", label: "Stamen Toner" },
  { value: "osm_bright", label: "OSM Bright" },
  { value: "outdoors", label: "Stadia Outdoors" },
  { value: "alidade_smooth", label: "Alidade Smooth" },
  { value: "alidade_smooth_dark", label: "Alidade Dark" },
  { value: "alidade_satellite", label: "Alidade Satellite" }
];

const UI_THEME_TEXTURES = {
  none: "none",
  paper: "radial-gradient(circle at 18% 12%, rgba(31,41,51,0.08), transparent 18%), radial-gradient(circle at 78% 68%, rgba(31,41,51,0.06), transparent 22%)",
  linen: "repeating-linear-gradient(0deg, rgba(31,41,51,0.07) 0 1px, transparent 1px 7px), repeating-linear-gradient(90deg, rgba(31,41,51,0.05) 0 1px, transparent 1px 9px)",
  grid: "linear-gradient(rgba(31,41,51,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(31,41,51,0.08) 1px, transparent 1px)"
};

const DEFAULT_UI_THEME = {
  panel: "#fffdf8",
  surface: "#f7f3eb",
  highlight: "#25313d",
  font: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  texture: "none",
  textureOpacity: 0,
  textureBlend: "multiply"
};

const ALL_THEME_TOGGLES = {
  land: true,
  water: true,
  deserts: true,
  texture: true,
  streets: true,
  faintStreets: true,
  topography: true,
  faintTopography: true,
  stateLines: true,
  faintStateLines: true,
  visitedStates: true,
  smallTowns: true,
  cities: true,
  capitols: true,
  route: true,
  faintRoute: true,
  startEnd: true,
  dayZoneFill: true,
  dayZoneStroke: true
};
