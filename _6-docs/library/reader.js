/** Owns the document reader chrome; the host supplies slide data and navigation. */
export function createDocumentReader({ dialog, frame, title, description, openLink, close, scope }) {
  const abort = new AbortController();
  const { signal } = abort;
  let opener = null;
  let currentSlide = -1;
  let slides = [];
  let onSelect = null;
  let navigation = {};
  let disposed = false;

  dialog.classList.add('docs-reader-ready');
  const shell = document.createElement('div'); shell.className = 'docs-reader-shell';
  const rail = document.createElement('nav'); rail.className = 'docs-reader-rail'; rail.setAttribute('aria-label', 'Presentation slides');
  const railList = document.createElement('div'); railList.className = 'docs-reader-rail-list';
  const railStatus = document.createElement('p'); railStatus.className = 'docs-reader-rail-status'; railStatus.textContent = 'Slide navigation is loading…';
  rail.append(railStatus, railList);
  const main = document.createElement('div'); main.className = 'docs-reader-main';
  const stage = document.createElement('div'); stage.className = 'docs-reader-stage'; stage.append(frame);
  const footer = document.createElement('div'); footer.className = 'docs-reader-footer';
  const makeButton = (label, icon, action) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'docs-reader-control';
    button.setAttribute('aria-label', label); button.title = label; button.innerHTML = icon;
    button.addEventListener('click', action, { signal }); return button;
  };
  const back = makeButton('Return to desk', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 5-7 7 7 7M4 12h16"/></svg>', () => dialog.close());
  back.classList.add('docs-reader-return');
  const previous = makeButton('Previous slide', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>', () => navigation.previous?.());
  const next = makeButton('Next slide', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>', () => navigation.next?.());
  const count = document.createElement('span'); count.className = 'docs-reader-count'; count.setAttribute('aria-live', 'polite');
  const spacer = document.createElement('span'); spacer.className = 'docs-reader-spacer';
  const fullscreen = makeButton('Enter fullscreen', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>', toggleFullscreen);
  footer.append(back, previous, count, next, spacer, fullscreen);
  main.append(stage, footer); shell.append(rail, main);
  const header = dialog.querySelector('header');
  dialog.insertBefore(shell, openLink);
  dialog.append(header, shell, openLink);
  close.classList.add('docs-reader-header-close');

  function updateNavigation() {
    const hasSlides = slides.length > 0;
    previous.disabled = !hasSlides || currentSlide <= 0 || !navigation.previous;
    next.disabled = !hasSlides || currentSlide < 0 || currentSlide >= slides.length - 1 || !navigation.next;
    count.textContent = hasSlides && currentSlide >= 0 ? `${currentSlide + 1} / ${slides.length}` : '';
    for (const [index, button] of [...railList.children].entries()) {
      const active = index === currentSlide;
      button.classList.toggle('is-current', active);
      if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    }
  }
  function setSlides(nextSlides = [], select) {
    slides = Array.isArray(nextSlides) ? nextSlides : [];
    onSelect = typeof select === 'function' ? select : null;
    currentSlide = slides.length ? 0 : -1;
    railList.replaceChildren();
    railStatus.hidden = slides.length > 0;
    for (const [index, slide] of slides.entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'docs-reader-slide';
      button.setAttribute('aria-label', `Slide ${index + 1}: ${slide.title || `Slide ${index + 1}`}`);
      const preview = document.createElement('span'); preview.className = 'docs-reader-slide-preview';
      if (slide.previewUrl) { const img = document.createElement('img'); img.src = slide.previewUrl; img.alt = ''; preview.append(img); }
      else preview.textContent = String(index + 1);
      const caption = document.createElement('span'); caption.className = 'docs-reader-slide-caption'; caption.textContent = slide.title || `Slide ${index + 1}`;
      button.append(preview, caption);
      button.addEventListener('click', () => onSelect?.(index), { signal });
      railList.append(button);
    }
    updateNavigation();
  }
  function setCurrentSlide(index) {
    if (!Number.isInteger(index) || index < 0 || index >= slides.length) return;
    currentSlide = index; updateNavigation();
    railList.children[index]?.scrollIntoView?.({ block: 'nearest' });
  }
  function setNavigation(nextNavigation = {}) { navigation = nextNavigation; updateNavigation(); }
  function syncFullscreen() {
    const expanded = document.fullscreenElement === dialog || dialog.classList.contains('is-expanded');
    fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreen.title = fullscreen.getAttribute('aria-label');
    fullscreen.classList.toggle('is-active', expanded);
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement === dialog) { await document.exitFullscreen(); return; }
    if (dialog.classList.contains('is-expanded')) { dialog.classList.remove('is-expanded'); syncFullscreen(); return; }
    try { if (!dialog.requestFullscreen) throw new Error('Fullscreen unavailable'); await dialog.requestFullscreen(); }
    catch { dialog.classList.add('is-expanded'); syncFullscreen(); }
  }
  async function leaveFullscreen() {
    dialog.classList.remove('is-expanded');
    if (document.fullscreenElement === dialog) { try { await document.exitFullscreen(); } catch {} }
    syncFullscreen();
  }
  function open(item, focusSource) {
    if (disposed) return;
    opener = focusSource || document.activeElement;
    title.textContent = item.title || '';
    description.textContent = item.description || '';
    frame.title = item.title || 'Selected document';
    frame.src = item.sourceUrl;
    frame.className = item.type === 'presentation' ? 'document-presentation' : 'document-paper';
    openLink.href = item.sourceUrl;
    openLink.textContent = item.type === 'presentation' ? 'Open presentation in a new tab' : 'Open original document';
    rail.hidden = item.type !== 'presentation';
    if (item.type === 'presentation') setSlides();
    else { slides = []; currentSlide = -1; updateNavigation(); }
    if (!dialog.open) dialog.showModal();
    back.focus();
  }
  function onClose() {
    void leaveFullscreen();
    frame.removeAttribute('src');
    if (opener?.isConnected) opener.focus();
    opener = null;
  }
  close.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', onClose, { signal });
  document.addEventListener('fullscreenchange', syncFullscreen, { signal });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.classList.contains('is-expanded')) { dialog.classList.remove('is-expanded'); syncFullscreen(); }
  }, { signal });
  scope?.onDispose?.(() => dispose());
  updateNavigation();
  function dispose() {
    if (disposed) return;
    disposed = true; abort.abort();
    void leaveFullscreen();
    if (dialog.open) dialog.close();
    frame.removeAttribute('src');
    shell.remove();
    dialog.classList.remove('docs-reader-ready', 'is-expanded');
  }
  return { open, setSlides, setCurrentSlide, setNavigation, dispose };
}
