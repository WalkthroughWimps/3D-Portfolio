/* global document, window, innerWidth, innerHeight */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const base = process.env.SITE_URL || 'http://127.0.0.1:8881/';
const output = 'output/videos-intro/browser.json';
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true, args: ['--enable-unsafe-swiftshader'] });
const results = [];
const instrumentation = `
  window.__introMedia = [];
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!this.__introTracked) {
      this.__introTracked = true;
      const record = { tag: this.tagName.toLowerCase(), src: this.currentSrc || this.src, events: [], outcomes: [] };
      window.__introMedia.push({ element: this, record });
      for (const name of ['loadstart','loadedmetadata','loadeddata','canplay','playing','waiting','stalled','pause','seeking','seeked','timeupdate','ended','error']) {
        this.addEventListener(name, () => record.events.push({ name, time: Number(this.currentTime || 0), readyState: this.readyState, networkState: this.networkState, stamp: performance.now() }));
      }
      record.sampleTimer = setInterval(() => {
        const quality = this.tagName === 'VIDEO' ? this.getVideoPlaybackQuality?.() : null;
        record.samples?.push({ time: Number(this.currentTime || 0), stamp: performance.now(), readyState: this.readyState, playbackRate: this.playbackRate, totalVideoFrames: quality?.totalVideoFrames ?? null, droppedVideoFrames: quality?.droppedVideoFrames ?? null });
      }, 250);
      record.samples = [];
    }
    let result;
    try { result = originalPlay.call(this); } catch (error) { window.__introMedia.at(-1)?.record.outcomes.push({ ok: false, error: String(error) }); throw error; }
    Promise.resolve(result).then(() => window.__introMedia.find(item => item.element === this)?.record.outcomes.push({ ok: true }), error => window.__introMedia.find(item => item.element === this)?.record.outcomes.push({ ok: false, error: String(error) }));
    return result;
  };
`;

async function newVideosPage(consent, { syncMs = null, playbackRate = 1, volume = 0.25, muted = false, soundOverride = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  await context.addInitScript(({ consent, instrumentation, volume, muted }) => {
    localStorage.setItem('site.audio.allowed', consent ? 'true' : 'false');
    localStorage.setItem('site.audio.volume', String(volume));
    localStorage.setItem('site.audio.muted', String(muted));
    document.cookie = `site_audio_allowed=${consent}; Path=/; SameSite=Lax`;
    (0, eval)(instrumentation);
  }, { consent, instrumentation, volume, muted });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => requests.push(request.url()));
  const pageUrl = new URL('_2-videos/videos.html', base);
  if (soundOverride) pageUrl.searchParams.set('sound', '1');
  await page.goto(pageUrl.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1200);
  const trace = await page.evaluate(() => {
    const video = document.querySelector('#tabletIntro');
    const events = [];
    for (const name of ['loadstart','loadedmetadata','loadeddata','canplay','playing','waiting','stalled','pause','seeking','seeked','timeupdate','ended','error']) {
      video?.addEventListener(name, () => events.push({ name, time: Number(video.currentTime || 0), duration: Number(video.duration || 0), readyState: video.readyState, networkState: video.networkState, buffered: [...Array(video.buffered.length)].map((_, i) => [video.buffered.start(i), video.buffered.end(i)]), stamp: performance.now() }));
    }
    return { events, startedAt: performance.now(), visible: document.visibilityState };
  });
  const promptChoice = await page.locator('#siteAudioConsentPrompt [data-audio-consent="' + (consent ? 'allow' : 'deny') + '"]').count();
  if (promptChoice) await page.locator('#siteAudioConsentPrompt [data-audio-consent="' + (consent ? 'allow' : 'deny') + '"]').click();
  await page.waitForFunction(() => !!document.querySelector('#tabletIntro') && document.querySelector('#tabletIntro').readyState >= 2, null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => { const b = document.querySelector('#introPlay'); return b && !b.disabled; }, null, { timeout: 60000 }).catch(() => {});
  if (syncMs !== null) await page.evaluate(({ syncMs, playbackRate }) => { window.setSyncOffsetMs(syncMs); document.querySelector('#tabletIntro').playbackRate = playbackRate; }, { syncMs, playbackRate });
  return { context, page, errors, requests, trace, promptChoice };
}

