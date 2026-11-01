import { GAME_SPLASH_IMAGES, paintGameSplash } from '../../_4-games/game-splash.js';
import { assetUrl } from '../../_7-shared-scripts/assets-config.js';
import { mountFeaturedVideoPlayer } from './featured-video-player.js';
import { getSharedSettings } from '../../_7-shared-scripts/core/settings.js';
import { isAudioAllowed, onAudioConsentChange } from '../../_7-shared-scripts/audio-consent.js';

const PROJECTS = Object.freeze({
  coursebooks: { title: 'Just Speak', url: '../../_3-graphics/graphics.html?embed=1&preview=coursebooks', page: '../../_3-graphics/graphics.html', image: 'assets/selected-work/coursebooks.png', kind: 'frame' },
  neotube: { title: 'NeoTube Studios', page: '../../_2-videos/videos.html', image: 'Videos/videos-page/neotube-studios.jpg', kind: 'video' },
  'global-conquest': { title: 'Global Conquest', url: '../../_3-graphics/shelf/tabletop.html?embed=1', page: '../../_3-graphics/graphics.html', image: 'assets/selected-work/global-conquest.png', kind: 'frame' },
  plunky: { title: 'Go Plunky, Go!', url: '../../games/plinko/index.html?embed=1', page: '../../_4-games/games.html', image: 'games/images/plinko.png', kind: 'game' }
});

const PROJECT_EXPLAINERS = Object.freeze({
  coursebooks: 'An illustrated coursebook collection for Grades 1–6. Choose a book from the spread to browse its pages.',
  neotube: 'A reel combining live action, compositing and illustrated settings. Play the video or explore Related work.',
  'global-conquest': 'Map, card and component design in a freeform tabletop. Move the pieces and explore the artwork; no game rules are enforced.',
  plunky: 'A team game with customizable names and tokens. Read the introduction, then press Play when you’re ready.'
});

