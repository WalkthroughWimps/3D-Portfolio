export function createPanelPresence({ delay = 2.2, enter = .68, exit = .14 } = {}) {
  let phase = 'hidden', age = 0;
  const snapshot = () => ({ phase, visible: ['entering', 'open', 'leaving'].includes(phase), interactive: phase === 'entering' || phase === 'open', progress: phase === 'open' ? 1 : phase === 'entering' ? Math.min(1, age / enter) : 0 });
  return {
    update(dt, focused) {
      const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
      if (!focused) {
        if (phase === 'hidden' || phase === 'waiting') { phase = 'hidden'; age = 0; }
        else if (phase !== 'leaving') { phase = 'leaving'; age = 0; }
        else if ((age += step) >= exit) { phase = 'hidden'; age = 0; }
      } else {
        if (phase === 'hidden' || phase === 'leaving') { phase = 'waiting'; age = 0; }
        age += step;
        if (phase === 'waiting' && age >= delay) { phase = 'entering'; age -= delay; }
        if (phase === 'entering' && age >= enter) { phase = 'open'; age = 0; }
      }
      return snapshot();
    },
    reset() { phase = 'hidden'; age = 0; return snapshot(); },
    get state() { return snapshot(); }
  };
}
