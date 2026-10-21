# Oddio arm interface for About Cube

The user assigned the mechanical arms on the cube to **About Cube** on October 18, 2026. Oddio Face owns audio, clips, tape/reel/roller layout and the controls. The tape-bed handoff below records the incoming source context. The completed About Cube redesign and current contract are documented in the implementation acceptance section at the end.

Before editing, reserve the applicable Oddio files with the project helper. Oddio Face releases its face-directory reservation after the current geometry/transport verification. Do not infer ownership from a previous token; inspect helper status.

## Coordinates and existing arm interface

`face.mechanism.group` is the cloth transport's local coordinate frame. X is tape travel, Y is the four-lane stack, positive Z points out toward the reader/user. This frame sits at Z −.24 beneath the upright carrier. The face mount is cube-local `[0,.982,0]`, normal `[0,1,0]`, right `[1,0,0]`, up `[0,0,-1]`. Borrow host camera/renderer/model; use host update/lifecycle.

Existing ball sockets: upper needle `[+.09,+.184,.25]`; lower unpicker `[−.09,−.184,.25]`. Both are on inward short panel edges, not the broad control surfaces. Upper tool stays right of the reader; lower stays left. Existing fixed link lengths are .18/.135/.125, tool length .040, base ball radius .012 and panel cup radius .0185. Panel surfaces are Z .234–.266, with Y ±.19 inner edges. Lane centers are `.075*(1.5-lane)`; cloth width .075, bed X ±.72. Existing work X spans ±.06–.18. These are inherited geometry, not a recommended final arm design.

User requirements to carry forward: folds flat between the panels; lift away from the reels before travel; do not cross the playhead or pass over controls; small mobile ball/bowl joints; tools cannot hit their own joints/rails. Pair unpick/sew only for close rightward moves; tabs lift only if that paired removal is underneath them. Otherwise unpick first, then sew. Finish consuming the ghost clip during unsewing. Maintain deployment across queued tasks. Current animation is perceived as stuttery and physically incoherent: review its rigid-body constraints, pose parameterization and travel/work timing together across all four cube arms.

## New tape geometry that the arms must follow

Reader at X 0. Unmuted cloth nominal Z .245, with an existing .004 sine bow and small damped flex/curl. Muted cloth withdraws .042 into the face. The dip is flat for X ±.065 and eases back to normal at X ±.28. Its center material coordinate remains pinned to the audio playhead; both reels supply the extra arc length. Muting affects audio immediately, with a damped visual transition. **Old tool tips at Z .252 do not follow the new lowered surface.** That contact adaptation belongs to the arm redesign, not this tape pass.

Use `face.mechanism.surfaceAtX(x,lane)` for the current face-local cloth position (bow/flex/curl and mute withdrawal included), and `timeAtX(x,lane)` for the material time. `muteAmounts` gives a copy of four 0–1 withdrawal values. The extra cloth is a reversible visual feed, never an audio seek. `holdTape()`, `cancelWork()`, `syncClips()` and the existing atelier queue connect to gestures and real edits.

Two inter-panel beams sit at X ±.31, span Y −.205 to +.205, and have center Z .223; depth .012, width .017. Panel mounting plates span X ±.023 about each beam, Y ±.018 about ±.205, Z .241–.253. Shoulder roller axes are at X ±.28 and ±.34, each lane's Y, Z .2425; radius .006 and length .065. Rear bearing forks are Z .217–.225. The central moving nip rollers remain at X ±.014; their yokes withdraw with the cloth. Rear reader rack and standoffs occupy roughly X ±.046, Y ±.173, Z .116–.268. Intentional cloth/nip, shaft/collar and panel mounting contacts are part of the mechanism.

Reels are now splayed: take-up center `[−.52,.27,.04]`, tilt +22.5° about local Y; supply `[.50,−.27,.028]`, tilt −20°. These are the reel-frame pivots. Ring/divider/coil geometry and the axis transforms live in `ribbon-path.mjs` / `REEL_FRAMES`; use actual meshes for collisions. The largest rear wheel radius is .245; divider .223; full cloth radius .205; front wheel .095. Lane axial centers are .059+.037*n, reversed on take-up. Clip time boundaries remain 0–60 seconds; manual winding permits −7.5 to 67.5. Numerical audio capacities are unchanged.

