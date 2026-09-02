/* Pure sticker-animation math. Kept separate from Leaflet/UI code so it can
   be reused by preview, timeline transport, and eventual exported playback. */
function stickerAnimationFrameCount(animation) {
  return clamp(Math.round(Number(animation?.frameCount) || Math.round((Number(animation?.duration) || .5) * 30)), 1, 600);
}

function keyframeEasedAmount(amount, frame) {
  const value = clamp(amount, 0, 1);
  const intensity = clamp(Number(frame?.intensity) || 1, 0.2, 2);
  switch (frame?.easing || "linear") {
    case "ease": return value * value * (3 - 2 * value);
    case "ease-in": return Math.pow(value, 1 + intensity);
    case "ease-out": return 1 - Math.pow(1 - value, 1 + intensity);
    case "bounce": {
      const overshoot = 1.15 + intensity * 1.1;
      const shifted = value - 1;
      return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
    }
    default: return value;
  }
}

function stickerAnimationFrameAt(animation, time) {
  const result = { opacity: animation.opacity, scale: animation.scale, scaleX: animation.scaleX ?? animation.scale, scaleY: animation.scaleY ?? animation.scale, rotation: animation.rotation, positionX: animation.positionX || 0, positionY: animation.positionY || 0 };
  Object.keys(result).forEach(property => {
    const frames = [...(animation.keyframes?.[property] || [])].sort((a, b) => a.time - b.time);
    const previous = frames.filter(item => item.time <= time).at(-1);
    const next = frames.find(item => item.time > time);
    if (previous && next && previous.easing !== "hold") {
      const amount = (time - previous.time) / Math.max(.00001, next.time - previous.time);
      result[property] = previous.value + (next.value - previous.value) * keyframeEasedAmount(amount, previous);
    } else if (previous) result[property] = previous.value;
    else if (next) result[property] = next.value;
  });
  return result;
}

function stickerPositionPathOffset(animation, time) {
  const frames = [...(animation.keyframes?.positionX || [])].sort((a, b) => a.time - b.time);
  const previous = frames.filter(frame => frame.time <= time).at(-1);
  const next = frames.find(frame => frame.time > time);
  if (!previous || !next) return { x: 0, y: 0 };
  const amount = clamp((time - previous.time) / Math.max(.0001, next.time - previous.time), 0, 1);
  const frequency = clamp(Number(previous.pathFrequency) || 2, 1, 8);
  const amplitude = 18 * clamp(Number(previous.intensity) || 1, .2, 2);
  switch (previous.pathMode || "straight") {
    case "in-curve": return { x: 0, y: -Math.sin(amount * Math.PI) * amplitude };
    case "out-curve": return { x: Math.sin(amount * Math.PI) * amplitude, y: 0 };
    case "zig-zag": return { x: 0, y: (1 - Math.abs(((amount * frequency) % 1) * 2 - 1) * 2 - 1) * amplitude };
    case "wavy": return { x: 0, y: Math.sin(amount * frequency * Math.PI * 2) * amplitude };
    default: return { x: 0, y: 0 };
  }
}

function stickerPreviewFrameAt(animation, time) {
  const values = stickerAnimationFrameAt(animation, time);
  const result = { ...values, x: values.positionX || 0, y: values.positionY || 0 };
  const path = stickerPositionPathOffset(animation, time);
  result.x += path.x; result.y += path.y;
  const t = clamp(time, 0, 1);
  if (animation.preset === "fade") result.opacity = .05 + (animation.opacity - .05) * t;
  if (animation.preset === "bounce") result.y = (1 - t) * 28;
  if (animation.preset === "drop") { result.opacity = .1 + (animation.opacity - .1) * t; result.y = -(1 - t) * 34; }
  if (animation.preset === "pop") result.scale = .12 + (animation.scale - .12) * t;
  return result;
}

function stickerAnimationLoopsSeamlessly(animation) {
  return Object.values(animation.keyframes || {}).every(frames => {
    if (!Array.isArray(frames) || frames.length < 2) return true;
    const ordered = [...frames].sort((a, b) => a.time - b.time);
    return Math.abs(Number(ordered[0].value) - Number(ordered.at(-1).value)) < .0001;
  });
}
