// Mirror controller state into the keyboard and screen reader alternative.
export function syncStartAccessibleControls({ elements, view, volume, syncMs, brightness, contrast, flow }) {
  const { audioMode, visualsMode, volumeSlider, syncSlider, brightnessSlider, contrastSlider,
    counts, alphabet, gallery, syncPreview, syncStatus, confirmYes, confirmNo } = elements;
  audioMode?.setAttribute('aria-pressed', String(view === 'audio'));
  visualsMode?.setAttribute('aria-pressed', String(view === 'visuals'));
  if (volumeSlider) volumeSlider.value = String(Math.round(volume * 100));
  if (syncSlider) syncSlider.value = String(syncMs);
  if (brightnessSlider) brightnessSlider.value = String(Math.round(brightness * 100));
  if (contrastSlider) contrastSlider.value = String(Math.round(contrast * 100));
  const syncRunning = flow.stage === 'sync-running';
  const exercise = flow.syncExercise;
  if (counts) {
    counts.textContent = syncRunning ? (exercise.playing ? 'Stop arpeggios' : 'Play arpeggios') : 'Start audio sync comparison';
  }
  if (alphabet) alphabet.hidden = true;
  if (gallery) gallery.hidden = !syncRunning;
  if (syncPreview) syncPreview.hidden = !syncRunning;
  if (syncStatus) {
    const message = syncRunning ? (exercise.result || (exercise.playing ? 'Playing three C arpeggios.' : 'Adjust audio sync and press Play to check.')) : '';
    if (syncStatus.textContent !== message) syncStatus.textContent = message;
  }
  if (confirmYes) confirmYes.hidden = flow.stage !== 'confirm';
  if (confirmNo) confirmNo.hidden = flow.stage !== 'confirm';
}
