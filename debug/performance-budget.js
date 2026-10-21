// Frame intervals describe observed cadence, not spare CPU/GPU time.
export function frameBudget(samples, targetFPS = 60) {
  const valid = samples.filter(ms => Number.isFinite(ms) && ms > 0);
  if (!valid.length || !Number.isFinite(targetFPS) || targetFPS <= 0) return null;
  const targetMs = 1000 / targetFPS, sorted = [...valid].sort((a, b) => a - b);
  return { targetMs, average: valid.reduce((n, ms) => n + ms, 0) / valid.length,
    p95: sorted[Math.ceil(valid.length * .95) - 1], count: valid.length,
    slow: valid.filter(ms => ms > targetMs * 1.25).length };
}
