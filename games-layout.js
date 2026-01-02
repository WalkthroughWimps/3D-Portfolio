import { assetUrl } from './assets-config.js';

export const GAME_LIST = [
  { id: 'battleship', label: 'Battleship', url: './games/battleship/index.html', renderMode: 'blit' },
  { id: 'plinko', label: 'Plinko', url: './games/plinko/index.html', renderMode: 'blit' },
  { id: 'train-mania', label: 'Train Mania', url: './games/train-mania/index.html', renderMode: 'blit' },
  { id: 'pick-a-square', label: 'Pick a Square', url: './games/pick-a-square/index.html', renderMode: 'blit' },
  { id: 'big-bomb-blast', label: 'Big Bomb Blast', url: './games/big-bomb-blast/index.html', renderMode: 'blit' }
];

export const VIDEO_LIST = [
  { id: 'reel', label: 'Game Reel', src: assetUrl('./Videos/games-page/video-games-reel-hq.webm') },
  { id: 'christmas', label: 'Christmas', src: assetUrl('./Videos/games-page/christmas-games-hq.webm') }
];

export const MENU_LAYOUT = Object.freeze({
  dividerOffset: 0.5,
  dividerWidth: 0.01, // percentage of rect.w
  videoAspect: 16 / 9,
  safeMargin: 0.01, // relative padding applied inside each region
  circleInsetPx: 48,
  textGapPx: 48
});

let loggedMenuRect = false;
let loggedMenuPositions = false;

