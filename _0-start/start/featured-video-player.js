import { assetUrl } from '../../_7-shared-scripts/assets-config.js';
import { getSharedSettings } from '../../_7-shared-scripts/core/settings.js';
import { VIDEO_EXPLAINER_DEFAULTS } from '../../_7-shared-scripts/core/settings-schema.js';
import { isAudioAllowed, onAudioConsentChange, ensureAudioConsentPrompt } from '../../_7-shared-scripts/audio-consent.js';
import { playbackRates, getStoredPreservePitch, setStoredPreservePitch, createVideoControlsUI, showVideoKeyboardShortcuts } from '../../_7-shared-scripts/shared-video-controls.js';
import { createMediaController } from '../../_7-shared-scripts/media-controller.js';
import { syncTargetTime, setPreservePitchFlag } from '../../_7-shared-scripts/media/transport.js';
import { setSyncOffsetMs } from '../../_7-shared-scripts/global-sync.js';

const CLIPS = Object.freeze(Object.keys(VIDEO_EXPLAINER_DEFAULTS));
const VIDEO_ROUTE = new URL('../../_2-videos/videos.html', import.meta.url).href;

export function mountFeaturedVideoPlayer({ body, dialog, token, live, close, setTitle, setExplainer }) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const listen = (target, event, listener, options = {}) => target.addEventListener(event, listener, { ...options, signal });
  const current = () => !signal.aborted && live(token);
  const wrap = make('div', 'start-project-media');
  const main = make('div', 'start-project-video-main');
  const stage = make('div', 'start-project-video-stage');
  const video = make('video');
  const audio = make('audio');
  const canvas = make('canvas', 'start-project-video-controls');
  const status = make('p', 'start-project-video-status', 'Loading video…');
  const description = make('p', 'start-project-video-description');
  description.hidden = typeof setExplainer === 'function';
  const related = make('aside', 'start-project-video-related');
  const relatedList = make('div', 'start-project-video-links');
  const permission = make('div', 'start-project-permission');
  const permissionBox = make('div');
  const permissionTitle = make('h3', '', 'Allow sound?');
  const permissionText = make('p', '', 'Allow this video soundtrack to play?');
  const allow = make('button', 'start-project-action', 'Allow');
  const deny = make('button', 'start-project-action', 'Deny');
  const a11y = make('div', 'start-project-video-a11y');
  let slug = 'neotube-studios';
  let desiredRate = 1;
  let started = false;
  let audioFailed = false;
  let pendingAudio = null;
  let audioRetryAt = 0;
  let audioInterruptions = 0;
  let playSerial = 0;
  let clipSerial = 0;
  let frame = null;
  let controlsTimer = null;
  let pointerDragging = false;
  canvas.style.transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'opacity 250ms ease';
  const hideControls = () => {
    controlsTimer = null;
    if (!current() || pointerDragging || (stage.contains(document.activeElement) && document.activeElement !== canvas)) return;
    canvas.style.opacity = '0';
    ui.clearHoverPreview();
  };
  const showControls = (delay = 1800) => {
    clearTimeout(controlsTimer);
    canvas.style.opacity = '1';
    controlsTimer = setTimeout(hideControls, delay);
  };

  permission.id = `startProjectPermission${token}`;
  permission.style.display = 'none';
  permission.setAttribute('role', 'dialog');
  permission.setAttribute('aria-modal', 'true');
  permissionTitle.id = `startProjectPermissionTitle${token}`;
  permissionText.id = `startProjectPermissionText${token}`;
  allow.id = `startProjectAllow${token}`;
  deny.id = `startProjectDeny${token}`;
  permission.setAttribute('aria-labelledby', permissionTitle.id);
  permission.setAttribute('aria-describedby', permissionText.id);
  for (const button of [allow, deny]) button.type = 'button';
  permissionBox.append(permissionTitle, permissionText, allow, deny);
  permission.append(permissionBox);

  video.preload = 'metadata';
  video.playsInline = true;
  video.muted = true;
  audio.preload = 'metadata';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Video player controls; use Tab for accessible controls');
  stage.append(video, audio, canvas, a11y, permission);
  const tablet = make('a', 'start-project-video-tablet', 'Explore the interactive video tablet →');
  tablet.href = VIDEO_ROUTE;
  related.append(make('h3', '', 'Related work'), relatedList, tablet);
  main.append(stage, status, description);
  wrap.append(main, related);
  body.append(wrap);

  const titleFor = id => VIDEO_EXPLAINER_DEFAULTS[id].title;
  const syncMs = () => getSharedSettings().get().audio.syncMs;
  const applyRate = () => {
    if (Math.abs(video.playbackRate - desiredRate) > .001) video.playbackRate = desiredRate;
    if (Math.abs(audio.playbackRate - desiredRate) > .001) audio.playbackRate = desiredRate;
  };
  const applySettings = () => {
    const saved = getSharedSettings().get().audio;
    audio.volume = Math.max(0, Math.min(1, saved.volume));
    audio.muted = !started || saved.muted || !isAudioAllowed();
    const pitch = getStoredPreservePitch();
    setPreservePitchFlag(video, pitch);
    setPreservePitchFlag(audio, pitch);
    applyRate();
    if (audio.muted) audio.pause();
  };
  const stopFrame = () => {
    if (frame === null) return;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frame);
    else cancelAnimationFrame(frame);
    frame = null;
  };
  const align = (exact = false) => {
    if (!current()) return;
    applyRate();
    const offset = syncMs();
    const target = syncTargetTime(video.currentTime, offset);
    const bounded = Number.isFinite(audio.duration) ? Math.min(target, audio.duration) : target;
    // A seek while play() is pending can reject that promise with AbortError.
    // At 2× the old 120 ms media-time correction threshold was crossed often.
    if (!pendingAudio && (exact || audio.paused || Math.abs(audio.currentTime - bounded) > .25)) {
      try { audio.currentTime = bounded; } catch { /* metadata may still be loading */ }
    }
    if (offset > 0 && video.currentTime < offset / 1000) { audio.pause(); return; }
    if (Number.isFinite(audio.duration) && target >= audio.duration - .03) return;
    if (!started || video.paused || video.readyState < 2 || audio.muted || !audio.paused || pendingAudio || audioFailed || performance.now() < audioRetryAt) return;
    const playAt = playSerial;
    const clipAt = clipSerial;
    try {
      const attempt = Promise.resolve(audio.play());
      pendingAudio = attempt;
      void attempt.then(() => {
        if (current() && playAt === playSerial && clipAt === clipSerial) {
          audioInterruptions = 0;
          audioRetryAt = 0;
          if (!video.paused) status.textContent = 'Playing.';
        }
      }).catch(error => {
        if (current() && playAt === playSerial && clipAt === clipSerial) {
          if (error?.name === 'AbortError' && !video.paused && !audio.muted && audioInterruptions < 2) {
            audioInterruptions += 1;
            audioRetryAt = performance.now() + 250 * audioInterruptions;
            status.textContent = 'Soundtrack interrupted; retrying…';
          } else {
            audioFailed = true;
            status.textContent = 'Video is playing; soundtrack could not start. Select Play to retry.';
          }
        }
      }).finally(() => {
        if (pendingAudio === attempt) pendingAudio = null;
        if (clipAt === clipSerial && (!current() || playAt !== playSerial || video.paused || audio.muted)) audio.pause();
      });
    } catch {
      pendingAudio = null;
      audioFailed = true;
      status.textContent = 'Video is playing; soundtrack could not start.';
    }
  };
  const tick = () => {
    frame = null;
    if (!current() || video.paused || video.ended) return;
    align();
    draw();
    frame = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  };
  const startFrame = () => { if (frame === null && current() && !video.paused) tick(); };
  const pause = () => { ++playSerial; video.pause(); audio.pause(); stopFrame(); draw(); };
  const play = async () => {
    if (!current()) return;
    if (video.error) { video.load(); audio.load(); status.textContent = 'Retrying video…'; return; }
    const playAt = ++playSerial;
    const clipAt = clipSerial;
    started = true;
    audioFailed = false;
    audioInterruptions = 0;
    audioRetryAt = 0;
    applySettings();
    align(true);
    status.textContent = 'Starting video…';
    try {
      const result = video.play();
      // The soundtrack attempt stays in the same user activation as video.play().
      align(true);
      await result;
      if (!current() || playAt !== playSerial || clipAt !== clipSerial) { if (!current()) { video.pause(); audio.pause(); } return; }
      applyRate();
      if (!audioFailed && !audioInterruptions) status.textContent = audio.muted ? 'Playing without soundtrack.' : 'Playing.';
      startFrame();
      align();
      draw();
    } catch {
      if (current() && playAt === playSerial && clipAt === clipSerial) status.textContent = 'Playback failed. Select Play to retry.';
    }
  };

  const controller = createMediaController({
    getActiveVideo: () => video,
    getActiveAudio: () => audio,
    getTitle: () => titleFor(slug),
    getCapabilities: () => ({ speed: true, pitch: true, sync: true, fullscreen: !!stage.requestFullscreen, tablet: false }),
    getAudioSettings: () => ({ ...getSharedSettings().get().audio, muted: getSharedSettings().get().audio.muted || !isAudioAllowed() }),
    getSyncMs: syncMs,
    getPreservePitch: getStoredPreservePitch,
    isFullscreen: () => document.fullscreenElement === stage,
    play, pause,
    seek: ratio => { video.currentTime = ratio * video.duration; align(true); draw(); },
    setVolume: value => getSharedSettings().patch({ audio: { volume: value } }),
    toggleMute: () => {
      const saved = getSharedSettings().get().audio;
      if (!isAudioAllowed()) {
        void ensureAudioConsentPrompt({ requestAfterDeny: true, modalId: permission.id, allowButtonId: allow.id,
          denyButtonId: deny.id, signal }).then(result => {
          if (current() && result.allowed) getSharedSettings().patch({ audio: { muted: false } });
        });
      } else getSharedSettings().patch({ audio: { muted: !saved.muted } });
    },
    cyclePlaybackRate: () => {
      const index = playbackRates.findIndex(rate => Math.abs(rate - desiredRate) < .001);
      desiredRate = playbackRates[(index + 1) % playbackRates.length];
      applyRate(); draw();
    },
    setPlaybackRate: rate => { desiredRate = rate; applyRate(); draw(); },
    togglePitch: () => { setStoredPreservePitch(!getStoredPreservePitch()); applySettings(); draw(); },
    setSyncMs: value => { setSyncOffsetMs(value); align(true); draw(); },
    toggleFullscreen: async () => {
      try {
        if (document.fullscreenElement === stage) await document.exitFullscreen();
        else if (!document.fullscreenElement) await stage.requestFullscreen();
        else { status.textContent = 'Another view is fullscreen. Exit it before expanding this video.'; return; }
        controller.refresh(); draw();
      } catch { status.textContent = 'Browser fullscreen was unavailable. Try the fullscreen control again.'; }
    },
    exit: close
  });
  const theme = { bg: '#461c24', fg: '#82d9f5', bgAlpha: .94 };
  const ui = createVideoControlsUI({ solidBars: true, compact: false,
    unlimitedSyncDrag: false, shortcutCapabilities: { playerView: true, captions: false, tabletView: false },
    theme, backAccent: '#82d9f5' });
  ui.onAction = action => controller.dispatch(action);
  ui.setViewportRectProvider(() => canvas.getBoundingClientRect());
  const context = canvas.getContext('2d');
  function draw() {
    if (!current() || !context) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const css = getComputedStyle(dialog);
    const bg = css.getPropertyValue('--red-primary').trim();
    const fg = css.getPropertyValue('--blue-tertiary').trim();
    if (bg) theme.bg = bg;
    if (fg) theme.fg = fg;
    ui.setState(controller.getState());
    context.clearRect(0, 0, width, height);
    ui.draw(context);
  }
  const observer = new ResizeObserver(draw);
  observer.observe(stage);

  const accessible = (label, action) => {
    const button = make('button', '', label);
    button.type = 'button';
    listen(button, 'click', () => controller.dispatch(action));
    a11y.append(button);
    return button;
  };
  accessible('Play or pause video', { type: 'togglePlay' });
  accessible('Mute or unmute soundtrack', { type: 'toggleMute' });
  accessible('Cycle playback speed', { type: 'cyclePlaybackRate' });
  accessible('Toggle preserve pitch', { type: 'togglePitch' });
  accessible('Toggle browser fullscreen', { type: 'toggleFullscreen' });
  const help = make('button', '', 'Keyboard shortcuts help');
  help.type = 'button';
  listen(help, 'click', () => showVideoKeyboardShortcuts({ playerView: true, captions: false, tabletView: false }));
  a11y.append(help);
  const addSlider = (label, min, max, step, value, action) => {
    const input = make('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step);
    input.setAttribute('aria-label', label);
    input.value = String(value);
    listen(input, 'input', () => controller.dispatch(action(Number(input.value))));
    a11y.append(input);
    return input;
  };
  const seek = addSlider('Seek video', 0, 1000, 1, 0, value => ({ type: 'seekToRatio', ratio: value / 1000 }));
  const volume = addSlider('Soundtrack volume', 0, 100, 1, 100, value => ({ type: 'setVolume', volume: value / 100 }));
  const sync = addSlider('Soundtrack sync in milliseconds', -3000, 3000, 5, 0, value => ({ type: 'setSyncMs', value }));
  controller.subscribe(state => {
    if (!current()) return;
    seek.value = state.duration ? String(Math.round(state.currentTime / state.duration * 1000)) : '0';
    volume.value = String(Math.round(state.volume * 100));
    sync.value = String(state.syncMs);
    draw();
  }, { signal, immediate: true });

  function showRelated() {
    relatedList.replaceChildren();
    const selected = CLIPS.indexOf(slug);
    for (let offset = 1; offset <= 3; offset++) {
      const id = CLIPS[(selected + offset) % CLIPS.length];
      const link = make('a', '', titleFor(id));
      link.href = VIDEO_ROUTE;
      link.dataset.videoSlug = id;
      relatedList.append(link);
    }
  }
  function updateExplainer(snapshot = getSharedSettings().get()) {
    description.textContent = snapshot.videos?.explainer?.[slug] ?? VIDEO_EXPLAINER_DEFAULTS[slug].text;
    setExplainer?.(description.textContent);
  }
  async function select(id) {
    if (!current() || !CLIPS.includes(id)) return;
    if (document.fullscreenElement === stage) {
      try { await document.exitFullscreen(); }
      catch { status.textContent = 'Exit browser fullscreen before choosing another video.'; return; }
      if (!current()) return;
    }
    ++clipSerial;
    pause();
    started = false;
    audioFailed = false;
    audioInterruptions = 0;
    audioRetryAt = 0;
    pendingAudio = null;
    slug = id;
    setTitle(titleFor(id));
    video.removeAttribute('src'); audio.removeAttribute('src');
    video.load(); audio.load();
    video.poster = assetUrl(`Videos/videos-page/${id}.jpg`);
    video.src = assetUrl(`Videos/videos-page/${id}-hq.webm`);
    audio.src = assetUrl(`Videos/videos-page/${id}.opus`);
    video.setAttribute('aria-label', `${titleFor(id)} video`);
    video.load(); audio.load();
    applySettings();
    status.textContent = 'Loading video…';
    updateExplainer();
    showRelated();
    controller.refresh(); draw();
  }
  listen(relatedList, 'click', event => {
    const link = event.target.closest('a[data-video-slug]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void select(link.dataset.videoSlug);
  });
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    showControls();
    pointerDragging = true;
    const meta = { canvasWidth: canvas.width, canvasHeight: canvas.height };
    const hit = ui.inspectPointerEvent(event, meta);
    const handled = ui.handlePointerEvent(event, meta);
    if (!handled && !hit.hit) controller.dispatch({ type: 'togglePlay' });
    event.preventDefault();
  });
  listen(canvas, 'pointermove', event => {
    showControls();
    ui.handlePointerMove(event, { canvasWidth: canvas.width, canvasHeight: canvas.height });
  });
  listen(stage, 'pointerenter', () => showControls());
  listen(stage, 'pointerleave', () => {
    pointerDragging = false;
    ui.endPointerInteraction();
    showControls(120);
  });
  for (const name of ['pointerup', 'pointercancel']) listen(window, name, () => {
    if (!pointerDragging) return;
    pointerDragging = false;
    ui.endPointerInteraction();
    showControls();
  });
  listen(stage, 'focusin', () => showControls());
  listen(stage, 'focusout', () => showControls());
  listen(stage, 'keydown', () => showControls());
  showControls();
  listen(video, 'loadedmetadata', () => { if (current()) { applyRate(); status.textContent = 'Ready to play.'; controller.refresh(); } });
  listen(video, 'error', () => { if (current()) { pause(); status.textContent = 'Video could not load. Select Play to retry.'; } });
  listen(audio, 'error', () => { if (current()) { audioFailed = true; status.textContent = 'Soundtrack could not load. Video can play silently.'; } });
  listen(video, 'waiting', () => { audio.pause(); if (current()) status.textContent = 'Buffering…'; });
  listen(video, 'playing', () => { if (current()) { applyRate(); align(true); startFrame(); if (!audioFailed && !audioInterruptions) status.textContent = audio.muted ? 'Playing without soundtrack.' : 'Playing.'; } });
  listen(video, 'pause', () => { audio.pause(); stopFrame(); draw(); });
  listen(video, 'timeupdate', () => { align(); controller.refresh(); });
  listen(video, 'seeked', () => align(true));
  listen(video, 'ended', () => { audio.pause(); stopFrame(); if (current()) status.textContent = 'Finished. Select Play to replay.'; });
  listen(document, 'fullscreenchange', () => { if (current()) { controller.refresh(); draw(); } });
  listen(dialog, 'keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest?.('button,input,select,textarea,[contenteditable="true"],[role="dialog"]')) return;
    const key = event.key.toLowerCase();
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (key === ' ' || key === 'k') { event.preventDefault(); controller.dispatch({ type: 'togglePlay' }); }
    else if (key === 'm') { event.preventDefault(); controller.dispatch({ type: 'toggleMute' }); }
    else if (key === 'f') { event.preventDefault(); controller.dispatch({ type: 'toggleFullscreen' }); }
    else if (key === '?' || (event.shiftKey && event.code === 'Slash')) {
      event.preventDefault(); showVideoKeyboardShortcuts({ playerView: true, captions: false, tabletView: false });
    } else if (key === 'arrowup' || key === 'arrowdown') {
      event.preventDefault();
      const next = Math.max(0, Math.min(1, getSharedSettings().get().audio.volume + (key === 'arrowup' ? .05 : -.05)));
      controller.dispatch({ type: 'setVolume', volume: next });
    } else if (!event.shiftKey && video.paused && duration && (event.code === 'Comma' || event.code === 'Period')) {
      event.preventDefault();
      const direction = event.code === 'Comma' ? -1 : 1;
      controller.dispatch({ type: 'seekToRatio', ratio: Math.max(0, Math.min(1, (video.currentTime + direction / 30) / duration)) });
    } else if (key === 'j' || key === 'arrowleft' || key === 'l' || key === 'arrowright') {
      event.preventDefault(); const amount = key === 'j' || key === 'l' ? 10 : 5;
      const direction = key === 'j' || key === 'arrowleft' ? -1 : 1;
      controller.dispatch({ type: 'seekToRatio', ratio: duration ? Math.max(0, Math.min(1, (video.currentTime + amount * direction) / duration)) : 0 });
    } else if (key === 'home' || key === 'end' || /^[0-9]$/.test(key)) {
      event.preventDefault(); controller.dispatch({ type: 'seekToRatio', ratio: key === 'home' ? 0 : key === 'end' ? 1 : Number(key) / 10 });
    } else if (event.shiftKey && (key === '<' || key === '>' || key === ',' || key === '.')) {
      event.preventDefault();
      const next = Math.max(0, Math.min(playbackRates.length - 1, playbackRates.indexOf(desiredRate) + (key === '<' || key === ',' ? -1 : 1)));
      controller.dispatch({ type: 'setRate', rate: playbackRates[next] });
    }
  });
  const unsubscribe = getSharedSettings().subscribe(snapshot => { if (current()) { applySettings(); updateExplainer(snapshot); align(true); controller.refresh(); } });
  const stopConsent = onAudioConsentChange(() => { if (current()) { applySettings(); controller.refresh(); } });
  void select(slug);
  return () => {
    clearTimeout(controlsTimer);
    lifetime.abort();
    ++playSerial; ++clipSerial;
    stopFrame();
    observer.disconnect();
    unsubscribe(); stopConsent();
    ui.dispose(); controller.dispose();
    video.pause(); audio.pause();
    video.removeAttribute('src'); audio.removeAttribute('src');
    video.load(); audio.load();
    permission.remove();
  };
}
