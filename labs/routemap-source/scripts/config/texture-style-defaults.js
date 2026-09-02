"use strict";

// Shared texture value shape and blend choices. Texture loading and rendering
// remain in their renderer-specific code.

const DEFAULT_LAYER_TEXTURE = {
  enabled: true,
  type: "natural-paper",
  opacity: 0.14,
  blend: "multiply",
  blendAmount: 0.9,
  scale: 1,
  secondaryEnabled: false,
  secondaryType: "vintage-speckles",
  secondaryScale: 1,
  secondaryOpacity: 0.07,
  secondaryBlend: "multiply"
};

const TEXTURE_BLEND_MODES = [
  ["normal", "Normal"],
  ["multiply", "Multiply"],
  ["screen", "Screen"],
  ["overlay", "Overlay"],
  ["soft-light", "Soft light"],
  ["darken", "Darken"],
  ["lighten", "Lighten"]
];

function layerTexture(overrides = {}) {
  return { ...DEFAULT_LAYER_TEXTURE, ...overrides };
}

function isTextureBlendMode(value) {
  return TEXTURE_BLEND_MODES.some(([mode]) => mode === value);
}

function themeLayerTexture(type = DEFAULT_LAYER_TEXTURE.type, opacity = DEFAULT_LAYER_TEXTURE.opacity, blend = DEFAULT_LAYER_TEXTURE.blend, scale = DEFAULT_LAYER_TEXTURE.scale, secondaryType = "none", secondaryOpacity = 0) {
  return {
    enabled: type !== "none",
    type,
    opacity,
    blend,
    blendAmount: 0.82,
    scale,
    secondaryEnabled: secondaryType !== "none",
    secondaryType,
    secondaryScale: scale,
    secondaryOpacity,
    secondaryBlend: "multiply"
  };
}
