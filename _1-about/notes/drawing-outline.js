// Display-only fallback for unusually dense off-glass artwork. Keep every
// object's continuation represented; saved paths and on-glass art are untouched.
const retained = new WeakMap();
export function limitOutlineSegments(paths, budget = 6000) {
  const visible = paths.filter(path => path.segments.length), total = visible.reduce((n, p) => n + p.segments.length, 0);
  if (total <= budget) return visible;
  const guaranteed = Math.min(visible.length, budget), available = Math.max(0, budget - guaranteed), extras = Math.max(1, total - visible.length);
  return visible.slice(0, guaranteed).map(path => {
    const quota = 1 + Math.floor((path.segments.length - 1) * available / extras);
    if (quota >= path.segments.length) return path;
    let cached = retained.get(path.segments);
    if (!cached || cached.quota !== quota) {
      const segments = Array.from({ length: quota }, (_, i) => path.segments[quota === 1 ? Math.floor(path.segments.length / 2) : Math.round(i * (path.segments.length - 1) / (quota - 1))]);
      cached = { quota, segments }; retained.set(path.segments, cached);
    }
    const segments = cached.segments;
    return { ...path, segments };
  });
}
