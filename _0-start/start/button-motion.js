const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export const RESET_PRESS_MS = Object.freeze({ down: 350, hold: 150, up: 300 });
export const MODE_PRESS_MS = Object.freeze({ down: 350, upDelay: 50, up: 300 });

export function sampleMomentaryPress(kind, elapsed) {
    const { down, hold, up } = kind === 'reset' ? RESET_PRESS_MS : { down: 70, hold: 0, up: 110 };
    const done = elapsed >= down + hold + up;
    const amount = elapsed < down ? ease(elapsed / down)
        : elapsed < down + hold ? 1 : 1 - ease((elapsed - down - hold) / up);
    return { amount: done ? 0 : amount, done };
}

// Mode buttons have their own wall clock. The authored UI clip keeps owning
// only the panel flips and label fade timing, including its speed control.
export function createModeButtonMotion(initialMode = 'visuals') {
    let selected = initialMode;
    let amounts = { audio: initialMode === 'audio' ? 1 : 0, visuals: initialMode === 'visuals' ? 1 : 0 };
    let transition = null;
    function sample(now, instant = false) {
        if(instant) {
            transition = null;
            amounts = { audio: selected === 'audio' ? 1 : 0, visuals: selected === 'visuals' ? 1 : 0 };
        } else if(transition) {
            const elapsed = now - transition.startedAt;
            for(const mode of ['audio', 'visuals']) {
                const pressing = mode === selected;
                const progress = pressing ? elapsed / MODE_PRESS_MS.down : (elapsed - MODE_PRESS_MS.upDelay) / MODE_PRESS_MS.up;
                const target = pressing ? 1 : 0;
                amounts[mode] = transition.from[mode] + (target - transition.from[mode]) * ease(progress);
            }
            if(elapsed >= MODE_PRESS_MS.down) transition = null;
        }
        return { ...amounts };
    }
    function select(mode, now, instant = false) {
        const current = sample(now);
        if(mode === selected && !instant) return;
        selected = mode;
        transition = { startedAt: now, from: current };
        sample(now, instant);
    }
    return { sample, select };
}
