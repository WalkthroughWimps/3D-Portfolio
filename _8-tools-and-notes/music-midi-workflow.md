# Music MIDI export and update workflow

## Update an existing song

Export edited MIDI to the source paths in its saved recipe, then run from the website folder:

```powershell
powershell -NoProfile -File tools/prepare-music-midi.ps1 -Recipe woods
```

The first-time dependency setup is the same command with `-Install`. Mido 1.3.3 is pinned in `tools/music-midi-requirements.txt`; the helper installs it into the disposable, ignored `tmp/music-midi-deps` directory. It uses a working Python 3.10+ from the project environment, the bundled Codex runtime, or PATH. Supply `-Python 'C:\path\to\python.exe'` if necessary. No MIDI playback driver or synthesizer is needed.

Use `-Check` for a read-only check that prepared files match the current sources and recipe. Changing any MIDI source, tempo reference, or recipe makes that check fail until preparation is rerun. Source fingerprints and note/tempo summaries are recorded in `midi/prepared/<song>/import-report.json`. Preparation is deterministic; unchanged input produces unchanged output.

Refresh the Music page after updating. If the MIDI notes changed but the recording still represents the old arrangement, re-export the audio/video too. Mido cannot infer a newly edited arrangement or missing tempo automation from an older recording.

## Export from REAPER

Prefer **File > Export project MIDI**, **Multitrack MIDI file (type 1)**, and **Embed project tempo/time signature changes**. Export the entire intended arrangement from the same start point as the audio, including any initial silence. Keep stable, unique instrument track names. One multitrack file can supply both the tempo map and all instrument parts; the importer can split it using the recipe below.

