import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTrackTitleController } from '../_5-music/music-tablet-title-state.mjs';
import { sampleInstrumentSlide, layoutInstrumentPanels, clipInstrumentHit } from '../_5-music/music-screen-layout.mjs';

function fakeClock() {
  let now = 0, nextId = 1;
  const timers = new Map(), frames = new Map();
  return {
    now: () => now,
    setTimer(callback, delay) { const id = nextId++; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimer(id) { timers.delete(id); },
    requestFrame(callback) { const id = nextId++; frames.set(id, { at: now + 16, callback }); return id; },
    cancelFrame(id) { frames.delete(id); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const entries = [...[...timers].map(([id, task]) => ({ id, task, frames: false })), ...[...frames].map(([id, task]) => ({ id, task, frames: true }))]
          .filter(item => item.task.at <= end).sort((a, b) => a.task.at - b.task.at || a.id - b.id);
        if (!entries.length) break;
        const { id, task, frames: isFrame } = entries[0];
        now = task.at;
        (isFrame ? frames : timers).delete(id);
        isFrame ? task.callback(now) : task.callback();
      }
      now = end;
    }
  };
}

function makeController(clock, options = {}) {
  const changes = [];
  const controller = createTrackTitleController({
    ...clock,
    ...options,
    initial: 'Choose a Track',
    onChange: state => changes.push({ at: clock.now(), ...state }),
    reducedMotion: options.reducedMotion || (() => false)
  });
  controller.setContext({ isWelcome: true });
  return { controller, changes };
}

test('hover debounce and 1200 ms idle timeout use the configured defaults', () => {
  const clock = fakeClock(), { controller } = makeController(clock);
  controller.setHover('Snow Thanks');
  clock.advance(99);
  assert.equal(controller.get().text, 'Choose a Track');
  clock.advance(461); // hover delay + fade out + gap + fade in
  assert.equal(controller.get().text, 'Snow Thanks');
  controller.setHover(null);
  clock.advance(1199);
  assert.equal(controller.get().text, 'Snow Thanks');
  clock.advance(500); // timeout plus full return transition
  assert.equal(controller.get().text, 'Choose a Track');
  controller.dispose();
});

test('rapid adjacent hover changes cancel stale targets without flashing them', () => {
  const clock = fakeClock(), { controller, changes } = makeController(clock);
  controller.setHover('Snow Thanks');
  clock.advance(50);
  controller.setHover('Those Raisins Are Mine!');
  clock.advance(560);
  assert.equal(controller.get().text, 'Those Raisins Are Mine!');
  assert.equal(changes.some(state => state.text === 'Snow Thanks'), false);
  controller.dispose();
});

test('a newer hover during the fade-out transition replaces its pending title target', () => {
  const clock = fakeClock(), { controller, changes } = makeController(clock);
  controller.setHover('Snow Thanks');
  clock.advance(100); // debounce finishes; the current title begins fading out
  clock.advance(50);
  controller.setHover('No Forests Left to Give');
  clock.advance(500);
  assert.equal(controller.get().text, 'No Forests Left to Give');
  assert.equal(changes.some(state => state.text === 'Snow Thanks'), false);
  controller.dispose();
});

test('title changes crossfade with a bounded overlap and no blank interval', () => {
  const clock = fakeClock(), { controller } = makeController(clock, { settings: { hoverDelay: 0, fadeDuration: 100, transitionGap: 60, idleTimeout: 1200 } });
  controller.setSettings({ hoverDelay: 0, fadeDuration: 100, transitionGap: 60, idleTimeout: 1200 });
  controller.setHover('No Forests Left to Give');
  clock.advance(80);
  assert.equal(controller.get().phase, 'crossfade');
  assert.equal(controller.get().text, 'Choose a Track');
  assert.equal(controller.get().incoming, 'No Forests Left to Give');
  assert.ok(controller.get().alpha > 0);
  assert.ok(controller.get().incomingAlpha > 0, 'incoming title overlaps outgoing title');
  assert.ok(controller.get().alpha + controller.get().incomingAlpha > 0.5, 'at least one title stays meaningfully visible');
  clock.advance(120);
  assert.equal(controller.get().phase, 'idle');
  assert.equal(controller.get().alpha, 1);
  assert.equal(controller.get().text, 'No Forests Left to Give');
  controller.dispose();
});

test('reduced motion changes the title immediately and selection overrides hover', () => {
  const clock = fakeClock(), { controller } = makeController(clock, { reducedMotion: () => true });
  controller.setHover('Snow Thanks');
  clock.advance(500);
  assert.equal(controller.get().text, 'Snow Thanks');
  assert.equal(controller.get().alpha, 1);
  controller.setContext({ selectedKey: 'Baby, Just Shut Up: A Lullaby', isWelcome: false });
  controller.setHover('No Forests Left to Give');
  assert.equal(controller.get().text, 'Baby, Just Shut Up: A Lullaby');
  controller.dispose();
});

