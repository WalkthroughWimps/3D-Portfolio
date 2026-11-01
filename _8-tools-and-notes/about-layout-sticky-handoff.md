# About layout, entrance, supports, and sticky notes

Human request: October 28, 2026. Scope is the About cube, not the other pages' scene behavior. No commit, push, publication, or deployment is authorized.

## Requested result

- Refs starts facing the viewer. Cube rises from below with a playful spin, overshoots, and bounces back to Refs.
- Skills is viewer-right of Refs, Oddio occupies the original Skills location, Notes moves to the top. Keep Fish and Clock in their other slots.
- Each face's content extends when approached and retracts when rotated away, using Skills' delayed, side-visible retreat as the baseline. Avoid applying a second deployment to Skills. Frames need credible stationary attachment and moving support; Fish's current planar ring needs physical depth.
- About sticky icon: click toggles notes, drag places a note and opens an appearance/text popup, click an existing note selects it in General Constructor. Reuse current v1 note storage, export and validation; do not add sample published notes or alter Graphics behavior.

## Model authorization and sequence

The human approved exactly one GPT-6.1 Sol / medium **read-only architecture pass**. That pass is complete. It is not approval for subsequent 6.1 implementation or review. Continue implementation with GPT-6 Sol / medium; further 6.1 work needs another explicit approval under AGENTS.md. Root coordinates and reviews. Use source reservations atomically, preserve inherited edits, and release after each slice.

1. Refs default and entrance: implemented by `/root/cube_layout_motion` in `about.js`; focused lint passed, easing reviewed, browser arrival at Refs verified. Site/OS reduced motion skips the decorative entrance.
2. Sticky About UI/scene adapter: complete. Browser checks passed for zero-note toggle, drag-to-draft, cancellation, saving from hidden state (reveals the note), click-to-Constructor, live text editing, reload persistence and deletion. Temporary QA notes removed; published bundle untouched. Nearest unsupported opaque surfaces block placement and show a visible hint. Original GLTF parser IDs and semantic fixed-topology hardware IDs remain stable through layout changes; current morph vertices are used.
3. Runtime face partition/coordinate contract and necessary face integration: implemented by GPT-6 Sol / medium. Exact 29-branch partition, mapped normals and sibling restoration checked; focused lint/syntax pass. Browser-discovered Skills shell lookup now uses original-name resolver rather than sanitized object names. Successful browser routes: Refs default, Skills, Notes artwork/UI and Oddio.
4. Interior helper-space migration: implemented by the same lower-model agent. Skills profile/lattice/speaker weights share mapped coordinates; Notes projector and Odd coupling moved; Clock target stays physical. Projector glows now use shared contrast mapping. Helper roots explicitly removed on detach. Focused lint/syntax and mapped endpoint checks pass.
5. Face travel/supports and Fish frame depth: complete, GPT-6 Sol / medium. Stationary skins/seats and moving carriers remain distinct; Skills receives no extra translation. Fish has a .13-deep annular sleeve and rim clamps while its explicit opening action remains intact. Other moving parts use delayed spring travel and guides attached to their actual frame planes. Removed duplicate moving torus outlines after visual review. Notes bridges stop at the glass rim and sit behind the pane; final front view confirms unobstructed artwork.
6. Combined review: complete for the bounded requested work. Browser checks covered Refs default; Skills viewer-right; Notes on top; all six summary routes; keyboard cube rotation; zoom; Fish explicit opening; shared contrast and reduced motion; sticky draft/save/select/edit/delete and reload persistence; leaving for Start and returning. Returning leaves exactly one cube canvas, one note icon and one draft dialog, with no new warning/error logs. Preview returns HTTP 200. The 390×844 check also recorded existing navigation overlap on the scene's left edge; navigation/framing source was not changed in this task. Evidence is under `output/about-layout-sticky/`; geometry sampling does not prove continuous collision clearance.

## Approved architecture finding

