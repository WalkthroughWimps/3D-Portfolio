// Compatibility facade. Consent remains separate from saved mute and volume.
import { createConsent } from './core/consent.js';
let owner;
export function getSharedConsent() { return owner ||= createConsent(); }
export function getAudioConsentState() { return getSharedConsent().get(); }
export function isAudioAllowed() { return getAudioConsentState().allowed; }
export function setAudioConsentAllowed(allowed, options) { return getSharedConsent().setAllowed(allowed, options).allowed; }
export function ensureAudioConsentPrompt(options) { return getSharedConsent().prompt(options); }
export function onAudioConsentChange(listener) {
  return getSharedConsent().subscribe((state, change) => listener(state.allowed, change));
}
