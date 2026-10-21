# Phase 8 validation evidence

October 6, 2026. **INCOMPLETE release gate.** Read `phase-08-final-review.md`, `phase-08-release.md` and `phase-08-handoff.md`. The following are actual bounded results, not full release acceptance.

## Environment and provenance

Windows; Node 24.19.0, npm 11.17.0; installed headless Chrome 154.0.8037.98 via pinned @playwright/test 1.63.0. Browser contexts are disposable, DPR 1, 1280x720 and 390x844 CSS pixels, software WebGL, denied sound and no-store local responses. Main browser matrices block workers. The separate worker fixture uses real classic workers in isolated contexts. Neither physical devices nor audible output were tested. Root and genuine local `/portfolio/` servers served the packaged files without injected diagnostics; requests outside the subpath prefix were rejected. Both previews were stopped after validation.

Starting/ending HEAD: `add5dd6eae8c81c40d0052371bcd8a387f7c0385`. No commit, push, upload, publication or deployment. `output/phase-08/starting-status.txt` records inherited changes; final status/hash inventories distinguish this phase. Of 109 protected runtime/config files, 108 are unchanged. Only Start's two image path cases in `index.html` changed; its rollback copy matches the starting SHA-256. Prior JS/scene/audio/settings/store source is unchanged.

## Command gates and exact results

| Command/check | Result and evidence |
| --- | --- |
| `npm test` | **35 passed**, 0 failed/skipped/cancelled: 32 prior + 3 artifact/preview regressions. `output/phase-08/tests.txt` |
| `npm run check:site-html` | Passed; marked HTML/import maps/classic worker config current. `generated.txt` |
| `npm run lint -- --format json --output-file output/phase-08/lint.json` | **Exit 1**, 642 errors, 0 warnings, zero new Phase 8 errors. Delta: 0 versus Phase 7, -40 versus Phase 1's 682. No lint waiver |
| `npm run check:artifact` | Passed; explicit inventory, required files, case collision, symlink and LFS-pointer guards. `artifact-plan.json` |
| `node tools/release-artifact.mjs build output/phase-08/artifact-v3/site` | Final generation: **1,041 files / 1,360,297,403 bytes**. Relocated locally to canonical `output/phase-08/artifact/site`; no publication. `artifact-built.json` |
| Streaming hash verification after relocation | **1,041/1,041** SHA-256 match; `artifact-final-verify.json` |
| `node tools/phase-08-references.mjs` | **269 references, 0 missing, 0 case mismatches** after review corrections. HTML/CSS/ES-module literal scope only; `references.json` |
| `npm run hydrate:assets` | All **7 local inputs** match pinned lengths/digests; `hydration.txt`. Missing-bank recovery in isolated snapshot **exits 1** with HTTP 404; `clean-missing-bank.txt` |
| Fresh isolated `npm ci --ignore-scripts --cache ../npm-cache --no-audit --no-fund` | Installed **127 packages**, exit 0; `clean-install.txt`. Source snapshot contained explicit local asset inputs, not existing node_modules |
| Snapshot `npm test`, `check:site-html`, `check:artifact` | **35 tests pass**, generated/artifact checks pass; `clean-tests.txt`. This does not establish a clean committed checkout or successful remote asset recovery |
| `git diff --check` | Exit 0, inherited LF/CRLF notices only; `diff-check.txt` |
| Revision 9 instruction PDF | **5 pages**; revision/end marker confirmed by pypdf and all Poppler PNG pages visually reviewed; no clipping/overlap observed |

Some source asset reads, notably `assets/computer-app-icons/Ableton Live.svg`, were denied in the sandbox. Approved read/build/test escalation succeeded. The failed unprivileged attempts are setup failures, not final test passes. Initial browser/reference predicates and one new lint declaration were corrected after review, with no inherited tests dropped. A missing-bank probe initially triggered a Node/Windows shutdown assertion after an unhandled fetch error; cancelled rejected response bodies and controlled failure reporting now reproduce a clean exit 1. Do not count failed setup attempts as passed scenarios.

## Final browser matrix

`output/phase-08/browser-final/results.json` and `browser-subpath-final/results.json` each contain **58 cases: 52 passed, 6 failed**. Both `npm run test:browser` processes exited **1**. Screenshot references are recorded per case, with 56 route/scenario images for each base. The additional missing-script sentinel tests the harness, not the product.