Create host-owned authored-coordinate spaces centered on physical cube origin. Keep original mount constants and manifest vectors local. Map spaces using proper rotations:

| Face | Source normal | Destination | Rotation |
| --- | --- | --- | --- |
| Fish/about | +X | +X | identity |
| Skills | +Z | -X | Y -90 degrees |
| Notes | -X | +Y | Z -90 degrees |
| Oddio | +Y | +Z | X +90 degrees |
| Clock | -Y | -Y | identity |
| Refs | -Z | -Z | identity |

Context contract: `physicalCube` is the real GLTF scene for global pose, whole-scene occlusion and host focus; `cube`/`authoredSpace` is the per-face layout group. `layout` converts local points/directions/mounts. Wrap each face's `focusFace` once; expose physical mounts for summary links. Build original `findNode` lookup before partition. Do not transform a mount twice.

Partition original direct GLTF branches while preserving cube-local matrices. Snapshot original parent/order, transforms, matrices and matrixAutoUpdate. Face modules still never reparent borrowed nodes; this host layout owner alone can reversibly partition them. Detach faces, then restore layout, then dispose shared model resources.

Inspected GLB root node248 (`V7 Review Assembly Root GLB`) has29 direct children. Select by names plus original parser identity, not permanent numeric assumptions. Assert exhaustive, disjoint partition; diagnose unknown future roots.

- Fish: `back.about Export` (node0).
- Notes: `back.art Export` (node1).
- Clock: `back.clock Export` (node2).
- Odd: `back.odd Export` (node3).
- Refs: `back.refs Export` (node4).
- Skills: `back.skills Export` (node5); `V16 Concealed Stationary Bearing Stator GLB`, `V16 Eight Fixed Mounting Spokes GLB`, `V16 Recessed Cube Mounting Ring GLB`, `V2 frame inner lip Export` (15–18); full `V7 Deploy Carriage GLB` (246, all children retained); eight `V7 Cube Support 01…08 Fixed Cube Anchor Aim GLB` branches; `V9 Eight Fixed Backing Saddles GLB` (247).
- Stationary chassis: `cube.main Export`, two Bevel Highlight roots, and all six Trench Pipe roots. Pipe names use Blender axes; do not infer their face ownership from labels.

Skills traps: `BeanBagThrower.mjs` writes `assembly.model` pose. Add an explicit `poseCube: physicalCube` for all capture/animation/restore/dispose operations while keeping assembly.model in authored Skills space. Capture cubeToFace against the physical cube. Skills focus and FaceCarrierRoll already use model.matrixWorld. Actual assembly implementation is `PanelAssembly.mjs`; CardAssembly is a facade. Do not rewrite runtime manifest vectors. Skills preview-input blockers need the complete physical cube, separate from authored coordinates. Fish and Refs full-scene occlusion also need physicalCube.

Interior: gyroscope, bearings and Clock remain physical. Add stationary mapped helper spaces for Skills lattice/feed/conduit/socket/terminal; Notes projector; and the short Odd arm/coupling. Their authored numerical directions stay unchanged. Skills surface profile and speaker-weight conversions use the Skills helper coordinates. Notes projector backing profile uses its helper space. Clock magnetic target contract remains physical. Speaker-response mesh-local deformation needs no remap; verify lattice still samples the same field.

Travel: do not use an entire layout group as a deployment slider. Separate stationary backing/frame/stator from moving content. Register existing Skills deployment unchanged; other faces get local-normal travel carriers or expose their own mechanism. Use live matrices for picking/interior links. Sticky anchors use original parser identity/triangle/bary; procedural surfaces need stable semantic IDs, not UUIDs or transient parent paths.

## Remaining steps

No required implementation phases remain after the final documentation/face-chat handoff. All implementation used GPT-6 Sol / medium after the single approved read-only GPT-6.1 architecture pass. No GLB rewrite, commit, push, publication or deployment occurred. Source reservations are released after the handoff slice.

