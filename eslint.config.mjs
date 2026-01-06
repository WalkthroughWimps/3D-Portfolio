import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/backups/**",
      "**/videos_files/**",
      "**/videos-files/**",
      "**/garbage/**",
      "eslint.config.mjs",
      // Legacy duplicate files created during earlier iterations — ignore to
      // focus linting on canonical modules.
      // "videos2.js", // will be linted next
      "videos3.js",
      // "videos copy.js",
      // "videos-copy.js",
      "videos.js.bak",
      "videos.original.moved.js",
      "stupid.js",
    ],
  },
  {
    files: ["*.{js,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.browser, gsap: "readonly", KUTE: "readonly" },
    },
    rules: {
      // Many legacy catch blocks intentionally ignore the error binding;
      // treat an unused `e` in catch as intentional to reduce noise.
      // Also allow unused vars that start with `_` so we can mark
      // intentionally-unused variables during refactor iterations.
      'no-unused-vars': ['error', { 'varsIgnorePattern': '^(_|e)$' }],
      // Allow empty catch blocks — we prefer an explicit ignore or
      // `void e;` pattern, but tolerate existing empty catches.
      'no-empty': ['error', { 'allowEmptyCatch': true }]
    },
  },
  {
    files: [
      "global-sync.js",
      "music-piano-controls.v2.js",
      "tablet_animation_test.js",
      "site-modelviewer.js",
      "videos.js",
      "videos-tablet.js",
      "video-lane-carousel.js",
    ],
    languageOptions: { sourceType: "module" },
  },
]);
