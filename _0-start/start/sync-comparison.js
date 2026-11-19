export const SYNC_NOTES = [
    { label: 'C4', frequency: 261.63, color: '#ffd173' },
    { label: 'E4', frequency: 329.63, color: '#ff9ab5' },
    { label: 'G4', frequency: 392.00, color: '#a4e4b2' },
    { label: 'C5', frequency: 523.25, color: '#8ed7ff' },
    { label: 'E5', frequency: 659.25, color: '#d3b6ff' }
];

const noteLength = .32;
const noteInterval = .42;
const schedulingLead = .04;
const events = [0, 2.55, 5.55].flatMap(arpeggio =>
    SYNC_NOTES.map((_, noteIndex) => ({ noteIndex, time: arpeggio + noteIndex * noteInterval })));

export function createSyncComparison({ context, output, signal, onEnd }) {
    const tones = SYNC_NOTES.map(({ frequency }) => {
        const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * noteLength), context.sampleRate);
        const samples = buffer.getChannelData(0);
        for(let i = 0; i < samples.length; i++) {
            const time = i / context.sampleRate;
            const phase = 2 * Math.PI * frequency * time;
            const envelope = Math.min(1, time / .004, (noteLength - time) / .035) * Math.exp(-time * 13);
            // The complete sequence measures about -16 LUFS at unity gain.
            samples[i] = .56 * envelope * (Math.sin(phase) + .23 * Math.sin(2 * phase) + .1 * Math.sin(3 * phase));
        }
        return buffer;
    });

    const scheduled = [];
    let generation = 0;
    let epoch = 0;
    let endTime = 0;
    let timer = null;
    let offset = 0;
    let scheduledOffset = 0;

    function cancelNote(source) {
        source.onended = null;
        source.stop();
        source.disconnect();
    }

    function stop() {
        generation++;
        clearInterval(timer);
        timer = null;
        for(const note of scheduled) if(note?.source) cancelNote(note.source);
        scheduled.length = 0;
    }

    function scheduleNotes(now) {
        scheduledOffset = offset;
        let earliest = now + schedulingLead;
        events.forEach(({ noteIndex, time }, index) => {
            const previous = scheduled[index];
            // Leave sounding and imminent notes alone. A large early shift
            // catches up without stacking notes or erasing the phrase breaks.
            const locked = previous && previous.when <= now + schedulingLead;
            const when = locked ? previous.when : Math.max(epoch + time + offset, earliest);
            if(!previous || previous.when !== when) {
                if(previous?.source) cancelNote(previous.source);
                const source = context.createBufferSource();
                const note = { when, source };
                source.buffer = tones[noteIndex];
                source.connect(output);
                scheduled[index] = note;
                source.onended = () => {
                    note.source = null;
                    source.disconnect();
                };
                source.start(when);
            }
            const gap = noteIndex === SYNC_NOTES.length - 1 ? .24 : .015;
            earliest = Math.max(earliest, when + noteLength + gap);
        });
        endTime = Math.max(epoch + events.at(-1).time, scheduled.at(-1).when) + noteLength;
    }

    function setOffset(offsetMs) {
        offset = offsetMs / 1000;
    }

    async function start(offsetMs) {
        stop();
        setOffset(offsetMs);
        const id = generation;
        await context.resume();
        if(id !== generation || signal?.aborted || context.state !== 'running') return false;
        const now = context.currentTime;
        epoch = now + .18 + Math.max(0, -offset);
        scheduleNotes(now);
        timer = setInterval(() => {
            const now = context.currentTime;
            if(scheduledOffset !== offset) scheduleNotes(now);
            if(now < endTime) return;
            stop();
            onEnd?.();
        }, 40);
        return true;
    }

    function sample() {
        if(timer === null) return null;
        const elapsed = context.currentTime - epoch;
        const event = events.find(({ time }) => elapsed >= time && elapsed < time + noteLength);
        if(!event) return null;
        const progress = (elapsed - event.time) / noteLength;
        return { noteIndex: event.noteIndex, bounce: 4 * progress * (1 - progress) };
    }

    signal?.addEventListener('abort', stop, { once: true });
    return { start, stop, sample, setOffset };
}