test('settings schema declares bounded, stepped defaults for the six Music controls', async () => {
  const schema = await readFile(new URL('../_7-shared-scripts/core/settings-schema.js', import.meta.url), 'utf8');
  const expected = {
    'music.tabletTitleIdleTimeout': [1200, 0, 3000, 50],
    'music.trackNameHoverDelay': [100, 0, 500, 25],
    'music.tabletTitleFadeDuration': [180, 0, 600, 20],
    'music.tabletTitleTransitionGap': [80, 0, 400, 20],
    'music.accidentalWidth': [1.45, 1, 2.4, .05],
    'music.instrumentPanelAnimationDuration': [480, 0, 1200, 20]
  };
  for (const [path, [value, min, max, step]] of Object.entries(expected)) {
    const line = schema.split(/\r?\n/).find(candidate => candidate.includes(`'${path}':`));
    assert.ok(line, path);
    assert.equal(Number(line.match(/default:\s*([\d.]+)/)?.[1]), value, path);
    assert.deepEqual(line.match(/steppedNumeric\(([^)]+)\)/)?.[1].split(',').map(Number), [min, max, step], path);
  }
});

test('instrument headings are removed while tabs/buttons expand and accessible panel names remain', async () => {
  const source = await readFile(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  assert.match(source, /const tabsY = panelTop;/);
  assert.match(source, /const buttonsH = Math\.max\(0, panelBottom - buttonsY\);/);
  assert.doesNotMatch(source, /drawTitle\(dualInstrumentMode \? 'Lower Instrument'/);
  assert.doesNotMatch(source, /drawTitle\('Higher Instrument'/);
  assert.match(source, /lower and higher instrument panels, category tabs, instrument buttons/);
  assert.match(source, /Math\.round\(h \* 0\.67\)/);
  assert.match(source, /topPadVideo\.mode === 'idle' && \(audioPlaying \|\| playingMIDI \|\| playbackPaused\)/);
});

test('black-note indicators widen independently and glyph centers remain tied to their shapes', async () => {
  const source = await readFile(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  assert.match(source, /baseLabelW \* \(entry\.isBlack \? accidentalWidth : 1\)/);
  assert.match(source, /left \+ labelW \/ 2, textY/);
  const schema = await readFile(new URL('../_7-shared-scripts/core/settings-schema.js', import.meta.url), 'utf8');
  assert.match(schema, /'music\.accidentalWidth': \{ key: '[^']+', default: 1\.45/);
});

test('instrument panels finish flush at the center divider and preserve divider visibility', async () => {
  const source = await readFile(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  assert.match(source, /duration: prefersReducedMotion\(\) \? 0 : instrumentPanelAnimationDuration/);
  assert.match(source, /const leftTarget = dividerX - dividerHalf - panelW/);
  assert.match(source, /const rightTarget = dividerX \+ dividerHalf/);
  assert.match(source, /rgba\(160, 70, 255, 0\.9\)/);
  assert.equal(sampleInstrumentSlide({ from: 0, to: 1, start: 0, duration: 0 }, 50), 1);
  const layout = layoutInstrumentPanels({ width: 2400, panelWidth: 600, rowTop: 0, rowHeight: 480, gap: 24, divider: 1216, progress: 1 });
  const dividerHalf = 10;
  const rightTarget = 1216 + dividerHalf;
  const leftTarget = 1216 - dividerHalf - 600;
  assert.equal(leftTarget + 600, 1206, 'left panel edge meets the divider inner edge');
  assert.equal(rightTarget, 1226, 'right panel starts at the same flush boundary');
  const hit = { x: layout.rightX + 10, y: 20, w: 100, h: 50 };
  assert.deepEqual(clipInstrumentHit(hit, layout.clipRight), hit);
});

test('MIDI completion restores the track selection view only when the track player was active', async () => {
  const source = await readFile(new URL('../_5-music/music-piano-controls.v2.js', import.meta.url), 'utf8');
  assert.match(source, /const returnFromTrackPlayer = trackVideo\.active;[\s\S]*?stopTrackVideoPlayback\(\);[\s\S]*?if \(returnFromTrackPlayer\) \{[\s\S]*?musicWelcome = true;/);
  assert.doesNotMatch(source, /if \(trackVideo\.active && trackVideo\.key === currentTrackKey\) \{\s*musicWelcome = true;/);
});

test('settings contexts expose the tablet and piano controls with numeric readouts', async () => {
  const source = await readFile(new URL('../debug/panel-shell.js', import.meta.url), 'utf8');
  for (const label of ['Idle Title Timeout', 'Track Name Hover Delay', 'Title Fade Duration', 'Title Transition Gap', 'Accidental Width', 'Instrument Panel Animation Duration']) assert.ok(source.includes(label), label);
  assert.match(source, /registerContext\(context\.id, context\.label, context\.element\)/);
  assert.match(source, /data-setting-output/);
});
