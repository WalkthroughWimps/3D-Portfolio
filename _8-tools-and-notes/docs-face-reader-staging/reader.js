/** Owns nonmodal reader chrome and selected-slide jumps. */
export function createDocumentReader({ dialog, frame, title, description, openLink, close, scope, text, fallback }) {
  const abort = new AbortController();
  const { signal } = abort;
  let opener = null;
  let currentSlide = -1;
  let slides = [];
  let currentItem = null;
  let currentSource = '';
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
  const previous = makeButton('Previous selected slide', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>', () => selectSlide(currentSlide - 1));
  const next = makeButton('Next selected slide', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>', () => selectSlide(currentSlide + 1));
  const count = document.createElement('span'); count.className = 'docs-reader-count'; count.setAttribute('aria-live', 'polite');
  const hint = document.createElement('span'); hint.className = 'docs-reader-hint'; hint.textContent = 'Click the slide to play its animations.';
  const spacer = document.createElement('span'); spacer.className = 'docs-reader-spacer';
  const fullscreen = makeButton('Enter fullscreen', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>', toggleFullscreen);
  footer.append(back, previous, count, next, hint, spacer, fullscreen);
  main.append(stage, footer); shell.append(rail, main);
  const header = dialog.querySelector('header');
  const screen = document.createElement('div'); screen.className = 'docs-reader-screen';
  screen.append(...[header, shell, text, fallback, openLink].filter(Boolean)); dialog.append(screen);
  close.classList.add('docs-reader-header-close');

  function updateNavigation() {
    const hasSlides = slides.length > 0;
    previous.disabled = !hasSlides || currentSlide <= 0;
    next.disabled = !hasSlides || currentSlide < 0 || currentSlide >= slides.length - 1;
    count.textContent = hasSlides && currentSlide >= 0 ? `Selected slide ${currentSlide + 1} / ${slides.length}` : '';
    hint.hidden = !hasSlides;
    for (const [index, button] of [...railList.children].entries()) {
      const active = index === currentSlide;
      button.classList.toggle('is-current', active);
      if (active) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current');
    }
  }
  function setSlides(nextSlides = []) {
    slides = Array.isArray(nextSlides) ? nextSlides : [];
    currentSlide = slides.length ? 0 : -1;
    rail.hidden = !slides.length;
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
      button.addEventListener('click', () => selectSlide(index), { signal });
      railList.append(button);
    }
    updateNavigation();
  }
  function setCurrentSlide(index) {
    if (!Number.isInteger(index) || index < 0 || index >= slides.length) return;
    currentSlide = index; updateNavigation();
    railList.children[index]?.scrollIntoView?.({ block: 'nearest' });
  }
  function slideUrl(index) {
    const url = new URL(currentSource);
    url.searchParams.set('wdSlideIndex', String(index + 1));
    return url.href;
  }
  function selectSlide(index) {
    if (!Number.isInteger(index) || index < 0 || index >= slides.length || index === currentSlide) return;
    setCurrentSlide(index);
    frame.title = `${currentItem?.title || 'Presentation'} — selected slide ${index + 1}`;
    frame.src = slideUrl(index);
  }
  function syncFullscreen() {
    const expanded = document.fullscreenElement === screen || dialog.classList.contains('is-expanded');
    fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreen.title = fullscreen.getAttribute('aria-label');
    fullscreen.classList.toggle('is-active', expanded);
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement === screen) { await document.exitFullscreen(); return; }
    if (dialog.classList.contains('is-expanded')) { dialog.classList.remove('is-expanded'); syncFullscreen(); return; }
    try { if (!screen.requestFullscreen) throw new Error('Fullscreen unavailable'); await screen.requestFullscreen(); }
    catch { dialog.classList.add('is-expanded'); syncFullscreen(); }
  }
  async function leaveFullscreen() {
    dialog.classList.remove('is-expanded');
    if (document.fullscreenElement === screen) { try { await document.exitFullscreen(); } catch {} }
    syncFullscreen();
  }
  function update(item) {
    if (disposed) return;
    const sameSource = currentItem?.id === item.id && currentSource === item.sourceUrl;
    currentItem = item; currentSource = item.sourceUrl;
    title.textContent = item.title || '';
    description.textContent = item.description || '';
    frame.className = item.type === 'presentation' ? 'document-presentation' : 'document-paper';
    openLink.href = item.sourceUrl;
    openLink.textContent = item.type === 'presentation' ? 'Open presentation in a new tab' : 'Open original document';
    const usableSlides = item.type === 'presentation' && Array.isArray(item.slides) ? item.slides : [];
    if (!sameSource || usableSlides.length !== slides.length) {
      setSlides(usableSlides);
      frame.title = item.title || 'Selected document';
      if (item.type === 'presentation' && usableSlides.length) frame.src = slideUrl(0);
      else frame.src = item.sourceUrl;
    }
    if (fallback) fallback.hidden = item.type !== 'external';
    if (text) text.hidden = item.type !== 'text';
    frame.hidden = item.type === 'external' || item.type === 'text';
    if (item.type === 'text' && text) text.textContent = item.content || '';
    updateNavigation();
  }
  function open(item, focusSource) {
    if (disposed) return;
    opener = focusSource || document.activeElement;
    update(item);
    if (!dialog.open) dialog.show();
    back.focus();
  }
  function onClose() {
    void leaveFullscreen();
    frame.removeAttribute('src');
    currentItem = null; currentSource = ''; slides = []; currentSlide = -1;
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
    disposed = true;
    void leaveFullscreen();
    if (dialog.open) dialog.close();
    onClose();
    abort.abort();
    screen.remove();
    dialog.classList.remove('docs-reader-ready', 'is-expanded');
  }
  return { open, update, setSlides, setCurrentSlide, selectSlide, dispose };
}
