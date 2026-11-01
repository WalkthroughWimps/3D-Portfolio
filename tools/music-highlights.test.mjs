import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../_5-music/music-highlights.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');

class Color {
  constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
  clone() { return new Color(this.r, this.g, this.b); }
  copy(other) { this.r = other.r; this.g = other.g; this.b = other.b; return this; }
  multiplyScalar(n) { this.r *= n; this.g *= n; this.b *= n; return this; }
}

function material(name, rgb) {
  return {
    name, color: new Color(...rgb), emissive: new Color(0, 0, 0),
    emissiveIntensity: .1, userData: {}, map: null,
    clone() { return material(this.name, [this.color.r, this.color.g, this.color.b]); },
    dispose() { this.disposed = true; }
  };
}

test('Music highlights default on, respond to shared contrast, and switch off cleanly', () => {
  const context = {
    THREE: { MathUtils: { clamp: (v, min, max) => Math.max(min, Math.min(max, v)) } },
    getLightScaleForValue: () => 1, getSharedSettings: () => null
  };
  const { bindMusicHighlights, musicContrastGlow, MUSIC_GLOW_RATIOS } = runInNewContext(
    `${source}\n({ bindMusicHighlights, musicContrastGlow, MUSIC_GLOW_RATIOS })`, context);
  const originals = [material('Borders.001', [.001, .03, .002]), material('Borders', [.06, .008, .009])];
  const bodyGroup = { name: 'SK_backing', parent: null };
  const bodyGreen = { name: 'Cube129_0', parent: bodyGroup, material: originals[0], userData: {} };
  const bodyRed = { name: 'Cube129_1', parent: bodyGroup, material: originals[1], userData: {} };
  const pedalSource = material('Rusted Brass', [.4, .3, .18]);
  const pedalGroup = { name: 'pedal_left', parent: null };
  const pedal = { name: 'pedalPart_0', parent: pedalGroup, material: pedalSource, userData: {} };
  const model = { traverse(fn) { [bodyGroup, bodyGreen, bodyRed, pedalGroup, pedal].forEach(fn); } };
  let snapshot = { start: { contrast: .5, brightness: .5 }, music: { highlightsEnabled: true } };
  let subscriber = null;
  const settings = {
    get: () => snapshot,
    subscribe(fn) { subscriber = fn; fn(snapshot, { changed: [] }); return () => { subscriber = null; }; }
  };
  const binding = bindMusicHighlights({ model, settings });
  const glow = musicContrastGlow(.5);
  assert.equal(MUSIC_GLOW_RATIOS.panelGreen, .2);
  assert.equal(MUSIC_GLOW_RATIOS.trimRed, .8);
  assert.equal(MUSIC_GLOW_RATIOS.pedals, .35);
  assert.equal(MUSIC_GLOW_RATIOS.sideGreen, .2);
  assert.equal(MUSIC_GLOW_RATIOS.sideRed, .8);
  assert.equal(bodyGreen.material.emissiveIntensity, glow * .2);
  assert.equal(bodyRed.material.emissiveIntensity, glow * .8);
  assert.equal(pedal.material.emissiveIntensity, glow * .35);
  snapshot = { ...snapshot, music: { highlightsEnabled: false } };
  subscriber(snapshot, { changed: ['music.highlightsEnabled'] });
  assert.deepEqual([bodyGreen.material.emissiveIntensity, bodyRed.material.emissiveIntensity, pedal.material.emissiveIntensity], [0, 0, 0]);
  snapshot = { start: { contrast: 1, brightness: .5 }, music: { highlightsEnabled: true } };
  subscriber(snapshot, { changed: ['start.contrast', 'music.highlightsEnabled'] });
  assert.equal(bodyRed.material.emissiveIntensity, musicContrastGlow(1) * .8);
  const clones = [bodyGreen.material, bodyRed.material, pedal.material];
  binding.dispose();
  assert.equal(bodyGreen.material, originals[0]);
  assert.equal(bodyRed.material, originals[1]);
  assert.equal(pedal.material, pedalSource);
  assert.ok(clones.every(item => item.disposed));
});