The setting is documented in the official [REAPER user guide](https://www.reaper.fm/userguide.php), section "Exporting Project MIDI". Do not export only a late-starting item and expect its project entrance to survive without a common start range.

## Export from Ableton Live

Live documents **File > Export MIDI Clip** for individual clips, rather than REAPER's project-wide export workflow. Prepare each instrument over the same complete arrangement range, retaining leading rests and committing repeated clips to that range before export. Verify the exported files using the inspector below. Do not assume a clip export includes the project's complete tempo automation.

If it has no tempo events, a constant-tempo song can explicitly specify `default_bpm` in its recipe. For tempo changes or ramps, supply a matching MIDI tempo-reference export. The tool does not reconstruct missing tempo automation from audio or from `.als`/`.rpp` project files. Updating the notes alone can reuse an unchanged tempo reference; changing the project's tempo requires updating the reference too.

See the official [Ableton file-management manual](https://www.ableton.com/en/manual/managing-files-and-sets/#exporting-midi-files). The importer catches a completely missing opening tempo, but cannot prove that an otherwise valid map contains every change intended in the DAW. Validate against the recording.

## Recipe for a new song

Recipes live in `source-files/music-midi/<song>.json`; source and output paths are relative to the website root. The output directory must be inside the project. Input files are never overwritten. Example for one named multitrack export:

```json
{
  "version": 1,
  "song": "new-song",
  "output_dir": "midi/prepared/new-song",
  "tempo_source": "midi/new-song.mid",
  "parts": [
    {"id": "piano", "source": "midi/new-song.mid", "track": "Piano"},
    {"id": "strings", "source": "midi/new-song.mid", "track": "Strings"}
  ]
}
```

`track` is an exact, unique track name or a zero-based track index. Omit it to retain all tracks in a separate instrument file. Stable part IDs define output filenames; selecting a differently named DAW track only requires editing its recipe entry. The importer preserves absolute note ticks and all non-tempo events, including velocities, controllers, pedal, pitch bends, metadata and instrument programs. It does not transpose concert/written pitches or trim each part to its own first note.

`tempo_source` defaults to the first part's source. Its map is authoritative for every part. All input must be synchronous PPQ MIDI type 0 or 1; independent type 2 and SMPTE timing are rejected. Tempo ticks are converted by beat position when source and destination PPQ differ, with at most half a destination tick of rounding. Same-tick events in one track use the final tempo value; conflicting simultaneous values on different tracks fail for review. Consecutive identical tempo values are removed.

For a confirmed constant-tempo export lacking tempo events, add `"default_bpm": 120` (using the actual project BPM). This is an explicit fallback, never a duration-based guess. There is no automatic audio-onset alignment or duration stretching in the importer.

Preparation validates all parts before writing any files, checks unmatched note events, verifies every non-tempo event survives a serialize/read round trip, and flags same-pitch/channel overlaps for review. Generated files are replaced atomically individually; concurrent edits to the same recipe/output directory should use the project's file reservations.

Adding a recipe prepares assets; adding a new song's audio, icon, colors and registration in the page remains a separate integration step. Local `midi/` assets are ignored by Git under the existing media policy; keep prepared copies with the local/media deployment assets.

## Inspect an export

The PowerShell helper also lists track names and tempo health without requiring a separate Python setup:

```powershell
powershell -NoProfile -File tools/prepare-music-midi.ps1 -Inspect midi/woods.mid
```

With any Python environment containing Mido:

```powershell
python tools/music-midi-import.py inspect midi/new-song.mid
python tools/music-midi-import.py prepare source-files/music-midi/new-song.json
python tools/music-midi-import.py prepare source-files/music-midi/new-song.json --check
python -m unittest discover -s tools -p test_music_midi_import.py
```

If using the helper's installed dependency directory directly, set `$env:PYTHONPATH = "$PWD/tmp/music-midi-deps"` first and use a working Python executable. The inspector lists track names/indexes, tempo health and note pairing. Preparation stops on a missing map unless an explicit constant opening BPM was supplied.

## Woods correction

`source-files/music-midi/woods.json` retains the five original instrument files, using `midi/woods.mid` only as their tempo reference. The combined file has the same 1,180 notes and the missing slowdown. Its 1,024-PPQ tempo map is transferred to the 960-PPQ parts. The Music page uses `midi/prepared/woods/woods-<part>.mid`; the five source exports and their original note ticks remain unchanged. Existing instrument IDs, colors and shared-note handling are preserved. Woods already has `preserveMidiTempo: true`, so the page does not duration-stretch the corrected score.

## Other three songs: prepared and connected

Recipes also exist for `baby`, `raisins`, and `forests`. The same command accepts any of those names, for example `powershell -NoProfile -File tools/prepare-music-midi.ps1 -Recipe forests`. All four live tracks now load the corresponding `midi/prepared/<song>/` assets.

Baby retains its approximately 119.974 BPM source tempo. Forests retains its approximately 140 BPM map and all three part entrances. Raisins gains an explicit 120 BPM tempo event, matching the standard default already used for its tempo-less original. No notes, sentinel bookends, original timestamps, audio or video were edited in preparation.

All four songs now preserve their MIDI tempo in playback. Baby and Forests use their original score/audio time axes, without aligning away native first-note rests. Raisins uses a 960 ms audio-minus-score offset based on the prior 30/60/90-second musical matching (approximately 940-980 ms), and no longer gets duration-stretched. Woods retains its near-matching audible-onset alignment and restored variable tempo map.

## Fine-tune the piano with Sync

On a recorded song, the upper player's Sync slider now adjusts MIDI against the recording, including Woods with no video. **Positive advances the piano; negative delays it.** Values are in source-time milliseconds, so they scale consistently with playback speed. Arrow adjustments use 5 ms steps; the range remains ±3000 ms.

Each song's manual correction starts at zero and is stored separately in the shared settings field `music.midiSyncOffsets` (storage key `site.music.midi-sync-offsets`). It survives refreshes and song changes, responds to shared/cross-tab updates, and participates in Music settings transfer/reset through the existing schema. The former site-wide video sync value is not adopted as a song calibration.

Changing a recorded-song correction rebuilds the held/released keys, pedal state, note cursor and falling notes without restarting audio or moving the matching video. It works while playing, paused, or stopped; start/resume/seek/speed paths all use the same correction. The standalone Sunil video and the site's global video/audio setting retain their existing separate behavior. Precise audiovisual timing still depends on output/display latency; this change fixes per-song musical calibration, not physical device latency measurement.

## Remaining phases / steps

1. Re-export future MIDI to the recipe's source paths and rerun preparation; verify landmarks if timing or the arrangement changed.
2. Supply and integrate the two future songs when ready; importer preparation does not create page buttons.
3. Listening review of the connected tracks: fine-tune any remaining small per-song offsets with Sync. Woods was reported very close after its tempo correction; the now-functional MIDI adjustment addresses a constant residual offset. Recheck musical landmarks if MIDI or recording exports change.
4. Harden audio-output-based visual timing and video resynchronization, then test start/pause/resume/seek/speed/background recovery across browsers/devices.
5. Optional piano model work remains deferred: emission bake recovery, back-panel/text/pedal repairs, geometry/material optimization, visibility/scale review, and candidate GLB export/review. Site-wide architecture and player rollout remain with Overall Site.
