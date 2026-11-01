(() => {
  const fallback = document.getElementById('about-fallback');
  if (!fallback) return;
  const panels = [...fallback.querySelectorAll('.about-fallback-panel')];
  const dots = [...fallback.querySelectorAll('.about-fallback-dots button')];
  const arrows = [...fallback.querySelectorAll('[data-fallback-step]')];
  if (!panels.length || panels.length !== dots.length) return;
  let current = 0;
  function select(index, scroll = true) {
    current = (index + panels.length) % panels.length;
    dots.forEach((dot, position) => {
      if (position === current) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
    if (scroll) fallback.scrollTo({ left: current * fallback.clientWidth, behavior: document.documentElement.classList.contains('a11y-motion-reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  dots.forEach((dot, index) => dot.addEventListener('click', () => select(index)));
  arrows.forEach(arrow => arrow.addEventListener('click', () => select(current + Number(arrow.dataset.fallbackStep))));
  fallback.addEventListener('scroll', () => {
    const index = Math.max(0, Math.min(panels.length - 1, Math.round(fallback.scrollLeft / Math.max(1, fallback.clientWidth))));
    if (index !== current) select(index, false);
  }, { passive: true });
  select(0, false);
})();
