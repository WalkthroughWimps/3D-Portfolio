document.addEventListener('DOMContentLoaded', function() {
    // Fetch the header and insert it into the page
    fetch('header.html')
      .then(response => response.text())
      .then(data => {
        document.getElementById('header-placeholder').innerHTML = data;
      });

    const grid = document.querySelector('.skills-basin');
    const toggle = document.getElementById('skillsToggle');
    const toggleStack = document.querySelector('.skills-toggle-stack');
    const skillsSection = document.querySelector('.skills');
    const skillsHeading = skillsSection ? skillsSection.querySelector('h2') : null;
    const cards = grid ? Array.from(grid.querySelectorAll('.skill-card')) : [];
    const STORAGE_KEY = 'skillsBackModeV2';
    let sliderLayers = null;

    function randomBetween(min, max) {
      return min + Math.random() * (max - min);
    }

    function buildStaggerDelays(count, maxDelay) {
      if (count <= 1) return [0];
      const intervals = Array.from({ length: count - 1 }, () => Math.random() + 0.2);
      const total = intervals.reduce((sum, value) => sum + value, 0);
      let acc = 0;
      const delays = [0];
      intervals.forEach((weight) => {
        acc += (weight / total) * maxDelay;
        delays.push(acc);
      });
      return delays;
    }

    function orderCards(list) {
      const ordered = list.slice().sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        const leftDiff = ra.left - rb.left;
        if (Math.abs(leftDiff) > 4) return leftDiff;
        return ra.top - rb.top;
      });
      const minLeft = Math.min(...ordered.map((card) => card.getBoundingClientRect().left));
      const leftColumn = ordered.filter((card) => Math.abs(card.getBoundingClientRect().left - minLeft) < 4);
      if (leftColumn.length) {
        const bottomLeft = leftColumn.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).pop();
        const idx = ordered.indexOf(bottomLeft);
        if (idx > -1 && idx !== ordered.length - 1) {
          ordered.splice(idx, 1);
          ordered.push(bottomLeft);
        }
      }
      return ordered;
    }

    function setCardTransition(card, duration, delay) {
      card.style.setProperty('--flip-duration', `${duration}s`);
      card.style.setProperty('--flip-delay', `${delay}s`);
    }

    function setCardFlip(card, flipped) {
      card.classList.toggle('is-flipped', flipped);
    }

    function translateSlider(part, dx, dy) {
      part.sliderEl.setAttribute('transform', `translate(${dx} ${dy})`);
    }

    function alignSlider(part, alignX, alignY) {
      const s = part.baseBBox;
      const g = part.guideBBox;
      let dx = 0;
      let dy = 0;
      if (alignX === 'left') dx = g.x - s.x;
      if (alignX === 'right') dx = (g.x + g.width) - (s.x + s.width);
      if (alignY === 'top') dy = g.y - s.y;
      if (alignY === 'bottom') dy = (g.y + g.height) - (s.y + s.height);
      translateSlider(part, dx, dy);
    }

    function applySliderMode(isBackMode) {
      if (!sliderLayers) return;
      if (sliderLayers.knobs) alignSlider(sliderLayers.knobs, isBackMode ? 'right' : 'left', null);
      if (sliderLayers.names) alignSlider(sliderLayers.names, null, isBackMode ? 'top' : 'bottom');
      if (sliderLayers.icons) alignSlider(sliderLayers.icons, null, isBackMode ? 'bottom' : 'top');
    }

    function applyToggleVisuals(isBackMode) {
      if (grid) grid.classList.toggle('use-back-images', isBackMode);
      if (toggle) {
        toggle.classList.toggle('skills-toggle--back', isBackMode);
        toggle.setAttribute('aria-pressed', String(isBackMode));
      }
      applySliderMode(isBackMode);
    }

    function applyMode(isBackMode, animate) {
      applyToggleVisuals(isBackMode);
      if (!cards.length) return;
      const ordered = orderCards(cards);
      const delays = animate ? buildStaggerDelays(ordered.length, 0.3) : new Array(ordered.length).fill(0);
      ordered.forEach((card, index) => {
        const duration = randomBetween(0.65, 1);
        const delay = delays[index];
        setCardTransition(card, duration, delay);
        setCardFlip(card, isBackMode);
      });
    }

    if (grid) {
      grid.querySelectorAll('.skill-card').forEach((card) => {
        const encoded = encodeURIComponent(card.dataset.icon || '');
        card.style.setProperty('--back-image', `url("assets/computer-app-icons/backs/${encoded}_back.svg")`);
      });
      const SKILL_CORNER_KEY = 'skillCardCornerMode';
      const storedSkillCorners = localStorage.getItem(SKILL_CORNER_KEY);
      if (storedSkillCorners === 'squircle') {
        grid.classList.add('skill-corner-squircle');
      }
      grid.addEventListener('click', (event) => {
        if (!event.target.closest('.skill-card')) return;
        const isSquircle = grid.classList.toggle('skill-corner-squircle');
        localStorage.setItem(SKILL_CORNER_KEY, isSquircle ? 'squircle' : 'rounded');
      });
    }

    let isBackMode = false;
    if (toggle) {
      const stored = localStorage.getItem(STORAGE_KEY);
      isBackMode = stored === null ? false : stored === 'true';
    }
    applyMode(isBackMode, false);

    if (toggleStack) {
      const names = toggleStack.querySelector('.layer-names');
      const knobs = toggleStack.querySelector('.layer-knobs');
      const icons = toggleStack.querySelector('.layer-icons');
      sliderLayers = { names: null, knobs: null, icons: null };

      function initLayer(objectEl, sliderId, guideId, key) {
        if (!objectEl || objectEl.tagName !== 'OBJECT') return;
        const getBBoxFromRects = (group) => {
          const rects = Array.from(group.querySelectorAll('rect'));
          if (!rects.length) return group.getBBox();
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          rects.forEach((rect) => {
            const x = parseFloat(rect.getAttribute('x') || '0');
            const y = parseFloat(rect.getAttribute('y') || '0');
            const w = parseFloat(rect.getAttribute('width') || '0');
            const h = parseFloat(rect.getAttribute('height') || '0');
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
          });
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        };

        const load = () => {
          const doc = objectEl.contentDocument;
          if (!doc) return;
          const sliderEl = doc.getElementById(sliderId);
          const guideEl = doc.getElementById(guideId);
          if (!sliderEl || !guideEl) return;
          sliderEl.style.transition = 'transform 260ms ease';
          sliderLayers[key] = {
            sliderEl,
            guideEl,
            baseBBox: getBBoxFromRects(sliderEl),
            guideBBox: guideEl.getBBox()
          };
          applySliderMode(isBackMode);
        };
        if (objectEl.contentDocument) {
          load();
        } else {
          objectEl.addEventListener('load', load, { once: true });
        }
      }

      initLayer(knobs, 'Slider_BUTTON', 'Guide_BUTTON', 'knobs');
      initLayer(names, 'Slider_NAMES', 'Guide_NAMES', 'names');
      initLayer(icons, 'Slider_ICONS', 'Guide_ICONS', 'icons');
    }

    if (toggle) {
      toggle.addEventListener('click', () => {
        isBackMode = !isBackMode;
        localStorage.setItem(STORAGE_KEY, String(isBackMode));
        applyMode(isBackMode, true);
        if (lastHovered) {
          setCardTransition(lastHovered, randomBetween(0.65, 1), 0);
          setCardFlip(lastHovered, isBackMode);
          lastHovered = null;
        }
      });
    }

    let lastHovered = null;
    cards.forEach((card) => {
      card.addEventListener('mouseenter', () => {
        if (lastHovered && lastHovered !== card) {
          setCardTransition(lastHovered, randomBetween(0.65, 1), 0);
          setCardFlip(lastHovered, isBackMode);
        }
        setCardTransition(card, randomBetween(0.65, 1), 0);
        setCardFlip(card, !isBackMode);
        lastHovered = card;
      });
    });

    if (grid) {
      grid.addEventListener('mouseleave', () => {
        if (lastHovered) {
          setCardTransition(lastHovered, randomBetween(0.65, 1), 0);
          setCardFlip(lastHovered, isBackMode);
          lastHovered = null;
        }
      });
    }

    window.addEventListener('scroll', () => {
      if (!lastHovered || !skillsHeading) return;
      if (skillsHeading.getBoundingClientRect().top > 0) {
        setCardTransition(lastHovered, randomBetween(0.65, 1), 0);
        setCardFlip(lastHovered, isBackMode);
        lastHovered = null;
      }
    }, { passive: true });

    // Scroll-driven gear rails: rotate pseudo-gears by toggling a rotate class on the rails
    let lastY = window.scrollY;
    function onScroll(){
      const y = window.scrollY;
      const dir = Math.sign(y - lastY); // 1 down, -1 up
      lastY = y;
      const left = document.getElementById('left-rail');
      const right = document.getElementById('right-rail');
      if (!left || !right) return;
      const rot = (dir>=0) ? 15 : -15; // small nudge for visual feedback
      left.style.transform = `rotate(${rot}deg)`;
      right.style.transform = `rotate(${rot}deg)`;
      // bounce back after a tick
      clearTimeout(onScroll._t);
      onScroll._t = setTimeout(()=>{ left.style.transform = ''; right.style.transform = ''; }, 120);
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Carousel wheel handling (Step 1)
    const carousel = document.querySelector('.section-carousel');
    if (carousel) {
      const track = carousel.querySelector('.section-carousel-track');
      const panels = track ? Array.from(track.children) : [];
      if (!track || panels.length < 2) return;

      let carouselIndex = 0;
      let wheelLock = false;

      track.style.setProperty('--panel-count', panels.length);

      const setCarouselIndex = (nextIndex) => {
        carouselIndex = Math.max(0, Math.min(nextIndex, panels.length - 1));
        track.style.setProperty('--track-offset', `-${carouselIndex * 100}%`);
      };

      const updatePanelHeight = () => {
        const baseFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const topOffset = (10 + 1.5) * baseFont;
        const bottomOffset = 0.5 * baseFont;
        const maxAvailable = Math.max(320, window.innerHeight - topOffset - bottomOffset);
        const frames = panels.map((panel) => panel.querySelector('.section-frame')).filter(Boolean);
        if (!frames.length) return;
        const maxContent = Math.max(...frames.map((frame) => frame.scrollHeight));
        const targetHeight = Math.min(maxContent, maxAvailable);
        carousel.style.setProperty('--panel-height', `${Math.ceil(targetHeight)}px`);
        frames.forEach((frame) => {
          frame.style.minHeight = `${Math.ceil(targetHeight)}px`;
        });
      };

      setCarouselIndex(0);
      updatePanelHeight();
      window.addEventListener('resize', updatePanelHeight);

      const handleWheelForCarousel = (event) => {
        event.preventDefault();
        if (wheelLock) return;
        const direction = Math.sign(event.deltaY);
        if (direction === 0) return;
        setCarouselIndex(carouselIndex + (direction > 0 ? 1 : -1));
        wheelLock = true;
        setTimeout(() => { wheelLock = false; }, 600);
      };

      carousel.addEventListener('wheel', handleWheelForCarousel, { passive: false });
    }
  });
  
  // On page load, trigger the "slide-out" animations to reveal the page
  window.addEventListener('load', () => {
  // Doors removed — no-op
  });
  
