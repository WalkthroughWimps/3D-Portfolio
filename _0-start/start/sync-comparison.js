// One audio clock drives both the reference flash and scheduled clicks. The
// offset is a preview until the page explicitly commits it; no reaction estimate.
export function createSyncComparison({ context, output, guideUrl, signal, onChange }) {
    let guideBuffer = null;
    let loading = null;
    let running = false;
    let interval = null;
    let epoch = 0;
    let nextBeat = 0;
    let period = 1.25;
    let offsetMs = 0;
    let guideEnds = 0;
    let generation = 0;
    const clicks = new Set();
    let voice = null;
    const click = context.createBuffer(1, Math.ceil(context.sampleRate * .045), context.sampleRate);
    const samples = click.getChannelData(0);
    for(let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        samples[i] = .65 * Math.min(1, t / .002) * Math.exp(-t * 115) * Math.sin(2 * Math.PI * 880 * t);
    }
    function stopClicks() {
        for(const source of clicks) { try { source.stop(); } catch { /* already ended */ } source.disconnect(); }
        clicks.clear();
    }
    function schedule() {
        if(!running || context.state !== 'running') return;
        const horizon = context.currentTime + Math.max(1, offsetMs / 1000 + .5);
        while(nextBeat <= horizon) {
            const when = nextBeat + offsetMs / 1000;
            if(when > context.currentTime + .015) {
                const source = context.createBufferSource();
                source.buffer = click;
                source.connect(output);
                source.onended = () => { clicks.delete(source); source.disconnect(); };
                source.start(when);
                clicks.add(source);
            }
            nextBeat += period;
        }
    }
    function setOffset(ms) {
        offsetMs = Math.max(-3000, Math.min(3000, Math.round(ms / 5) * 5));
        if(!running) return;
        stopClicks();
        // Long offsets get longer, unambiguous cycles. Changes restart the
        // reference, rather than leaving a click from the previous setting.
        period = Math.max(1.25, 2 * Math.abs(offsetMs) / 1000 + .6);
        epoch = Math.max(guideEnds + .4, context.currentTime + Math.max(.4, -offsetMs / 1000 + .18));
        nextBeat = epoch;
        schedule();
    }
    async function start(ms) {
        stop();
        const id = ++generation;
        await context.resume();
        if(!guideBuffer) {
            loading ||= fetch(guideUrl, { signal }).then(response => {
                if(!response.ok) throw new Error('Voice guide unavailable');
                return response.arrayBuffer();
            }).then(bytes => context.decodeAudioData(bytes)).catch(() => null);
            guideBuffer = await loading;
        }
        if(id !== generation || signal?.aborted) return false;
        running = true;
        guideEnds = context.currentTime;
        if(guideBuffer) {
            voice = context.createBufferSource();
            voice.buffer = guideBuffer;
            voice.connect(output);
            const source = voice;
            voice.onended = () => { source.disconnect(); if(voice === source) voice = null; };
            guideEnds = context.currentTime + .1 + guideBuffer.duration;
            voice.start(context.currentTime + .1);
        }
        setOffset(ms);
        interval = setInterval(schedule, 80);
        onChange?.();
        return true;
    }
    function stop() {
        generation++;
        running = false;
        if(interval !== null) clearInterval(interval);
        interval = null;
        stopClicks();
        if(voice) { try { voice.stop(); } catch { /* already ended */ } voice.disconnect(); voice = null; }
    }
    function sample() {
        const now = context.currentTime;
        const phase = now < epoch ? -1 : (now - epoch) % period;
        return { running, flash: running && phase >= 0 && phase < .10,
            guiding: running && now < guideEnds, period, offsetMs,
            outputLatencyMs: Number.isFinite(context.outputLatency) ? Math.round(context.outputLatency * 1000) : null };
    }
    signal?.addEventListener('abort', stop, { once: true });
    return { start, stop, setOffset, sample };
}
