// Start's visual setting state. The shared settings owner still handles the
// scene-lighting key; the page-specific look controls retain their old keys.
export function createStartSettingsFlow({ preferences, setSceneLightingValue }) {
  const keys = Object.freeze({
    animationAllowed: 'site.start.animation.allowed',
    contrast: 'site.contrast.value',
    brightness: 'site.start.brightness',
    backgroundContrast: 'site.start.background.contrast',
    underlight: 'site.start.look.underlight',
    speakerPurple: 'site.start.look.speaker-purple',
    sceneLighting: 'site.scene.lighting'
  });
  const defaultSliderValue = 0.5;
  const defaultLookTuning = Object.freeze({ underlight: 0.65, speakerPurple: 0.65 });
  const lightingState = { lux: Number.NaN, emi: Number.NaN, overlay: Number.NaN };
  const clamp01Value = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : null;
  };
  const clampLookTuning = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(3, parsed)) : null;
  };
  const readLookTuning = (key, fallback) => {
    try {
      const stored = clampLookTuning(preferences.getItem(key));
      if (stored !== null) return stored;
    } catch { /* use existing fallback */ }
    return fallback;
  };
  const lookTuning = {
    underlight: readLookTuning(keys.underlight, defaultLookTuning.underlight),
    speakerPurple: readLookTuning(keys.speakerPurple, defaultLookTuning.speakerPurple)
  };
  const getLuxValue = () => {
    if (Number.isFinite(lightingState.lux)) return lightingState.lux;
    let stored = null;
    try { stored = clamp01Value(preferences.getItem(keys.sceneLighting)); } catch { /* use fallback */ }
    if (stored === null) {
      stored = defaultSliderValue;
      setSceneLightingValue(stored);
    }
    lightingState.lux = stored;
    return stored;
  };
  const setLuxValue = value => {
    const next = clamp01Value(value);
    if (next === null) return getLuxValue();
    lightingState.lux = next;
    setSceneLightingValue(next);
    return next;
  };
  const getEmiValue = () => {
    if (Number.isFinite(lightingState.emi)) return lightingState.emi;
    try {
      const parsed = clamp01Value(preferences.getItem(keys.contrast));
      if (parsed === null) {
        try { preferences.setItem(keys.contrast, String(defaultSliderValue)); } catch { /* session value remains */ }
        lightingState.emi = defaultSliderValue;
      } else lightingState.emi = parsed;
    } catch { lightingState.emi = defaultSliderValue; }
    return lightingState.emi;
  };
  const setEmiValue = value => {
    const next = clamp01Value(value);
    if (next === null) return getEmiValue();
    lightingState.emi = next;
    try { preferences.setItem(keys.contrast, String(next)); } catch { /* session value remains */ }
    return next;
  };
  return { keys, defaultSliderValue, defaultLookTuning, lightingState, clamp01Value,
    clampLookTuning, lookTuning, getLuxValue, setLuxValue, getEmiValue, setEmiValue };
}
