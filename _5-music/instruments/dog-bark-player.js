// Eight real bark recordings. Prefer nearby voices so transposition stays mild.
export const DOG_BARK_SAMPLES = [
  { file: 'dog-bark-01.wav', rootMidi: 58.11 },
  { file: 'dog-bark-02.wav', rootMidi: 58.11 },
  { file: 'dog-bark-03.wav', rootMidi: 65.88 },
  { file: 'dog-bark-04.wav', rootMidi: 58.11 },
  { file: 'dog-bark-05.wav', rootMidi: 73.34 },
  { file: 'dog-bark-06.wav', rootMidi: 63.21 },
  { file: 'dog-bark-07.wav', rootMidi: 52.90 },
  { file: 'dog-bark-08.wav', rootMidi: 71.25 }
];

export function getDogBarkVoiceForMidi(midi){
  const note = Number(midi);
  if(!Number.isFinite(note)) return null;
  const distances = DOG_BARK_SAMPLES.map(sample => Math.abs(note - sample.rootMidi));
  const nearest = Math.min(...distances);
  const secondNearest = distances.slice().sort((a, b) => a - b)[1];
  const nearby = DOG_BARK_SAMPLES.map((_, index) => index).filter(index => distances[index] <= Math.max(nearest + 3.5, secondNearest));
  const fullPitch = nearby.filter(index => {
    const rate = Math.pow(2, (note - DOG_BARK_SAMPLES[index].rootMidi) / 12);
    return rate >= 0.5 && rate <= 2;
  });
  const choices = fullPitch.length ? fullPitch : nearby;
  const index = choices[((Math.round(note) - 36) % choices.length + choices.length) % choices.length];
  const sample = DOG_BARK_SAMPLES[index];
  let soundingMidi = note;
  let playbackRate = Math.pow(2, (soundingMidi - sample.rootMidi) / 12);
  // Above twofold transposition the short bark turns into a chirp. Retain the
  // pitch class at extreme keys, with an explicit octave displacement.
  while(playbackRate > 2){ playbackRate /= 2; soundingMidi -= 12; }
  while(playbackRate < 0.5){ playbackRate *= 2; soundingMidi += 12; }
  return { index, playbackRate, soundingMidi, octaveShift: (soundingMidi - note) / 12 };
}

export async function loadDogBarkPlayer(audioCtx, baseUrl, options = {}){
  if(!audioCtx) throw new Error('Audio context unavailable');
  const prefix = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  const buffers = await Promise.all(DOG_BARK_SAMPLES.map(async sample => {
    const response = await fetch(`${prefix}${sample.file}`, { signal: options.signal });
    if(!response.ok) throw new Error(`Dog bark sample failed: ${response.status} ${sample.file}`);
    const bytes = await response.arrayBuffer();
    return audioCtx.decodeAudioData(bytes);
  }));
  if(buffers.some(buffer => !buffer || !buffer.duration)) throw new Error('Dog bark sample could not decode');
  return {
    _dogBark: true,
    sampleCount: buffers.length,
    getBufferForMidi(midi){
      const voice = getDogBarkVoiceForMidi(midi);
      return voice ? buffers[voice.index] : null;
    },
    play(midi, whenSec, opts = {}){
      const voice = getDogBarkVoiceForMidi(midi);
      if(!voice) return null;
      const source = audioCtx.createBufferSource();
      source.buffer = buffers[voice.index];
      source.playbackRate.value = voice.playbackRate;
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3800;
      lowpass.Q.value = 0.7;
      const highs = audioCtx.createBiquadFilter();
      highs.type = 'highshelf';
      highs.frequency.value = 2600;
      highs.gain.value = -4;
      const level = audioCtx.createGain();
      const startAt = Math.max(audioCtx.currentTime, Number.isFinite(whenSec) ? whenSec : audioCtx.currentTime);
      const duration = source.buffer.duration / voice.playbackRate;
      const fadeIn = Math.min(0.012, duration * 0.2);
      const fadeOut = Math.min(0.035, duration * 0.3);
      level.gain.setValueAtTime(0.0001, startAt);
      level.gain.linearRampToValueAtTime(0.72, startAt + fadeIn);
      level.gain.setValueAtTime(0.72, startAt + Math.max(fadeIn, duration - fadeOut));
      level.gain.linearRampToValueAtTime(0.0001, startAt + duration);
      source.connect(lowpass);
      lowpass.connect(highs);
      highs.connect(level);
      level.connect(opts.gainNode || audioCtx.destination);
      source.onended = () => {
        for(const node of [source, lowpass, highs, level]) try{ node.disconnect(); }catch{}
      };
      source.start(startAt);
      return {
        _src: source,
        stop(stopWhenSec){
          try{ source.stop(Number.isFinite(stopWhenSec) ? stopWhenSec : audioCtx.currentTime); }catch{}
        }
      };
    }
  };
}
