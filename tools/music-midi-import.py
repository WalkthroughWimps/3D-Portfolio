"""Prepare deterministic MIDI assets from a saved export recipe; never alter sources."""

import argparse
from collections import defaultdict, deque
from fractions import Fraction
import hashlib
import io
import json
from pathlib import Path
import re
import sys

try:
    import mido
except ImportError:
    raise SystemExit("Mido is missing. Run tools/prepare-music-midi.ps1 -Recipe woods -Install")

ROOT = Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def absolute_events(track):
    tick = 0
    for message in track:
        tick += message.time
        yield tick, message


def load_midi(path):
    midi = mido.MidiFile(path)
    if midi.type not in (0, 1) or midi.ticks_per_beat <= 0:
        raise ValueError(f"{path}: only synchronous PPQ MIDI type 0/1 is supported")
    return midi


def canonical_tempos(midi, default_bpm=None):
    """Same-track events at one tick use the last value; cross-track conflicts fail."""
    by_tick = defaultdict(dict)
    count = 0
    for index, track in enumerate(midi.tracks):
        for tick, message in absolute_events(track):
            if message.type == "set_tempo":
                if message.tempo <= 0:
                    raise ValueError("Tempo must be positive")
                by_tick[tick][index] = message.tempo
                count += 1
    result = []
    for tick, values in sorted(by_tick.items()):
        if len(set(values.values())) > 1:
            raise ValueError(f"Conflicting tempo events across tracks at tick {tick}")
        result.append((tick, next(iter(values.values()))))
    if not result or result[0][0] != 0:
        if default_bpm is None:
            raise ValueError("Tempo map missing at tick 0. Export it from the DAW, provide "
                             "tempo_source, or explicitly set default_bpm for a constant opening.")
        if not 0 < float(default_bpm) <= 1000:
            raise ValueError("default_bpm must be between 0 and 1000")
        result.insert(0, (0, mido.bpm2tempo(float(default_bpm))))
    # Consecutive equal values add no timing information.
    normalized = []
    for tick, tempo in result:
        if not normalized or normalized[-1][1] != tempo:
            normalized.append((tick, tempo))
    return normalized, count


def scale_tick(tick, source_ppq, target_ppq):
    whole, remainder = divmod(tick * target_ppq, source_ppq)
    return whole + int(2 * remainder >= source_ppq)


def selected_tracks(midi, selector):
    if selector is None:
        return list(midi.tracks)
    if isinstance(selector, int) and not isinstance(selector, bool):
        if selector < 0 or selector >= len(midi.tracks):
            raise ValueError(f"Track index {selector} does not exist")
        return [midi.tracks[selector]]
    matches = [track for track in midi.tracks if track.name == selector]
    if len(matches) != 1:
        raise ValueError(f"Track name {selector!r} matched {len(matches)} tracks; use an exact name or index")
    return matches


def message_signature(tracks):
    return [[(tick, message.copy(time=0).bytes())
             for tick, message in absolute_events(track)
             if message.type not in ("set_tempo", "end_of_track")]
            for track in tracks]


def prepare_part(source, selector, tempos, tempo_ppq):
    tracks = selected_tracks(source, selector)
    output = mido.MidiFile(type=0 if len(tracks) == 1 else 1,
                          ticks_per_beat=source.ticks_per_beat, charset=source.charset)
    scaled = {}
    for tick, tempo in tempos:
        scaled[scale_tick(tick, tempo_ppq, source.ticks_per_beat)] = tempo
    for index, track in enumerate(tracks):
        events = [(tick, 1, order, message) for order, (tick, message)
                  in enumerate(absolute_events(track))
                  if message.type not in ("set_tempo", "end_of_track")]
        end_tick = sum(message.time for message in track)
        if index == 0:
            events.extend((tick, 0, order, mido.MetaMessage("set_tempo", tempo=tempo))
                          for order, (tick, tempo) in enumerate(scaled.items()))
        events.sort(key=lambda event: event[:3])
        prepared = mido.MidiTrack()
        last_tick = 0
        for tick, _, _, message in events:
            prepared.append(message.copy(time=tick - last_tick))
            last_tick = tick
        prepared.append(mido.MetaMessage("end_of_track", time=max(0, end_tick - last_tick)))
        output.tracks.append(prepared)
    buffer = io.BytesIO()
    output.save(file=buffer)
    data = buffer.getvalue()
    reloaded = mido.MidiFile(file=io.BytesIO(data))
    if message_signature(tracks) != message_signature(reloaded.tracks):
        raise ValueError("Round-trip changed a non-tempo event or its absolute tick")
    return reloaded, data


