
// Recording engine for the music page.
// Moved from music-piano-controls.v2.js to keep recording logic isolated.

const DEFAULT_CLAMP = (value, min, max) => {
  if(!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

function createRecordingEngine(){
  const state = {
    tracks: [],
    deleted: [],
    maxDeleted: 6,
    recording: false,
    recordMode: false,
    countIn: false,
    startMs: 0,
    transportStartSec: 0,
    transportLeadInSec: 0,
    countInClock: null,
    countInUntilMs: 0,
    countInTimer: null,
    metronomeTimer: null,
    nextTickMs: 0,
    selectedTrackId: null,
    divisionsCollapsed: { left: false, right: false },
    trackScrollY: 0,
    trackScrollMax: 0,
    pianoRollOffset: 0,
    playheadMs: 0,
    playing: false,
    playbackTimers: [],
    playbackStartMs: 0,
    recordOffsetMs: 0,
    tempoMode: 'stretch',
    recordTab: 'tracks',
    activeBySide: { left: null, right: null, single: null },
    monitorDuringRecord: false,
    tempoBpm: 120,
    timeSignature: { top: 4, bottom: 4 },
    metronome: { enabled: false, leadInBars: 2, volume: 0.85 },
    metronomeNextTickSec: 0,
    metronomeBeatIndex: 0,
    silentMode: false,
    master: { volume: 1 },
    trackNameHistory: [],
    trackNameHistoryLimit: 120,
    trackNameHistoryScroll: 0,
    trackScrollToBottom: false,
    deleteConfirmTrackId: null,
    deleteConfirmTransferUp: false,
    deleteConfirmTransferDown: false
  };

  let recordTrackSeq = 1;
  let deps = {
    getNowMs: () => Date.now(),
    getAudioTimeSec: () => 0,
    render: () => {},
    getInstrumentSnapshotForSide: () => ({ id: null, name: 'Instrument' }),
    noteOn: () => {},
    noteOff: () => {},
    panic: () => {},
    clampRange: DEFAULT_CLAMP,
    getDualMode: () => false,
    playMetronomeClick: () => {}
  };

  const setDependencies = (next) => {
    deps = Object.assign({}, deps, next || {});
  };

  const clampRange = (value, min, max) => deps.clampRange(value, min, max);

  function ensureSelectedRecordTrack(){
    if(state.selectedTrackId && state.tracks.some((t)=>t.id === state.selectedTrackId)) return;
    state.selectedTrackId = state.tracks.length ? state.tracks[0].id : null;
  }
  function refreshTrackNumbers(){
    state.tracks.forEach((track, idx) => {
      track.displayNumber = idx + 1;
      track.name = `Track ${track.displayNumber}`;
    });
  }
  function createRecordTrack(side){
    return {
      id: recordTrackSeq++,
      name: `Track ${recordTrackSeq - 1}`,
      side,
      displayNumber: 0,
      customName: '',
      events: [],
      recordEnabled: false,
      instrumentId: null,
      instrumentName: null,
      createdAt: Date.now(),
      recording: false,
      muted: false,
      solo: false,
      volume: 0.5,
      syncMs: 0,
      transpose: 0,
      reversed: false
    };
  }
  function normalizeRecordTracksForMode(){
    if(deps.getDualMode()){
      const single = state.tracks.find((t)=>t.side === 'single');
      if(single) single.side = 'left';
      if(!state.tracks.some((t)=>t.side === 'left')) state.tracks.push(createRecordTrack('left'));
      if(!state.tracks.some((t)=>t.side === 'right')) state.tracks.push(createRecordTrack('right'));
    } else {
      if(!state.tracks.some((t)=>t.side === 'single')){
        const left = state.tracks.find((t)=>t.side === 'left');
        if(left) left.side = 'single';
        if(!state.tracks.some((t)=>t.side === 'single')) state.tracks.push(createRecordTrack('single'));
      }
    }
    refreshTrackNumbers();
    ensureSelectedRecordTrack();
  }
  function getRecordTrackForSide(side){
    normalizeRecordTracksForMode();
    let track = state.tracks.find((t)=>t.side === side);
    if(!track && side === 'left') track = state.tracks.find((t)=>t.side === 'single');
    if(!track){
      track = createRecordTrack(side);
      state.tracks.push(track);
    }
    ensureSelectedRecordTrack();
    return track;
  }

  function getSelectedRecordTrack(){
    ensureSelectedRecordTrack();
    if(!state.selectedTrackId) return null;
    return state.tracks.find((t)=>t.id === state.selectedTrackId) || null;
  }

  function selectRecordTrack(trackId){
    if(state.tracks.some((t)=>t.id === trackId)){
      state.selectedTrackId = trackId;
      deps.render();
    }
  }

  function setRecordPanelTab(tabId){
    const next = (tabId === 'piano') ? 'piano' : 'tracks';
    state.recordTab = next;
    deps.render();
  }
  function setTrackRecordEnabled(trackId){
    let enabled = false;
    state.tracks.forEach((t)=>{
      if(t.id === trackId){
        t.recordEnabled = !t.recordEnabled;
        enabled = t.recordEnabled;
      } else {
        t.recordEnabled = false;
      }
    });
    if(enabled) state.selectedTrackId = trackId;
    deps.render();
  }

  function toggleTrackMute(trackId){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track) return;
    track.muted = !track.muted;
    deps.render();
  }

  function toggleTrackSolo(trackId){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track) return;
    track.solo = !track.solo;
    deps.render();
  }

  function getPlayableRecordTracks(){
    if(!state.tracks.length) return [];
    const soloed = state.tracks.filter((t)=>t.solo);
    const source = soloed.length ? soloed : state.tracks;
    return source.filter((t)=>!t.muted);
  }
  function addRecordTrack(){
    const side = deps.getDualMode()
      ? ((getSelectedRecordTrack() && getSelectedRecordTrack().side) || 'left')
      : 'single';
    const track = createRecordTrack(side);
    state.tracks.push(track);
    state.selectedTrackId = track.id;
    state.trackScrollToBottom = true;
    refreshTrackNumbers();
    deps.render();
  }

  function deleteRecordTrack(trackId){
    if(state.tracks.length <= 1) return;
    const idx = state.tracks.findIndex((t)=>t.id === trackId);
    if(idx === -1) return;
    const removed = state.tracks.splice(idx, 1)[0];
    if(removed){
      state.deleted.unshift(removed);
      if(state.deleted.length > state.maxDeleted) state.deleted.pop();
    }
    refreshTrackNumbers();
    ensureSelectedRecordTrack();
    deps.render();
  }

  function undeleteRecordTrack(){
    const restored = state.deleted.shift();
    if(!restored) return;
    state.tracks.push(restored);
    state.selectedTrackId = restored.id;
    refreshTrackNumbers();
    deps.render();
  }

  function duplicateRecordTrack(trackId){
    const src = state.tracks.find((t)=>t.id === trackId);
    if(!src) return;
    const dup = createRecordTrack(src.side);
    dup.name = `${src.name} Copy`;
    dup.events = src.events.map((e)=>Object.assign({}, e));
    dup.instrumentId = src.instrumentId;
    dup.instrumentName = src.instrumentName;
    dup.volume = src.volume;
    dup.syncMs = src.syncMs;
    dup.transpose = src.transpose;
    dup.reversed = src.reversed;
    dup.customName = src.customName || '';
    state.tracks.push(dup);
    state.selectedTrackId = dup.id;
    refreshTrackNumbers();
    deps.render();
  }
  function transposeRecordTrack(trackId, semis){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track || !Number.isFinite(semis)) return;
    track.transpose += semis;
    track.events.forEach((e)=>{
      if(e && Number.isFinite(e.note)){
        const next = Math.max(0, Math.min(127, e.note + semis));
        e.note = next;
      }
    });
    deps.render();
  }

  function reverseRecordTrack(trackId){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track || !track.events.length) return;
    const last = track.events.reduce((m, e)=> Math.max(m, e.timeMs || 0), 0);
    track.events.forEach((e)=>{ e.timeMs = Math.max(0, last - (e.timeMs || 0)); });
    track.reversed = !track.reversed;
    deps.render();
  }

  function swapTrackInstrument(trackId){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track) return;
    const side = track.side === 'right' ? 'right' : 'left';
    const snap = deps.getInstrumentSnapshotForSide(side);
    track.instrumentId = snap.id;
    track.instrumentName = snap.name;
    deps.render();
  }

  function adjustTrackVolume(trackId, delta){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track) return;
    track.volume = clampRange((track.volume || 0.5) + delta, 0, 1);
    deps.render();
  }

  function adjustTrackSync(trackId, delta){
    const track = state.tracks.find((t)=>t.id === trackId);
    if(!track) return;
    track.syncMs = clampRange((track.syncMs || 0) + delta, -5000, 5000);
    deps.render();
  }

  function adjustMasterVolume(delta){
    state.master.volume = clampRange((state.master.volume || 1) + delta, 0, 2);
    deps.render();
  }
  function setRecordTempo(delta){
    const next = clampRange((state.tempoBpm || 120) + delta, 30, 220);
    state.tempoBpm = Math.round(next);
    if(state.recording && state.metronome.enabled){
      startMetronome();
    }
    deps.render();
  }

  function toggleMetronome(){
    state.metronome.enabled = !state.metronome.enabled;
    if(state.metronome.enabled) startMetronome();
    else stopMetronome();
    deps.render();
  }

  function toggleLeadIn(){
    state.metronome.leadInBars = state.metronome.leadInBars ? 0 : 2;
    deps.render();
  }

  function toggleTempoMode(){
    state.tempoMode = state.tempoMode === 'pitch' ? 'stretch' : 'pitch';
    deps.render();
  }

  function toggleSilentMode(){
    state.silentMode = !state.silentMode;
    deps.render();
  }

  function stopMetronome(){
    if(state.metronomeTimer){
      clearInterval(state.metronomeTimer);
      state.metronomeTimer = null;
    }
  }

  function startMetronome(){
    if(!state.metronome.enabled) return;
    stopMetronome();
    const bpm = state.tempoBpm || 120;
    const beatSec = 60 / Math.max(30, bpm);
    const leadInSec = state.transportLeadInSec || 0;
    const baseSec = state.transportStartSec ? (state.transportStartSec - leadInSec) : deps.getAudioTimeSec();
    const nowSec = deps.getAudioTimeSec();
    state.metronomeBeatIndex = Math.max(0, Math.floor((nowSec - baseSec) / beatSec));
    state.metronomeNextTickSec = baseSec + state.metronomeBeatIndex * beatSec;
    const lookaheadSec = 0.15;
    state.metronomeTimer = setInterval(() => {
      const currentSec = deps.getAudioTimeSec();
      const scheduleUntil = currentSec + lookaheadSec;
      while(state.metronomeNextTickSec <= scheduleUntil){
        const beatsPerBar = Math.max(1, Math.round(state.timeSignature && state.timeSignature.top ? state.timeSignature.top : 4));
        const accent = (state.metronomeBeatIndex % beatsPerBar) === 0;
        deps.playMetronomeClick(accent, state.metronomeNextTickSec);
        state.metronomeBeatIndex += 1;
        state.metronomeNextTickSec += beatSec;
      }
    }, 30);
  }
  function startRecordingSession(options){
    if(state.recording) return;
    if(state.playing && !state.monitorDuringRecord) stopRecordPlayback();
    state.recording = true;
    state.recordMode = true;
    const nowSec = deps.getAudioTimeSec();
    const beatMs = 60000 / Math.max(30, (state.tempoBpm || 120));
    const skipLeadIn = options && options.skipLeadIn;
    const beatsPerBar = Math.max(1, Math.round(state.timeSignature && state.timeSignature.top ? state.timeSignature.top : 4));
    const leadInBeats = (!skipLeadIn && state.metronome.enabled) ? (state.metronome.leadInBars || 0) * beatsPerBar : 0;
    const leadInMs = leadInBeats > 0 ? leadInBeats * beatMs : 0;
    const leadInSec = leadInMs / 1000;
    state.countIn = leadInMs > 0;
    state.transportLeadInSec = leadInSec;
    state.transportStartSec = nowSec + leadInSec;
    state.startMs = state.transportStartSec * 1000;
    state.countInUntilMs = state.startMs;
    state.recordOffsetMs = Math.max(0, state.playheadMs || 0);
    if(state.countInTimer){
      clearTimeout(state.countInTimer);
      state.countInTimer = null;
    }
    if(state.countIn){
      state.countInTimer = setTimeout(() => {
        state.countIn = false;
        state.countInTimer = null;
        deps.render();
      }, leadInMs);
    }
    state.activeBySide = { left: null, right: null, single: null };
    startMetronome();
    const armed = state.tracks.find((t)=>t.recordEnabled) || getSelectedRecordTrack();
    if(armed){
      state.tracks.forEach((t)=>{ if(t !== armed) t.recordEnabled = false; });
      armed.recordEnabled = true;
      const snap = deps.getInstrumentSnapshotForSide(armed.side === 'right' ? 'right' : 'left');
      armed.instrumentId = snap.id;
      armed.instrumentName = snap.name;
      armed.recording = true;
      state.activeBySide.single = armed;
      state.activeBySide.left = armed;
      state.activeBySide.right = armed;
    }
    if(state.monitorDuringRecord){
      playRecordPlayback({ allowWhileRecording: true, excludeTrackId: armed ? armed.id : null });
    }
    deps.render();
  }

  function stopRecordingSession(){
    if(!state.recording) return;
    state.recording = false;
    state.countIn = false;
    state.countInUntilMs = 0;
    if(state.countInTimer){
      clearTimeout(state.countInTimer);
      state.countInTimer = null;
    }
    state.activeBySide = { left: null, right: null, single: null };
    state.tracks.forEach((t)=>{ t.recording = false; });
    stopMetronome();
    deps.render();
  }

  function enterRecordMode(){
    state.recordMode = true;
    deps.render();
  }

  function exitRecordMode(){
    if(state.recording) stopRecordingSession();
    if(state.playing) stopRecordPlayback();
    state.recordMode = false;
    deps.render();
  }
  function recordNoteEvent(type, midi, velocity, side){
    if(!state.recording) return;
    const nowSec = deps.getAudioTimeSec();
    if(nowSec < state.transportStartSec) return;
    const elapsed = Math.max(0, (nowSec - state.transportStartSec) * 1000);
    const adjusted = elapsed + (state.recordOffsetMs || 0);
    state.playheadMs = adjusted;
    const targetSide = deps.getDualMode() ? side : 'single';
    const track = state.activeBySide[targetSide];
    if(!track) return;
    const snap = deps.getInstrumentSnapshotForSide(side);
    if(!track.instrumentId) track.instrumentId = snap.id;
    if(!track.instrumentName) track.instrumentName = snap.name;
    track.events.push({
      timeMs: adjusted,
      type,
      note: Number(midi),
      velocity: Number.isFinite(velocity) ? velocity : 1,
      instrumentId: snap.id,
      instrumentName: snap.name
    });
  }

  function buildRecordNoteSpans(track){
    if(!track || !track.events || !track.events.length) return [];
    const syncMs = Number.isFinite(track.syncMs) ? track.syncMs : 0;
    const events = track.events.slice().sort((a,b)=> (a.timeMs || 0) - (b.timeMs || 0));
    const active = new Map();
    const spans = [];
    for(const ev of events){
      if(!ev || !Number.isFinite(ev.note)) continue;
      const t = Math.max(0, (ev.timeMs || 0) + syncMs);
      const note = Number(ev.note);
      if(ev.type === 'on'){
        active.set(note, t);
      } else if(ev.type === 'off'){
        if(active.has(note)){
          spans.push({ note, startMs: active.get(note), endMs: t });
          active.delete(note);
        }
      }
    }
    const tail = events.length ? Math.max(0, (events[events.length - 1].timeMs || 0) + syncMs) : 0;
    active.forEach((startMs, note) => {
      spans.push({ note, startMs, endMs: Math.max(startMs + 80, tail) });
    });
    return spans;
  }
  function stopRecordPlayback(){
    state.playing = false;
    state.playbackStartMs = 0;
    state.playbackTimers.forEach((t)=>clearTimeout(t));
    state.playbackTimers = [];
    if(state.metronome.enabled) stopMetronome();
    try{ deps.panic(); }catch(e){}
    deps.render();
  }

  function playRecordPlayback(options){
    const allowWhileRecording = !!(options && options.allowWhileRecording);
    if(state.playing || (state.recording && !allowWhileRecording)) return;
    let tracks = getPlayableRecordTracks();
    if(options && options.excludeTrackId){
      tracks = tracks.filter((t)=>t.id !== options.excludeTrackId);
    }
    if(!tracks.length) return;
    state.playing = true;
    if(state.metronome.enabled) startMetronome();
    const playhead = Math.max(0, state.playheadMs || 0);
    const rate = Math.max(0.25, (state.tempoBpm || 120) / 120);
    const pitchMode = state.tempoMode === 'pitch';
    const semis = pitchMode ? Math.round(12 * Math.log2(rate)) : 0;
    const nowSec = deps.getAudioTimeSec();
    const nextTransportStart = nowSec - (playhead / 1000);
    if(!(state.recording && allowWhileRecording)){
      state.transportStartSec = nextTransportStart;
    }
    state.playbackStartMs = nowSec * 1000;
    state.playbackTimers = [];
    tracks.forEach((track)=>{
      const syncMs = Number.isFinite(track.syncMs) ? track.syncMs : 0;
      track.events.forEach((ev)=>{
        if(!ev || !Number.isFinite(ev.timeMs)) return;
        const eventTime = (ev.timeMs || 0) + syncMs;
        if(eventTime < playhead) return;
        const delay = Math.max(0, (eventTime - playhead) / rate);
        const timer = setTimeout(() => {
          if(!state.playing) return;
          const baseNote = Number.isFinite(ev.note) ? ev.note : null;
          const shifted = (baseNote == null) ? null : Math.max(0, Math.min(127, baseNote + semis));
          if(ev.type === 'on' && shifted != null) deps.noteOn(shifted);
          if(ev.type === 'off' && shifted != null) deps.noteOff(shifted);
        }, delay);
        state.playbackTimers.push(timer);
      });
    });
    const duration = tracks.reduce((m, t)=> {
      const syncMs = Number.isFinite(t.syncMs) ? t.syncMs : 0;
      return Math.max(m, t.events.reduce((mm, e)=> Math.max(mm, (e.timeMs || 0) + syncMs), 0));
    }, 0);
    const endDelay = Math.max(0, (duration - playhead) / rate) + 120;
    state.playbackTimers.push(setTimeout(() => stopRecordPlayback(), endDelay));
    if(!(state.recording && allowWhileRecording)){
      const uiTimer = setInterval(() => {
        if(!state.playing){
          clearInterval(uiTimer);
          return;
        }
        const nowMs = deps.getNowMs();
        state.playheadMs = Math.max(0, playhead + (nowMs - state.playbackStartMs) * rate);
        deps.render();
      }, 60);
      state.playbackTimers.push(uiTimer);
    }
  }

  function toggleMonitorDuringRecord(){
    state.monitorDuringRecord = !state.monitorDuringRecord;
    if(state.recording){
      if(state.monitorDuringRecord){
        playRecordPlayback({ allowWhileRecording: true, excludeTrackId: state.selectedTrackId });
      } else if(state.playing){
        stopRecordPlayback();
      }
    }
    deps.render();
  }
  return {
    state,
    setDependencies,
    normalizeRecordTracksForMode,
    getRecordTrackForSide,
    getSelectedRecordTrack,
    setRecordPanelTab,
    selectRecordTrack,
    setTrackRecordEnabled,
    toggleTrackMute,
    toggleTrackSolo,
    getPlayableRecordTracks,
    addRecordTrack,
    deleteRecordTrack,
    undeleteRecordTrack,
    duplicateRecordTrack,
    transposeRecordTrack,
    reverseRecordTrack,
    swapTrackInstrument,
    adjustTrackVolume,
    adjustTrackSync,
    adjustMasterVolume,
    setRecordTempo,
    toggleMetronome,
    toggleLeadIn,
    toggleTempoMode,
    toggleSilentMode,
    startRecordingSession,
    stopRecordingSession,
    enterRecordMode,
    exitRecordMode,
    recordNoteEvent,
    buildRecordNoteSpans,
    playRecordPlayback,
    toggleMonitorDuringRecord,
    stopRecordPlayback
  };
}

export const recording = createRecordingEngine();
export function configureRecordingEngine(deps){
  recording.setDependencies(deps);
}
