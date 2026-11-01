export function formatTime(t) {
  if (!isFinite(t) || t < 0) return '0:00';
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
