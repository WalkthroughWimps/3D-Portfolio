export const TAU = Math.PI * 2;

/** One clockwise circuit of the carrier represents one minute. */
export function offsetForWinding(offsetSeconds, clockwiseRadians) {
  return offsetSeconds - clockwiseRadians * 60 / TAU;
}

/** Keep a continuous drag across twelve o'clock; each event is less than half a turn. */
export function unwrapAngle(previous, next) {
  let delta = next - previous;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

export function handAngles(date) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  const hours = date.getHours() % 12 + minutes / 60;
  return {hour: hours * TAU / 12, minute: minutes * TAU / 60, second: seconds * TAU / 60};
}
