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
  videoWidthRatio: 0.86,
  safeMargin: 0.01, // relative padding applied inside each region
  circleInsetPx: 48,
  textGapPx: 48,
  magentaTopInsetRatio: 0.06,
  videoTitleHeaderRatio: 0.06,
  videoTitleVerticalOffsetRatio: 0.04,
  magentaContentOffsetRatio: 0.025
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
  const dividerW = Math.max(4, Math.round(rect.w * MENU_LAYOUT.dividerWidth));
  const dividerLeft = dividerX - dividerW / 2;
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

  const leftWidth = leftRegion.right - leftRegion.left;
  const leftSafeWidth = Math.max(0, leftWidth - safeMargin * 2);

  // Available space inside right region with margins
  const availableWidth = (rightRegion.right - rightRegion.left) - 2 * safeMargin;

  const padX = Math.max(8, Math.round(rect.w * 0.02));
  const videoTitleHeaderHeight = Math.max(
    18,
    Math.round(rect.h * (MENU_LAYOUT.videoTitleHeaderRatio || 0.04))
  );
  const videoTitleVerticalOffset = Math.round(rect.h * (MENU_LAYOUT.videoTitleVerticalOffsetRatio || 0.04));
  const magLeft = Math.round(dividerX + padX);
  const magRight = Math.round(rightRegion.right - padX);
  const titleWidthRatio = 0.8;
  const videoTitleWidth = Math.max(32, Math.round(leftSafeWidth * titleWidthRatio));
  const videoTitleX = leftRegion.left + safeMargin + Math.round((leftSafeWidth - videoTitleWidth) / 2);
  const videoTitleRect = {
    x: videoTitleX,
    y: leftRegion.top + safeMargin + videoTitleVerticalOffset,
    w: videoTitleWidth,
    h: videoTitleHeaderHeight
  };
  const magentaTitleWidth = Math.max(32, Math.round((magRight - magLeft) * titleWidthRatio));
  const magentaTitleRect = {
    x: magLeft + Math.round(((magRight - magLeft) - magentaTitleWidth) / 2),
    y: videoTitleRect.y,
    w: magentaTitleWidth,
    h: videoTitleHeaderHeight
  };
  const EXCEL_ROW_CENTERS = [352, 556, 760, 964, 1168];
  const rowCenters = EXCEL_ROW_CENTERS.slice(0, gamesCount)
    .map((y) => rect.y + y);
  const magentaTopMargin = Math.round(rect.h * (MENU_LAYOUT.magentaTopInsetRatio || 0.06));
  const magentaContentOffset = Math.round(rect.h * (MENU_LAYOUT.magentaContentOffsetRatio || 0.025));
  const minMagTop = Math.round(magentaTitleRect.y + magentaTitleRect.h + magentaTopMargin + magentaContentOffset);
  const maxMagBottom = Math.round(rect.y + rect.h - padX);
  const rowSpacing = rowCenters.length > 1
    ? (rowCenters[rowCenters.length - 1] - rowCenters[0]) / (rowCenters.length - 1)
    : 0;
  const baseRadiusFromSpacing = rowSpacing ? Math.round(rowSpacing * 0.45) : 0;
  const baseRadiusFromWidth = Math.max(48, Math.round(availableWidth * 0.12));
  const baseRadius = Math.max(12, Math.min(
    baseRadiusFromWidth,
    baseRadiusFromSpacing || baseRadiusFromWidth
  ));
  const maxRadiusByTop = rowCenters.length ? Math.max(0, rowCenters[0] - minMagTop) : baseRadius;
  const maxRadiusByBottom = rowCenters.length
    ? Math.max(0, maxMagBottom - rowCenters[rowCenters.length - 1])
    : baseRadius;
  const circleRadius = Math.max(12, Math.min(baseRadius, maxRadiusByTop || baseRadius, maxRadiusByBottom || baseRadius));
  const magTop = rowCenters.length ? Math.round(rowCenters[0] - circleRadius) : minMagTop;
  const magBottom = rowCenters.length ? Math.round(rowCenters[rowCenters.length - 1] + circleRadius) : maxMagBottom;
  const magHeight = Math.max(0, magBottom - magTop);
  const pillHeight = Math.max(12, circleRadius * 1.1);
  const pillWidth = Math.max(48, availableWidth * 0.78);
  const thumbPattern = ['left', 'right', 'left', 'right', 'left'];
  const games = GAME_LIST.map((game, index) => {
    let cy = rowCenters[index];
    const side = thumbPattern[index % thumbPattern.length];
    const r = circleRadius;
    const inset = Number.isFinite(MENU_LAYOUT.circleInsetPx) ? MENU_LAYOUT.circleInsetPx : Math.max(28, Math.round(availableWidth * 0.06));
    let circleCx = side === 'left' ? magLeft + r : magRight - r;
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
    const textMaxWidth = Math.max(200, Math.round((rightRegion.right - magLeft) - safeMargin * 2));
    const textPreferredWidth = Math.min(textMaxWidth, Math.round(pillWidth * 1.1));
    const textExpandedWidth = Math.min(textMaxWidth, Math.round(textPreferredWidth * 1.15));
    textRect.w = textExpandedWidth;
    textRect.x = magLeft;
    textRect.cx = textRect.x + textRect.w * 0.5;
    textRect.cy = cy;
    textRect.y = textRect.cy - textBoxH / 2;

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

    if (side === 'left') {
      circle.cx = magLeft + r;
    } else {
      circle.cx = magRight - r;
    }
    const circleLeft2 = circle.cx - r;
    const circleRight2 = circle.cx + r;
    if (side === 'left') {
      pillLeft = circleRight2 - overlapItem + gapItem;
      pillRight = pillLeft + pillWidth;
    } else {
      pillRight = circleLeft2 + overlapItem - gapItem;
      pillLeft = pillRight - pillWidth;
    }
    pill.x = pillLeft;
    pill.w = pillWidth;
    pill.y = cy - pillHeight / 2;

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
  const videoWidth = Math.max(64, leftSafeWidth * (MENU_LAYOUT.videoWidthRatio || 0.9));
  const videoHeight = videoWidth / MENU_LAYOUT.videoAspect;
  const videoCount = VIDEO_LIST.length;
  const videoStackHeight = Math.max(0, magBottom - magTop);
  const gapSlots = Math.max(1, videoCount - 1);
  const videoGap = videoCount > 1
    ? Math.max(0, (videoStackHeight - videoHeight * videoCount) / gapSlots)
    : 0;
  const videoListTop = magTop;
  const videoX = leftRegion.left + safeMargin + (leftSafeWidth - videoWidth) / 2;
  const videos = VIDEO_LIST.map((video, index) => {
    const vy = videoListTop + index * (videoHeight + videoGap);
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

  return {
    games,
    videos,
    itemHeight: pillHeight,
    dividerX,
    dividerW,
    dividerLeft,
    rightRegion,
    magLeft,
    magRight,
    magTop,
    magBottom,
    videoTitleRect,
    magentaTitleRect,
    videoTitleHeaderHeight
  };
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
