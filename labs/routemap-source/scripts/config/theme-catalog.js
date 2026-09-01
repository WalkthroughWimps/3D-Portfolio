"use strict";

// Built-in themes are normalized once at startup and remain mutable copies at
// runtime so the editor can derive and save custom themes from them.
const ROUTE_THEME_PRESETS = {
  "watercolor-parchment": {"label":"Custom Atlas","description":"Current saved theme","uiTheme":{"panel":"#fffaf0","surface":"#f4ead6","highlight":"#24313f","font":"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif","texture":"paper","textureOpacity":0.16,"textureBlend":"multiply"},"toggles":{"land":true,"water":true,"texture":true,"streets":false,"faintStreets":true,"topography":true,"faintTopography":false,"stateLines":true,"faintStateLines":false,"smallTowns":false,"cities":true,"capitols":true,"route":true,"faintRoute":true,"startEnd":true},"styles":{"land":{"color":"#ba9921","size":1,"texture":{"type":"natural-paper","opacity":1,"blend":"overlay","blendAmount":1,"scale":3,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"water":{"color":"#2fabc1","size":1,"texture":{"type":"washi","opacity":1,"blend":"soft-light","blendAmount":1,"scale":0.45,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"texture":{"color":"#a87c52","size":0.72,"texture":{"type":"natural-paper","opacity":0.12,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"stateLines":{"color":"#b9708b","size":1.15,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"faintStateLines":{"color":"#c99bae","size":0.8,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"route":{"color":"#2b8fc4","size":5.25,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"faintRoute":{"color":"#9eb08e","size":4.2,"texture":{"type":"natural-paper","opacity":0.04,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"startEnd":{"color":"#a83b2d","size":6.5,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"smallTowns":{"color":"#59686d","size":10,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"cities":{"color":"#1d3549","size":12.5,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}},"capitols":{"color":"#8e2f26","size":12.5,"texture":{"type":"natural-paper","opacity":0.14,"blend":"multiply","blendAmount":0.9,"scale":1,"secondaryEnabled":false,"secondaryType":"vintage-speckles","secondaryOpacity":0.07,"secondaryBlend":"multiply"}}},"texture":{"landA":"186 153 33","opacity":0.72,"waterB":"47 171 193","waterA":"47 171 193","className":"route-theme-watercolor","landB":"168 124 82"}}
};

Object.assign(ROUTE_THEME_PRESETS, {
  "stadia-parchment": {
    label: "Parchment",
    description: "Stadia watercolor feel",
    uiTheme: { panel: "#fffaf0", surface: "#f3ead6", highlight: "#26313d", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.14, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: false, faintStreets: true, topography: true, faintTopography: false, stateLines: true, faintStateLines: false, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: {
      land: { color: "#e7cf93", size: 1, texture: { type: "natural-paper", opacity: 0.58, blend: "multiply", blendAmount: 0.85, scale: 2.35, secondaryEnabled: true, secondaryType: "light-paper-fibers", secondaryOpacity: 0.1, secondaryBlend: "multiply" } },
      water: { color: "#7fb6bd", size: 1, texture: { type: "washi", opacity: 0.4, blend: "soft-light", blendAmount: 0.75, scale: 0.8, secondaryEnabled: false, secondaryType: "vintage-speckles", secondaryOpacity: 0.05, secondaryBlend: "multiply" } },
      texture: { color: "#9a734a", size: 0.5, texture: { type: "natural-paper", opacity: 0.1, blend: "multiply", blendAmount: 0.8, scale: 1.2, secondaryEnabled: false, secondaryType: "vintage-speckles", secondaryOpacity: 0.05, secondaryBlend: "multiply" } },
      stateLines: { color: "#b7768c", size: 1.1 }, faintStateLines: { color: "#c99bae", size: 0.75 },
      route: { color: "#2b8fc4", size: 5.2 }, faintRoute: { color: "#8fa188", size: 4.1 }, startEnd: { color: "#a83b2d", size: 7.2 },
      smallTowns: { color: "#59686d", size: 10 }, cities: { color: "#21384c", size: 12.5 }, capitols: { color: "#8e2f26", size: 12.5 }
    },
    texture: { className: "route-theme-watercolor", opacity: 0.5, landA: "231 207 147", landB: "154 115 74", waterA: "127 182 189", waterB: "69 139 158" }
  },
  "stadia-pirate": {
    label: "Pirate Map",
    description: "Aged sepia paper",
    uiTheme: { panel: "#fbf0d8", surface: "#ecd8ae", highlight: "#3b2e23", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.22, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: false, faintStreets: true, topography: true, faintTopography: false, stateLines: true, faintStateLines: false, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: {
      land: { color: "#c99f55", size: 1, texture: { type: "textured-paper", opacity: 0.62, blend: "multiply", blendAmount: 0.9, scale: 2.6, secondaryEnabled: true, secondaryType: "vintage-speckles", secondaryOpacity: 0.08, secondaryBlend: "multiply" } },
      water: { color: "#6f8d7d", size: 1, texture: { type: "washi", opacity: 0.45, blend: "multiply", blendAmount: 0.7, scale: 0.75, secondaryEnabled: false, secondaryType: "retina-dust", secondaryOpacity: 0.06, secondaryBlend: "multiply" } },
      texture: { color: "#6f4e2c", size: 0.64 }, stateLines: { color: "#9f6470", size: 1.1 }, faintStateLines: { color: "#b48b82", size: 0.8 },
      route: { color: "#7b5131", size: 5.4 }, faintRoute: { color: "#846b43", size: 4 }, startEnd: { color: "#743424", size: 7.4 },
      smallTowns: { color: "#5f5545", size: 10 }, cities: { color: "#3b3027", size: 12.5 }, capitols: { color: "#743424", size: 12.5 }
    },
    texture: { className: "route-theme-watercolor", opacity: 0.62, landA: "201 159 85", landB: "111 78 44", waterA: "111 141 125", waterB: "83 108 96" }
  },
  "stadia-storybook": {
    label: "Storybook",
    description: "Warm terrain paper",
    uiTheme: { panel: "#fbf7e9", surface: "#ece4cb", highlight: "#33402f", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.12, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: false, faintStreets: true, topography: true, faintTopography: false, stateLines: true, faintStateLines: false, smallTowns: true, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: {
      land: { color: "#d9cf9a", size: 1, texture: { type: "light-paper-fibers", opacity: 0.44, blend: "multiply", blendAmount: 0.75, scale: 2, secondaryEnabled: true, secondaryType: "tactile-noise-light", secondaryOpacity: 0.06, secondaryBlend: "multiply" } },
      water: { color: "#91b4a5", size: 1, texture: { type: "natural-paper", opacity: 0.28, blend: "soft-light", blendAmount: 0.7, scale: 0.9, secondaryEnabled: false, secondaryType: "subtle-freckles", secondaryOpacity: 0.05, secondaryBlend: "multiply" } },
      texture: { color: "#7a8f62", size: 0.48 }, stateLines: { color: "#a98975", size: 1 }, faintStateLines: { color: "#bea994", size: 0.75 },
      route: { color: "#427aa1", size: 5.2 }, faintRoute: { color: "#85966f", size: 4 }, startEnd: { color: "#8d4932", size: 7 },
      smallTowns: { color: "#66715c", size: 10 }, cities: { color: "#283c34", size: 12.5 }, capitols: { color: "#8d4932", size: 12.5 }
    },
    texture: { className: "route-theme-watercolor", opacity: 0.46, landA: "217 207 154", landB: "122 143 98", waterA: "145 180 165", waterB: "99 145 141" }
  },
  "stadia-ink": {
    label: "Ink",
    description: "Toner print wash",
    uiTheme: { panel: "#f7f4eb", surface: "#e8e3d5", highlight: "#242424", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.08, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: false, faintStreets: true, topography: false, faintTopography: true, stateLines: true, faintStateLines: false, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: {
      land: { color: "#e9e4d6", size: 1, texture: { type: "paper", opacity: 0.28, blend: "multiply", blendAmount: 0.7, scale: 1.6, secondaryEnabled: true, secondaryType: "retina-dust", secondaryOpacity: 0.05, secondaryBlend: "multiply" } },
      water: { color: "#a8bcc0", size: 1, texture: { type: "paper", opacity: 0.2, blend: "multiply", blendAmount: 0.55, scale: 1, secondaryEnabled: false, secondaryType: "retina-dust", secondaryOpacity: 0.04, secondaryBlend: "multiply" } },
      texture: { color: "#333333", size: 0.22 }, stateLines: { color: "#5e5a55", size: 0.9 }, faintStateLines: { color: "#8d8982", size: 0.65 },
      route: { color: "#252525", size: 4.8 }, faintRoute: { color: "#7a7a70", size: 3.4 }, startEnd: { color: "#262626", size: 6.6 },
      smallTowns: { color: "#5c5c58", size: 9.5 }, cities: { color: "#252525", size: 12 }, capitols: { color: "#252525", size: 12 }
    },
    texture: { className: "route-theme-watercolor", opacity: 0.18, landA: "233 228 214", landB: "72 72 72", waterA: "168 188 192", waterB: "118 136 140" }
  },
  "stadia-plastic": {
    label: "Plastic Toy",
    description: "Bright molded atlas",
    uiTheme: { panel: "#fff9df", surface: "#f4edc6", highlight: "#203447", font: DEFAULT_UI_THEME.font, texture: "none", textureOpacity: 0, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: false, faintStreets: true, topography: true, faintTopography: false, stateLines: true, faintStateLines: false, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: {
      land: { color: "#dfe974", size: 1, texture: { type: "white-paperboard", opacity: 0.12, blend: "soft-light", blendAmount: 0.45, scale: 1.5, secondaryEnabled: false, secondaryType: "tactile-noise-light", secondaryOpacity: 0.04, secondaryBlend: "multiply" } },
      water: { color: "#55d8f2", size: 1, texture: { type: "white-paperboard", opacity: 0.1, blend: "soft-light", blendAmount: 0.5, scale: 0.8, secondaryEnabled: false, secondaryType: "subtle-freckles", secondaryOpacity: 0.04, secondaryBlend: "multiply" } },
      texture: { color: "#f0d43b", size: 0.18 }, stateLines: { color: "#af78c2", size: 1.3 }, faintStateLines: { color: "#caa1d5", size: 0.8 },
      route: { color: "#ff7b3d", size: 5.8 }, faintRoute: { color: "#79a653", size: 4.4 }, startEnd: { color: "#d93f2e", size: 8 },
      smallTowns: { color: "#245b6a", size: 10 }, cities: { color: "#172033", size: 12.8 }, capitols: { color: "#b22828", size: 12.8 }
    },
    texture: { className: "route-theme-watercolor", opacity: 0.18, landA: "223 233 116", landB: "240 212 59", waterA: "85 216 242", waterB: "45 173 210" }
  },
  "stadia-night": {
    label: "Night",
    description: "Muted dark road map",
    uiTheme: { panel: "#202733", surface: "#2a3341", highlight: "#f3e6c8", font: DEFAULT_UI_THEME.font, texture: "none", textureOpacity: 0, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: false, faintStreets: true, topography: true, faintTopography: false, stateLines: true, faintStateLines: false, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: {
      land: { color: "#1b2532", size: 1, texture: { type: "retina-dust", opacity: 0.18, blend: "soft-light", blendAmount: 0.55, scale: 1.7, secondaryEnabled: false, secondaryType: "subtle-freckles", secondaryOpacity: 0.04, secondaryBlend: "soft-light" } },
      water: { color: "#315f74", size: 1, texture: { type: "retina-dust", opacity: 0.16, blend: "soft-light", blendAmount: 0.5, scale: 1, secondaryEnabled: false, secondaryType: "subtle-freckles", secondaryOpacity: 0.04, secondaryBlend: "soft-light" } },
      texture: { color: "#536170", size: 0.2 }, stateLines: { color: "#677b91", size: 1 }, faintStateLines: { color: "#4d6277", size: 0.7 },
      route: { color: "#f2b75e", size: 5.2 }, faintRoute: { color: "#7d8c76", size: 3.8 }, startEnd: { color: "#ff775e", size: 7 },
      smallTowns: { color: "#c5d0d8", size: 10 }, cities: { color: "#e8eef4", size: 12.5 }, capitols: { color: "#ffb08d", size: 12.5 }
    },
    texture: { className: "route-theme-watercolor", opacity: 0.16, landA: "27 37 50", landB: "83 97 112", waterA: "49 95 116", waterB: "81 132 154" }
  }
});

Object.assign(ROUTE_THEME_PRESETS, {
  "road-atlas": {
    label: "Road Atlas",
    description: "Clean printed highway atlas",
    uiTheme: { panel: "#fbf6e8", surface: "#eee3c8", highlight: "#23384c", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.1, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: true, faintStreets: false, topography: true, faintTopography: false, stateLines: true, faintStateLines: true, smallTowns: true, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("light-paper-fibers", 0.34, "multiply", 2.1, "subtle-freckles", 0.04) },
      water: { texture: themeLayerTexture("paper", 0.18, "screen", 1.2) },
      texture: { size: 0.22, texture: themeLayerTexture("cream-paper", 0.1, "multiply", 1.35) },
      route: { size: 5.8 },
      faintRoute: { size: 3.8 },
      streets: { size: 0.86 }
    }, {
      land: "#efe2bd", water: "#8abfc7", ink: "#24313d", muted: "#59656a", road: "#ad7b46",
      boundary: "#b06f88", route: "#d75038", faintRoute: "#7f9b7a", marker: "#9f2d1e",
      topoLow: "#e8d99e", topoHigh: "#7f845d", texture: "#ad8a55"
    }),
    texture: { className: "route-theme-watercolor", opacity: 0.22, landA: "239 226 189", landB: "173 138 85", waterA: "138 191 199", waterB: "66 135 153" }
  },
  "national-park": {
    label: "National Park",
    description: "Brochure greens and river blue",
    uiTheme: { panel: "#f8f3df", surface: "#e7dcc0", highlight: "#274433", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.14, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: true, faintStreets: false, topography: true, faintTopography: false, stateLines: true, faintStateLines: true, smallTowns: true, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("paper-fibers", 0.34, "multiply", 1.8, "tactile-noise-light", 0.05) },
      water: { texture: themeLayerTexture("wavecut", 0.16, "soft-light", 1.1) },
      texture: { size: 0.34, texture: themeLayerTexture("natural-paper", 0.09, "multiply", 1.25) },
      topography: { size: 0.52, blend: "multiply" },
      streets: { size: 0.72 }
    }, {
      land: "#d6d2a0", water: "#68aeb2", ink: "#243a2e", muted: "#5d6a55", road: "#a96f3f",
      boundary: "#917b5d", route: "#2f6f47", faintRoute: "#8b9b61", marker: "#b04a2f",
      topoLow: "#b7c47a", topoHigh: "#50683d", texture: "#72884c"
    }),
    texture: { className: "route-theme-watercolor", opacity: 0.32, landA: "214 210 160", landB: "114 136 76", waterA: "104 174 178", waterB: "52 124 139" }
  },
  "blueprint": {
    label: "Blueprint",
    description: "Drafting-paper night cyan",
    uiTheme: { panel: "#102133", surface: "#172b40", highlight: "#aee8ff", font: DEFAULT_UI_THEME.font, texture: "grid", textureOpacity: 0.12, textureBlend: "screen" },
    toggles: { land: true, water: true, texture: true, streets: true, faintStreets: false, topography: false, faintTopography: true, stateLines: true, faintStateLines: true, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("tiny-grid", 0.28, "screen", 1.1, "subtle-freckles", 0.03) },
      water: { texture: themeLayerTexture("wave-grid", 0.2, "screen", 1) },
      texture: { size: 0.16, texture: themeLayerTexture("graphy", 0.07, "screen", 1.2) },
      faintTopography: { size: 0.18, blend: "screen" },
      streets: { size: 0.9, blend: "screen" },
      stateLines: { size: 1.15 },
      route: { size: 5.4 }
    }, {
      land: "#122a3c", water: "#154c62", ink: "#e4f8ff", muted: "#9bc4d2", road: "#86d9ef",
      boundary: "#5aa7bf", route: "#ffd166", faintRoute: "#7ec8b5", marker: "#ff876c",
      topoLow: "#2e6680", topoHigh: "#aee8ff", texture: "#79c6de"
    }),
    texture: { className: "route-theme-watercolor", opacity: 0.14, landA: "18 42 60", landB: "121 198 222", waterA: "21 76 98", waterB: "126 200 224" }
  },
  "desert-survey": {
    label: "Desert Survey",
    description: "Warm field map with teal water",
    uiTheme: { panel: "#fff4dc", surface: "#efd8ad", highlight: "#4b3423", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.16, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: true, faintStreets: false, topography: true, faintTopography: false, stateLines: true, faintStateLines: true, smallTowns: true, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("beige-paper", 0.42, "multiply", 2.25, "vintage-speckles", 0.05) },
      water: { texture: themeLayerTexture("subtle-white-feathers", 0.18, "screen", 1) },
      texture: { size: 0.36, texture: themeLayerTexture("retina-dust", 0.08, "multiply", 1.5) },
      topography: { size: 0.5 },
      streets: { size: 0.8 }
    }, {
      land: "#dfb96e", water: "#56b3bc", ink: "#3c2b20", muted: "#66584a", road: "#8a5d35",
      boundary: "#a66473", route: "#1f7f8a", faintRoute: "#9a7a4c", marker: "#9d3b24",
      topoLow: "#d8a85d", topoHigh: "#6e5d3e", texture: "#8f6032"
    }),
    texture: { className: "route-theme-watercolor", opacity: 0.42, landA: "223 185 110", landB: "143 96 50", waterA: "86 179 188", waterB: "42 126 141" }
  },
  "candy-pop": {
    label: "Candy Pop",
    description: "Playful high-contrast toy map",
    uiTheme: { panel: "#fff7f1", surface: "#f4e2d8", highlight: "#202a44", font: DEFAULT_UI_THEME.font, texture: "none", textureOpacity: 0, textureBlend: "multiply" },
    toggles: { land: true, water: true, texture: true, streets: true, faintStreets: false, topography: true, faintTopography: false, stateLines: true, faintStateLines: false, smallTowns: true, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("3px-tile", 0.1, "soft-light", 1.3) },
      water: { texture: themeLayerTexture("carbon-fibre-v2", 0.11, "screen", 1) },
      texture: { size: 0.16, texture: themeLayerTexture("bright-squares", 0.08, "soft-light", 1.4) },
      topography: { size: 0.28, blend: "soft-light" },
      streets: { size: 0.82 }
    }, {
      land: "#d9ee7f", water: "#48d3ef", ink: "#18203a", muted: "#3f5570", road: "#f4972e",
      boundary: "#b65dd6", route: "#f04e4e", faintRoute: "#47a767", marker: "#dd2e44",
      topoLow: "#d6db5f", topoHigh: "#2c8b6d", texture: "#e6c640"
    }),
    texture: { className: "route-theme-watercolor", opacity: 0.18, landA: "217 238 127", landB: "230 198 64", waterA: "72 211 239", waterB: "35 155 206" }
  },
  "charcoal-print": {
    label: "Charcoal Print",
    description: "Soft black paper with warm roads",
    uiTheme: { panel: "#1f2528", surface: "#2a3235", highlight: "#ead9b8", font: DEFAULT_UI_THEME.font, texture: "linen", textureOpacity: 0.1, textureBlend: "screen" },
    toggles: { land: true, water: true, texture: true, streets: true, faintStreets: false, topography: true, faintTopography: false, stateLines: true, faintStateLines: true, smallTowns: false, cities: true, capitols: true, route: true, faintRoute: true, startEnd: true },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("black-paper", 0.18, "screen", 1.45, "subtle-freckles", 0.04) },
      water: { texture: themeLayerTexture("black-linen", 0.16, "screen", 1.1) },
      texture: { size: 0.18, texture: themeLayerTexture("black-thread-light", 0.08, "screen", 1.3) },
      topography: { size: 0.42, blend: "soft-light" },
      streets: { size: 0.88, blend: "screen" },
      stateLines: { size: 1.1 }
    }, {
      land: "#20272a", water: "#183f4d", ink: "#f1eee6", muted: "#b9c2bf", road: "#d4b36f",
      boundary: "#7f9ca8", route: "#ffb454", faintRoute: "#7ca985", marker: "#ff7b68",
      topoLow: "#465348", topoHigh: "#d0c38f", texture: "#9ca39b"
    }),
    texture: { className: "route-theme-watercolor", opacity: 0.16, landA: "32 39 42", landB: "156 163 155", waterA: "24 63 77", waterB: "86 132 145" }
  }
});

Object.assign(ROUTE_THEME_PRESETS, {
  "mangrove-coast": {
    label: "Mangrove Coast",
    description: "Deep green wetlands and blue shallows",
    uiTheme: { panel: "#f0f5e7", surface: "#dce8cc", highlight: "#183f36", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.12, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("natural-paper", 0.32, "multiply", 1.9, "subtle-freckles", 0.04) },
      water: { texture: themeLayerTexture("wavecut", 0.22, "screen", 1.05) },
      texture: { size: 0.26, texture: themeLayerTexture("light-paper-fibers", 0.08, "multiply", 1.3) }
    }, { land: "#b8c98a", water: "#4ea5a8", ink: "#1c342d", muted: "#526a56", road: "#7e6842", boundary: "#7f7f5a", route: "#0f7c63", marker: "#b84a32", topoLow: "#a7bc6a", topoHigh: "#315d42" }),
    texture: { className: "route-theme-watercolor", opacity: 0.26, landA: "184 201 138", landB: "49 93 66", waterA: "78 165 168", waterB: "38 115 126" }
  },
  "miami-deco": {
    label: "Miami Deco",
    description: "Soft coral, mint, and ocean teal",
    uiTheme: { panel: "#fff2ee", surface: "#f5d8cf", highlight: "#17465a", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.08, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("washi", 0.24, "soft-light", 1.4) },
      water: { texture: themeLayerTexture("arches", 0.12, "screen", 1) },
      texture: { size: 0.18, texture: themeLayerTexture("subtle-freckles", 0.05, "multiply", 1.6) }
    }, { land: "#f2c7b7", water: "#42bed0", ink: "#1b3148", muted: "#5f6f78", road: "#d67c58", boundary: "#8f79bc", route: "#0b75a5", marker: "#e5534b", topoLow: "#efd89d", topoHigh: "#4e9f89" }),
    texture: { className: "route-theme-watercolor", opacity: 0.18, landA: "242 199 183", landB: "214 124 88", waterA: "66 190 208", waterB: "20 123 151" }
  },
  "alpine-lake": {
    label: "Alpine Lake",
    description: "Cool stone, pine, and clear water",
    uiTheme: { panel: "#eef3f0", surface: "#dce7e2", highlight: "#203f4a", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.1, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("white-paperboard", 0.26, "multiply", 1.7) },
      water: { texture: themeLayerTexture("light-paper-fibers", 0.18, "screen", 1.1) },
      texture: { size: 0.2, texture: themeLayerTexture("retina-dust", 0.05, "multiply", 1.2) }
    }, { land: "#c7d1c2", water: "#6fb5ca", ink: "#20313a", muted: "#58676a", road: "#88795f", boundary: "#7991a0", route: "#276fbf", marker: "#b94e3b", topoLow: "#b6c59e", topoHigh: "#4c6754" }),
    texture: { className: "route-theme-watercolor", opacity: 0.24, landA: "199 209 194", landB: "76 103 84", waterA: "111 181 202", waterB: "52 129 158" }
  },
  "coral-reef": {
    label: "Coral Reef",
    description: "Sand flats with reef-blue water",
    uiTheme: { panel: "#fff7e6", surface: "#ecd9b6", highlight: "#0e5b6f", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.12, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("beige-paper", 0.38, "multiply", 2.1, "vintage-speckles", 0.04) },
      water: { texture: themeLayerTexture("waves", 0.14, "screen", 0.95) },
      texture: { size: 0.22, texture: themeLayerTexture("natural-paper", 0.08, "multiply", 1.2) }
    }, { land: "#ead092", water: "#21abc2", ink: "#27404a", muted: "#6a6250", road: "#b9834a", boundary: "#c06f85", route: "#e85d75", marker: "#b8324f", topoLow: "#dfbf70", topoHigh: "#8c7549" }),
    texture: { className: "route-theme-watercolor", opacity: 0.3, landA: "234 208 146", landB: "140 117 73", waterA: "33 171 194", waterB: "11 104 132" }
  },
  "lavender-survey": {
    label: "Lavender Survey",
    description: "Quiet violet field notes",
    uiTheme: { panel: "#f7f0f6", surface: "#e5d6e8", highlight: "#35294b", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.11, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("textured-paper", 0.28, "multiply", 1.7) },
      water: { texture: themeLayerTexture("washi", 0.16, "soft-light", 1) },
      texture: { size: 0.18, texture: themeLayerTexture("subtle-freckles", 0.05, "multiply", 1.4) }
    }, { land: "#d8c6df", water: "#8bb9c7", ink: "#2d2740", muted: "#665b74", road: "#8f6a58", boundary: "#8e68a6", route: "#6c4bb5", marker: "#b84a62", topoLow: "#c6b1d5", topoHigh: "#5a557f" }),
    texture: { className: "route-theme-watercolor", opacity: 0.2, landA: "216 198 223", landB: "90 85 127", waterA: "139 185 199", waterB: "73 132 153" }
  },
  "moss-ink": {
    label: "Moss Ink",
    description: "Muted field greens with black ink roads",
    uiTheme: { panel: "#eef1de", surface: "#dce3c4", highlight: "#1f3022", font: DEFAULT_UI_THEME.font, texture: "linen", textureOpacity: 0.08, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("paper-fibers", 0.36, "multiply", 1.9) },
      water: { texture: themeLayerTexture("natural-paper", 0.14, "soft-light", 1) },
      texture: { size: 0.24, texture: themeLayerTexture("retina-dust", 0.06, "multiply", 1.5) }
    }, { land: "#bcc891", water: "#7aa9a2", ink: "#1e2a20", muted: "#56644d", road: "#313b2e", boundary: "#6f835d", route: "#c95c2e", marker: "#9f2d1e", topoLow: "#a4b871", topoHigh: "#3d5f37" }),
    texture: { className: "route-theme-watercolor", opacity: 0.28, landA: "188 200 145", landB: "61 95 55", waterA: "122 169 162", waterB: "64 122 119" }
  },
  "copperplate": {
    label: "Copperplate",
    description: "Aged copper and mineral blue",
    uiTheme: { panel: "#f6eadb", surface: "#e4c7a8", highlight: "#43281c", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.18, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("cardboard", 0.34, "multiply", 2.2, "vintage-speckles", 0.06) },
      water: { texture: themeLayerTexture("black-thread-light", 0.1, "screen", 1) },
      texture: { size: 0.32, texture: themeLayerTexture("tactile-noise-light", 0.08, "multiply", 1.5) }
    }, { land: "#c68152", water: "#4b9ba4", ink: "#321f18", muted: "#6e5546", road: "#4b3327", boundary: "#8e5f74", route: "#1f6f78", marker: "#ffd166", topoLow: "#d28e55", topoHigh: "#68402d" }),
    texture: { className: "route-theme-watercolor", opacity: 0.36, landA: "198 129 82", landB: "104 64 45", waterA: "75 155 164", waterB: "37 101 113" }
  },
  "glacial-chart": {
    label: "Glacial Chart",
    description: "Pale ice, slate ink, and blue roads",
    uiTheme: { panel: "#f4f8f8", surface: "#e0ebec", highlight: "#17364a", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.06, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("white-paperboard", 0.22, "multiply", 1.5) },
      water: { texture: themeLayerTexture("az-subtle", 0.12, "screen", 1.2) },
      texture: { size: 0.14, texture: themeLayerTexture("light-paper-fibers", 0.05, "multiply", 1.2) }
    }, { land: "#dfe8e4", water: "#9bcbd7", ink: "#233343", muted: "#66757d", road: "#497a98", boundary: "#8aa1ad", route: "#0b5cad", marker: "#d64045", topoLow: "#cddccb", topoHigh: "#6f8791" }),
    texture: { className: "route-theme-watercolor", opacity: 0.16, landA: "223 232 228", landB: "111 135 145", waterA: "155 203 215", waterB: "83 150 176" }
  },
  "citrus-grove": {
    label: "Citrus Grove",
    description: "Orange groves, leaf green, clear coast",
    uiTheme: { panel: "#fff6dc", surface: "#f0deb0", highlight: "#27472b", font: DEFAULT_UI_THEME.font, texture: "paper", textureOpacity: 0.1, textureBlend: "multiply" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("natural-paper", 0.3, "multiply", 1.8, "subtle-freckles", 0.04) },
      water: { texture: themeLayerTexture("washi", 0.14, "screen", 1) },
      texture: { size: 0.2, texture: themeLayerTexture("tactile-noise-light", 0.06, "multiply", 1.3) }
    }, { land: "#e9c66d", water: "#62bdc9", ink: "#293626", muted: "#636139", road: "#8d6b2f", boundary: "#8fb25a", route: "#f47b20", marker: "#c63d2f", topoLow: "#d6c552", topoHigh: "#527c3e" }),
    texture: { className: "route-theme-watercolor", opacity: 0.24, landA: "233 198 109", landB: "82 124 62", waterA: "98 189 201", waterB: "49 138 160" }
  },
  "midnight-orchid": {
    label: "Midnight Orchid",
    description: "Dark plum with cyan water lines",
    uiTheme: { panel: "#241d2e", surface: "#30253d", highlight: "#f3d8ff", font: DEFAULT_UI_THEME.font, texture: "linen", textureOpacity: 0.1, textureBlend: "screen" },
    styles: completeThemeStyles({
      land: { texture: themeLayerTexture("black-linen", 0.18, "screen", 1.4) },
      water: { texture: themeLayerTexture("carbon-fibre-v2", 0.12, "screen", 1) },
      texture: { size: 0.16, texture: themeLayerTexture("subtle-freckles", 0.06, "screen", 1.6) },
      streets: { blend: "screen" }
    }, { land: "#251b31", water: "#19566f", ink: "#f3eaff", muted: "#c5afd8", road: "#d7a8ff", boundary: "#6fb5ca", route: "#4de1d3", marker: "#ff8a7a", topoLow: "#4b385d", topoHigh: "#b98fe6" }),
    texture: { className: "route-theme-watercolor", opacity: 0.16, landA: "37 27 49", landB: "185 143 230", waterA: "25 86 111", waterB: "77 225 211" }
  }
});

Object.values(ROUTE_THEME_PRESETS).forEach(theme => {
  theme.styles = completeThemeStyles(theme.styles);
  theme.toggles = { ...ALL_THEME_TOGGLES };
});
