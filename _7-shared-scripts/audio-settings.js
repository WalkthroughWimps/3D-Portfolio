// Thin compatibility functions while page media flows remain in their owners.
import { getSharedSettings } from './core/settings.js';
import { isAudioAllowed } from './audio-consent.js';
export function getSavedAudioSettings() { return getSharedSettings().get().audio; }
export function getEffectiveAudioSettings() {
  const saved = getSavedAudioSettings();
  return { ...saved, muted: saved.muted || !isAudioAllowed() };
}
export function patchAudioSettings(values) { return getSharedSettings().patch({ audio: values }); }
