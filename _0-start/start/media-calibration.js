// Keep the existing median reaction estimate and 3-second supported range.
export function estimateSyncOffsetMs(taps) {
  if (!Array.isArray(taps) || !taps.length) return 0;
  const sorted = [...taps].sort((a, b) => a - b);
  return Math.max(-3000, Math.min(3000, Math.round(-sorted[Math.floor(sorted.length / 2)])));
}

export function audioDelaySeconds(syncMs) {
  return Math.max(0, syncMs / 1000);
}
