"use strict";

// OpenFreeMap/MapLibre provider definitions. Runtime loading and semantic
// style application remain renderer responsibilities.

const MAPLIBRE_STYLES = [
  {
    id: "liberty",
    label: "Liberty",
    description: "Classic road map",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    swatch: ["#e8ddc2", "#7fb1ba"],
    contours: 0.24,
    blend: 0.32,
    colors: {
      background: "#e9ddc5",
      land: "#dfcfaa",
      water: "#83b7bd",
      park: "#93ad67",
      road: "#9f643c",
      boundary: "#9b6570",
      label: "#1f2a35",
      halo: "#fff7e5",
      topoLow: "#d3c99f",
      topoHigh: "#775634"
    }
  },
  {
    id: "positron",
    label: "Positron",
    description: "Clean light base",
    styleUrl: "https://tiles.openfreemap.org/styles/positron",
    swatch: ["#f1ead9", "#7aaec2"],
    contours: 0.2,
    blend: 0.38,
    colors: {
      background: "#f3eddc",
      land: "#eadfc6",
      water: "#86bdd1",
      park: "#a9c48a",
      road: "#a8794e",
      boundary: "#a88b8d",
      label: "#22303c",
      halo: "#fffdf7",
      topoLow: "#c4cf9e",
      topoHigh: "#7d6041"
    }
  },
  {
    id: "bright",
    label: "Bright",
    description: "Saturated atlas",
    styleUrl: "https://tiles.openfreemap.org/styles/bright",
    swatch: ["#e7f26f", "#55d0f2"],
    contours: 0.36,
    blend: 0.24,
    colors: {
      background: "#ecf7d6",
      land: "#dfe985",
      water: "#5fc9ea",
      park: "#77cf74",
      road: "#f29b4b",
      boundary: "#af78c2",
      label: "#111827",
      halo: "#ffffff",
      topoLow: "#bdf278",
      topoHigh: "#2c788a"
    }
  },
  {
    id: "dark",
    label: "Dark",
    description: "Muted night base",
    styleUrl: "https://tiles.openfreemap.org/styles/dark",
    swatch: ["#161f2c", "#6da4bf"],
    contours: 0.22,
    blend: 0.2,
    colors: {
      background: "#131c28",
      land: "#1b2532",
      water: "#315f74",
      park: "#264a3f",
      road: "#a9bacb",
      boundary: "#71879e",
      label: "#f4f8fc",
      halo: "#0b1118",
      topoLow: "#355144",
      topoHigh: "#b9c4cf"
    }
  },
  {
    id: "fiord",
    label: "Fiord",
    description: "Blue dark base",
    styleUrl: "https://tiles.openfreemap.org/styles/fiord",
    swatch: ["#183852", "#8cc7df"],
    contours: 0.32,
    blend: 0.18,
    colors: {
      background: "#132f45",
      land: "#1d4058",
      water: "#76b8d2",
      park: "#2c665f",
      road: "#e2f4f8",
      boundary: "#9dc8d9",
      label: "#ffffff",
      halo: "#092236",
      topoLow: "#4f8a81",
      topoHigh: "#d8edf4"
    }
  },
  {
    id: "parchment",
    label: "Parchment",
    description: "Warm paper map",
    styleUrl: "https://tiles.openfreemap.org/styles/positron",
    swatch: ["#f1dca5", "#91b4a5"],
    contours: 0.18,
    blend: 0.46,
    colors: {
      background: "#f3dfad",
      land: "#ecdbad",
      water: "#91b7bd",
      park: "#b7c78d",
      road: "#bd915d",
      boundary: "#b77784",
      label: "#2b3340",
      halo: "#fff4d7",
      topoLow: "#d8c98c",
      topoHigh: "#8a5f39"
    }
  },
  {
    id: "candy",
    label: "Candy",
    description: "Glossy pastel map",
    styleUrl: "https://tiles.openfreemap.org/styles/bright",
    swatch: ["#ff9ed8", "#7de3ff"],
    contours: 0.5,
    blend: 0.18,
    colors: {
      background: "#fff1fb",
      land: "#ffe3a8",
      water: "#7de3ff",
      park: "#9df28f",
      road: "#ff8f67",
      boundary: "#c47be0",
      label: "#172033",
      halo: "#ffffff",
      topoLow: "#a8f58c",
      topoHigh: "#ff6fc8"
    }
  },
  {
    id: "blueprint",
    label: "Blueprint",
    description: "Cool planning map",
    styleUrl: "https://tiles.openfreemap.org/styles/dark",
    swatch: ["#103a63", "#a9dcff"],
    contours: 0.58,
    blend: 0.16,
    colors: {
      background: "#0f2f50",
      land: "#17466f",
      water: "#4fb1df",
      park: "#2f6b76",
      road: "#e7f8ff",
      boundary: "#a7d2f2",
      label: "#f5fbff",
      halo: "#0c243d",
      topoLow: "#2f7191",
      topoHigh: "#d7f3ff"
    }
  },
  {
    id: "sage",
    label: "Sage",
    description: "Soft terrain tint",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    swatch: ["#d9e5bd", "#79936f"],
    contours: 0.4,
    blend: 0.34,
    colors: {
      background: "#e4e4c8",
      land: "#d8dfb9",
      water: "#86b4ad",
      park: "#8fa86d",
      road: "#b98e5c",
      boundary: "#9c8a74",
      label: "#263528",
      halo: "#f7f3db",
      topoLow: "#b9cf91",
      topoHigh: "#6e5f45"
    }
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm dusk map",
    styleUrl: "https://tiles.openfreemap.org/styles/fiord",
    swatch: ["#372132", "#f2aa5b"],
    contours: 0.28,
    blend: 0.2,
    colors: {
      background: "#2a1e2d",
      land: "#3b2935",
      water: "#365f70",
      park: "#4e6040",
      road: "#e19b57",
      boundary: "#b76f78",
      label: "#fff1dd",
      halo: "#221724",
      topoLow: "#6f6045",
      topoHigh: "#f2aa5b"
    }
  }
];
