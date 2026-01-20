import { recording, configureRecordingEngine } from './music-transcription.js';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const trackListEl = document.getElementById('trackList');
const addTrackButton = document.getElementById('addTrackButton');
const recordStartBtn = document.getElementById('recordStart');
const recordStopBtn = document.getElementById('recordStop');
const playbackBtn = document.getElementById('playbackBtn');
const monitorToggle = document.getElementById('monitorDuringRecord');
const recordStatus = document.getElementById('recordStatus');
const perfMonitor = document.getElementById('perfMonitor');
const featureFlagsEl = document.getElementById('featureFlags');
const instrumentOverlay = document.getElementById('instrumentOverlay');
const instrumentOptions = document.getElementById('instrumentOptions');
const instrumentOverlayClose = document.getElementById('instrumentOverlayClose');

const INSTRUMENTS = [
  { id: 'grand_piano', label: 'Grand Piano' },
  { id: 'solo_string', label: 'Solo Strings' },
  { id: 'solo_wind', label: 'Solo Wind' },
  { id: 'solo_brass', label: 'Solo Brass' },
  { id: 'electric_piano', label: 'Electric Piano' },
  { id: 'harpsichord', label: 'Harpsichord' }
];

const FEATURE_FLAGS = [
  { id: 'SHOW_GRID', label: 'Show Grid', value: true },
  { id: 'SHOW_NOTES', label: 'Show Notes', value: true },
  { id: 'SHOW_PLAYHEAD', label: 'Show Playhead', value: true },
  { id: 'SHOW_PERF', label: 'Show Perf Monitor', value: true }
];

const featureState = new Map(FEATURE_FLAGS.map(flag => [flag.id, flag.value]));

let renderHandle = null;

const dependencies = {
  getNowMs: () => performance.now(),
  getAudioTimeSec: () => audioCtx.currentTime,
  render: () => scheduleRender(),
  getInstrumentSnapshotForSide: () => ({ id: 'grand_piano', name: 'Grand Piano' }),
  noteOn: (midi) => console.log('NoteOn', midi),
  noteOff: (midi) => console.log('NoteOff', midi),
  panic: () => console.warn('panic requested'),
  clampRange: (value, min, max) => Math.max(min, Math.min(max, value)),
  getDualMode: () => false,
  playMetronomeClick: (accent, when) => {
    console.log('metronome', accent ? 'accent' : 'tick', 'at', when);
  }
};

configureRecordingEngine(dependencies);

function scheduleRender() {
  if (renderHandle !== null) return;
  renderHandle = window.requestAnimationFrame(() => {
    renderHandle = null;
    renderTracks();
    updateStatus();
    updatePerf();
  });
}

function ensureAudioContext() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {/* ignore */});
  }
}

function updateStatus() {
  const state = recording.state;
  const statusText = state.recording ? 'Recording' : state.playing ? 'Playing' : 'Idle';
  recordStatus.textContent = statusText;
}

function updatePerf() {
  if (!featureState.get('SHOW_PERF')) {
    perfMonitor.style.display = 'none';
    return;
  }
  perfMonitor.style.display = 'block';
  const { tracks, playheadMs, recording: isRecording } = recording.state;
  perfMonitor.textContent = `Tracks: ${tracks.length} · Playhead: ${Math.round(playheadMs || 0)} ms · ${isRecording ? 'Recording' : 'Waiting'}`;
}

function renderFeatureFlags() {
  if (!featureFlagsEl) return;
  featureFlagsEl.innerHTML = '';
  FEATURE_FLAGS.forEach(flag => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = featureState.get(flag.id);
    input.addEventListener('change', () => {
      featureState.set(flag.id, input.checked);
      scheduleRender();
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(flag.label));
    featureFlagsEl.appendChild(label);
  });
}

function renderTracks() {
  if (!trackListEl) return;
  const { tracks, selectedTrackId } = recording.state;
  trackListEl.innerHTML = '';
  tracks.forEach(track => {
    const row = document.createElement('div');
    row.className = 'track-row';
    if (track.id === selectedTrackId) row.classList.add('active');

    const info = document.createElement('div');
    info.className = 'track-info';
    const title = document.createElement('div');
    title.className = 'track-name';
    title.textContent = track.name;
    const subtitle = document.createElement('div');
    subtitle.className = 'track-sub';
    subtitle.textContent = track.instrumentName || 'No Instrument';
    info.append(title, subtitle);

    const controls = document.createElement('div');
    controls.className = 'track-controls';
    const armBtn = document.createElement('button');
    armBtn.type = 'button';
    armBtn.textContent = track.recordEnabled ? 'Recording' : 'Arm Track';
    armBtn.addEventListener('click', () => {
      recording.setTrackRecordEnabled(track.id);
    });
    const instrBtn = document.createElement('button');
    instrBtn.type = 'button';
    instrBtn.textContent = track.instrumentName || 'Choose Instrument';
    instrBtn.addEventListener('click', () => openInstrumentOverlay(track.id));
    controls.append(armBtn, instrBtn);

    row.append(info, controls);
    trackListEl.appendChild(row);
  });
}

function openInstrumentOverlay(trackId) {
  if (!instrumentOverlay) return;
  instrumentOverlay.dataset.trackId = String(trackId);
  instrumentOverlay.classList.remove('hidden');
}

function closeInstrumentOverlay() {
  if (!instrumentOverlay) return;
  instrumentOverlay.classList.add('hidden');
  delete instrumentOverlay.dataset.trackId;
}

function populateInstrumentOptions() {
  if (!instrumentOptions) return;
  instrumentOptions.innerHTML = '';
  INSTRUMENTS.forEach(inst => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = inst.label;
    btn.dataset.instrumentId = inst.id;
    btn.addEventListener('click', () => {
      const trackId = Number(instrumentOverlay?.dataset.trackId);
      const track = recording.state.tracks.find(t => t.id === trackId);
      if (track) {
        track.instrumentId = inst.id;
        track.instrumentName = inst.label;
        recording.selectRecordTrack(track.id);
        scheduleRender();
      }
      closeInstrumentOverlay();
    });
    instrumentOptions.appendChild(btn);
  });
}

if (instrumentOverlay) {
  instrumentOverlay.addEventListener('click', (event) => {
    if (event.target === instrumentOverlay) closeInstrumentOverlay();
  });
}
instrumentOverlayClose?.addEventListener('click', closeInstrumentOverlay);

addTrackButton?.addEventListener('click', () => {
  recording.addRecordTrack();
});

recordStartBtn?.addEventListener('click', () => {
  ensureAudioContext();
  recording.startRecordingSession();
});

recordStopBtn?.addEventListener('click', () => {
  recording.stopRecordingSession();
});

playbackBtn?.addEventListener('click', () => {
  ensureAudioContext();
  recording.playRecordPlayback();
});

monitorToggle?.addEventListener('change', () => {
  recording.toggleMonitorDuringRecord();
});

renderFeatureFlags();
populateInstrumentOptions();
recording.normalizeRecordTracksForMode();
scheduleRender();
