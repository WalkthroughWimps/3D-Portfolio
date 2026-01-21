const defaults = () => ({
  reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  highContrast: false,
  textScale: 1,
  focusOutline: 'auto',
  masterVolume: 0.25,
  audioSyncMs: 0,
  mute: false
});

function getSiteA11y(){
  return window.SiteA11y || null;
}

export function loadSettings(){
  const site = getSiteA11y();
  if(site){
    return site.get();
  }
  return defaults();
}

export function saveSettings(partial){
  const site = getSiteA11y();
  if(site){
    return site.set(partial);
  }
  return Object.assign(defaults(), partial);
}

export function applySettingsToDocument(settings){
  const site = getSiteA11y();
  if(site){
    site.apply(settings);
  }
  return settings;
}

let currentSettings = loadSettings();
applySettingsToDocument(currentSettings);

export function getSettings(){
  return currentSettings;
}

export function updateSettings(partial){
  currentSettings = saveSettings(partial);
  applySettingsToDocument(currentSettings);
  return currentSettings;
}
