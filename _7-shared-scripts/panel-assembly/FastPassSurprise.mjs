/** Session-only artwork surprise. Future image pools can replace the variant. */
export function createFastPassSurprises({artwork, motion, isIncomingHidden = () => true, random = Math.random, now = () => performance.now()}) {
  let lastReveal = -Infinity;
  return (id, {speed, duration}) => {
    const time = now();
    const cycle = motion.active.get(id) || motion.queue.get(id);
    // Only replace the incoming artwork while it is still safely hidden.
    // Once committed, this whole cycle must finish before another hover turn.
    if (!motion.focused || motion.paused || motion.reducedMotion || !motion.panels.get(id)?.record.axes ||
      !cycle?.hover || cycle.hovered || cycle.surprise || (cycle.angle || 0) >= Math.PI * .4 || !isIncomingHidden(id, cycle) ||
      !Number.isFinite(speed) || !Number.isFinite(duration) || speed < 1200 || duration <= 0 || duration > 160 ||
      time - lastReveal < 12000 || random() >= .025) return false;
    const side = motion.getLogicalSide(id) === 'icon' ? 'back' : 'front';
    cycle.surprise = true;
    if (!artwork.showPlaceholder(id, Math.floor(random() * 6), time, {side, cycle:true})) {cycle.surprise=false;return false;}
    lastReveal = time; return true;
  };
}