def audit(midi):
    active = defaultdict(deque)
    notes, orphan, overlaps = 0, 0, 0
    first_on, last_off, seconds = None, 0.0, 0.0
    for message in midi:
        seconds += message.time
        if message.type == "note_on" and message.velocity:
            key = (message.channel, message.note)
            overlaps += bool(active[key])
            active[key].append(seconds)
            notes += 1
            if first_on is None:
                first_on = seconds
        elif message.type == "note_off" or (message.type == "note_on" and not message.velocity):
            key = (message.channel, message.note)
            if active[key]:
                active[key].popleft()
            else:
                orphan += 1
            last_off = seconds
    return {"notes": notes, "first_note_sec": first_on, "last_release_sec": last_off,
            "file_duration_sec": seconds, "unclosed": sum(map(len, active.values())),
            "orphan_releases": orphan, "same_pitch_overlaps": overlaps}


def require_notes(stats, label):
    if not stats["notes"] or stats["unclosed"] or stats["orphan_releases"]:
        raise ValueError(f"{label}: empty part or unmatched note events: {stats}")


def read_recipe(recipe_path, root=ROOT):
    config = json.loads(recipe_path.read_text(encoding="utf-8-sig"))
    if config.get("version") != 1:
        raise ValueError("Recipe version must be 1")
    song = config["song"]
    if not isinstance(song, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", song):
        raise ValueError("song must be a lowercase filename slug")
    output_dir = (root / config["output_dir"]).resolve()
    if not output_dir.is_relative_to(root.resolve()) or output_dir == root.resolve():
        raise ValueError("output_dir must be a directory inside the project")
    if not config.get("parts"):
        raise ValueError("Recipe needs at least one part")
    sources = {}

    def get_source(filename):
        path = (root / filename).resolve()
        if path not in sources:
            raw = path.read_bytes()
            sources[path] = (load_midi(path), digest(raw))
        return sources[path][0]

    tempo_source = config.get("tempo_source", config["parts"][0]["source"])
    reference = get_source(tempo_source)
    tempos, raw_count = canonical_tempos(reference, config.get("default_bpm"))
    artifacts, parts, ids = {}, [], set()
    warnings = []
    if raw_count == 0:
        warnings.append("No exported tempo events: using the recipe's explicit default_bpm.")
    for part in config["parts"]:
        part_id = part["id"]
        if not isinstance(part_id, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", part_id) or part_id in ids:
            raise ValueError(f"Invalid or duplicate part id: {part_id}")
        ids.add(part_id)
        source = get_source(part["source"])
        before = mido.MidiFile(type=0 if len(selected_tracks(source, part.get("track"))) == 1 else 1,
                               ticks_per_beat=source.ticks_per_beat)
        before.tracks.extend(selected_tracks(source, part.get("track")))
        # Source statistics are diagnostic; a conductor track may hold the tempo elsewhere.
        original_stats = audit(before)
        prepared, data = prepare_part(source, part.get("track"), tempos, reference.ticks_per_beat)
        stats = audit(prepared)
        require_notes(stats, part_id)
        if stats["same_pitch_overlaps"]:
            warnings.append(f"{part_id}: {stats['same_pitch_overlaps']} same-channel/pitch overlaps; inspect in DAW.")
        own_tempos = [message for track in source.tracks for message in track if message.type == "set_tempo"]
        if not own_tempos:
            warnings.append(f"{part_id}: source has no tempo events; supplied by {tempo_source}.")
        filename = f"{song}-{part_id}.mid"
        artifacts[filename] = data
        parts.append({"id": part_id, "source": part["source"], "track": part.get("track"),
                      "output": filename, "sha256": digest(data), "ticks_per_beat": prepared.ticks_per_beat,
                      "source_timing": original_stats, "prepared_timing": stats})
    # Refuse source aliases, including an accidentally chosen output directory.
    for filename in [*artifacts, "import-report.json"]:
        if (output_dir / filename).resolve() in sources or (output_dir / filename).resolve() == recipe_path.resolve():
            raise ValueError("Output would overwrite an input file")
    report = {"version": 1, "song": song, "recipe_sha256": digest(recipe_path.read_bytes()),
              "tempo_source": tempo_source, "source_tempo_events": raw_count,
              "normalized_tempo_events": len(tempos),
              "tempo_map": [{"beat": float(Fraction(tick, reference.ticks_per_beat)),
                             "microseconds_per_beat": tempo, "bpm": mido.tempo2bpm(tempo)}
                            for tick, tempo in tempos],
              "sources": [{"path": str(path.relative_to(root)) if path.is_relative_to(root) else str(path),
                           "sha256": sha} for path, (_, sha) in sources.items()],
              "parts": parts, "warnings": warnings,
              "audio_alignment": "Not measured by this tool. Verify against the recording; never stretch to file duration."}
    artifacts["import-report.json"] = (json.dumps(report, indent=2) + "\n").encode("utf-8")
    return output_dir, artifacts, report


def run_recipe(recipe_path, check=False, root=ROOT):
    output_dir, artifacts, report = read_recipe(recipe_path, root)
    if check:
        stale = [name for name, data in artifacts.items()
                 if not (output_dir / name).is_file() or (output_dir / name).read_bytes() != data]
        if stale:
            raise ValueError("Prepared assets are stale or missing: " + ", ".join(stale))
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
        # All parts validate in memory before replacing any prepared asset.
        for name, data in artifacts.items():
            destination = output_dir / name
            temporary = output_dir / (name + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(destination)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="Build or check a saved JSON recipe")
    prepare.add_argument("recipe", type=Path)
    prepare.add_argument("--check", action="store_true", help="Read-only stale-export check")
    inspect = commands.add_parser("inspect", help="List tracks, note health, and exported tempo events")
    inspect.add_argument("files", type=Path, nargs="+")
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            report = run_recipe(args.recipe.resolve(), check=args.check)
            print(f"{report['song']}: {'verified' if args.check else 'prepared'} "
                  f"{len(report['parts'])} parts; {report['normalized_tempo_events']} tempo events")
            for part in report["parts"]:
                timing = part["prepared_timing"]
                print(f"  {part['id']}: {timing['notes']} notes, "
                      f"{timing['first_note_sec']:.3f}s to {timing['last_release_sec']:.3f}s")
            for warning in report["warnings"]:
                print("  NOTE: " + warning)
        else:
            for path in args.files:
                midi = load_midi(path)
                try:
                    tempos, count = canonical_tempos(midi)
                    tempo_info = {"exported_events": count, "normalized_events": len(tempos)}
                except ValueError as error:
                    tempo_info = {"error": str(error)}
                print(json.dumps({"file": str(path), "ticks_per_beat": midi.ticks_per_beat,
                                  "tracks": [{"index": index, "name": track.name,
                                              "notes": sum(message.type == "note_on" and message.velocity > 0
                                                           for message in track)}
                                             for index, track in enumerate(midi.tracks)],
                                  "tempo": tempo_info, "note_health": audit(midi)}, indent=2))
    except (ValueError, KeyError, OSError, EOFError) as error:
        print(f"MIDI import failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
