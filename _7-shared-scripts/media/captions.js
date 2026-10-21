function parseTimestamp(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function parseSrt(source) {
  if (typeof source !== 'string') return [];
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) continue;
    const match = /^(\S+)\s*-->\s*(\S+)/.exec(lines[timingIndex]);
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    const text = lines.slice(timingIndex + 1).join(' ').replace(/\s+/g, ' ').trim();
    if (start === null || end === null || end <= start || !text) continue;
    cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function captionTimeForVideo(videoTime, syncMs) {
  return Math.max(0, Number(videoTime || 0) - Number(syncMs || 0) / 1000);
}

export function captionAtTime(cues, time) {
  if (!Array.isArray(cues) || !Number.isFinite(time)) return null;
  return cues.find(cue => time >= cue.start && time < cue.end) || null;
}
