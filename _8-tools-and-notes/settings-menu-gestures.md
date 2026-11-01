# Shared settings menu gestures

User-requested site-wide interaction contract, October 25, 2026. Folding applies to every existing UI panel with sections, including informational guides and future sectioned panels. Archive transfer applies only to Settings and Constructor contexts on the seven main pages and future settings menus.

- Prevent the browser context menu across the site, while allowing right-button events to reach custom site controls.
- Left-click a section heading to expand or collapse that section. Headings must remain keyboard-operable buttons or native summaries.
- Right-click a heading once to expand all sections in its tab/context when any are collapsed, otherwise collapse them all. "Toggle all" is an acceptable short label if a label is needed.
- In Settings/Constructor only, middle-click inside a section body to open that section's Import / Export / Cancel popup.
- In Settings/Constructor only, middle-click a section heading or a settings tab to download the full site settings archive directly. The full archive includes current registered owners and cached settings from other pages.
- Do not advertise middle-click import/export in titles, hints, shortcuts, or other product text. Developer documentation may describe it.
- Retain Cancel, Escape, outside-click, and pointer-exit dismissal for transfer popups. Pointer-exit tolerance is the height of the Import button.

Implementation owners are `js/site-utils.js`, `_7-shared-scripts/panel-assembly/CollapsibleSections.mjs`, `_7-shared-scripts/panel-assembly/SettingsContextMenu.mjs`, and `debug/panel-shell.js`, plus each non-settings panel's explicit fold mount. Section enhancement must preserve existing control node identity, listeners, values, and disposal. Constructor expansion state uses its own scope, separate from normal Settings; non-settings panels use their own scopes and receive no transfer menu or reordering. Nested menus must handle a gesture once; middle-click handling must run before a panel's scene-isolation pointerdown handler stops propagation.

When a section is inserted after its shared fold controller mounts, its owner calls `refresh()` or dispatches a bubbling `settings-sections-refresh` event from the inserted section. The controller enhances only new headings and native details in its existing root; do this before binding or querying controls in the inserted section. Do not use a global heading observer or wrap flat toolbars. Explicit disclosure adapters keep custom state owners and fieldset legends intact.

For shared `data-setting` preferences embedded inside a privately managed settings tab, mark the enclosing section `data-shared-settings`. This routes its middle-click section transfer through the shared preferences exporter, while unmarked sections keep their private transfer format. The shared capture handler handles the gesture once before the nested menu.

Layout preservation: do not reload or reset a user's tab containing unexported edits to apply updated menu code. Preserve/export that tab first; use a separate tab for verification.

## Verification and remaining steps

October 25, 2026: live checks covered normal About Settings, Refs Constructor (all eight headings and the entire Cabinet construction section), nested Skills sections, late-added spheroid headings/native summary, Start, and Graphics. Single right-click expands/collapses the whole owning tab; middle-click section popups appear once and Cancel closes them. Constructor option values stayed unchanged during gesture checks. All seven main HTML entry points load the common browser-context-menu guard.

`output/settings-menu-gestures/full-export-qa.json` is a verified full-site archive with eleven owners, including `about.refs.sketch`. `spheroid-rotation-section.json` is a verified shared preferences section containing seven declared spheroid rotation paths. Scoped ESLint/module syntax and diff checks passed; the review server returned HTTP 200. Import validation and existing dismissal logic were preserved; a live file-picker import round trip was not repeated.

The human also renamed the former About Face chat to Fish Face. The live tab, face/backing switches, focus button, and both current and picture-mode context registrations now display Fish. Existing internal `about` identifiers and saved settings remain compatible. `fish-face-labels.jpg` records the live labels.

The original menu and rename implementation has no remaining source steps. Follow-up universal folding is tracked in `settings-architecture-progress.md`: new Oddio deck and Debug hook folds and all seven main routes still need live acceptance. Existing user tabs were not reloaded. The available Refs recovery snapshot was not verified against the newer screenshot layout and is not claimed as its backup; recovery of any still-unsaved layout requires locating the actual edited tab. No commit, push, publication, or deployment was requested or performed.
