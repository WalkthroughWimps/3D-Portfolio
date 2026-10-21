// Mirror controller state into the keyboard and screen reader alternative.
export function syncStartAccessibleControls({ elements, view, volume, syncMs, brightness, contrast, flow, syncWords }) {
  const { audioMode, visualsMode, volumeSlider, syncSlider, brightnessSlider, contrastSlider,
    counts, alphabet, playPause, gallery, confirmYes, confirmNo } = elements;
  audioMode?.setAttribute('aria-pressed', String(view === 'audio'));
  visualsMode?.setAttribute('aria-pressed', String(view === 'visuals'));
  if (volumeSlider) volumeSlider.value = String(Math.round(volume * 100));
  if (syncSlider) syncSlider.value = String(syncMs);
  if (brightnessSlider) brightnessSlider.value = String(Math.round(brightness * 100));
  if (contrastSlider) contrastSlider.value = String(Math.round(contrast * 100));
  const syncRunning = flow.stage === 'sync-running';
  const syncActive = syncRunning && flow.syncExercise.active;
  if (counts) {
    counts.hidden = syncActive;
    counts.textContent = syncRunning ? 'Try audio sync exercise again' : 'Start audio sync exercise';
  }
  if (alphabet) alphabet.hidden = true;
  if (playPause) {
    playPause.hidden = !syncActive;
    playPause.textContent = `Tap ${syncWords[Math.min(flow.syncExercise.taps.length, syncWords.length - 1)]} sync cue`;
  }
  if (gallery) gallery.hidden = !syncRunning;
  if (confirmYes) confirmYes.hidden = flow.stage !== 'confirm';
  if (confirmNo) confirmNo.hidden = flow.stage !== 'confirm';
}
