/** Focused-media preferences mirror the two sides of the on-screen chrome. */
export const focusedMediaMarkup = `<h3>Focused media</h3>
<label><input data-setting="interaction.focusUiMoveAway" type="checkbox"> Hide site UI</label>
<fieldset class="focused-ui-options" data-focused-options aria-label="Site UI while media is focused">
  <label><input data-focused-animate data-setting="interaction.focusUiAnimate" type="checkbox"> Animate UI</label>
  <hr>
  <div class="focused-ui-sides">
    <div class="focused-ui-side" role="group" aria-label="Left UI">
      <label><input data-setting="interaction.focusUiHideHeader" type="checkbox"> Hide header</label>
      <label><input data-setting="interaction.focusUiHideNavbar" type="checkbox"> Hide navbar</label>
    </div>
    <div class="focused-ui-side" role="group" aria-label="Right UI">
      <label><input data-setting="interaction.focusUiHideGear" type="checkbox"> Hide gear</label>
      <label><input data-setting="interaction.focusUiHideTopRight" type="checkbox"> Hide help</label>
    </div>
  </div>
  <hr>
  <div class="focused-ui-timing">
    <label>Move out <output data-focus-speed-output="out"></output><input data-setting="interaction.focusUiOutSpeedMs" type="range" min="0" max="2000" step="10" aria-label="UI move out time in milliseconds"></label>
    <label><input data-setting="interaction.focusUiSeparateInSpeed" type="checkbox"> Link return speed</label>
    <label data-focused-return>Return <output data-focus-speed-output="in"></output><input data-setting="interaction.focusUiInSpeedMs" type="range" min="0" max="2000" step="10" aria-label="UI return time in milliseconds"></label>
  </div>
</fieldset>`;

export function mountFocusedMediaControls(root, store) {
  const options = root.querySelector('[data-focused-options]');
  const animate = root.querySelector('[data-focused-animate]');
  const media = root.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
  function refresh(snapshot = store.get()) {
    const reduced = snapshot.accessibility.reducedMotion || media.matches;
    options.disabled = snapshot.interaction.focusUiMoveAway === false;
    options.classList.toggle('is-inactive', options.disabled);
    animate.checked = !reduced && snapshot.interaction.focusUiAnimate !== false;
    animate.disabled = !!reduced;
    animate.title = reduced ? 'Reduced motion overrides this preference' : '';
    const linked = !snapshot.interaction.focusUiSeparateInSpeed;
    root.querySelector('[data-focused-return]').hidden = linked;
    for (const [direction, key] of [['out', 'focusUiOutSpeedMs'], ['in', 'focusUiInSpeedMs']]) {
      const output = root.querySelector(`[data-focus-speed-output="${direction}"]`);
      output.value = `${snapshot.interaction[key]} ms`;
    }
    for (const slider of root.querySelectorAll('.focused-ui-timing input')) {
      slider.disabled = !!reduced || snapshot.interaction.focusUiAnimate === false;
    }
  }
  const onSystemChange = () => refresh();
  media.addEventListener('change', onSystemChange);
  const unsubscribe = store.subscribe(refresh, { immediate: true });
  return { dispose() {
    unsubscribe();
    media.removeEventListener('change', onSystemChange);
  } };
}