| Bounded scenario | Root | Local subpath | What this establishes |
| --- | --- | --- | --- |
| Seven normal entries at desktop/narrow | 14/14 | 14/14 | Titles/descriptions/main landmarks, no uncaught errors or required local script/style/font failures; not complete scene/media interactions |
| No JavaScript | 14/14 | 14/14 | Named visible navigation and main landmarks; 12 content skip targets per base focus correctly |
| Blocked local/session storage getters | 7/7 | 7/7 | Direct shells do not raise uncaught storage errors; not blocked cookies/IDB/quota or all control paths |
| Reduced-motion class | 7/7 | 7/7 | Shared class present; not every page scene/animation motion contract |
| GLBs deliberately aborted | 7/7 | 7/7 | No uncaught errors during bounded probe; not successful complete fallback/playback |
| WebGL unavailable | **1/7** | **1/7** | Graphics guarded path passes; six other routes fail |
| Deliberate Graphics main-module 404 | 1/1 | 1/1 | Revised harness detects missing local module as required failure, even without pageerror |
| Settings browser case | 1/1 | 1/1 | Canonical volume 0/mute false override legacy values; volume 0.37 crosses tabs/reloads; Reset returns 0.25/removes aliases and preserves denied cookie |

The unavailable-WebGL failures are Start, About, Videos, Games, Music and Docs. Music additionally throws `Cannot access 'instrumentPickerEl' before initialization`. Those match inherited Phase 7 failures. HTTP/request arrays remain separate: missing external/media requests must not be hidden by a page-shell pass. Fault injection/teardown aborts are not uniformly load regressions. Local artifact previews do not include every external media family; they do not reproduce network-cold production audio/video.

The six static video alternative files were explicitly added to packaging. All **12 root/subpath HEAD checks** return 200 in `alternative-links.json`. Videos are visual previews with separate audio. Generated games and the 2D recorder remain packaged, but their full controls/consent/recording parity was not accepted here.

Final normal desktop/narrow screenshot contact sheets were visually inspected. Page shells render, with inherited cropping on some narrow scenes and incomplete Videos tablet media in the local artifact. This visual check does not establish full playback or interaction parity.

## Worker and asset-host results

`node tools/phase-08-worker.mjs` exits **1**: **4/6 checks pass** in `worker.json`.

- Install/upgrade removes old owned intro cache while retaining an unrelated cache: pass.
- Empty-cache online Range `bytes=0-63`: **FAIL**, `TypeError: Failed to fetch`; successful 206 network response cannot be cache.put, and the worker converts that cache-write failure to a network error.
- Query-insensitive full cached intro offline: pass, status 200 / 9,380,850 bytes.
- Cached offline Range `bytes=0-63`: **FAIL**, full 200 / 9,380,850 bytes / no Content-Range.
- Unrelated offline miss and matching empty-cache offline miss: both reject as expected.

No decoded/audible offline playback, production-origin worker or physical-device gate was passed. Original unit worker regressions remain passing; live range behavior adds required closure to the earlier asset/worker gate.

`node tools/phase-08-network.mjs` records **32 HTTP probes, 16 pass** in `network.json`: eight root/subpath local ranges pass; production-origin HEAD/ranges pass for four sampled files; card-test and Hypersound return 404 under both origins; localhost CORS is unsupported by sampled responses allowing `https://matthallportfolio.com`. HTTP header probes do not enforce browser CORS/CORP themselves or prove playback.

`provision-source-probes.json`: **5/7 production-origin HEAD/length/CORS probes pass**. Hypersound is 404. CDN `Videos/videos-page/music-videos-hq.webm` is 200 but **74,364,825 bytes**, differing from the candidate's **74,213,638**. Full downloaded digest/version/baseline reconciliation is required; do not repin silently. Other five video HEAD lengths match the candidate, which is weaker than verifying their remote SHA-256. The locally pinned seven inputs were independently hashed.

## Comparison with Phase 1 and coverage still open

Phase 1's five isolated correctness issues were repaired in Phase 2 and remain tested. Phase 7 supplied the durable navigation/skip/consent/storage/Graphics evidence described in its handoff; these bounded route checks continue to pass at real CSS dimensions. Phase 8 corrected asset-case references and packages the six static previews; no new material/light/camera/audio tuning occurred. Graphics' prior idle-draw improvement remains historical Phase 7 evidence, not a new whole-page performance claim. Fresh artifact servers avoid the earlier review injection, but do not turn these screenshots into controlled performance measurements.

Active playback/settings UI/dialog/keyboard canvas interactions, physical mobile/audio, screen reader/contrast/zoom/320px, all scene reduced motion, audible Music reference/first note and long-run sync, real recorded notes/transcription, resource-counted lifecycle/BFCache, Three/decoder/backend compatibility, real browser IDB/quota/versions/eviction and saved-byte/preparation/readiness limits remain incomplete. Save/preparation integration does not exist. Full seven-route-plus-alternative acceptance cannot pass before those earlier phase implementations/gates are completed.

CI now has strict contract/artifact, lint and browser jobs, explicit verified provisioning and reference checks; no deployment action. It has not run remotely. Hypersound recovery and music-video integrity currently block clean external input recovery; inherited uncommitted source and required LFS/media also prevent a reproducible committed release today. All open gates are enumerated in the final handoff and Astra review.
