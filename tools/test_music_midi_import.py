"""Run: python -m unittest discover -s tools -p test_music_midi_import.py"""

import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

import mido

spec = importlib.util.spec_from_file_location("music_midi_import", Path(__file__).with_name("music-midi-import.py"))
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def fixture(ppq=960, name="Flute", start=480, tempo=None):
    midi = mido.MidiFile(type=0, ticks_per_beat=ppq)
    track = mido.MidiTrack([mido.MetaMessage("track_name", name=name)])
    if tempo is not None:
        track.append(mido.MetaMessage("set_tempo", tempo=tempo))
    track.extend([mido.Message("program_change", channel=2, program=73),
                  mido.Message("note_on", channel=2, note=60, velocity=71, time=start),
                  mido.Message("control_change", channel=2, control=64, value=127, time=10),
                  mido.Message("pitchwheel", channel=2, pitch=400, time=10),
                  mido.Message("note_on", channel=2, note=60, velocity=0, time=460),
                  mido.MetaMessage("end_of_track", time=50)])
    midi.tracks.append(track)
    return midi


class ImportTests(unittest.TestCase):
    def test_tempo_conversion_preserves_every_non_tempo_event(self):
        source = fixture()
        prepared, data = importer.prepare_part(source, None, [(0, 500000), (1024, 1000000)], 1024)
        self.assertEqual(importer.message_signature(source.tracks), importer.message_signature(prepared.tracks))
        self.assertEqual([(tick, msg.tempo) for tick, msg in importer.absolute_events(prepared.tracks[0])
                          if msg.type == "set_tempo"], [(0, 500000), (960, 1000000)])
        self.assertEqual(importer.audit(prepared)["notes"], 1)
        self.assertEqual(data, importer.prepare_part(source, None, [(0, 500000), (1024, 1000000)], 1024)[1])

    def test_missing_tempo_requires_explicit_constant_or_reference(self):
        with self.assertRaisesRegex(ValueError, "Tempo map missing"):
            importer.canonical_tempos(fixture())
        self.assertEqual(importer.canonical_tempos(fixture(), 90)[0], [(0, mido.bpm2tempo(90))])

    def test_duplicate_tempos_use_last_at_tick_and_remove_redundant_values(self):
        midi = fixture()
        midi.tracks[0][:0] = [mido.MetaMessage("set_tempo", tempo=499999),
                             mido.MetaMessage("set_tempo", tempo=500003),
                             mido.MetaMessage("set_tempo", tempo=500003, time=100)]
        self.assertEqual(importer.canonical_tempos(midi), ([(0, 500003)], 3))

    def test_conflicting_conductor_tracks_fail(self):
        midi = fixture(tempo=500000)
        midi.type = 1
        midi.tracks.append(mido.MidiTrack([mido.MetaMessage("set_tempo", tempo=600000)]))
        with self.assertRaisesRegex(ValueError, "Conflicting tempo"):
            importer.canonical_tempos(midi)

    def test_multitrack_selection_keeps_late_entrance_and_conductor_tempo(self):
        midi = fixture(name="Later", start=1920)
        midi.type = 1
        midi.tracks.insert(0, mido.MidiTrack([mido.MetaMessage("set_tempo", tempo=1000000)]))
        tempos, _ = importer.canonical_tempos(midi)
        output, _ = importer.prepare_part(midi, "Later", tempos, 960)
        self.assertEqual(output.type, 0)
        self.assertEqual(importer.audit(output)["first_note_sec"], 2)
        self.assertEqual(importer.message_signature([midi.tracks[1]]), importer.message_signature(output.tracks))
        with self.assertRaisesRegex(ValueError, "matched 0 tracks"):
            importer.selected_tracks(midi, "missing")

    def test_note_health_flags_unclosed_orphan_and_preserves_velocity_zero_offs(self):
        self.assertEqual(importer.audit(fixture())["unclosed"], 0)
        midi = fixture()
        del midi.tracks[0][-2]
        with self.assertRaisesRegex(ValueError, "unmatched note"):
            importer.require_notes(importer.audit(midi), "broken")
        midi = fixture()
        midi.tracks[0].insert(0, mido.Message("note_off", note=90))
        self.assertEqual(importer.audit(midi)["orphan_releases"], 1)

    def test_recipe_updates_are_deterministic_and_check_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.mid"
            fixture(tempo=500000).save(source)
            original = source.read_bytes()
            recipe = root / "recipe.json"
            recipe.write_text(json.dumps({"version": 1, "song": "test", "output_dir": "prepared",
                                          "parts": [{"id": "flute", "source": "source.mid"}]}))
            importer.run_recipe(recipe, root=root)
            importer.run_recipe(recipe, check=True, root=root)
            self.assertEqual(source.read_bytes(), original)
            target = root / "prepared/test-flute.mid"
            prepared_before = target.read_bytes()
            updated = fixture(tempo=600000)
            updated.save(source)
            with self.assertRaisesRegex(ValueError, "stale"):
                importer.run_recipe(recipe, check=True, root=root)
            self.assertEqual(target.read_bytes(), prepared_before)
            importer.run_recipe(recipe, root=root)
            self.assertNotEqual(target.read_bytes(), prepared_before)

    def test_recipe_refuses_to_overwrite_source_or_write_outside_project(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(tempo=500000).save(root / "test-flute.mid")
            config = {"version": 1, "song": "test", "output_dir": ".",
                      "parts": [{"id": "flute", "source": "test-flute.mid"}]}
            recipe = root / "recipe.json"
            recipe.write_text(json.dumps(config))
            with self.assertRaisesRegex(ValueError, "inside the project"):
                importer.run_recipe(recipe, root=root)
            config["output_dir"] = "../elsewhere"
            recipe.write_text(json.dumps(config))
            with self.assertRaisesRegex(ValueError, "inside the project"):
                importer.run_recipe(recipe, root=root)
            (root / "prepared").mkdir()
            fixture(tempo=500000).save(root / "prepared/test-flute.mid")
            config["output_dir"] = "prepared"
            config["parts"][0]["source"] = "prepared/test-flute.mid"
            recipe.write_text(json.dumps(config))
            with self.assertRaisesRegex(ValueError, "overwrite an input"):
                importer.run_recipe(recipe, root=root)

    def test_invalid_later_part_does_not_partially_update_first_part(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture(tempo=500000).save(root / "source.mid")
            recipe = root / "recipe.json"
            recipe.write_text(json.dumps({"version": 1, "song": "test", "output_dir": "prepared",
                                          "parts": [{"id": "good", "source": "source.mid"},
                                                    {"id": "bad", "source": "missing.mid"}]}))
            with self.assertRaises(OSError):
                importer.run_recipe(recipe, root=root)
            self.assertFalse((root / "prepared").exists())

    def test_other_three_recipes_preserve_source_notes_and_timing(self):
        root = Path(__file__).resolve().parents[1]
        if not (root / "midi/babyshutup.mid").exists():
            self.skipTest("Local media is not hydrated")
        for song in ("baby", "raisins", "forests"):
            with self.subTest(song=song):
                recipe = root / f"source-files/music-midi/{song}.json"
                _, artifacts, report = importer.read_recipe(recipe, root)
                for part in report["parts"]:
                    source = importer.load_midi(root / part["source"])
                    output = mido.MidiFile(file=io.BytesIO(artifacts[part["output"]]))
                    self.assertEqual(importer.message_signature(source.tracks),
                                     importer.message_signature(output.tracks))
                    self.assertEqual(part["source_timing"]["notes"], part["prepared_timing"]["notes"])
                    # These three source scores already match the intended tempo.
                    # Raisins gains an explicit 120 BPM event, matching its former MIDI default.
                    source_events = list(source)
                    output_events = [message for message in output if message.type != "set_tempo"]
                    source_events = [message for message in source_events if message.type != "set_tempo"]
                    self.assertEqual(len(source_events), len(output_events))
                    for before, after in zip(source_events, output_events):
                        self.assertAlmostEqual(before.time, after.time, places=9)
                        self.assertEqual(before.copy(time=0), after.copy(time=0))
                    self.assertEqual(part["prepared_timing"]["unclosed"], 0)
                    self.assertEqual(part["prepared_timing"]["orphan_releases"], 0)

    def test_real_woods_all_notes_and_timing_match_reference(self):
        root = Path(__file__).resolve().parents[1]
        recipe = root / "source-files/music-midi/woods.json"
        if not (root / "midi/woods.mid").exists():
            self.skipTest("Local media is not hydrated")
        _, artifacts, report = importer.read_recipe(recipe, root)
        self.assertEqual(sum(part["prepared_timing"]["notes"] for part in report["parts"]), 1180)
        reference = importer.load_midi(root / "midi/woods.mid")
        reference_names = {"flute": "Flute", "oboe": "Oboe", "horn": "Horn in F",
                           "clarinet": "Bb Bass Clarinet", "bassoon": "Bassoon"}
        tempos, _ = importer.canonical_tempos(reference)

        def note_events(midi):
            now, events = 0, []
            for message in midi:
                now += message.time
                if message.type in ("note_on", "note_off"):
                    events.append((message.type, message.note, message.velocity, now))
            return events

        for part in report["parts"]:
            output = mido.MidiFile(file=io.BytesIO(artifacts[part["output"]]))
            source = importer.load_midi(root / part["source"])
            self.assertEqual(importer.message_signature(source.tracks), importer.message_signature(output.tracks))
            expected, _ = importer.prepare_part(reference, reference_names[part["id"]], tempos, reference.ticks_per_beat)
            actual_notes, expected_notes = note_events(output), note_events(expected)
            self.assertEqual(len(actual_notes), len(expected_notes))
            for actual, expected in zip(actual_notes, expected_notes):
                self.assertEqual(actual[:3], expected[:3])
                self.assertLess(abs(actual[3] - expected[3]), .0015)
            self.assertEqual(part["prepared_timing"]["unclosed"], 0)
        self.assertGreater(max(part["prepared_timing"]["last_release_sec"] for part in report["parts"]), 151)


if __name__ == "__main__":
    unittest.main()
