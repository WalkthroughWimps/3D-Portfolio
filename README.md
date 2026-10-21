# Resume website

Static multipage website with browser ES modules, Three.js scenes, generated games and local/CDN media. The Phase 8 release gate is **INCOMPLETE**; nothing has been published by the architecture phases.

Use Node **24.19.0** and npm **11** (validated locally with npm 11.17.0). Run `npm ci --ignore-scripts`, `npm test`, `npm run check:site-html`, and `npm run lint`. Lint currently fails with 642 inherited errors. The real Hypersound fixture and hydrated GLBs are prerequisites for the existing tests. Ignored media are separate inputs; a Git checkout alone is insufficient.

`npm run review` starts the existing diagnostic preview on port 8878. For a preview without injected diagnostics, run `npm run preview:artifact` on port 8879. Both bind to loopback. To preview a packaged site, set `SITE_ROOT=output/phase-08/artifact/site` before the latter command. Neither command deploys.

`npm run check:artifact` inventories allowed runtime contents and rejects missing required files, case collisions and Git LFS pointers. `npm run build:artifact` writes a new local artifact plus SHA-256 inventory. It refuses existing output. External media still require the asset host; the artifact is not release-approved.

Read [validation](tools/VALIDATION.md), [current module/dependency/hosting/rollback reference](_8-tools-and-notes/architecture-phases/phase-08-release.md), and [Phase 8 handoff](_8-tools-and-notes/architecture-phases/phase-08-handoff.md). Prior phase handoffs and editable instructions in the same folder are authoritative history.