Current verification in `output/oddio-bed/`: actual reel mesh samples at three winding positions and six carrier angles, backing/panel/opening clearance, folded transit routes, conservative full-reel vs roller-support bounds, owned-resource disposal, pinned material time and opposite reel feed. This does not certify future arm sweeps. Recheck the full assembly after the arm redesign.

## Remaining steps

1. About Cube develops the coherent shared arm/joint/motion approach for all four arms.
2. Implement the two Oddio arms against `surfaceAtX`, existing queue semantics and the current rollers/reels/controls.
3. Verify all lane/deployment/work/travel/jam poses, tool self-clearance, paired jobs/tab lift, suspension/reduced motion and disposal; show motion to the user for review.
4. Keep audio/tape/editing changes under Oddio Face coordination. Later plate layouts, capacity decision, real microphone/listening checks and optional loose-cloth/fabrication audits remain separate.

No commit, push, publication or deployment is authorized.

## About Cube implementation acceptance — October 18, 2026

The queued armature order is implemented. This section supersedes the inherited arm dimensions and pending implementation steps above. Notes Face replaced its four hands with two exterior, folding roller-guide assemblies; its source handoff is `../../notes/scroll-rail-assemblies-handoff.md`. About Cube completed the Oddio rigid arms after finishing the Skills bean bag tray. Oddio audio, tape/reel layout and editing remain owned by Oddio Face.

### Current mechanical contract

The original panel sockets remain at `[side*.09, side*.184, .25]`. A rigid .035 shoulder riser clears the housing. The working links have fixed lengths .18 / .17 / .04, with a .040 tool. The base ball is .018 inside the existing .0185 cup; the other joint balls are .0045. The arm folds in the plane Z .285. The joints and twin rails follow the same analytic rigid-body solution; cups align with their incoming links. No discrete elbow-candidate scan or variable-length rail remains.

The elbow follows an analytically clipped circle with continuous scheduled swivel. Its own-side X limit, minimum Z and Z±Y clearance wedge keep it above the housings; an elbow may project over a panel edge only while safely forward of it. Travel lifts before moving laterally, turns the tool before descending and uses a nonsingular radial path. The tool seats on the sampled cloth, including mute withdrawal, bow and live flex/curl. The sewing stroke retains its intended ±.0015 Z motion. Queued work, close rightward paired moves, tab lift conditions, ghost consumption, decorative feed and audio position semantics remain unchanged.

`createMechanicalAtelier.update(dt,state)` advances the queue and returns decorative feed. `renderSurface(sampleSurface,dt,reduced)` now paints the arm poses after the cloth geometry updates. The cloth host calls it in that order so tools sample the same frame's actual surface. Public `surfaceAtX` and `timeAtX` remain available. Park/suspend/disable/reduced-motion/disposal contracts are preserved.

### Verification and limits

- All 150 repository tests pass, including four new rigid-arm tests. Those cover 14,472 work/fold/muted poses, 240,024 subframe continuity samples, fixed segment lengths and exact supplied-surface contact. Targeted ESLint and generated site HTML checks pass.
- Four actual arm-mesh sweeps, 2,800 poses each, cover normal/muted cloth plus full-supply and full-takeup positions, all lanes, weaving, unpicking, paired and distant moves, travel and jam assistance. The measured noncontact structure clearance is at least .0101189; sampled tool-to-own-arm clearance is .0176562; own-side mesh margin is at least .03896. The intended source cup/base bearing interface has about .0004 sampled seat clearance. It is an attachment, not a noncontact obstacle.
- Sampled tool contact deviation is at most .0014266, within the deliberate sewing stroke. The actual complete cloth transport, without substituting its atelier, follows muted cloth with .0008817 measured contact error and passes six queue/lifecycle/disposal checks. All owned production resources dispose once.
- Notes' separate source-skin sweep covers 8,040 deployment/width/tilt poses. The combined loaded host now includes all six faces: actual vertices of 1,043 other meshes stay beyond a cube-local separating plane with .068999997 clearance to the sampled moving Notes hardware envelope. Its fixed frame attachments, pane/profile bounds and fallback/resize checks are documented in the Notes handoff. This acceptance is representative sampled visual clearance, not a continuous self-contact or fabrication certificate.

