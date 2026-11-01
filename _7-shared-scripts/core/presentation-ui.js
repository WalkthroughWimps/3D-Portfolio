// The scene, player and game controls stay in their original stacking context.
// Only the shared chrome is translated; in particular the header itself never
// acquires a transform (which would rebase its fixed children).
const EASE = 'cubic-bezier(.2, .95, .25, 1.25)';
const MARGIN = 16;

export function createPresentationUiMotion(root, getParts) {
  const states = new Map();
  const win = root.defaultView;
  const media = win?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let active = false;
  let snapshot = null;

  function reduced() {
    return snapshot?.accessibility?.reducedMotion === true || !!media?.matches;
  }
  function remember(node) {
    let state = states.get(node);
    if (!state) {
      const base = win.getComputedStyle(node).translate;
      const mark = !node.closest('.header, .header-utility-dock, #review-panels, .header-gear') &&
        !node.matches('.shared-nav-wrap, .header-mouse-controls');
      state = { inline: node.style.translate, marker: node.getAttribute('data-focus-ui-chrome'), mark, base, offset: [0, 0], animation: null };
      states.set(node, state);
      if (mark) node.setAttribute('data-focus-ui-chrome', '');
    }
    return state;
  }
  function currentOffset(node) {
    const state = states.get(node);
    if (!state) return [0, 0];
    const shift = win.getComputedStyle(node).translate.split(/\s+/);
    const base = state.base === 'none' ? ['0px', '0px'] : state.base.split(/\s+/);
    const delta = index => shift[index]?.endsWith('px') && base[index]?.endsWith('px') ?
      parseFloat(shift[index]) - parseFloat(base[index]) : state.offset[index];
    return [delta(0), delta(1)];
  }
  function baseRect(node) {
    const rect = node.getBoundingClientRect();
    const [dx, dy] = currentOffset(node);
    return { left: rect.left - dx, right: rect.right - dx, top: rect.top - dy, bottom: rect.bottom - dy };
  }
  function translateAt(state, x, y) {
    if (state.base === 'none') return `${x}px ${y}px`;
    const [baseX = '0px', baseY = '0px'] = state.base.split(/\s+/);
    return `calc(${baseX} + ${x}px) calc(${baseY} + ${y}px)`;
  }
  function move(node, x, y, duration, outward) {
    if (!node?.isConnected) return;
    const state = remember(node);
    if (state.offset[0] === x && state.offset[1] === y && !(state.animation && !duration)) return;
    const previous = state.offset;
    const current = win.getComputedStyle(node).translate;
    state.animation?.cancel();
    state.animation = null;
    state.offset = [x, y];
    const target = translateAt(state, x, y);
    node.style.translate = target;
    if (!duration || !node.animate) {
      if (!x && !y) node.style.translate = state.inline;
      return;
    }
    const start = current === 'none' ? '0px 0px' : current;
    const frames = [{ translate: start }];
    if (x !== previous[0] || y !== previous[1]) {
      const overX = outward ? Math.sign(x) : -Math.sign(previous[0]);
      const overY = outward ? Math.sign(y) : -Math.sign(previous[1]);
      frames.push({ translate: translateAt(state, x + overX * 10, y + overY * 10), offset: .72 });
    }
    frames.push({ translate: target });
    const animation = node.animate(frames, { duration, easing: EASE });
    state.animation = animation;
    animation.onfinish = () => {
      if (state.animation !== animation) return;
      state.animation = null;
      if (!state.offset[0] && !state.offset[1]) node.style.translate = state.inline;
    };
    animation.oncancel = () => {
      if (state.animation === animation) state.animation = null;
    };
  }
  function bounds(nodes) {
    const visible = nodes.filter(node => node?.isConnected && win.getComputedStyle(node).display !== 'none');
    const rects = visible.map(baseRect);
    return rects.length ? {
      left: Math.min(...rects.map(rect => rect.left)),
      right: Math.max(...rects.map(rect => rect.right)),
      top: Math.min(...rects.map(rect => rect.top)),
      bottom: Math.max(...rects.map(rect => rect.bottom))
    } : null;
  }
  function edgeOffset(node, edge) {
    const rect = baseRect(node);
    if (edge === 'left') return [-(rect.right + MARGIN), 0];
    if (edge === 'right') return [win.innerWidth - rect.left + MARGIN, 0];
    if (edge === 'top') return [0, -(rect.bottom + MARGIN)];
    return [0, win.innerHeight - rect.top + MARGIN];
  }
  function closestEdge(node) {
    const rect = baseRect(node);
    const distances = [rect.left, win.innerWidth - rect.right, rect.top, win.innerHeight - rect.bottom];
    return ['left', 'right', 'top', 'bottom'][distances.indexOf(Math.min(...distances))];
  }
  function refresh(nextActive = active, nextSnapshot = snapshot) {
    active = nextActive;
    snapshot = nextSnapshot;
    const config = snapshot?.interaction || {};
    const away = active && config.focusUiMoveAway !== false;
    // Focused media controls always take precedence over decorative site chrome.
    const behind = active;
    const hideHeader = away && config.focusUiHideHeader !== false;
    const hideNavbar = away && config.focusUiHideNavbar !== false;
    const hideTopRight = away && config.focusUiHideTopRight !== false;
    const hideGear = away && config.focusUiHideGear === true;
    root.body.dataset.focusUiBehind = String(behind);
    root.body.dataset.focusUiAway = String(away);
    root.body.dataset.focusUiHeaderHidden = String(hideHeader);
    root.body.dataset.focusUiNavbarHidden = String(hideNavbar);
    root.body.dataset.focusUiGearHidden = String(hideGear);
    const duration = reduced() || config.focusUiAnimate === false ? 0 :
      (away ? config.focusUiOutSpeedMs : (config.focusUiSeparateInSpeed ? config.focusUiInSpeedMs : config.focusUiOutSpeedMs)) ?? 460;
    const { header, nav, beta, mouse, gear, dock, noteDock, summary = [], utilities } = getParts();
    const target = new Map();
    const add = (node, offset) => { if (node) target.set(node, away ? offset : [0, 0]); };
    if (header) {
      const identity = [...header.children].filter(node => node.id !== 'header-placeholder' && !node.matches('.skip-link'));
      const identityBounds = bounds(identity);
      const up = identityBounds ? -(identityBounds.bottom + MARGIN) : -160;
      for (const node of identity) add(node, [0, hideHeader ? up : 0]);
      header.style.setProperty('--focus-cap-y', hideHeader ? `${-Math.max(160, identityBounds?.bottom || 0) - MARGIN}px` : '0px');
      header.style.setProperty('--focus-cap-duration', `${duration}ms`);
    }
    if (nav) add(nav, hideNavbar ? edgeOffset(nav, 'left') : hideHeader ? [0, -baseRect(nav).top] : [0, 0]);
    if (beta) add(beta, [0, hideTopRight ? edgeOffset(beta, 'top')[1] : 0]);
    if (mouse) add(mouse, hideTopRight ? edgeOffset(mouse, 'right') : [0, 0]);
    if (noteDock) add(noteDock, hideTopRight ? edgeOffset(noteDock, 'right') : [0, 0]);
    if (gear) add(gear, hideGear ? edgeOffset(gear, 'right') : [0, 0]);
    for (const node of summary) add(node, hideHeader ? edgeOffset(node, 'top') : [0, 0]);
    if (dock) add(dock, edgeOffset(dock, 'left'));
    for (const node of utilities) {
      if (dock?.contains(node) || mouse?.contains(node) || header?.contains(node) || node.closest('#review-panels')) continue;
      add(node, edgeOffset(node, closestEdge(node)));
    }
    for (const [node, state] of states) {
      if (!node.isConnected) {
        state.animation?.cancel(); node.style.translate = state.inline;
        if (state.mark) {
          if (state.marker === null) node.removeAttribute('data-focus-ui-chrome');
          else node.setAttribute('data-focus-ui-chrome', state.marker);
        }
        states.delete(node);
      }
      else if (!target.has(node)) target.set(node, [0, 0]);
    }
    for (const [node, [x, y]] of target) move(node, x, y, duration, away);
  }
  function dispose() {
    delete root.body.dataset.focusUiBehind;
    delete root.body.dataset.focusUiAway;
    delete root.body.dataset.focusUiHeaderHidden;
    delete root.body.dataset.focusUiNavbarHidden;
    delete root.body.dataset.focusUiGearHidden;
    getParts().header?.style.removeProperty('--focus-cap-y');
    getParts().header?.style.removeProperty('--focus-cap-duration');
    for (const [node, state] of states) {
      state.animation?.cancel();
      node.style.translate = state.inline;
      if (state.mark) {
        if (state.marker === null) node.removeAttribute('data-focus-ui-chrome');
        else node.setAttribute('data-focus-ui-chrome', state.marker);
      }
    }
    states.clear();
  }
  const onMotionPreference = () => refresh();
  media?.addEventListener?.('change', onMotionPreference);
  const release = dispose;
  function disposeWithListener() {
    media?.removeEventListener?.('change', onMotionPreference);
    release();
  }
  return { refresh, dispose: disposeWithListener };
}