try {
  const paused = await newVideosPage(false, { soundOverride: true });
  let videoReady = await paused.page.evaluate(() => ({ readyState: document.querySelector('#tabletIntro')?.readyState, duration: document.querySelector('#tabletIntro')?.duration, networkState: document.querySelector('#tabletIntro')?.networkState }));
  if (await paused.page.locator('#introPlay').isEnabled()) await paused.page.locator('#introPlay').click();
  await paused.page.waitForFunction(() => document.querySelector('#tabletIntro')?.currentTime > 2.5, null, { timeout: 15000 });
  await paused.page.evaluate(() => document.querySelector('#tabletIntro').pause());
  const pausedAt = await paused.page.evaluate(() => document.querySelector('#tabletIntro').currentTime);
  await paused.page.waitForTimeout(12500);
  const heldState = await paused.page.evaluate(() => ({ done: document.body.dataset.introDone === 'true', reason: document.body.dataset.introCompletionReason || null, time: document.querySelector('#tabletIntro').currentTime, playEnabled: !document.querySelector('#introPlay').disabled, tabletY: window.__videos_debug?._refs?.tabletGroup?.position?.y ?? null }));
  const held = { ...heldState, gridMediaRequests: paused.requests.filter(url => /\/Videos\/videos-page\//i.test(url)) };
  if (await paused.page.locator('#introPlay').isEnabled()) await paused.page.locator('#introPlay').click();
  await paused.page.waitForFunction(() => document.body.dataset.introDone === 'true', null, { timeout: 25000 }).catch(() => {});
  await paused.page.waitForTimeout(1300);
  const completed = await paused.page.evaluate(() => ({ done: document.body.dataset.introDone === 'true', reason: document.body.dataset.introCompletionReason || null, time: document.querySelector('#tabletIntro').currentTime, ended: document.querySelector('#tabletIntro').ended, tabletY: window.__videos_debug?._refs?.tabletGroup?.position?.y ?? null, introMedia: window.__introMedia.map(({ record }) => record) }));
  results.push({ scenario: 'direct-denied-play-pause-over-old-deadline-resume', consentPromptChoiceFound: paused.promptChoice, videoReady, pausedAt, held, completed, gridMediaRequestCountAfterHandoff: paused.requests.filter(url => /\/Videos\/videos-page\//i.test(url)).length, pageErrors: paused.errors, events: paused.trace.events });
  await paused.context.close();

  for (const variant of [
    { syncMs: -270, playbackRate: 1 }, { syncMs: 0, playbackRate: 1 }, { syncMs: 250, playbackRate: 1.25 },
    { syncMs: 0, playbackRate: 1, volume: 0 }, { syncMs: 0, playbackRate: 1, muted: true }
  ]) {
    const allowed = await newVideosPage(true, variant);
    if (await allowed.page.locator('#introPlay').isEnabled()) await allowed.page.locator('#introPlay').click();
    await allowed.page.waitForFunction(() => document.body.dataset.introDone === 'true', null, { timeout: 25000 }).catch(() => {});
    if (variant.syncMs > 0) await allowed.page.waitForFunction(() => window.__introMedia.some(({ record, element }) => record.tag === 'audio' && element.ended), null, { timeout: 2500 }).catch(() => {});
    const allowedResult = await allowed.page.evaluate(() => ({ consent: localStorage.getItem('site.audio.allowed'), done: document.body.dataset.introDone === 'true', reason: document.body.dataset.introCompletionReason || null, syncMs: window.getSyncOffsetMs?.(), audio: window.__introMedia.filter(({ record }) => record.tag === 'audio').map(({ record, element }) => ({ ...record, currentTime: element.currentTime, paused: element.paused, muted: element.muted, volume: element.volume })), video: window.__introMedia.filter(({ record }) => record.tag === 'video').map(({ record }) => record) }));
    results.push({ scenario: 'direct-allowed-gesture-audio-video-completion', variant, result: allowedResult, pageErrors: allowed.errors, events: allowed.trace.events });
    await allowed.context.close();
  }

  const narrowContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await narrowContext.addInitScript(() => { localStorage.setItem('site.audio.allowed', 'false'); document.cookie = 'site_audio_allowed=false; Path=/; SameSite=Lax'; });
  const narrowPage = await narrowContext.newPage();
  await narrowPage.goto(new URL('_2-videos/videos.html', base).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await narrowPage.locator('#introSkip').waitFor({ state: 'visible', timeout: 30000 });
  const narrowSkipPosition = await narrowPage.locator('#introSkip').evaluate(button => { const rect = button.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; });
  await narrowPage.locator('#introSkip').click();
  const narrowResult = await narrowPage.evaluate(() => ({ done: document.body.dataset.introDone === 'true', reason: document.body.dataset.introCompletionReason || null, viewport: [innerWidth, innerHeight] }));
  results.push({ scenario: 'direct-narrow-skip-during-loading', skipPosition: narrowSkipPosition, result: narrowResult });
  await narrowContext.close();

  const record = { browser: browser.version(), base, viewport: '1280x720 direct media; 390x844 direct Skip', serviceWorkers: 'blocked for direct media cases; actual local worker behavior tested separately', physicalDevice: false, audibleOutputVerified: false, startNavigation: 'Not reproduced: local Start page initially presents its canvas onboarding and no visible Videos DOM link in the disposable headless context.', runs: results };
  await fs.mkdir('output/videos-intro', { recursive: true });
  await fs.writeFile(output, JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
} finally { await browser.close(); }