export function mountStartProjectOverlays({ scope, onOpen, onClose, returnLabel = 'Start' } = {}) {
  let dialog = null;
  let active = null;
  let opener = null;
  let serial = 0;
  let disposed = false;
  let fullscreenRequest = 0;
  const cleanups = [];
  const add = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const button = (text, className, action) => {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  };
  const live = token => !disposed && !scope?.signal?.aborted && token === serial && dialog?.open;

  function afterFullscreen(action) {
    const full = document.fullscreenElement;
    if (!full || !dialog?.contains(full)) return false;
    const ownedDialog = dialog;
    const request = ++fullscreenRequest;
    const finish = () => { if (!disposed && request === fullscreenRequest && dialog === ownedDialog) action(); };
    void document.exitFullscreen().then(finish, finish);
    return true;
  }

  function clearContent(generation) {
    for (const cleanup of cleanups.splice(0)) cleanup();
    dialog.querySelectorAll('video,audio').forEach(media => {
      media.pause();
      media.removeAttribute('src');
      media.load();
    });
    dialog.querySelectorAll('iframe').forEach(frame => {
      try { frame.contentWindow?.postMessage({ type: 'start-plunky-stop', generation: String(generation) }, location.origin); } catch { /* frame may be unavailable */ }
      frame.src = 'about:blank';
      frame.remove();
    });
    dialog.querySelector('.start-project-body').replaceChildren();
  }

  function close(skipFullscreen = false) {
    if (!dialog?.open) return;
    if (!skipFullscreen && afterFullscreen(() => close(true))) return;
    ++fullscreenRequest;
    const generation = serial++;
    const prior = active;
    active = null;
    clearContent(generation);
    dialog.close();
    dialog.remove();
    dialog = null;
    try { onClose?.(prior); } finally {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      opener = null;
    }
  }

  function buildDialog() {
    dialog = element('dialog', 'start-project-dialog');
    const shell = element('div', 'start-project-shell');
    const rail = element('nav', 'start-project-rail');
    rail.setAttribute('aria-label', 'Selected work');
    const railMain = element('div', 'start-work-main');
    const intro = element('section', 'start-work-intro');
    intro.setAttribute('aria-label', 'About this work');
    intro.append(element('h2', 'start-work-context'), element('p', 'start-work-explainer'));
    const choices = element('div', 'start-work-choices');
    railMain.append(intro, element('h2', 'start-work-list-title', 'Selected work'), choices);
    rail.append(railMain);
    for (const [key, project] of Object.entries(PROJECTS)) {
      const link = element('a', 'start-project-choice');
      link.href = new URL(project.url || project.page, import.meta.url).href;
      link.dataset.startProject = key;
      const image = element('img');
      image.src = assetUrl(project.image);
      image.alt = '';
      image.width = 144; image.height = 96;
      link.append(image, element('span', '', project.title));
      choices.append(link);
    }
    const hiring = element('div', 'start-project-hiring');
    const resume = element('a', '', 'Résumé PDF');
    resume.href = assetUrl('assets/documents/matt-hall-resume.pdf');
    resume.download = 'Matt Hall - Resume.pdf';
    const resumeIcon = element('img');
    resumeIcon.src = assetUrl('assets/icons/resume-page.png');
    resumeIcon.alt = ''; resumeIcon.width = 24; resumeIcon.height = 31;
    resume.prepend(resumeIcon);
    const contact = element('a', '', 'Email me');
    contact.href = 'mailto:MattHall.JMH@gmail.com';
    contact.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 32 28" aria-hidden="true" focusable="false"><rect x="2" y="4" width="28" height="21" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 6l13 10L29 6M3 24l9-9m17 9l-9-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>');
    const sitemap = element('a', 'start-work-sitemap', 'Sitemap →');
    sitemap.href = new URL('../../sitemap.html', import.meta.url).href;
    hiring.append(resume, contact, sitemap);
    rail.append(hiring);
    const head = element('header', 'start-project-head');
    const backLabel = String(returnLabel).trim() || 'Start';
    const source = element('a', 'start-project-source');
    head.append(button(`← Back to ${backLabel}`, 'start-project-back', () => close()), element('h2'), source);
    const body = element('div', 'start-project-body');
    shell.append(rail, head, body);
    dialog.append(shell);
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('button').focus();
    // This listener belongs to the persistent shell, not a switched project's cleanup.
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    return body;
  }

  function mountFrame(body, project, key, token) {
    const frame = element('iframe', 'start-project-frame');
    frame.title = project.title;
    frame.setAttribute('allow', 'fullscreen');
    const url = new URL(project.url, import.meta.url);
    if (key === 'plunky') url.searchParams.set('generation', String(token));
    frame.src = url.href;
    body.append(frame);
    add(frame, 'load', () => {
      if (!live(token)) return;
      try {
        if (frame.contentWindow?.location.href === 'about:blank') return;
        const child = frame.contentDocument;
        add(child, 'keydown', event => {
          const childModalOpen = [...child.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')]
            .some(node => node.matches('dialog[open]') || (!node.hidden && child.defaultView.getComputedStyle(node).display !== 'none'));
          if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
              event.target.closest?.('input, textarea, select, [contenteditable="true"], dialog[open], [role="dialog"]') ||
              childModalOpen) return;
          event.preventDefault(); close();
        }, true);
        if (key === 'plunky') return;
        const embeddedStyle = child.createElement('style');
        embeddedStyle.textContent = key === 'global-conquest'
          ? 'body>header,body>footer,aside a.back,.site-selected-work{display:none!important}.table{height:100dvh!important}main{min-height:100dvh!important}.tabletop-tools{top:68px!important}'
          : '#patterned-background,#header-placeholder,.header-direct-links,.site-selected-work,.header-gear,.navigation,.nav-wrap,.header-mouse,.header-beta-label,.header-utility-dock,.header-page-summary,.page-summary,.page-summary-trigger,.page-summary-panel,.utility-dock{display:none!important}';
        child.head.append(embeddedStyle);
        cleanups.push(() => embeddedStyle.remove());
        const back = event => {
          const anchor = event.target.closest?.('a[href]');
          if (!anchor) return;
          const href = new URL(anchor.href);
          if (href.origin === location.origin && (href.pathname.endsWith('/graphics.html') || href.pathname.endsWith('/index.html'))) {
            event.preventDefault();
            close();
          }
        };
        add(child, 'click', back, true);
      } catch { /* child can still use the visible parent Back button */ }
    });
    return frame;
  }

  function mountGame(body, project, token) {
    const frame = mountFrame(body, project, 'plunky', token);
    frame.inert = true;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    const cover = element('div', 'start-project-cover');
    const card = element('div', 'start-project-shared-splash');
    const canvas = element('canvas');
    canvas.width = 1280; canvas.height = 720;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Go Plunky, Go! — the shared Games splash. Play when ready.');
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = GAME_SPLASH_IMAGES.plinko;
    const paint = () => {
      if (!live(token)) return;
      paintGameSplash(canvas.getContext('2d'), {x:0,y:0,w:1280,h:720}, {
        image, title: project.title, progress: ready ? 1 : 0, accent:getComputedStyle(document.documentElement).getPropertyValue('--purple-tertiary').trim()||'#d6a7ff'
      });
    };
    add(image, 'load', paint);
    const status = element('p', 'start-project-splash-status', 'Preparing the game…');
    status.setAttribute('role', 'status');
    const play = button('Play', 'start-project-action', () => {
      if (!ready || !live(token)) return;
      playing = true;
      play.disabled = true;
      status.textContent = 'Starting the game…';
      sendSettings();
      frame.contentWindow?.postMessage({ type: 'start-plunky-play', generation: String(token) }, location.origin);
      const ackTimer = setTimeout(() => {
        if (!live(token) || !cover.isConnected) return;
        status.textContent = 'The game did not start. Try again.';
        retry.hidden = false;
      }, 6000);
      cleanups.push(() => clearTimeout(ackTimer));
    });
    play.disabled = true;
    const retry = button('Retry', 'start-project-action', () => {
      if (!live(token)) return;
      const trigger = opener;
      close();
      open('plunky', trigger);
    });
    retry.hidden = true;
    card.append(canvas, status, play, retry);
    play.classList.add('start-project-splash-play');
    retry.classList.add('start-project-splash-retry');
    cover.append(card);
    body.append(cover);
    let ready = false;
    let playing = false;
    paint();
    const sendSettings = () => {
      if (!live(token)) return;
      const settings = getSharedSettings().get().audio;
      frame.contentWindow?.postMessage({ type: 'start-plunky-settings', generation: String(token), allowed: playing && isAudioAllowed() && !settings.muted, volume: settings.volume }, location.origin);
    };
    const timeout = setTimeout(() => {
      if (!live(token) || ready) return;
      status.textContent = 'The game is taking too long to start.';
      retry.hidden = false;
    }, 20000);
    cleanups.push(() => clearTimeout(timeout));
    add(window, 'message', event => {
      if (!live(token) || event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.generation !== String(token)) return;
      if (event.data.type === 'start-plunky-ready') {
        ready = true;
        paint();
        clearTimeout(timeout);
        status.textContent = 'Ready to play.';
        play.disabled = false;
        retry.hidden = true;
        sendSettings();
      } else if (event.data.type === 'start-plunky-playing' && playing) {
        frame.inert = false;
        frame.tabIndex = 0;
        frame.removeAttribute('aria-hidden');
        cover.remove();
        frame.focus();
      }
    });
    cleanups.push(getSharedSettings().subscribe(sendSettings));
    cleanups.push(onAudioConsentChange(sendSettings));
    add(frame, 'error', () => { if (live(token)) { status.textContent = 'The game could not load.'; retry.hidden = false; } });
  }

  function mountVideo(body, token) {
    const title = dialog.querySelector('.start-project-head h2');
    cleanups.push(mountFeaturedVideoPlayer({
      body, dialog, token, live, close,
      setTitle: value => {
        if (!live(token)) return;
        title.textContent = value;
        dialog.querySelector('.start-work-context').textContent = value;
      },
      setExplainer: value => { if (live(token)) dialog.querySelector('.start-work-explainer').textContent = value; }
    }));
  }
  function open(key, trigger = null, skipFullscreen = false) {
    if (disposed || scope?.signal?.aborted || !Object.hasOwn(PROJECTS, key)) return false;
    if (dialog?.open && key === active) return true;
    if (!skipFullscreen && afterFullscreen(() => open(key, trigger, true))) return true;
    ++fullscreenRequest;
    const project = PROJECTS[key];
    const switching = !!dialog?.open;
    if (switching) clearContent(serial);
    else { opener = trigger || document.activeElement; buildDialog(); }
    const token = ++serial;
    active = key;
    dialog.dataset.project = key;
    dialog.classList.toggle('start-project-video-dialog', project.kind === 'video');
    dialog.setAttribute('aria-label', `${project.title} project`);
    dialog.querySelector('.start-project-head h2').textContent = project.title;
    dialog.querySelector('.start-work-context').textContent = project.title;
    dialog.querySelector('.start-work-explainer').textContent = PROJECT_EXPLAINERS[key];
    const source = dialog.querySelector('.start-project-source');
    source.href = new URL(project.page, import.meta.url).href;
    source.textContent = key === 'coursebooks' ? 'Explore Graphics →' : `Explore ${key === 'neotube' ? 'Videos' : key === 'plunky' ? 'Games' : 'Graphics'} →`;
    for (const link of dialog.querySelectorAll('.start-project-choice')) {
      if (link.dataset.startProject === key) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    const body = dialog.querySelector('.start-project-body');
    body.scrollTop = 0;
    if (project.kind === 'video') mountVideo(body, token);
    else if (project.kind === 'game') mountGame(body, project, token);
    else mountFrame(body, project, key, token);
    if (!switching) onOpen?.(key);
    return true;
  }

  function handleClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[data-start-project]');
    if (!anchor || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;
    const key = anchor.dataset.startProject;
    if (!Object.hasOwn(PROJECTS, key)) return;
    event.preventDefault();
    open(key, anchor);
  }
  document.addEventListener('click', handleClick);
  const onPageHide = () => close(true);
  window.addEventListener('pagehide', onPageHide);
  function dispose() {
    if (disposed) return;
    close(true);
    disposed = true;
    document.removeEventListener('click', handleClick);
    window.removeEventListener('pagehide', onPageHide);
  }
  scope?.defer?.(dispose);
  return { open, close, dispose };
}
