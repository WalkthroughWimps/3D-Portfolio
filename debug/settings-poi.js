export const poiSettingsMarkup = `<h3>Points of interest</h3>
<label><input data-setting="interaction.poiAnimate" type="checkbox"> Animate navigation</label>
<label>Navigation speed <input data-setting="interaction.poiSpeed" type="range" min="0.25" max="3" step="0.05"><output data-poi-speed></output></label>`;

/** Reduced motion overrides presentation without overwriting the saved choice. */
export function mountPoiSettings(root, store) {
  const animate = root.querySelector('[data-setting="interaction.poiAnimate"]');
  const speed = root.querySelector('[data-setting="interaction.poiSpeed"]');
  const output = root.querySelector('[data-poi-speed]');
  const media = root.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
  const refresh = (snapshot = store.get()) => {
    const reduced = !!snapshot.accessibility.reducedMotion || media.matches;
    animate.checked = !reduced && snapshot.interaction.poiAnimate !== false;
    animate.disabled = reduced;
    animate.title = reduced ? 'Reduced motion overrides this preference' : '';
    speed.disabled = reduced || snapshot.interaction.poiAnimate === false;
    output.value = `${Number(snapshot.interaction.poiSpeed).toFixed(2).replace(/\.?0+$/, '')}×`;
  };
  const unsubscribe = store.subscribe(refresh, { immediate: true });
  const onSystemChange = () => refresh();
  media.addEventListener('change', onSystemChange);
  return { dispose() { unsubscribe(); media.removeEventListener('change', onSystemChange); } };
}
