# Circular cube apertures — October 19, 2026

The apparent spacing problem was real. The authored cutout and trench pipes had a centered four-lobed contour while the face content was circular. At normal depth .99, the opening radius was about .91546 along the axes and .94158 along the diagonals. This repeats on all six faces; it was not a face-center offset or merely perspective.

`_1-about/cube-apertures.mjs` corrects only the loaded chassis and its six trench pipes before the host prepares arrows, frames the model or attaches faces. It derives each angular profile from the actual pipe sections, retains the average radius and applies a coherent radial correction to the inner aperture/trench. A smooth spatial blend leaves the external cube edges and separate highlight meshes fixed. The smooth source normals are transformed with the deformation Jacobian, preserving authored hard seams. Each 16-vertex pipe section is translated and rotated rigidly, including its normals, preserving the round tube cross-section. The host owns the loaded model geometry and disposes it through its existing lifecycle; the correction adds no meshes, resources or render loop and is idempotent for a loaded scene.

Original GLB/runtime files, face backings, artwork, content and mechanism geometry are unchanged. Source names/topology/identity-transform assumptions are checked explicitly. Future source-model changes must retain that contract or update this helper and its focused check. Raw-GLB clearance audits should apply the same runtime correction before assessing the chassis.

## Verification

- All 159 repository tests pass at this checkpoint, including the real-asset geometric invariant check. Targeted ESLint and generated HTML checks pass.
- Across six faces and seven actual opening depths from .973 through .995, sampled radial variation falls from .025921–.026131 to .000533–.000541, about a 98% reduction. Mean radius changes by only .0000062–.0000074. Remaining variation is bounded by the source mesh tessellation and sampled profile interpolation.
- All six pipe centerline ranges are below .0001. Every tube vertex preserves its distance from its section center within .000001. External edge vertices stay fixed.
- Jacobian determinants over 32,318 changed chassis vertices are positive (.2821 minimum). Corrected normal lengths remain within .00000005 of one.
- Real Three.js 0.159 loading and all six face renders pass in matching orthographic views. The GLB and runtime metadata SHA-256 hashes remain identical, and the final live page was refreshed successfully.

Evidence: `output/cube-apertures/before-six-faces.png`, `after-six-faces.png`, `geometry-profiles.json`, and source-hash reports. Disposable audit and view fixtures are under `tmp/aperture-*` and `tmp/cube-apertures-review.html`. This is a sampled visual/geometry check, not a fabrication or complete moving-mechanism collision certificate.

## Remaining phases / steps

Measurement, correction, geometry tests, six-face visual review and the middle-button focus/pan/reset follow-up are complete. The final input regression passes, including right-button rotation. Source reservations are released and Face chats are notified as part of this handoff. Remaining required phases / steps for these requests: none. No commit, push, publication or deployment.

[Live preview](http://127.0.0.1:8878/_1-about/about.html?review=1)

## Start-style middle-button follow-up

The host now supplies the shared mouse helper with a cube raycast and default-focus callback. A single middle click focuses the visible hit point; a middle drag pans freely; a double middle click returns to the original cube focus. As on Start, animated focus changes preserve camera orientation and current orbit distance. Hidden objects/ancestors and invisible materials are excluded. Canvas coordinates and the live camera projection include the settings-drawer view offset. Right-button handling remains explicitly disabled in the shared helper so About's compatibility `mousedown` / pointer-lock rotation still works. The canvas accessibility label describes all three middle-button actions.

Native browser single and double middle-click checks pass: orientation/distance are preserved, and the reset target returns exactly to [0,0,0]. Evidence is `middle-single-focus.txt` and `middle-double-reset.txt` under `output/cube-apertures/`. The retained input regression covers middle drag, wheel zoom, cancellation, native right-click delivery, and right drag releases. No shared mouse-helper or Start-page source was edited.

