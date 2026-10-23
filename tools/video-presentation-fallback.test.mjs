import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../_7-shared-scripts/video-player-controls.js', import.meta.url), 'utf8');
const createVideoStart = source.indexOf('      function createVideo(srcs = [], muted = true) {');
const createAudioStart = source.indexOf('      function createAudio(srcs = []) {', createVideoStart);
const fullListenersStart = source.indexOf('      fullVideos.forEach((vid, idx) => {', createAudioStart);
const fullListenersEnd = source.indexOf('      let hoverIndex = -1;', fullListenersStart);
assert.ok(createVideoStart >= 0 && createAudioStart > createVideoStart && fullListenersStart > createAudioStart && fullListenersEnd > fullListenersStart);

class FakeVideo {
  listeners = new Map();
  src = '';
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) || [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(listener => listener !== callback));
  }
  emit(type) {
    for (const callback of [...(this.listeners.get(type) || [])]) callback();
  }
  load() {}
}

function setup(sources) {
  const video = runInNewContext(`${source.slice(createVideoStart, createAudioStart)}\ncreateVideo(sources);`, {
    sources,
    document: { createElement: () => new FakeVideo() },
    resolveMediaUrl: value => value,
    applyPlaybackSettings: () => {},
    console: { warn: () => {} }
  });
  let exits = 0;
  runInNewContext(source.slice(fullListenersStart, fullListenersEnd), {
    fullVideos: [video],
    uiState: { fullscreen: false },
    gridDisposed: false,
    fullIndex: 0,
    startZoomOut: () => { exits++; }
  });
  return { video, get exits() { return exits; } };
}

test('first source failure starts final fallback without closing presentation; final failure closes it', () => {
  const state = setup(['first.webm', 'final.mp4']);
  state.video.__ensureSrc();
  assert.equal(state.video.src, 'first.webm');
  state.video.emit('error');
  assert.equal(state.video.src, 'final.mp4');
  assert.equal(state.video.__sourcesExhausted, false);
  assert.equal(state.exits, 0);
  state.video.emit('error');
  assert.equal(state.video.__sourcesExhausted, true);
  assert.equal(state.exits, 1);
});

test('failure after metadata closes presentation even when unused fallbacks remain', () => {
  const state = setup(['first.webm', 'final.mp4']);
  state.video.__ensureSrc();
  state.video.emit('loadedmetadata');
  state.video.emit('error');
  assert.equal(state.video.__metadataReady, true);
  assert.equal(state.video.__sourcesExhausted, false);
  assert.equal(state.exits, 1);
});
