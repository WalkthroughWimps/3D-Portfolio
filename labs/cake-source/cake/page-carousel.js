(() => {
  const makeCarousel = (container, selector, label) => {
    if (!container || container.dataset.pageCarouselReady === 'true') return;
    container.dataset.pageCarouselReady = 'true';
    const items = () => [...container.querySelectorAll(selector)];
    const controls = document.createElement('div');
    controls.className = 'page-carousel-controls';
    controls.setAttribute('aria-label', `${label} pages`);
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'button carousel-arrow';
    previous.textContent = '← Previous';
    previous.setAttribute('aria-label', `Previous ${label.toLowerCase()}`);
    const count = document.createElement('span');
    count.className = 'carousel-count';
    count.setAttribute('aria-live', 'polite');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'button carousel-arrow';
    next.textContent = 'Next →';
    next.setAttribute('aria-label', `Next ${label.toLowerCase()}`);
    controls.append(previous, count, next);
    container.insertAdjacentElement('afterend', controls);
    let index = 0;

    const render = () => {
      const all = items();
      const available = all.filter(item => !item.hidden);
      if (index >= available.length) index = Math.max(0, available.length - 1);
      all.forEach(item => {
        const current = available[index] === item;
        item.dataset.pageCurrent = String(current);
        item.setAttribute('aria-hidden', String(!current));
      });
      controls.hidden = available.length < 2;
      count.textContent = available.length ? `${index + 1} of ${available.length}` : '';
      previous.disabled = index === 0;
      next.disabled = index >= available.length - 1;
    };
    const move = delta => {
      const total = items().filter(item => !item.hidden).length;
      index = Math.max(0, Math.min(total - 1, index + delta));
      render();
    };
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    controls.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    });
    container.addEventListener('touchstart', event => {
      container.dataset.swipeX = String(event.changedTouches[0]?.clientX ?? '');
    }, { passive: true });
    container.addEventListener('touchend', event => {
      const start = Number(container.dataset.swipeX);
      const end = event.changedTouches[0]?.clientX;
      if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(end - start) > 45) move(end < start ? 1 : -1);
    }, { passive: true });
    new MutationObserver(render).observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
    render();
  };

  makeCarousel(document.querySelector('.gallery-grid'), 'figure', 'Gallery photos');
  const infoGrid = document.querySelector('.page-content > .info-grid');
  makeCarousel(infoGrid, '.info-card', 'Studio details');
})();
