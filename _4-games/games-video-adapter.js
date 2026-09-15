import { createMediaController } from '../_7-shared-scripts/media-controller.js';

export function createGamesVideoAdapter(ctx = {}) {
  const isVideo = () => ctx.getContentMode?.() === 'video' && !!ctx.getActiveVideo?.();
  const controller = createMediaController({
    ...ctx,
    getCapabilities: () => ({
      canPlay: isVideo(),
      speed: true,
      pitch: true,
      sync: true,
      tablet: false,
      fullscreen: true
    }),
    getTitle: (video) => video?.dataset?.title || 'Game Reel',
    play: (video) => video?.play().catch(() => {}),
    pause: (video) => video?.pause(),
    cyclePlaybackRate: () => ctx.cyclePlaybackRate?.(),
    isFullscreen: () => !!ctx.isFullscreen?.(),
    toggleFullscreen: () => ctx.toggleFullscreen?.()
  });
  return { ...controller, getScreenRect: ctx.getScreenRect || (() => null), isActive: isVideo };
}