Optional follow-ups: stable proxy anchors for dynamic-topology cabinet surfaces, existing narrow-screen navbar/framing overlap, and broader continuous collision/fabrication auditing. They are separate from the completed layout/travel/sticky request. Existing older face/site backlogs remain separate.

Final acceptance: `browser-validation.json`, `geometry-validation.json`, `layout-overview-final.png` and `notes-guides-final.png` are saved under `output/about-layout-sticky/`. The six owned face chats (Fish, Refs, Skills, Clock, Oddio and Notes) received the coordinate-contract handoff with explicit instructions to retain it silently and start no new work. The chat is named About Cube. Final source reservations are released; no required steps remain.

Live preview: http://127.0.0.1:8878/_1-about/about.html?review=1.

## October 28 follow-up: face hardware, Fish rings, and scale notes

The shared generated guide hardware was removed. Shared non-Skills faces and Skills use entry at dot 0.5 with a 0.06-second dwell, then retain through dot 0.35 with a 0.45-second exit dwell. Fish's fixed frame front now aligns with the authored rim at cube x about 0.970. Its seven baked hover rings are rotated from runtime XZ into the Fish face plane, centered from their exported stack coordinates, and sized around the whole mount. The green scale backing uses stable semantic surface `about:owned:face:about:fish-scale-plane:v1` and an invisible flat proxy at the tile mesh's outward relief limit; v1 triangle and barycentric note anchors remain intact.

Browser acceptance showed no grey Clock bars; Fish stowed, flipped and deployed with centered rings; native sticky-icon drag onto the green backing, creation dialog and save; an upright flat note that persisted after reload, followed the plate flip out of view, and opened its General Constructor selection when clicked. The temporary QA note alone was deleted. No browser errors were recorded. Evidence: `output/about-face-followup-20261028/clock-no-bars.png`, `fish-rings-centered.png`, `scale-note-flat.png`, `fish-frame-oblique.png`, and `rim-profile.json` in that folder. The final oblique image was refreshed after the rim-position change; final front/deployed review also passed.

Remaining bounded steps: none after the final browser review of the recessed frame/rim plane and deployed ring fit. Optional physical-device and continuous-clearance audits and the broader face/site backlogs remain separate. Source Blend and GLB assets were unchanged; no commit, push, publication or deployment occurred.

## October 28 sticky clearance follow-up

New About and Graphics placements save an optional v1 flat plane in a stable target's local coordinates. The old triangle/bary fields and existing saved notes remain valid. About uses named support groups within authored face spaces; Graphics uses its existing source mesh IDs. Placement samples nearby visible relief and cached bounding boxes over the largest allowed note at any rotation, then raises one flat plane to the highest intersecting surface. Later size and rotation edits therefore retain the original clearance. New placement has no front-face or fitted-patch rejection. Existing Graphics fitted patches and the Fish-scale semantic proxy continue to work. Model geometry, materials and GPU sources are unchanged.

Browser review passed for Oddio placement below its knobs, reload and Constructor selection. Graphics closed-book edge overhang at size 2 and open pages passed without browser errors. Temporary QA notes were removed. Final code adjustment routes new Fish-scale placements through the same raised-plane path while preserving the old proxy for saved triangle/bary notes.

Final acceptance: a new Fish-scale plane note stayed flat, disappeared behind the reversed plate, persisted through reload and reopened its Constructor selection. All temporary About and Graphics notes were removed; each page's editor returned to New note (draft). No browser warning/error logs were recorded. Evidence is under `output/sticky-clearance-20261028/`, including `oddio-panel-final.png`, `book-edge.png`, `book-open.png`, and `fish-flat-final.png`. Targeted ESLint and module syntax checks passed. This is desktop browser coverage, not an exhaustive audit of every movable part or instanced surface.

Remaining required steps for this bounded follow-up: none. Optional later work remains placement adapters for the other site routes, instanced surface support, and remapping closed/open book representations. The broader face/site backlogs remain under their existing handoffs. No commit, push, publication or deployment occurred.
