// First sustained audible signal, rather than the strongest later attack.
export function firstAudibleOffsetMs(buffer, threshold = .001) {
  const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => buffer.getChannelData(i));
  const window = Math.max(1, Math.round(buffer.sampleRate * .002));
  let run = 0;
  for (let offset = 0; offset < buffer.length; offset += window) {
    const end = Math.min(buffer.length, offset + window);
    let energy = 0;
    for (const channel of channels) {
      let sum = 0;
      for (let i = offset; i < end; i++) sum += channel[i] * channel[i];
      energy = Math.max(energy, sum / (end - offset));
    }
    run = energy >= threshold * threshold ? run + 1 : 0;
    if (run === 3) return Math.max(0, offset - 2 * window) / buffer.sampleRate * 1000;
  }
  return 0;
}

// Positive sync advances the piano against the recording; source-time offsets
// scale with playback speed, so the same saved calibration works at every rate.
export function midiElapsedForAudioPosition(positionSec, firstNoteMs, onsetMs, rate = 1, syncMs = 0) {
  return firstNoteMs + (positionSec * 1000 - onsetMs + syncMs) / Math.max(1e-6, rate);
}

// Source alignment is separate from device sync and from MIDI calibration.
// Some score renders and their videos were exported at different tempos.
export function videoSourceTimeForAudioPosition(positionSec, trimMs = 0, syncMs = 0, timing = {}) {
  const scale = Number.isFinite(timing.scale) && timing.scale > 0 ? timing.scale : 1;
  const offsetMs = Number.isFinite(timing.offsetMs) ? timing.offsetMs : 0;
  return (positionSec + trimMs / 1000) * scale + (offsetMs + syncMs) / 1000;
}

export function videoTimeForAudioPosition(positionSec, trimMs = 0, syncMs = 0, timing = {}) {
  return Math.max(0, videoSourceTimeForAudioPosition(positionSec, trimMs, syncMs, timing));
}