Evidence: `output/about-cube/odd-rigid-*-sweep.json`, `odd-rigid-full-supply.json`, `odd-rigid-full-takeup.json`, `odd-rigid-production-contact.txt`, `odd-rigid-production-lifecycle.txt`, `odd-rigid-muted-contact.png`, and `combined-notes-arm-clearance.txt` / `combined-notes-arm-view.png`. Disposable fixtures are `tmp/odd-rigid-arms-qa.html`, `tmp/odd-arm-production.html` and `tmp/cube-arm-combined-qa.html`.

### Remaining phases and steps

Required implementation and combined acceptance for this bounded armature order: complete. Optional later work: user motion review, continuous self-contact/fabrication audit, and Oddio's separate microphone/listening, capacity, loose-cloth and plate-layout decisions. Notes' new context drawing controls remain owned by Notes Face. No broader architecture work was advanced. No commit, push, publication or deployment.

[Live preview](http://127.0.0.1:8878/_1-about/about.html?review=1)

## Folded parking correction — October 18, 2026

The earlier idle elbow bent inward across the tracks. This correction supersedes that rest pose and the preceding clearance numbers. Each arm now doubles back along its respective panel edge. The shoulder remains at signed Y .184, Z .285; the elbow parks at signed X .2686701, signed Y .163, Z .291; the returning knuckle is at signed X .1016881, signed Y .184, Z .315, with the wrist .04 farther outward along X. The separate depths keep the returning rails and tool apart. Original socket positions and fixed link lengths remain unchanged.

Early unfolding interpolates rigid segment directions from this compact fold to the raised clearance pose. Work and lowering retain the analytic IK. Folding reverses that path. An unused arm stays in its panel gap throughout its partner's operation. Queue transitions separately deploy a newly needed arm or park an outgoing arm; two already deployed arms retain their existing safe travel path. A parked helper uses the same deployment path during jam assistance. No audio, clip or queue timing source changed.

Acceptance: all 151 repository tests, targeted ESLint and generated HTML checks pass. A new regression checks inactive arms at every lane/work phase and both start/end parked poses. Actual rendered working rails, cups, joints and tools occupy signed Y .1573943304 through .1900000001, leaving .0073943304 beyond the cloth track edge at .15. The socket/riser remain their intentional panel attachment. Two 2,800-pose actual-mesh sweeps cover full supply/unmuted and full takeup/muted conditions, all lanes and queue/jam paths. Minimum sampled noncontact structure clearance is .0072521591; tool-to-own-arm clearance is .0029560943. Work contact error remains within the deliberate ±.0015 sewing stroke. A 12,000-frame queued sew/delete/handoff/fold check passes with 15,306 parked-arm observations, and the full production rig passes suspension/resume, disable/enable, reduced-motion parking and idempotent disposal checks.

Current evidence: `output/about-cube/odd-folded-parked-geometry.txt`, `odd-folded-parked.png`, `odd-folded-supply-sweep.json`, `odd-folded-muted-takeup-sweep.json`, `odd-folded-queue-continuity.txt`, and `odd-folded-production-lifecycle.txt`. Earlier arm screenshots/numeric reports describe the superseded fold. These are representative visual clearance checks, not a fabrication certificate.

Remaining phases / steps for this correction: none after verification and reservation release. Optional user motion review and fabrication audit remain separate. No commit, push, publication or deployment.

[Live preview](http://127.0.0.1:8878/_1-about/about.html?review=1)

## Roller-contact surface follow-up — October 18, 2026

Oddio replaced the shoulder beams with panel-seated shafts and rubber drums at X ±.30. `guidedMutePoint` in `track-mute.mjs` constrains the complete cloth width to Z .249 at these supports and removes bow/flutter from the taut muted span. `cloth-rig.js` applies it to rendered vertices and the shared `sampleSurface` helper; public `surfaceAtX` delegates to that helper. Same-frame `atelier.renderSurface` ordering and the tool-center curl correction remain intact. No arm motion, tool or queue module changed. About Cube was notified under the user's existing shared-arm handoff authorization.

Validation: 154 repository tests and eight focused browser checks pass, including .000999 minimum sampled cloth/drum gap during moving mute transitions. Current evidence is `output/oddio-tension/`. Remaining phases / steps: user motion/layout review and the separate Oddio control-layout, capacity, device and optional fabrication decisions above. No further arm implementation is requested by this follow-up.

## Corner sockets and clearance leaves — October 19, 2026

This bounded follow-up supersedes the center socket and folded-arm coordinates above. The upper sewing ball now seats at `[+.370,+.184,.250]`, at the far right end of the upper panel's inward short edge. The lower unpicker ball seats at `[−.370,−.184,.250]`, at the far left end of the lower panel's inward short edge. Both remain radius .018 inside real radius .0185 spherical pockets lofted through the .032 panel thickness. The pockets leave .0115 of material to the ±.40 inner-edge endpoints. No broad control surface carries a socket.

Each panel also has a small through relief next to its own socket, spanning signed X .286–.336 and signed Y .192–.229. A .050 × .037 hinged leaf covers that opening when parked. The fixed hinge pin anchors in the panel; the leaf rotates forward to open before the links unfold and closes after they return. Cancel, suspend and disable close it immediately. The fixed ball seat remains separate from the relief. The leaf is a moving collision obstacle in the arm sweep, not a decorative overlay on solid panel material.

The rigid upper and forearm links are now .23/.23, with the .04 wrist link, .035 shoulder riser and .040 tool unchanged. Each parked arm folds **inward**: elbow at signed X about .141, signed Y .163, Z .291; returning knuckle at signed X about .367, signed Y .184, Z .328; wrist .04 farther inward. The parked tool also points inward, away from its own knuckle and rails. The return depth offset prevents the parked tool from brushing the forearm. The exact two-link solver follows a continuous elbow guide; its clearance circle keeps joints on their own X side and above the panel front. A bounded Z .37 staging wrist lifts and turns before moving across lanes, then seats the tip on the cloth sampled during that same frame. The sewing stroke still has its intentional ±.0015 Z motion. Queue, audio, tape, paired-move/tab and ghost-consumption semantics are unchanged.

The five-color feeder is smaller and panel mounted above the upper ball near `[.355,.258]`. Its axle runs continuously from the panel anchor through the bobbin and feed plate. All five eyelets seat into the plate; their thread curves follow the moving upper needle eye. The plate's leftmost X is .336, beyond the adjacent control's X .330 edge, leaving the rest of the upper panel available for later UI layout.

Current verification: 36 focused Oddio tests, targeted ESLint and site HTML checks pass. The rigid pose test covers fixed lengths, corner coordinates, flap-first deployment, own-side folding, supplied-surface contact and subframe continuity. Its per-1e-4-progress joint-motion limit is .002 instead of the earlier center-socket .0012 because the corner arm travels farther; the measured maximum with the continuous elbow guide is .001431. The final 12,000-frame queued sew/delete/handoff/fold fixture measures maximum .005205 joint movement per millisecond, below its .006 gate, with 16,320 parked-arm observations. A real production fixture passes 12 flap, through-opening, yarn and immediate-cancel checks over 150 frames, including the final outgoing flap closure; minimum sampled thread clearance from the upper socket is .080282. Production muted cloth contact error is .000882 and the six lifecycle/disposal checks pass.

The full-supply actual-mesh sweep covers 2,800 poses across four lanes, sew/unpick/move/travel/jam conditions, panels, controls, moving leaves, reel and tool self-clearance. Its minimum sampled noncontact structure gap is .011276, tool-to-own-arm gap .001620 and own-side margin .084. The 2,800-pose muted full-takeup sweep also passes, with minimum structure gap .012526, tool-to-own-arm gap .001620 and own-side margin .084. Contact deviation in both remains within the deliberate ±.0015 sewing stroke. Evidence is in `output/odd-corner-arms/`; the new disposable review fixtures are `tmp/odd-corner-arms/qa.html` and `production.html`. These sampled sweeps check the rendered mechanism, not continuous fabrication tolerances.

### Remaining phases and steps

The coordinator reviewed the final About preview and working arm/flap motion. No implementation or verification steps remain for this bounded corner-arm request.

Separate future work remains with Oddio: reel/tape clearance review, plate layout, capacity and microphone/listening checks. An optional fabrication audit could extend beyond the sampled collision checks.

No commit, push, publication or deployment was made.

[Live preview](http://127.0.0.1:8878/_1-about/about.html?review=1)
