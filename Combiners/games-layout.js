export const GAME_LIST = [
  { id: 'battleship', label: 'Battleship', url: './games/battleship/index.html', renderMode: 'blit' },
  { id: 'train-mania', label: 'Train Mania', url: './games/train-mania/index.html', renderMode: 'blit' },
  { id: 'plinko', label: 'Plinko', url: './games/plinko/index.html', renderMode: 'blit' },
  { id: 'choose-a-square', label: 'Choose A Square', url: './games/choose-a-square/index.html', renderMode: 'blit' },
  { id: 'bowsers-big-blast', label: "Bowser's Big Blast", url: './games/bowsers-big-blast/index.html', renderMode: 'blit' }
];

export const VIDEO_LIST = [
  { id: 'reel', label: 'Game Reel', src: './Videos/games-page/Video-Games-Reel_hq.webm' },
  { id: 'christmas', label: 'Christmas', src: './Videos/games-page/Christmas-Games_hq.webm' }
];

export const MENU_LAYOUT = Object.freeze({
  leftWidth: 0.42,
  itemHeight: 0.2,
  gap: 0.04,
  leftMarginX: 0.07,
  topMargin: 0.12,
  circleRadius: 0.18,
  rightMarginX: 0.14,
  circleGap: 0.08
});

export function getMenuRects(rect) {
  const gamesCount = GAME_LIST.length;
  const leftWidth = rect.w * MENU_LAYOUT.leftWidth;
  const leftX = rect.x + rect.w * MENU_LAYOUT.leftMarginX;
  const gap = rect.h * MENU_LAYOUT.gap;
  const availableHeight = rect.h * (1 - MENU_LAYOUT.topMargin * 2);
  const maxItemHeight = rect.h * MENU_LAYOUT.itemHeight;
  const totalGap = gap * Math.max(gamesCount - 1, 0);
  const itemHeight = gamesCount > 0
    ? Math.min(maxItemHeight, Math.max(32, (availableHeight - totalGap) / gamesCount))
    : maxItemHeight;
  const totalHeight = gamesCount * itemHeight + totalGap;
  const topY = rect.y + (rect.h - totalHeight) / 2;

  const games = GAME_LIST.map((game, index) => {
    const y = topY + index * (itemHeight + gap);
    return { id: game.id, label: game.label, rect: { x: leftX, y, w: leftWidth, h: itemHeight }, url: game.url };
  });

  const r = rect.h * MENU_LAYOUT.circleRadius;
  const circleGap = rect.h * MENU_LAYOUT.circleGap;
  const totalCircleHeight = VIDEO_LIST.length * (r * 2) + circleGap * Math.max(VIDEO_LIST.length - 1, 0);
  const circlesTop = rect.y + (rect.h - totalCircleHeight) / 2;
  const cx = rect.x + rect.w - rect.w * MENU_LAYOUT.rightMarginX - r;
  const videos = VIDEO_LIST.map((video, index) => {
    const cy = circlesTop + r + index * (r * 2 + circleGap);
    return { id: video.id, label: video.label, cx, cy, r, src: video.src };
  });

  return { games, videos, itemHeight };
}

export function getMenuAction(x, y, rect) {
  if (!rect) return null;
  const layout = getMenuRects(rect);
  for (let i = 0; i < layout.games.length; i++) {
    const slot = layout.games[i];
    if (pointInRect(x, y, slot.rect)) return { type: 'game', index: i };
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
