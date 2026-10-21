# Hosting reference

Previous instructions described obsolete paths and a root media manifest that is not the current deployment contract. Use [Phase 8 release documentation](architecture-phases/phase-08-release.md) and `tools/release-artifact.json` for actual contents, paths, dependencies and rollback.

Entry is `index.html`; six content routes live under `_1-about` through `_6-docs`. HTML/import maps and classic `sw-asset-config.js` are prepared with `npm run prepare:site-html` and verified with `npm run check:site-html`. Large media are ignored by Git and normally resolved against `https://assets.matthallportfolio.com`; GLBs map from local `assets/glb/` to CDN `glb/`. Git LFS objects must be hydrated. Pointer text or missing external files are not complete release inputs.

`ASSETS_BASE` and `assetsBase` query overrides select assets; custom overrides do not reconfigure the intro worker cache. Root/subpath are boundedly checked locally; complete hosted subpath and production worker/CDN/audio gates remain incomplete. Do not publish the raw workspace with tools/fixtures/art/notes/evidence. Explicit artifact contents preserve public alternatives, games, attribution and vendor licenses.

Publishing/deploying requires a separate user request after the release gate passes. Phase 8 did not push, publish, change hosting or upload assets.
