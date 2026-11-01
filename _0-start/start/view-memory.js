const KEY = 'start.last-view.v1';
const vector = (value, count) => Array.isArray(value) && value.length === count
    && value.every(number => Number.isFinite(number) && Math.abs(number) < 100000);

export function validateStartView(value) {
    if(!value || value.version !== 1 || !vector(value.position, 3) || !vector(value.target, 3)
        || !vector(value.quaternion, 4) || !vector(value.up, 3)) return null;
    const distance = Math.hypot(...value.position.map((number, i) => number - value.target[i]));
    if(distance < .001 || distance > 10000 || Math.hypot(...value.quaternion) < .5 || Math.hypot(...value.up) < .5
        || !(value.zoom > 0 && value.zoom < 1000) || !(value.fov > 1 && value.fov < 179)
        || !(value.minDistance > 0) || !(value.maxDistance >= value.minDistance)
        || !Number.isFinite(value.maxDistance)) return null;
    if(!['audio', 'visuals'].includes(value.mode) || !['3d', 'text'].includes(value.presentation)) return null;
    return value;
}

export function createStartViewMemory(preferences) {
    let saved = null;
    try { saved = validateStartView(JSON.parse(preferences.getItem(KEY))); } catch { /* use the authored view */ }
    let pending = saved ? JSON.stringify(saved) : null;
    let written = pending, lastWrite = -Infinity;
    function record(value, now, force = false) {
        if(!validateStartView(value)) return;
        pending = JSON.stringify(value);
        if(pending !== written && (force || now - lastWrite >= 180)) {
            preferences.setItem(KEY, pending);
            written = pending; lastWrite = now;
        }
    }
    return { read: () => saved, record };
}