export function getMenuRects(rect) {
  if (!loggedMenuRect) {
    loggedMenuRect = true;
    console.log('[games-layout] getMenuRects', { rect });
  }
  const gamesCount = GAME_LIST.length;
  const safeMargin = Math.min(rect.w, rect.h) * (MENU_LAYOUT.safeMargin || 0.01);

  // Define regions
  const dividerX = rect.x + rect.w * MENU_LAYOUT.dividerOffset;
  const leftRegion = {
    left: rect.x,
    right: dividerX,
    top: rect.y,
    bottom: rect.y + rect.h
  };
  const rightRegion = {
    left: dividerX,
    right: rect.x + rect.w,
    top: rect.y,
    bottom: rect.y + rect.h,
    centerX: dividerX + (rect.x + rect.w - dividerX) * 0.5,
    centerY: rect.y + rect.h * 0.5
  };

  // Available space inside right region with margins
  const availableWidth = (rightRegion.right - rightRegion.left) - 2 * safeMargin;
  const availableHeight = (rightRegion.bottom - rightRegion.top) - 2 * safeMargin;

  // Vertical spacing based on available height
  const rowSpacing = availableHeight / gamesCount;
  const rowCenters = [];
  for (let i = 0; i < gamesCount; i++) {
    rowCenters.push(rightRegion.top + safeMargin + (rowSpacing * (i + 0.5)));
  }
  // Sizing based on row spacing (fit-to-region rules)
  const pillHeight = rowSpacing * 0.5;
  const circleRadius = rowSpacing * 0.42;
  const gap = circleRadius * 0.18;
  const overlap = circleRadius * 0.35;
  const pillWidth = availableWidth * 0.78;

  const rowCenterX = rightRegion.left + safeMargin + (availableWidth * 0.5);

    const thumbPattern = ['left', 'right', 'left', 'right', 'left'];
  const games = GAME_LIST.map((game, index) => {
      let cy = rowCenters[index];
      const side = thumbPattern[index % thumbPattern.length];
      let circleCx;
    const r = circleRadius * 1.25;
    const inset = Number.isFinite(MENU_LAYOUT.circleInsetPx) ? MENU_LAYOUT.circleInsetPx : Math.max(28, Math.round(availableWidth * 0.06));
    if (side === 'left') {
      circleCx = rightRegion.left + safeMargin + inset + r;
    } else {
      circleCx = rightRegion.right - safeMargin - inset - r;
    }
    const delta = r - circleRadius;
    if (game.id === 'battleship') {
      circleCx += delta;
      cy += delta;
    } else if (game.id === 'big-bomb-blast') {
      circleCx += delta;
      cy -= delta;
    } else if (game.id === 'train-mania') {
      circleCx += delta;
    } else if (game.id === 'plinko' || game.id === 'pick-a-square') {
      circleCx -= delta;
    }
    const circle = { cx: circleCx, cy, r, side };
    const circleLeft = circle.cx - r;
    const circleRight = circle.cx + r;

    const gapItem = r * 0.18;
    const overlapItem = r * 0.35;
    let pillLeft, pillRight;
    if (side === 'left') {
      pillLeft = circleRight - overlapItem + gapItem;
      pillRight = pillLeft + pillWidth;
    } else {
      pillRight = circleLeft + overlapItem - gapItem;
      pillLeft = pillRight - pillWidth;
    }
    const pill = {
      x: pillLeft,
      y: cy - pillHeight / 2,
      w: pillWidth,
      h: pillHeight,
      radius: pillHeight / 2,
      angleSide: side
    };

    const textBoxW = pillWidth * 0.78;
    const textBoxH = pillHeight * 0.7;
    const textRect = { w: textBoxW, h: textBoxH, cx: 0, cy: cy };
    const textGap = Number.isFinite(MENU_LAYOUT.textGapPx) ? MENU_LAYOUT.textGapPx : inset;
    if (side === 'left') {
      textRect.cx = circle.cx + r + textGap + textBoxW * 0.5;
    } else {
      textRect.cx = circle.cx - r - textGap - textBoxW * 0.5;
    }
    textRect.x = textRect.cx - textBoxW / 2;
    textRect.y = textRect.cy - textBoxH / 2;

    // Clamp to right region with safe margins
    let rowLeft = Math.min(pill.x, circleLeft);
    let rowRight = Math.max(pill.x + pill.w, circleRight);
    let rowTop = Math.min(pill.y, cy - r);
    let rowBottom = Math.max(pill.y + pill.h, cy + r);
    rowLeft = Math.min(rowLeft, textRect.x);
    rowRight = Math.max(rowRight, textRect.x + textRect.w);
    rowTop = Math.min(rowTop, textRect.y);
    rowBottom = Math.max(rowBottom, textRect.y + textRect.h);

    if (rowLeft < rightRegion.left + safeMargin) {
      const dx = (rightRegion.left + safeMargin) - rowLeft;
      pill.x += dx; circle.cx += dx; textRect.x += dx; textRect.cx += dx;
      rowRight += dx; rowLeft += dx;
    }
    if (rowRight > rightRegion.right - safeMargin) {
      const dx = rowRight - (rightRegion.right - safeMargin);
      pill.x -= dx; circle.cx -= dx; textRect.x -= dx; textRect.cx -= dx;
      rowLeft -= dx; rowRight -= dx;
    }
    if (rowTop < rightRegion.top + safeMargin) {
      const dy = (rightRegion.top + safeMargin) - rowTop;
      pill.y += dy; circle.cy += dy; textRect.y += dy; textRect.cy += dy; rowBottom += dy; rowTop += dy;
    }
    if (rowBottom > rightRegion.bottom - safeMargin) {
      const dy = rowBottom - (rightRegion.bottom - safeMargin);
      pill.y -= dy; circle.cy -= dy; textRect.y -= dy; textRect.cy -= dy; rowTop -= dy; rowBottom -= dy;
    }

    return {
      id: game.id,
      label: game.label,
      pill,
      thumb: circle,
      url: game.url,
      textRect,
      side
    };
  });

  if (loggedMenuRect && !loggedMenuPositions) {
    loggedMenuPositions = true;
    const debug = games.map((g) => ({
      id: g.id,
      circle: { x: Math.round(g.thumb.cx), y: Math.round(g.thumb.cy), r: Math.round(g.thumb.r) },
      text: { x: Math.round(g.textRect.x), y: Math.round(g.textRect.y), w: Math.round(g.textRect.w), h: Math.round(g.textRect.h) }
    }));
    console.log('[games-layout] game positions', debug);
  }

  // Videos: stack inside left region
  const leftWidth = leftRegion.right - leftRegion.left;
  const leftHeight = leftRegion.bottom - leftRegion.top;
  const leftSafeWidth = leftWidth - safeMargin * 2;
  const leftSafeHeight = leftHeight - safeMargin * 2;
  const videoWidth = leftSafeWidth * 0.9;
  const videoHeight = videoWidth / MENU_LAYOUT.videoAspect;
  const videoCount = VIDEO_LIST.length;
  const remainingHeight = Math.max(0, leftSafeHeight - videoHeight * videoCount);
  const videoGap = videoCount > 0 ? remainingHeight / (videoCount + 1) : 0;
  const videoX = leftRegion.left + safeMargin + (leftSafeWidth - videoWidth) / 2;
  const videos = VIDEO_LIST.map((video, index) => {
    const vy = leftRegion.top + safeMargin + videoGap * (index + 1) + videoHeight * index;
    return {
      id: video.id,
      label: video.label,
      rect: { x: videoX, y: vy, w: videoWidth, h: videoHeight },
      cx: videoX + videoWidth / 2,
      cy: vy + videoHeight / 2,
      r: videoWidth / 2,
      src: video.src
    };
  });

  // Final vertical centering of the group within right region
  let minY = Infinity;
  let maxY = -Infinity;
  games.forEach((g) => {
    const circleTop = g.thumb.cy - g.thumb.r;
    const circleBottom = g.thumb.cy + g.thumb.r;
    minY = Math.min(minY, g.pill.y, circleTop, g.textRect.y);
    maxY = Math.max(maxY, g.pill.y + g.pill.h, circleBottom, g.textRect.y + g.textRect.h);
  });
  const groupCenterY = (minY + maxY) / 2;
  const regionCenterY = rightRegion.top + (rightRegion.bottom - rightRegion.top) * 0.5;
  const offsetY = regionCenterY - groupCenterY;
  if (Math.abs(offsetY) > 0.01) {
    games.forEach((g) => {
      g.pill.y += offsetY;
      g.thumb.cy += offsetY;
      g.textRect.y += offsetY;
      g.textRect.cy += offsetY;
    });
  }

  return { games, videos, itemHeight: pillHeight, dividerX, rightRegion };
}

export function getMenuAction(x, y, rect) {
  if (!rect) return null;
  const layout = getMenuRects(rect);
  for (let i = 0; i < layout.games.length; i++) {
    const slot = layout.games[i];
    const pillRect = slot.pill || slot.rect;
    if (pillRect && pointInRect(x, y, pillRect)) return { type: 'game', index: i };
    if (slot.thumb) {
      const dx = x - slot.thumb.cx;
      const dy = y - slot.thumb.cy;
      if (dx * dx + dy * dy <= slot.thumb.r * slot.thumb.r) return { type: 'game', index: i };
    }
  }
  for (let i = 0; i < layout.videos.length; i++) {
    const slot = layout.videos[i];
    if (pointInRect(x, y, slot.rect)) return { type: 'video', index: i };
  }
  return null;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
