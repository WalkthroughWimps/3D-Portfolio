import { createMediaController } from '../_7-shared-scripts/media-controller.js';

export function createVideosVideoAdapter(ctx = {}) {
  return createMediaController({
    ...ctx,
    getCapabilities: () => ({ speed: true, pitch: true, sync: true, tablet: true }),
    play: (video) => video?.play().catch(() => {}),
    pause: (video) => video?.pause(),
    cyclePlaybackRate: (video) => {
      const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
      const current = Number.isFinite(video?.playbackRate) ? video.playbackRate : 1;
      const index = Math.max(0, rates.findIndex((rate) => Math.abs(rate - current) < 0.001));
      ctx.setPlaybackRate?.(rates[(index + 1) % rates.length]);
    }
  });
}
