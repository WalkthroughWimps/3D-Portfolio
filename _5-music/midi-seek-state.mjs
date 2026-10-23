// Reconstruct the transport state immediately after every event at the target.
// Matching by channel keeps overlapping notes and independent pedal lanes intact.
export function getMidiStateAtElapsed(events, elapsedMs, adjustTime) {
  const heldByChannel = new Map();
  const pedalByChannel = new Map();
  let nextIndex = 0;
  for (; nextIndex < events.length; nextIndex++) {
    const event = events[nextIndex];
    if (adjustTime(event.timeMs) > elapsedMs) break;
    const channel = Number(event.chan) || 0;
    if (event.type === 'cc64') {
      pedalByChannel.set(channel, (event.value | 0) >= 64);
      continue;
    }
    if (event.type !== 'on' && event.type !== 'off') continue;
    const key = `${channel}:${event.note}`;
    const held = heldByChannel.get(key) || [];
    if (event.type === 'on') held.push(event);
    else held.shift();
    if (held.length) heldByChannel.set(key, held);
    else heldByChannel.delete(key);
  }
  return {
    nextIndex,
    heldNotes: [...heldByChannel.values()].flat(),
    sustainDown: [...pedalByChannel.values()].some(Boolean)
  };
}
