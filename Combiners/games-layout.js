export const GAME_LIST = [
  { id: 'battleship', label: 'Battleship', url: './games/battleship/index.html', renderMode: 'blit' },
  { id: 'plinko', label: 'Plinko', url: './games/plinko/index.html', renderMode: 'blit' },
  { id: 'pick-a-square', label: 'Pick a Square', url: './games/pick-a-square/index.html', renderMode: 'blit' },
  { id: 'train-mania', label: 'Train Mania', url: './games/train-mania/index.html', renderMode: 'blit' },
  { id: 'big-bomb-blast', label: 'Big Bomb Blast', url: './games/big-bomb-blast/index.html', renderMode: 'blit' }
];

export const VIDEO_LIST = [
  { id: 'reel', label: 'Game Reel', src: './Videos/games-page/Video-Games-Reel_hq.webm' },
  { id: 'christmas', label: 'Christmas', src: './Videos/games-page/Christmas-Games_hq.webm' }
];

export const MENU_LAYOUT = Object.freeze({
  itemHeight: 0.26,
  gap: 0.04,
  leftMarginX: 0.1,
  topMargin: 0.12,
  rightMarginX: 0.08,
  circleGap: 0.08,
  dividerOffset: 0.48,
  dividerWidth: 0.012,
  gamesMarginX: 0.04,
  videoWidth: 0.32, // percentage of rect.w
  videoAspect: 16 / 9,
  thumbRadiusFactor: 0.35,
  barWidthFactor: 0.65
});

export function getMenuRects(rect) {
  const gamesCount = GAME_LIST.length;
  const gap = rect.h * MENU_LAYOUT.gap;
  const availableHeight = rect.h * (1 - MENU_LAYOUT.topMargin * 2);
  const maxItemHeight = rect.h * MENU_LAYOUT.itemHeight;
  const totalGap = gap * Math.max(gamesCount - 1, 0);
  const itemHeight = gamesCount > 0
    ? Math.min(maxItemHeight, Math.max(32, (availableHeight - totalGap) / gamesCount))
    : maxItemHeight;
  const totalHeight = gamesCount * itemHeight + totalGap;
  const topY = rect.y + (rect.h - totalHeight) / 2;

  const dividerX = rect.x + rect.w * MENU_LAYOUT.dividerOffset;
  const gamesLeft = dividerX + rect.w * MENU_LAYOUT.gamesMarginX;
  const gamesWidth = rect.x + rect.w - rect.w * MENU_LAYOUT.rightMarginX - gamesLeft;
  const thumbSides = ['left', 'right', 'left', 'right', 'left'];
  const games = GAME_LIST.map((game, index) => {
    const y = topY + index * (itemHeight + gap);
    const side = thumbSides[index % thumbSides.length];
    const r = itemHeight * (MENU_LAYOUT.thumbRadiusFactor || 0.6);
    const thumbCx = side === 'left'
      ? dividerX + rect.w * 0.05 + r
      : rect.x + rect.w - rect.w * 0.05 - r;
    const thumbCy = y + itemHeight * 0.5;
    const barW = gamesWidth * (MENU_LAYOUT.barWidthFactor || 0.7);
    const barH = itemHeight * 0.7;
    const barY = thumbCy - barH * 0.5;
    const barX = side === 'left'
      ? thumbCx + r + rect.w * 0.015
      : thumbCx - r - rect.w * 0.015 - barW;
    return {
      id: game.id,
      label: game.label,
      rect: { x: barX, y: barY, w: barW, h: barH },
      thumb: { cx: thumbCx, cy: thumbCy, r, side },
      url: game.url
    };
  });

  const videoW = rect.w * MENU_LAYOUT.videoWidth;
  const videoH = videoW / MENU_LAYOUT.videoAspect;
  const circleGap = rect.h * MENU_LAYOUT.circleGap;
  const totalCircleHeight = VIDEO_LIST.length * videoH + circleGap * Math.max(VIDEO_LIST.length - 1, 0);
  const circlesTop = rect.y + (rect.h - totalCircleHeight) / 2;
  const cx = rect.x + rect.w * MENU_LAYOUT.leftMarginX + videoW / 2;
  const videos = VIDEO_LIST.map((video, index) => {
    const cy = circlesTop + videoH / 2 + index * (videoH + circleGap);
    const vx = cx - videoW / 2;
    const vy = cy - videoH / 2;
    return { id: video.id, label: video.label, cx, cy, r: videoW / 2, rect: { x: vx, y: vy, w: videoW, h: videoH }, src: video.src };
  });

  return { games, videos, itemHeight, dividerX };
}

export function getMenuAction(x, y, rect) {
  if (!rect) return null;
  const layout = getMenuRects(rect);
  for (let i = 0; i < layout.games.length; i++) {
    const slot = layout.games[i];
    if (pointInRect(x, y, slot.rect)) return { type: 'game', index: i };
    if (slot.thumb) {
      const dx = x - slot.thumb.cx;
      const dy = y - slot.thumb.cy;
      if (dx * dx + dy * dy <= slot.thumb.r * slot.thumb.r) return { type: 'game', index: i };
    }
  }
  for (let i = 0; i < layout.videos.length; i++) {
    const slot = layout.videos[i];
    const dx = x - slot.cx;
    const dy = y - slot.cy;
    if (dx * dx + dy * dy <= slot.r * slot.r) return { type: 'video', index: i };
  }
  return null;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
