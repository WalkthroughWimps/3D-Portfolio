import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecordedTrackVolumeRoute } from '../_5-music/music-recorded-volume.mjs';

test('recorded audio routes through its own site-volume gain before the meter mix', () => {
  const calls = [];
  const trackGain = {
    gain: { value: 1 },
    connect(destination) { calls.push(['track gain', destination]); },
    disconnect() { calls.push(['disconnect gain']); }
  };
  const audioContext = { createGain: () => trackGain };
  const meterMix = { name: 'meter mix' };
  const source = name => ({ connect(destination) { calls.push([name, destination]); } });
  const route = createRecordedTrackVolumeRoute();

  route.connectSource(source('start'), audioContext, meterMix, { volume: .25, muted: false });
  assert.deepEqual(calls.slice(0, 3), [
    ['disconnect gain'], ['track gain', meterMix], ['start', trackGain]
  ]);
  assert.equal(trackGain.gain.value, .25);
  route.update({ volume: .25, muted: true });
  assert.equal(trackGain.gain.value, 0);
  route.update({ volume: .6, muted: false });
  assert.equal(trackGain.gain.value, .6);

  route.connectSource(source('seek replacement'), audioContext, meterMix, { volume: .25, muted: false });
  assert.equal(trackGain.gain.value, .25);
  assert.deepEqual(calls.at(-1), ['seek replacement', trackGain]);
  assert.equal(calls.filter(call => call[0] === 'track gain').length, 1, 'seek reuses the routed gain');
  route.dispose();
  assert.deepEqual(calls.at(-1), ['disconnect gain']);
});

test('effective volume is clamped and consent mute cannot leak recorded audio', () => {
  const gain = { gain: { value: 1 }, connect() {}, disconnect() {} };
  const route = createRecordedTrackVolumeRoute();
  route.connectSource({ connect() {} }, { createGain: () => gain }, {}, { volume: 2, muted: false });
  assert.equal(gain.gain.value, 1);
  route.update({ volume: 1, muted: true });
  assert.equal(gain.gain.value, 0);
  route.update({ volume: -.4, muted: false });
  assert.equal(gain.gain.value, 0);
});
