"use strict";

// Dependency-free helpers shared by rendering, themes, textures, and editors.
// This remains a classic script so the site continues to work from file://.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gcd(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function lcm(a, b) {
  if (!a || !b) return Math.max(a || 0, b || 0);
  return Math.abs(Math.round(a * b)) / gcd(a, b);
}

function mixRgb(a, b, amount) {
  const ratio = clamp(amount, 0, 1);
  return a.map((channel, index) => Math.round(channel + (b[index] - channel) * ratio));
}

function normalizeHex(value) {
  const raw = String(value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split("").map(character => character + character).join("")}`.toLowerCase();
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return `#${raw}`.toLowerCase();
  }
  return null;
}

function hexToRgbTriplet(hex) {
  const normalized = normalizeHex(hex) || "#ffffff";
  return `${parseInt(normalized.slice(1, 3), 16)} ${parseInt(normalized.slice(3, 5), 16)} ${parseInt(normalized.slice(5, 7), 16)}`;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex) || "#ffffff";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const toHex = value => clamp(Math.round(Number(value) || 0), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = value => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function readableTextColor(background, dark = "#1f2933", light = "#fff8e8") {
  return relativeLuminance(background) > 0.48 ? dark : light;
}

function mixHex(a, b, amount = 0.5) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const ratio = clamp(amount, 0, 1);
  const mix = channel => Math.round(first[channel] * (1 - ratio) + second[channel] * ratio).toString(16).padStart(2, "0");
  return `#${mix("r")}${mix("g")}${mix("b")}`;
}

function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function bestContrastColor(background, candidates) {
  return candidates
    .filter(Boolean)
    .sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background))[0];
}

function ensureContrastColor(color, background, minimum, candidates) {
  if (contrastRatio(color, background) >= minimum) return color;
  return bestContrastColor(background, candidates);
}

function labelHaloColor(fill) {
  return bestContrastColor(fill, ["#fffdf8", "#111827", "#f6e7be", "#082033"]);
}
