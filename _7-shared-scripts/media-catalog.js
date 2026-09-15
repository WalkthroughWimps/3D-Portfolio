// Canonical identifiers for page-owned media. Paths remain relative so each
// page resolves them through assetUrl(), including deployments with ASSETS_BASE.
export const MEDIA_CATALOG = Object.freeze({
  music: Object.freeze({
    topPad: Object.freeze({
      title: 'Music Videos',
      thumbnail: '../Videos/music-page/sunil-video.jpg',
      preview: '../Videos/music-page/sunil-video_lq.webm',
      video: '../Videos/music-page/sunil-video_hq.webm',
      audio: '../Videos/music-page/sunil-video.opus'
    })
  })
});
