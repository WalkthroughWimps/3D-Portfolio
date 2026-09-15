# Video Player Button Inventory

Canonical shared video-player button set:

- `Back/Exit`
- `Play/Pause`
- `Mute`
- `Volume Slider`
- `Progress Bar`
- `Time Readout`
- `Speed`
- `Pitch Shift`
- `Sync`
- `Tablet View`

Per-page shared-strip availability after the merge:

## Videos

- Enabled: `Back/Exit`, `Play/Pause`, `Mute`, `Volume Slider`, `Progress Bar`, `Time Readout`, `Speed`, `Pitch Shift`, `Sync`, `Tablet View`
- Disabled: none
- Notes: Videos remains the canonical renderer and behavior baseline.

## Games

- Enabled: `Back/Exit`, `Play/Pause`, `Mute`, `Volume Slider`, `Progress Bar`, `Time Readout`, `Speed`
- Disabled: `Pitch Shift`, `Sync`, `Tablet View`
- Notes: disabled controls are intentionally shown in the shared layout so the button map stays consistent with Videos without inventing new Games-only behavior.

## Music Top Pad Video

- Enabled: `Back/Exit`, `Play/Pause`, `Mute`, `Volume Slider`, `Progress Bar`, `Time Readout`
- Disabled: `Speed`, `Pitch Shift`, `Sync`, `Tablet View`
- Notes: Music keeps its existing extra playback controls outside the shared strip, including page-specific speed presets and sync controls.

## Music Track Video

- Enabled: `Back/Exit`, `Play/Pause`, `Mute`, `Volume Slider`, `Progress Bar`, `Time Readout`
- Disabled: `Speed`, `Pitch Shift`, `Sync`, `Tablet View`
- Notes: Music track playback remains tied to the page transport. Existing external Music controls stay in place.

Non-video surface:

- The Music backboard is not part of the shared video-player system.
- It remains a page-specific UI and note-animation surface.
