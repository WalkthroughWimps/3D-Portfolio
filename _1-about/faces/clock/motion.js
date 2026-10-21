export const TEETH = Object.freeze([216, 144, 108, 72, 54, 36, 18]);
export const SPEED_FACTORS = Object.freeze([1, -1.5, 2, -3, 4, -6, 12]);
export const HOUR_PERIOD_SECONDS = 43200;
export const MAIN_ORBIT_FACTORS = Object.freeze([-59 / 12, 59 / 8, -59 / 6, 59 / 4, -59 / 3, 59 / 2, -59]);
export const RETURN_FACTORS = Object.freeze([1, -8, 56, -336, 1680]);

function localSeconds(date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
}

/** Absolute local wall time; a full day also closes the half-integer gear phases. */
export function gearAngles(date = new Date()) {
  const seconds = localSeconds(date);
  const phase = seconds / HOUR_PERIOD_SECONDS * Math.PI * 2;
  return SPEED_FACTORS.map(factor => (phase * factor) % (Math.PI * 2));
}

/** Grounded minute input -> descending compound train -> moving ring/backing.
 * Main wheels are measured in the backing frame; C + main[6] = motor phase.
 * The old rear wheel is NOT a 12-hour output in the fixed cube frame anymore.
 */
export function orbitMotion(date = new Date()) {
  const motor = localSeconds(date) / 3600 * Math.PI * 2;
  const wrap = angle => angle % (Math.PI * 2);
  return {
    motor: wrap(motor), carrier: wrap(motor * 60),
    main: MAIN_ORBIT_FACTORS.map(factor => wrap(motor * factor)),
    returning: RETURN_FACTORS.map(factor => wrap(motor * factor))
  };
}
