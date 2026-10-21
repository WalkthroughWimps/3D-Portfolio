# Videos captions: automatic drafts

These six `.srt` files are **unreviewed automatic captions** for the Videos tablet selections. They were generated from the corresponding detached `.opus` soundtracks using faster-whisper `base.en`, with word-level timestamps and cue lengths capped at 5.5 seconds. Source hashes, durations and cue counts are in `output/captions-draft/report.json`.

Caption scope is the six Videos tablet selections only. Other pages do not have spoken lines requiring captions; the Music page song already displays its lyrics with a bouncing-ball effect.

Open each `.srt` in **Subtitle Edit** (the likely app meant by “OpenSubtitle”), correct words, punctuation, speaker changes, lyrics and sound descriptions, and check timing against the matching high-quality WebM plus Opus track at the site sync offset. The site reads these `.srt` files directly; saving the edited file updates its captions on the next page load. Keep UTF-8 encoding and the existing filenames.

Automatic recognition is especially uncertain for music, montages, proper names and overlapping speakers. Captions are opt-in and labeled as drafts until reviewed.
