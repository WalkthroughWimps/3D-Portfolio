/**
 * video-player-controls.js
 * Reusable video player with controls for tablet/canvas-based playback
 * Usage: import VideoPlayer from './video-player-controls.js'; then VideoPlayer.create(canvas, options)
 */
import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { applyScreenCanvasTexture, createTabletRaycaster, createScreenOverlay, createScreenOverlayPlane } from './videos-tablet.js';

// Player state management
class PlayerState {
    constructor() {
      this.playingFull = false;
      this.fullIndex = -1;
      this.activeIndex = -1;
      this.seeking = false;
      this.controlsVisible = 0;
      this.controlsTarget = 0;
      this.controlsAnimStart = 0;
      this.lastPointerMoveTs = 0;
      this.fullStopTimer = 0;
      this.zooming = false;
      this.zoomStart = 0;
      this.zoomingOut = false;
      this.zoomOutStart = 0;
      this.zoomFrom = { x: 0, y: 0, w: 0, h: 0 };
      this.zoomOutTo = { x: 0, y: 0, w: 0, h: 0 };
    }

    reset() {
      console.log('[VideoPlayer] Resetting state, playingFull before:', this.playingFull);
      this.playingFull = false;
      this.fullIndex = -1;
      this.activeIndex = -1;
      this.seeking = false;
      this.controlsVisible = 0;
      this.controlsTarget = 0;
      this.zooming = false;
      this.zoomingOut = false;
      console.log('[VideoPlayer] State reset complete, playingFull after:', this.playingFull);
    }
  }

  // Video player instance
  class Player {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.state = new PlayerState();
      
      // Configuration
      this.config = {
        allowSound: options.allowSound !== false,
        zoomDuration: options.zoomDuration || 300,
        controlsFadeDuration: options.controlsFadeDuration || 200,
        controlsHideDelay: options.controlsHideDelay || 3000,
        onBackClick: options.onBackClick || null,
        onVideoEnd: options.onVideoEnd || null,
        getGridRect: options.getGridRect || null, // function(index) -> {x, y, w, h}
        ...options
      };

      // Media arrays
      this.videos = [];
      this.thumbnails = [];
      this.files = [];

      // Event handlers
      this.boundHandlers = {
        click: this.handleClick.bind(this),
        pointerMove: this.handlePointerMove.bind(this),
        pointerDown: this.handlePointerDown.bind(this)
      };

      this.setupEventListeners();
      // preview UI elements (floating canvas)
      this._createPreviewElements();
    }

    setupEventListeners() {
      this.canvas.addEventListener('click', this.boundHandlers.click);
      this.canvas.addEventListener('pointermove', this.boundHandlers.pointerMove);
      this.canvas.addEventListener('pointerdown', this.boundHandlers.pointerDown);
    }

    _createPreviewElements() {
      try {
        this.preview = {};
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:99999;border:1px solid rgba(0,0,0,0.6);background:#000;padding:2px;border-radius:4px;';
        const pc = document.createElement('canvas');
        pc.width = 160; pc.height = 90; pc.style.display = 'block';
        el.appendChild(pc);
        document.body.appendChild(el);
        this.preview.container = el;
        this.preview.canvas = pc;
        this.preview.ctx = pc.getContext('2d');
        this.preview.videos = []; // optional low-quality preview video elements
        this._previewState = { visible: false, idx: -1, lastPct: -1, seekToken: 0 };
      } catch (e) { this.preview = null; }
    }

    destroy() {
      this.canvas.removeEventListener('click', this.boundHandlers.click);
      this.canvas.removeEventListener('pointermove', this.boundHandlers.pointerMove);
      this.canvas.removeEventListener('pointerdown', this.boundHandlers.pointerDown);
      this.stopAllVideos();
    }

    // videoUrls: array of full-quality video URLs OR HTMLVideoElements
    // thumbnailUrls: array of static thumbnail image URLs (optional) or Image elements
    // previewUrls: array of low-quality preview video URLs OR HTMLVideoElements (optional)
    loadVideos(videoUrls, thumbnailUrls = [], previewUrls = []) {
      this.files = videoUrls;
      this.videos = videoUrls.map(item => {
        if (!item) return null;
        if (item instanceof HTMLVideoElement) {
          return item;
        }
        const video = document.createElement('video');
        video.src = item;
        video.preload = 'metadata';
        return video;
      });
      this.thumbnails = thumbnailUrls.map(url => {
        if (!url) return null;
        if (url instanceof HTMLImageElement) return url;
        const img = new Image();
        img.src = url;
        return img;
      });
      // prepare preview (low-quality) videos if provided
      try {
        if (Array.isArray(previewUrls) && previewUrls.length) {
          this.preview.videos = previewUrls.map(u => {
            if (!u) return null;
            if (u instanceof HTMLVideoElement) return u;
            const v = document.createElement('video');
            v.src = u;
            v.muted = true;
            v.preload = 'metadata';
            v.playsInline = true;
            v.crossOrigin = 'anonymous';
            return v;
          });
        } else if (typeof window !== 'undefined' && window.__videoGridPreviewVideos && Array.isArray(window.__videoGridPreviewVideos)) {
          // reuse preview videos produced by createGrid if available
          this.preview.videos = window.__videoGridPreviewVideos.slice(0, this.videos.length);
        } else if (this.preview && this.preview.videos && this.preview.videos.length && this.preview.videos.length === this.videos.length) {
          this.preview.videos = this.preview.videos;
        }
      } catch (e) { /* ignore preview setup errors */ }
    }

    stopAllVideos() {
      this.videos.forEach(v => {
        try {
          if (v) {
            v.pause();
            v.currentTime = 0;
          }
        } catch (e) {
          console.warn('[VideoPlayer] Error stopping video:', e);
        }
      });
    }

    canPlayVideo(index) {
      console.log('[VideoPlayer] canPlayVideo check - playingFull:', this.state.playingFull, 'index:', index);
      return !this.state.playingFull && index >= 0 && index < this.videos.length;
    }

    playVideo(index, gridRect = null) {
      console.log('[VideoPlayer] playVideo called - index:', index, 'canPlay:', this.canPlayVideo(index));
      
      if (!this.canPlayVideo(index)) {
        console.log('[VideoPlayer] Cannot play - playingFull=true or invalid index');
        return false;
      }

      console.log('[VideoPlayer] Starting video playback for index:', index);
      this.state.playingFull = true;
      this.state.fullIndex = index;

      // Stop all other videos
      this.videos.forEach((v, i) => {
        if (i !== index) {
          try { v.pause(); } catch (e) {}
        }
      });

      // Get grid position for zoom animation
      if (gridRect) {
        this.state.zoomFrom = gridRect;
      } else if (this.config.getGridRect) {
        this.state.zoomFrom = this.config.getGridRect(index);
      }

      // Start zoom-in animation
      this.state.zooming = true;
      this.state.zoomStart = performance.now();

      // Prepare video
      const video = this.videos[index];
      if (video) {
        try {
          video.pause();
          video.currentTime = 0;
          video.muted = !this.config.allowSound;
          if (!video.muted) video.volume = 1.0;
        } catch (e) {
          console.warn('[VideoPlayer] Error preparing video:', e);
        }
      }

      // Show controls after a delay
      setTimeout(() => {
        this.state.controlsTarget = 1;
        this.state.controlsAnimStart = performance.now();
      }, 500);

      return true;
    }

    exitPlayer() {
      console.log('[VideoPlayer] exitPlayer called, fullIndex:', this.state.fullIndex);
      
      if (this.state.fullIndex < 0) {
        console.log('[VideoPlayer] No video playing, ignoring exit');
        return;
      }

      const exitingIndex = this.state.fullIndex;

      // Stop current video
      if (this.videos[exitingIndex]) {
        try {
          this.videos[exitingIndex].pause();
        } catch (e) {
          console.warn('[VideoPlayer] Error pausing video on exit:', e);
        }
      }

      // Get destination rect for zoom-out
      if (this.config.getGridRect) {
        this.state.zoomOutTo = this.config.getGridRect(exitingIndex);
      }

      // Start zoom-out animation
      this.state.zoomingOut = true;
      this.state.zoomOutStart = performance.now();
      this.state.playingFull = false;
      
      console.log('[VideoPlayer] Set playingFull=false, started zoom-out animation');

      // Callback
      if (this.config.onBackClick) {
        this.config.onBackClick(exitingIndex);
      }
    }

    handleClick(event) {
      if (!this.state.playingFull || this.state.fullIndex < 0) return;

      const pt = this.getCanvasPoint(event);
      if (!pt) return;

      const ui = this.getControlsLayout();
      
      // Back button
      const b = ui.top.back;
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
        console.log('[VideoPlayer] Back button clicked');
        this.exitPlayer();
        return;
      }

      // Play/pause button
      const video = this.videos[this.state.fullIndex];
      if (!video) return;

      const pb = ui.bottom.play;
      if (pt.x >= pb.x && pt.x <= pb.x + pb.w && pt.y >= pb.y && pt.y <= pb.y + pb.h) {
        if (video.paused) {
          video.play().catch(e => console.warn('[VideoPlayer] Play failed:', e));
        } else {
          video.pause();
        }
        this.showControlsTemporarily();
        return;
      }

      // Mute button
      const mb = ui.bottom.mute;
      if (pt.x >= mb.x && pt.x <= mb.x + mb.w && pt.y >= mb.y && pt.y <= mb.y + mb.h) {
        video.muted = !video.muted;
        this.showControlsTemporarily();
        return;
      }

      // Progress bar seek
      const pr = ui.bottom.progress;
      if (pt.x >= pr.x && pt.x <= pr.x + pr.w && pt.y >= pr.y - 16 && pt.y <= pr.y + pr.h + 16) {
        if (video && video.duration) {
          const t = Math.max(0, Math.min(1, (pt.x - pr.x) / pr.w)) * video.duration;
          try {
            video.currentTime = t;
          } catch (e) {
            console.warn('[VideoPlayer] Seek failed:', e);
          }
          this.showControlsTemporarily();
        }
      }
    }

    handlePointerMove(event) {
      if (!this.state.playingFull) return;
      this.state.lastPointerMoveTs = performance.now();
      if (this.state.controlsTarget === 0) {
        this.state.controlsTarget = 1;
        this.state.controlsAnimStart = performance.now();
      }
      // update hover preview if over progress bar
      try { this._updateHoverPreview(event); } catch (e) { /* ignore */ }
    }

    handlePointerDown(event) {
      // Reset interactions if not in full player mode
      if (!this.state.playingFull) {
        this.state.reset();
      }
    }

    showControlsTemporarily() {
      this.state.lastPointerMoveTs = performance.now();
      this.state.controlsTarget = 1;
      this.state.controlsAnimStart = performance.now();
    }

    getCanvasPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: x * scaleX,
        y: y * scaleY
      };
    }

    getBarHeight() {
      const CH = this.canvas.height;
      return Math.max(24, Math.round(CH * 0.08));
    }

    getControlsLayout() {
      const CW = this.canvas.width;
      const CH = this.canvas.height;
      const BAR_H = this.getBarHeight();
      const ICON_SIZE = Math.round(BAR_H * 0.5);
      const PAD = Math.round(BAR_H * 0.25);

      return {
        top: {
          x: 0,
          y: 0,
          w: CW,
          h: BAR_H,
          back: { x: PAD, y: (BAR_H - ICON_SIZE) / 2, w: ICON_SIZE, h: ICON_SIZE }
        },
        bottom: {
          x: 0,
          y: CH - BAR_H,
          w: CW,
          h: BAR_H,
          play: { x: PAD, y: CH - BAR_H + (BAR_H - ICON_SIZE) / 2, w: ICON_SIZE, h: ICON_SIZE },
          mute: { x: PAD * 2 + ICON_SIZE, y: CH - BAR_H + (BAR_H - ICON_SIZE) / 2, w: ICON_SIZE, h: ICON_SIZE },
          progress: { x: PAD * 3 + ICON_SIZE * 2, y: CH - BAR_H + BAR_H / 2 - 2, w: CW - (PAD * 4 + ICON_SIZE * 2), h: 4 }
        }
      };
    }

    updateControls() {
      if (!this.state.playingFull) return;

      // Auto-hide controls after delay
      const now = performance.now();
      if (this.state.controlsTarget === 1 && now - this.state.lastPointerMoveTs > this.config.controlsHideDelay) {
        this.state.controlsTarget = 0;
        this.state.controlsAnimStart = now;
      }

      // Animate controls fade
      const elapsed = now - this.state.controlsAnimStart;
      const progress = Math.min(1, elapsed / this.config.controlsFadeDuration);
      this.state.controlsVisible = this.state.controlsTarget === 1
        ? progress
        : 1 - progress;
    }

    drawControls(alpha = 1) {
      if (this.state.controlsVisible <= 0) return;

      const ctx = this.ctx;
      const ui = this.getControlsLayout();
      const video = this.videos[this.state.fullIndex];
      if (!video) return;

      const finalAlpha = alpha * this.state.controlsVisible;
      ctx.save();
      ctx.globalAlpha = finalAlpha;

      // Top bar with back button
      ctx.fillStyle = 'rgba(12,12,12,0.92)';
      ctx.fillRect(ui.top.x, ui.top.y, ui.top.w, ui.top.h);

      // Back button (chevron)
      this.drawBackButton(ui.top.back);

      // Bottom bar
      ctx.fillStyle = 'rgba(12,12,12,0.92)';
      ctx.fillRect(ui.bottom.x, ui.bottom.y, ui.bottom.w, ui.bottom.h);

      // Play/pause button
      this.drawPlayButton(ui.bottom.play, video.paused);

      // Mute button
      this.drawMuteButton(ui.bottom.mute, video.muted);

      // Progress bar
      this.drawProgressBar(ui.bottom.progress, video);

      ctx.restore();
    }

    drawBackButton(rect) {
      const ctx = this.ctx;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w * 0.68, rect.y + rect.h * 0.22);
      ctx.lineTo(rect.x + rect.w * 0.32, rect.y + rect.h * 0.50);
      ctx.lineTo(rect.x + rect.w * 0.68, rect.y + rect.h * 0.78);
      ctx.stroke();
    }

    drawPlayButton(rect, paused) {
      const ctx = this.ctx;
      ctx.fillStyle = '#fff';
      if (paused) {
        // Play triangle
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w * 0.30, rect.y + rect.h * 0.20);
        ctx.lineTo(rect.x + rect.w * 0.30, rect.y + rect.h * 0.80);
        ctx.lineTo(rect.x + rect.w * 0.80, rect.y + rect.h * 0.50);
        ctx.closePath();
        ctx.fill();
      } else {
        // Pause bars
        ctx.fillRect(rect.x + rect.w * 0.25, rect.y + rect.h * 0.20, rect.w * 0.20, rect.h * 0.60);
        ctx.fillRect(rect.x + rect.w * 0.55, rect.y + rect.h * 0.20, rect.w * 0.20, rect.h * 0.60);
      }
    }

    drawMuteButton(rect, muted) {
      const ctx = this.ctx;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      
      // Speaker icon
      ctx.beginPath();
      ctx.moveTo(rect.x + rect.w * 0.20, rect.y + rect.h * 0.35);
      ctx.lineTo(rect.x + rect.w * 0.40, rect.y + rect.h * 0.35);
      ctx.lineTo(rect.x + rect.w * 0.60, rect.y + rect.h * 0.15);
      ctx.lineTo(rect.x + rect.w * 0.60, rect.y + rect.h * 0.85);
      ctx.lineTo(rect.x + rect.w * 0.40, rect.y + rect.h * 0.65);
      ctx.lineTo(rect.x + rect.w * 0.20, rect.y + rect.h * 0.65);
      ctx.closePath();
      ctx.fill();

      if (muted) {
        // X mark
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w * 0.70, rect.y + rect.h * 0.30);
        ctx.lineTo(rect.x + rect.w * 0.94, rect.y + rect.h * 0.70);
        ctx.moveTo(rect.x + rect.w * 0.94, rect.y + rect.h * 0.30);
        ctx.lineTo(rect.x + rect.w * 0.70, rect.y + rect.h * 0.70);
        ctx.stroke();
      } else {
        // Sound waves
        ctx.beginPath();
        ctx.arc(rect.x + rect.w * 0.70, rect.y + rect.h * 0.50, rect.w * 0.15, -Math.PI/4, Math.PI/4);
        ctx.stroke();
      }
    }

    drawProgressBar(rect, video) {
      const ctx = this.ctx;
      
      // Background track
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      // Progress fill
      const progress = video.duration > 0 ? video.currentTime / video.duration : 0;
      ctx.fillStyle = '#1e90ff';
      ctx.fillRect(rect.x, rect.y, rect.w * progress, rect.h);

      // Scrubber dot
      const dotX = rect.x + rect.w * progress;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(dotX, rect.y + rect.h / 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover preview helpers
    _isPointOverProgress(pt, pr) {
      if (!pr || !pt) return false;
      const hitY = pr.h + 16; // vertical tolerance
      return pt.x >= pr.x && pt.x <= pr.x + pr.w && pt.y >= pr.y - 16 && pt.y <= pr.y + pr.h + 16;
    }

    _updateHoverPreview(event) {
      if (!this.preview) return;
      const pt = this.getCanvasPoint(event);
      if (!pt) return;
      const ui = this.getControlsLayout();
      const pr = ui.bottom.progress;
      if (!this._isPointOverProgress(pt, pr)) {
        // hide preview
        if (this._previewState.visible) {
          this.preview.container.style.display = 'none';
          this._previewState.visible = false;
          this._previewState.lastPct = -1;
        }
        return;
      }

      // calculate percentage
      const pct = Math.max(0, Math.min(1, (pt.x - pr.x) / pr.w));
      // throttle updates to avoid excessive seeking
      if (Math.abs(pct - this._previewState.lastPct) < 0.01) return;
      this._previewState.lastPct = pct;

      // compute target time using current full video duration
      const idx = this.state.fullIndex;
      const fullVideo = this.videos[idx];
      let targetTime = 0;
      if (fullVideo && fullVideo.duration && isFinite(fullVideo.duration)) targetTime = pct * fullVideo.duration;

      // position preview centered over cursor, but clamp to progress bar bounds
      try {
        const canvasRect = this.canvas.getBoundingClientRect();
        const progClientX = canvasRect.left + (pr.x / this.canvas.width) * canvasRect.width;
        const progClientW = (pr.w / this.canvas.width) * canvasRect.width;
        const previewW = this.preview.canvas.width;
        const previewH = this.preview.canvas.height;
        // desired centered left
        let left = Math.round(event.clientX - previewW / 2);
        // clamp within progress bar extents with small margins
        const minLeft = Math.round(progClientX - 4);
        const maxLeft = Math.round(progClientX + progClientW - previewW + 4);
        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = maxLeft;
        // fallback to stay on-screen
        left = Math.max(6, Math.min(window.innerWidth - previewW - 6, left));
        // vertical: place above cursor if possible
        let top = Math.round(event.clientY - previewH - 12);
        if (top < 6) top = Math.min(window.innerHeight - previewH - 6, event.clientY + 16);
        this.preview.container.style.left = left + 'px';
        this.preview.container.style.top = top + 'px';
      } catch (e) {
        const px = Math.min(window.innerWidth - 10 - this.preview.canvas.width, Math.max(10, event.clientX + 12));
        const py = Math.min(window.innerHeight - 10 - this.preview.canvas.height, Math.max(10, event.clientY - 12 - this.preview.canvas.height));
        this.preview.container.style.left = px + 'px';
        this.preview.container.style.top = py + 'px';
      }
      this.preview.container.style.display = 'block';
      this._previewState.visible = true;

      // If we have a low-quality preview video for this index, seek and draw
      try {
        if (this.preview.videos && this.preview.videos[idx]) {
          const pv = this.preview.videos[idx];
          if (!pv) { this._drawThumbnailPreview(idx); return; }
          // quantize to nearest 10 frames (approx using previewFps config)
          const fps = (this.config && this.config.previewFps) ? Number(this.config.previewFps) : 30;
          const interval = Math.max(0.05, 10 / Math.max(1, fps));
          const qTime = Math.round(targetTime / interval) * interval;
          // use seek token to ensure only latest seek triggers draw
          const token = ++this._previewState.seekToken;
          const drawIfReady = () => {
            try {
              if (this._previewState.seekToken !== token) return;
              if (pv.readyState >= 2) {
                try { this.preview.ctx.drawImage(pv, 0, 0, this.preview.canvas.width, this.preview.canvas.height); } catch (e) {}
              }
            } catch (e) {}
          };
          try {
            // clamp qTime to pv.duration if available
            const dst = Math.max(0, Math.min((pv.duration || fullVideo.duration || 0), qTime));
            pv.currentTime = dst;
            drawIfReady();
            const onseek = () => { drawIfReady(); pv.removeEventListener('seeked', onseek); };
            pv.addEventListener('seeked', onseek);
          } catch (e) { this._drawThumbnailPreview(idx); }
        } else {
          // fallback to static thumbnail image if available
          this._drawThumbnailPreview(idx);
        }
      } catch (e) { /* ignore preview failures */ }
    }

    _drawThumbnailPreview(idx) {
      try {
        const img = this.thumbnails && this.thumbnails[idx];
        if (img && img.complete) {
          this.preview.ctx.clearRect(0, 0, this.preview.canvas.width, this.preview.canvas.height);
          // draw image scaled to preview size, center-crop if aspect mismatch
          const pw = this.preview.canvas.width, ph = this.preview.canvas.height;
          const arImg = img.naturalWidth / img.naturalHeight || 16/9;
          const arDest = pw / ph;
          let sx=0, sy=0, sw=img.naturalWidth, sh=img.naturalHeight;
          if (arImg > arDest) {
            // image wider -> crop horizontally
            const newW = Math.round(img.naturalHeight * arDest);
            sx = Math.floor((img.naturalWidth - newW) / 2);
            sw = newW;
          } else if (arImg < arDest) {
            const newH = Math.round(img.naturalWidth / arDest);
            sy = Math.floor((img.naturalHeight - newH) / 2);
            sh = newH;
          }
          this.preview.ctx.drawImage(img, sx, sy, sw, sh, 0, 0, pw, ph);
        } else if (img) {
          // try later once image loads
          img.onload = () => { try { this._drawThumbnailPreview(idx); } catch (e) {} };
        } else {
          // clear
          this.preview.ctx.clearRect(0,0,this.preview.canvas.width,this.preview.canvas.height);
        }
      } catch (e) { /* ignore */ }
    }

    isPlaying() {
      return this.state.playingFull;
    }

    getCurrentIndex() {
      return this.state.fullIndex;
    }
  }

  // Public API
  const VideoPlayer = {
    create: function(canvas, options) {
      return new Player(canvas, options);
    },

    createGrid: function(screenMesh, renderer, camera, tabletGroup, videosPageConfig, options = {}) {
      const opts = {
        allowSound: true,
        replaceScreenMaterial: !!options.replaceScreenMaterial,
        disableGrid: !!options.disableGrid,
        externalControls: !!options.externalControls,
        canvasWidth: 2048,
        canvasHeight: 1280,
        zoomDuration: 420,
        descriptionLineHeight: 0.2,
        ...options
      };

      if (opts.disableGrid) {
        console.log('[VideoPlayer] createGrid: disableGrid=true, returning no-op API');
        return {
          canvas: null,
          texture: null,
          reset() {},
          destroy() {},
          setPlaybackRate() {},
          setPreservePitch() {},
          applyToMesh() { return false; },
          applyToMeshById() { return false; },
          restoreOriginalMaterial() {}
        };
      }

      if (!screenMesh || !renderer || !renderer.domElement || !camera) {
        console.warn('[VideoPlayer] createGrid: missing screenMesh/renderer/camera; skipping grid creation.');
        return null;
      }

      const entries = [
        { id: 'online-classes', title: 'Online Classes', description: 'Remote learning cuts and overlays.', order: 0 },
        { id: 'a-list-videos', title: 'A-List Videos', description: 'Promo edits and highlights.', order: 1 },
        { id: 'news-broadcast', title: 'News Broadcast', description: 'Broadcast-style segments.', order: 2 },
        { id: 'neotube-studios', title: 'NeoTube Studios', description: 'Studio-branded content.', order: 3 },
        { id: 'music-videos', title: 'Music Videos', description: 'Music-driven visuals and edits.', order: 4 },
        { id: 'random-vids', title: 'Random Vids', description: 'Favorite mixes and experiments.', order: 5 }
      ];

      const rows = 2;
      const cols = 3;
      const gridCanvas = document.createElement('canvas');
      const controlsCanvas = document.createElement('canvas'); // separate layer for bars/icons

      // Use a strict 16:9 backing canvas so the grid/video can fill the
      // 16:9 wrapper plane without any resampling or stretch.
      const requestedW = 2048;
      const requestedH = 1152; // 16:9
      gridCanvas.width = requestedW;
      gridCanvas.height = requestedH;
      controlsCanvas.width = requestedW;
      controlsCanvas.height = requestedH;
      const ctx = gridCanvas.getContext('2d');
      const ctrlCtx = controlsCanvas.getContext('2d');

      const syncControlCanvasSize = () => {
        controlsCanvas.width = gridCanvas.width;
        controlsCanvas.height = gridCanvas.height;
      };
      syncControlCanvasSize();

      function computeContentSurfaceRect() {
        // Full canvas is already 16:9.
        return { x: 0, y: 0, w: gridCanvas.width, h: gridCanvas.height };
      }

      const contentSurfaceRect = computeContentSurfaceRect();

      const layout = (() => {
        // Pull the thumbnail rows closer to the top/bottom edges while
        // increasing the middle band for the explainer text.
        const gap = Math.max(12, Math.round(contentSurfaceRect.w * 0.028));
        const margin = Math.max(12, Math.round(gap * 0.55));
        // Increase middle band so the info area is larger without changing outer margins
        const centerGap = Math.max(Math.round(contentSurfaceRect.h * 0.30), gap * 2);
        const totalW = contentSurfaceRect.w - margin * 2;
        const slotW = Math.floor((totalW - gap * (cols - 1)) / cols);
        const slotH = Math.floor((contentSurfaceRect.h - margin * 2 - centerGap) / rows);
        const ar = 16 / 9;
        const cells = [];
        const rowYs = [contentSurfaceRect.y + margin, contentSurfaceRect.y + contentSurfaceRect.h - margin - slotH];
        // Vertical bias within slots: push top row items upward and bottom row items downward
        const vBiasTop = 0.12;   // 0 = align to top of slot, 0.5 = center, 1 = bottom
        const vBiasBottom = 0.88;
        for (let r = 0; r < rows; r++) {
          const rowY = rowYs[r];
          const vBias = (r === 0) ? vBiasTop : vBiasBottom;
          for (let c = 0; c < cols; c++) {
            let w = Math.round(slotW);
            let h = Math.round(w / ar);
            if (h > slotH) {
              h = slotH;
              w = Math.round(h * ar);
            }
            const x = contentSurfaceRect.x + margin + c * (slotW + gap) + Math.floor((slotW - w) / 2);
            const y = rowY + Math.floor((slotH - h) * vBias);
            cells.push({ x, y, w, h });
          }
        }
        const descBand = {
          x: contentSurfaceRect.x + margin,
          y: rowYs[0] + slotH,
          w: contentSurfaceRect.w - margin * 2,
          h: rowYs[1] - (rowYs[0] + slotH)
        };
        return { gap, margin, descBand, cells, contentSurfaceRect };
      })();

      const baseBarHeight = Math.min(120, Math.round(gridCanvas.height * 0.11));
      const barOverhang = Math.max(8, Math.round(layout.margin * 0.35));

      function applyOverdraw(rect) {
        // Slight horizontal overdraw to hide tiny gaps at tablet edges
        const over = rect.w * 0.01;
        const r = {
          x: rect.x - over * 0.5,
          y: rect.y,
          w: rect.w + over,
          h: rect.h
        };
        if (r.x < 0) { r.w += r.x; r.x = 0; }
        if (r.x + r.w > gridCanvas.width) { r.w = gridCanvas.width - r.x; }
        return r;
      }

      function getFullRects() {
        // Slightly expand and shift to close edge gaps
        const padX = gridCanvas.width * 0.005; // ~0.5% each side
        const surfaceRect = {
          x: -padX,
          y: 0,
          w: gridCanvas.width + padX * 2,
          h: Math.max(1, gridCanvas.height)
        };
        const videoRect = applyOverdraw(fitRectToAspect(surfaceRect, 16 / 9));
        return { surfaceRect, videoRect };
      }

      function getFullscreenRects() {
        const padX = gridCanvas.width * 0.005;
        const surfaceRect = {
          x: -padX,
          y: 0,
          w: gridCanvas.width + padX * 2,
          h: Math.max(1, gridCanvas.height)
        };
        const videoRect = applyOverdraw(fitRectToAspect(surfaceRect, 16 / 9));
        return { surfaceRect, videoRect };
      }

      function getActiveRects() {
        return uiState.fullscreen ? getFullscreenRects() : getFullRects();
      }

      function computeVideoRect(containerRect, video) {
        const aspect = (() => {
          if (video && video.videoWidth && video.videoHeight) return video.videoWidth / video.videoHeight;
          return 16 / 9;
        })();
        return fitRectToAspect(containerRect, aspect);
      }

      // Palette pulled from videos.css (--secondary-color) with fallbacks
      const secondaryColor = (() => {
        try {
          const cssVal = getComputedStyle(document.body || document.documentElement).getPropertyValue('--secondary-color');
          if (cssVal && cssVal.trim()) return cssVal.trim();
        } catch (e) { /* ignore */ }
        return '#1e3a8a';
      })();
      const iconColor = '#ffa94d';
      const iconFont = '"Material Symbols Rounded","Material Symbols Outlined","Material Icons Round","Material Icons"';

      const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];
      const uiState = {
        playbackRateIndex: playbackRates.indexOf(1) >= 0 ? playbackRates.indexOf(1) : 0,
        preservePitch: true, // time-stretch default
        tabletView: false,
        fullscreen: false,
        volumeHover: false,
        lastVolume: 0.6
      };

      const camPose = { saved: null, tabletActive: false };
      let fullscreenOverlay = null;
      let gridCanvasPrevStyle = '';
      let gridCanvasPrevSize = { w: null, h: null };
      let fullscreenListenersAdded = false;
      let gridCanvasWasInOverlay = false;

      const base = 'Videos/videos-page/';
      const thumbs = entries.map((entry) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const imgPath = base + entry.id + '.jpg';
        img.src = encodeURI((window && window.mediaUrl) ? window.mediaUrl(imgPath) : imgPath);
        return img;
      });

      const DEBUG_SCREEN_OUTLINE = false;

      let chromeVisible = 1;
      let chromeTarget = 1;
      let chromeAnimStart = performance.now();
      let lastMouseMoveTs = performance.now();
      const chromeHideDelay = 2000;
      const chromeFadeDuration = 220;

      let dragState = null;
      let pendingSingleClick = null;
      let pendingClickPos = null;

      function clearPendingSingleClick() {
        if (pendingSingleClick) {
          clearTimeout(pendingSingleClick);
          pendingSingleClick = null;
        }
        pendingClickPos = null;
      }

      function setPreservePitchFlag(video, preserve) {
        if (!video) return;
        try { video.preservesPitch = preserve; } catch (e) { /* ignore */ }
        try { video.mozPreservesPitch = preserve; } catch (e) { /* ignore */ }
        try { video.webkitPreservesPitch = preserve; } catch (e) { /* ignore */ }
      }

      function applyPlaybackSettings(video) {
        if (!video) return;
        const rate = playbackRates[Math.max(0, Math.min(playbackRates.length - 1, uiState.playbackRateIndex))];
        try { video.playbackRate = rate; } catch (e) { /* ignore */ }
        setPreservePitchFlag(video, uiState.preservePitch);
      }

      function toggleMute(video) {
        if (!video) return;
        if (video.muted || video.volume <= 0.0001) {
          const target = uiState.lastVolume > 0.001 ? uiState.lastVolume : 0.5;
          video.muted = false;
          try { video.volume = target; } catch (e) { /* ignore */ }
        } else {
          uiState.lastVolume = video.volume || uiState.lastVolume || 0.5;
          video.muted = true;
          try { video.volume = 0; } catch (e) { /* ignore */ }
        }
      }

      function saveCamPose() {
        if (!camera) return;
        camPose.saved = {
          pos: camera.position.clone(),
          quat: camera.quaternion.clone()
        };
      }

      function restoreCamPose() {
        if (!camera || !camPose.saved) return;
        try {
          camera.position.copy(camPose.saved.pos);
          camera.quaternion.copy(camPose.saved.quat);
          if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
        } catch (e) { /* ignore */ }
      }

      function applyTabletViewCamera() {
        if (!camera) return;
        try {
          camera.position.set(0, 0, -5);
          camera.lookAt(0, 0, 0);
          if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
        } catch (e) { /* ignore */ }
      }

      function setTabletView(active) {
        if (!camera) return;
        if (active) {
          if (!camPose.tabletActive) saveCamPose();
          applyTabletViewCamera();
          camPose.tabletActive = true;
          uiState.tabletView = true;
        } else {
          restoreCamPose();
          camPose.tabletActive = false;
          uiState.tabletView = false;
        }
      }

      function ensureFullscreenOverlay() {
        if (fullscreenOverlay && fullscreenOverlay.parentNode) return fullscreenOverlay;
        const ov = document.createElement('div');
        ov.id = 'vp-fullscreen-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:#000;display:none;z-index:9999;overflow:hidden;display:flex;align-items:center;justify-content:center;';
        document.body.appendChild(ov);
        fullscreenOverlay = ov;
        return ov;
      }

      function showFullscreenOverlay(video) {
        const ov = ensureFullscreenOverlay();
        ov.style.display = 'flex';
        ov.style.visibility = 'visible';
        ov.style.pointerEvents = 'auto';
        ov.style.opacity = '1';
        // Display the grid canvas (with controls) in the overlay; video is drawn into it by renderFull
        try {
          gridCanvasPrevStyle = gridCanvas.style.cssText || '';
          gridCanvasPrevSize = { w: gridCanvas.width, h: gridCanvas.height };
          const vw = Math.max(window.innerWidth || 1, 1);
          const vh = Math.max(window.innerHeight || 1, 1);
          const aspect = 16 / 9;
          let width = vw;
          let height = vw / aspect;
          if (height > vh) { height = vh; width = vh * aspect; }
          // Allow higher DPR in fullscreen for sharper video; cap only on total pixels to avoid stutter.
          const deviceDpr = Math.max(1, (window.devicePixelRatio || 1));
          let dpr = deviceDpr;
          const maxPixels = 7_500_000; // allow more pixels for clarity
          const desiredPixels = (width * dpr) * (height * dpr);
          if (desiredPixels > maxPixels) {
            const scaleDown = Math.sqrt(maxPixels / Math.max(1, desiredPixels));
            dpr = dpr * scaleDown;
          }
          // Keep minimum reasonable resolution; allow <1 only when needed.
          dpr = Math.max(0.75, dpr);
          gridCanvas.width = Math.round(width * dpr);
          gridCanvas.height = Math.round(height * dpr);
          gridCanvas.style.width = `${width}px`;
          gridCanvas.style.height = `${height}px`;
          gridCanvas.style.maxWidth = 'none';
          gridCanvas.style.maxHeight = 'none';
          gridCanvas.style.objectFit = 'contain';
          gridCanvas.style.display = 'block';
          gridCanvas.style.position = 'relative';
          gridCanvas.style.inset = 'auto';
          syncControlCanvasSize();
          if (gridCanvas.parentNode !== ov) {
            ov.innerHTML = '';
            ov.appendChild(gridCanvas);
            gridCanvasWasInOverlay = true;
          }
        } catch (e) { /* ignore */ }

        // Hide the WebGL canvas behind fullscreen to reduce GPU/CPU load.
        try {
          if (renderer && renderer.domElement && renderer.domElement.style) {
            renderer.domElement.style.display = 'none';
          }
        } catch (e) { /* ignore */ }
        if (!fullscreenListenersAdded) {
          try {
            const add = (el, type, fn) => el && el.addEventListener && el.addEventListener(type, fn);
            add(gridCanvas, 'pointermove', handlePointerMove);
            add(gridCanvas, 'pointerleave', handlePointerLeave);
            add(gridCanvas, 'click', handleClick);
            add(gridCanvas, 'pointerdown', handlePointerDown);
            add(gridCanvas, 'pointerup', handlePointerUp);
            fullscreenListenersAdded = true;
          } catch (e) { /* ignore */ }
        }
      }

      function hideFullscreenOverlay() {
        if (!fullscreenOverlay) return;
        fullscreenOverlay.style.visibility = 'hidden';
        fullscreenOverlay.style.pointerEvents = 'none';
        fullscreenOverlay.style.opacity = '0';
        fullscreenOverlay.style.display = 'none';
        try {
          if (renderer && renderer.domElement && renderer.domElement.style) {
            renderer.domElement.style.display = '';
          }
        } catch (e) { /* ignore */ }
        try {
          gridCanvas.style.cssText = gridCanvasPrevStyle;
          if (gridCanvas.parentNode === fullscreenOverlay) {
            fullscreenOverlay.removeChild(gridCanvas);
            gridCanvasWasInOverlay = false;
          }
          if (gridCanvasPrevSize.w && gridCanvasPrevSize.h) {
            gridCanvas.width = gridCanvasPrevSize.w;
            gridCanvas.height = gridCanvasPrevSize.h;
            syncControlCanvasSize();
          }
        } catch (e) { /* ignore */ }
        if (fullscreenListenersAdded) {
          try {
            const rem = (el, type, fn) => el && el.removeEventListener && el.removeEventListener(type, fn);
            rem(gridCanvas, 'pointermove', handlePointerMove);
            rem(gridCanvas, 'pointerleave', handlePointerLeave);
            rem(gridCanvas, 'click', handleClick);
            rem(gridCanvas, 'pointerdown', handlePointerDown);
            rem(gridCanvas, 'pointerup', handlePointerUp);
          } catch (e) { /* ignore */ }
          fullscreenListenersAdded = false;
        }
      }

      
      function toggleFullscreenMode() {
        uiState.fullscreen = !uiState.fullscreen;
        try {
          if (uiState.fullscreen) {
            const v = fullIndex >= 0 ? fullVideos[fullIndex] : null;
            showFullscreenOverlay(v);
            const targetEl = fullscreenOverlay || renderer.domElement || document.documentElement || document.body;
            const req = targetEl.requestFullscreen || document.documentElement.requestFullscreen || document.body.requestFullscreen;
            if (req) req.call(targetEl).catch(() => {
              const fallback = document.documentElement.requestFullscreen || document.body.requestFullscreen;
              if (fallback) fallback.call(document.documentElement || document.body);
            });
          } else {
            hideFullscreenOverlay();
            if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen().catch(() => {});
            }
            // keep playback state; do not pause
          }
        } catch (e) { /* ignore */ }
      }

      function createVideo(srcs = [], muted = true) {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.playsInline = true;
        v.preload = 'auto';
        v.loop = false;
        v.muted = muted;
        let i = 0;
        const list = Array.isArray(srcs) ? srcs : [srcs];
        const tryNext = () => {
          if (i >= list.length) return;
          const current = list[i++];
          const srcPath = base + current;
          v.src = encodeURI((window && window.mediaUrl) ? window.mediaUrl(srcPath) : srcPath);
          v.load();
        };
        const onAbortLike = () => tryNext();
        v.addEventListener('error', tryNext);
        v.addEventListener('abort', onAbortLike);
        v.addEventListener('stalled', onAbortLike);
        v.addEventListener('loadedmetadata', () => {
          v.removeEventListener('error', tryNext);
          v.removeEventListener('abort', onAbortLike);
          v.removeEventListener('stalled', onAbortLike);
          applyPlaybackSettings(v);
        }, { once: true });
        applyPlaybackSettings(v);
        tryNext();
        return v;
      }

      const previewVideos = entries.map((entry) => createVideo([`${entry.id}-lq.webm`, `${entry.id}.mp4`], true));
      const fullVideos = entries.map((entry) => createVideo([`${entry.id}-hq.webm`, `${entry.id}.mp4`], !opts.allowSound));
      // expose preview/full video element arrays so external player instances can reuse them
      try { window.__videoGridPreviewVideos = previewVideos; window.__videoGridFullVideos = fullVideos; } catch (e) { /* ignore */ }

      // Kick off preloading for snappier hover and playback
      previewVideos.forEach((v) => {
        if (!v) return;
        try { v.muted = true; v.preload = 'auto'; v.load(); } catch (e) { /* ignore */ }
      });
      fullVideos.forEach((v) => {
        if (!v) return;
        try { v.preload = 'auto'; v.load(); } catch (e) { /* ignore */ }
      });

      function applySettingsToAllVideos() {
        previewVideos.forEach(applyPlaybackSettings);
        fullVideos.forEach(applyPlaybackSettings);
      }
      applySettingsToAllVideos();

      fullVideos.forEach((vid, idx) => {
        if (!vid) return;
        vid.addEventListener('ended', () => {
          if (uiState.fullscreen) { /* fullscreen disabled */ }
          startZoomOut(idx);
        });
      });

      let hoverIndex = -1;
      let description = 'Hover a thumbnail to preview a random snippet.';
      let playingFull = false;
      let fullIndex = -1;
      let lastFullRect = null;
      const previewWindows = entries.map(() => ({ until: 0 }));
      const animation = { phase: 'idle', start: 0, from: null, to: null };
      const cellsBounds = (() => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        layout.cells.forEach((c) => {
          minX = Math.min(minX, c.x);
          minY = Math.min(minY, c.y);
          maxX = Math.max(maxX, c.x + c.w);
          maxY = Math.max(maxY, c.y + c.h);
        });
        return { minX, minY, maxX, maxY };
      })();

      let texture = null;
      let overlayMesh = null;

      // Separate tablet-mode control panels (top/bottom) rendered on their own
      // overlay planes so controls can fill the space above/below the 16:9
      // content without stretching the video or thumbnail grid.
      let topPanelCanvas = null;
      let bottomPanelCanvas = null;
      let topPanelCtx = null;
      let bottomPanelCtx = null;
      let topPanelTexture = null;
      let bottomPanelTexture = null;
      let topPanelMesh = null;
      let bottomPanelMesh = null;

      // IMPORTANT: keep the Blender-authored screen material visible.
      // We'll render the interactive UI onto a separate 16:9 overlay plane.
      texture = new THREE.CanvasTexture(gridCanvas);
      try { texture.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
      // Reduce grazing-angle blur: increase anisotropy and set explicit filters
      try { texture.anisotropy = Math.max(texture.anisotropy || 1, 16); } catch (e) { /* ignore */ }
      try { texture.minFilter = THREE.LinearMipMapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true; } catch (e) { /* ignore */ }
      texture.flipY = true; // canvas->texture orientation for PlaneGeometry
      try { texture.needsUpdate = true; } catch (e) { /* ignore */ }

      // Add a dedicated 16:9 overlay mesh (wrapper) that sits inside the screen.
      try {
        overlayMesh = createScreenOverlay({
          screenMesh,
          texture,
          gridCanvas,
          alwaysOnTop: true,
          doubleSided: false,
          camera
        });
      } catch (e) { /* ignore overlay creation errors */ }

      function ensureTabletPanels() {
        try {
          if (!screenMesh || !camera) return;
          if (topPanelMesh && bottomPanelMesh && topPanelTexture && bottomPanelTexture) return;

          screenMesh.updateWorldMatrix(true, false);
          const bbox = new THREE.Box3().setFromObject(screenMesh);
          const size = bbox.getSize(new THREE.Vector3());
          const screenW = Math.max(0.001, size.x);
          const screenH = Math.max(0.001, size.y);
          const aspect = 16 / 9;

          // Mirror the sizing used in createScreenOverlay so widths match.
          let wMain = screenW;
          let hMain = wMain / aspect;
          if (hMain > screenH) { hMain = screenH; wMain = hMain * aspect; }
          const inset = 0.99;
          wMain = Math.max(0.001, wMain * inset);
          hMain = Math.max(0.001, hMain * inset);

          const bandH = Math.max(0, (screenH - hMain) / 2);
          if (bandH < 0.02) return;

          const pxW = gridCanvas.width;
          const pxH = Math.max(160, Math.round(pxW * (bandH / wMain)));

          if (!topPanelCanvas) {
            topPanelCanvas = document.createElement('canvas');
            topPanelCanvas.width = pxW;
            topPanelCanvas.height = pxH;
            topPanelCtx = topPanelCanvas.getContext('2d');
          }
          if (!bottomPanelCanvas) {
            bottomPanelCanvas = document.createElement('canvas');
            bottomPanelCanvas.width = pxW;
            bottomPanelCanvas.height = pxH;
            bottomPanelCtx = bottomPanelCanvas.getContext('2d');
          }

          if (!topPanelTexture) {
            topPanelTexture = new THREE.CanvasTexture(topPanelCanvas);
            try { topPanelTexture.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
            try { topPanelTexture.anisotropy = Math.max(topPanelTexture.anisotropy || 1, 16); } catch (e) { /* ignore */ }
            try { topPanelTexture.minFilter = THREE.LinearMipMapLinearFilter; topPanelTexture.magFilter = THREE.LinearFilter; topPanelTexture.generateMipmaps = true; } catch (e) { /* ignore */ }
            topPanelTexture.flipY = true;
            try { topPanelTexture.needsUpdate = true; } catch (e) { /* ignore */ }
          }
          if (!bottomPanelTexture) {
            bottomPanelTexture = new THREE.CanvasTexture(bottomPanelCanvas);
            try { bottomPanelTexture.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
            try { bottomPanelTexture.anisotropy = Math.max(bottomPanelTexture.anisotropy || 1, 16); } catch (e) { /* ignore */ }
            try { bottomPanelTexture.minFilter = THREE.LinearMipMapLinearFilter; bottomPanelTexture.magFilter = THREE.LinearFilter; bottomPanelTexture.generateMipmaps = true; } catch (e) { /* ignore */ }
            bottomPanelTexture.flipY = true;
            try { bottomPanelTexture.needsUpdate = true; } catch (e) { /* ignore */ }
          }

          const yOffset = (hMain / 2) + (bandH / 2);
          topPanelMesh = createScreenOverlayPlane({
            screenMesh,
            texture: topPanelTexture,
            width: wMain,
            height: bandH * 0.98,
            centerOffset: { x: 0, y: +yOffset, z: 0 },
            alwaysOnTop: true,
            doubleSided: false,
            camera,
            gridCanvas: topPanelCanvas,
            name: 'screenOverlayTopPanel'
          });
          bottomPanelMesh = createScreenOverlayPlane({
            screenMesh,
            texture: bottomPanelTexture,
            width: wMain,
            height: bandH * 0.98,
            centerOffset: { x: 0, y: -yOffset, z: 0 },
            alwaysOnTop: true,
            doubleSided: false,
            camera,
            gridCanvas: bottomPanelCanvas,
            name: 'screenOverlayBottomPanel'
          });

          if (topPanelMesh) topPanelMesh.visible = false;
          if (bottomPanelMesh) bottomPanelMesh.visible = false;
        } catch (e) { /* ignore */ }
      }

      const rayHelper = createTabletRaycaster(camera, overlayMesh || screenMesh);
      const canvasRect = () => renderer.domElement.getBoundingClientRect();

      const multiRaycaster = new THREE.Raycaster();
      const multiNdc = new THREE.Vector2();

      function isAncestor(ancestor, node) {
        try {
          for (let cur = node; cur; cur = cur.parent) {
            if (cur === ancestor) return true;
          }
        } catch (e) { /* ignore */ }
        return false;
      }

      function hitFromEventMulti(ev) {
        try {
          if (!ev || !camera) return null;
          const rect = canvasRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return null;
          multiNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          multiNdc.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
          multiRaycaster.setFromCamera(multiNdc, camera);
          const targets = [];
          if (topPanelMesh) targets.push(topPanelMesh);
          if (overlayMesh) targets.push(overlayMesh);
          if (bottomPanelMesh) targets.push(bottomPanelMesh);
          const hits = multiRaycaster.intersectObjects(targets, true);
          if (!hits || !hits.length) return null;
          const isOpaqueHit = (hit) => {
            try {
              const mat = hit.object.material;
              if (!mat) return true;
              const map = mat.alphaMap || mat.map;
              const img = map && map.image;
              if (!img || !img.getContext) return true;
              const w = img.width || 1; const h = img.height || 1;
              const u = Math.max(0, Math.min(1, hit.uv.x));
              const v = Math.max(0, Math.min(1, 1 - hit.uv.y));
              const x = Math.floor(u * (w - 1));
              const y = Math.floor(v * (h - 1));
              const ctx = img.getContext('2d');
              if (!ctx) return true;
              const data = ctx.getImageData(x, y, 1, 1).data;
              return data[3] > 16; // alpha threshold
            } catch (e) { return true; }
          };
          for (let i = 0; i < hits.length; i++) {
            if (hits[i] && hits[i].uv && isOpaqueHit(hits[i])) return hits[i];
          }
          return null;
        } catch (e) {
          return null;
        }
      }

      function pointFromEvent(ev) {
        if (!ev) return null;
        let pt = null;
        // In fullscreen, map client coords directly to canvas since the tablet is hidden
        try {
          if (uiState.fullscreen && gridCanvas && gridCanvas.getBoundingClientRect) {
            const r = gridCanvas.getBoundingClientRect();
            if (r && r.width > 0 && r.height > 0) {
              const x = ((ev.clientX - r.left) / r.width) * gridCanvas.width;
              const y = ((ev.clientY - r.top) / r.height) * gridCanvas.height;
              return { x, y };
            }
          }
        } catch (e) { /* ignore */ }
        try {
          if (!uiState.fullscreen && playingFull) {
            ensureTabletPanels();
            if (topPanelMesh || bottomPanelMesh) {
              const hit = hitFromEventMulti(ev);
              const bad = hit && hit.object && typeof hit.object.name === 'string' && hit.object.name.indexOf('Plane631') !== -1;
              if (bad) return null;
              if (!hit || !hit.uv) return null;

              let canvas = gridCanvas;
              let target = 'main';
              if (topPanelMesh && isAncestor(topPanelMesh, hit.object)) {
                canvas = topPanelCanvas;
                target = 'top';
              } else if (bottomPanelMesh && isAncestor(bottomPanelMesh, hit.object)) {
                canvas = bottomPanelCanvas;
                target = 'bottom';
              }
              if (!canvas) return null;
              pt = {
                x: THREE.MathUtils.clamp(hit.uv.x, 0, 1) * canvas.width,
                y: (1 - THREE.MathUtils.clamp(hit.uv.y, 0, 1)) * canvas.height,
                target
              };
              return pt;
            }
          }

          if (rayHelper) {
            const hit = rayHelper.hitFromEvent(ev, canvasRect());
            const bad = hit && hit.object && typeof hit.object.name === 'string' && hit.object.name.indexOf('Plane631') !== -1;
            if (bad) return null;
            if (!hit) return null; // require an actual hit
            if (hit && hit.uv) {
              // Three.js UV space: v=0 is bottom. Canvas space: y=0 is top.
              pt = {
                x: THREE.MathUtils.clamp(hit.uv.x, 0, 1) * gridCanvas.width,
                y: (1 - THREE.MathUtils.clamp(hit.uv.y, 0, 1)) * gridCanvas.height
              };
            }
            if (!pt) return null;
          } else {
            const rect = canvasRect();
            if (!rect) return null;
            const x = ((ev.clientX - rect.left) / rect.width) * gridCanvas.width;
            const y = ((ev.clientY - rect.top) / rect.height) * gridCanvas.height;
            pt = { x, y };
          }
        } catch (e) { /* ignore */ }
        return pt;
      }

      function cellIndexFromPoint(pt) {
        if (!pt) return -1;
        for (let i = 0; i < layout.cells.length; i++) {
          const rc = layout.cells[i];
          if (pt.x >= rc.x && pt.x <= rc.x + rc.w && pt.y >= rc.y && pt.y <= rc.y + rc.h) return i;
        }
        return -1;
      }

      function fitRectToAspect(rect, aspect = 16 / 9) {
        const r = { ...rect };
        const ar = r.w / r.h;
        if (ar > aspect) {
          const newW = Math.round(r.h * aspect);
          const dx = Math.floor((r.w - newW) / 2);
          r.x += dx; r.w = newW;
        } else {
          const newH = Math.round(r.w / aspect);
          const dy = Math.floor((r.h - newH) / 2);
          r.y += dy; r.h = newH;
        }
        return r;
      }

      function lerp(a, b, t) { return a + (b - a) * t; }
      function lerpRect(a, b, t) {
        return {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          w: lerp(a.w, b.w, t),
          h: lerp(a.h, b.h, t)
        };
      }
      function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

      function drawBackground() {
        // Leave the base screen material visible (Blender screen background).
        // Only draw a subtle band behind the description text.
        ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(layout.descBand.x, layout.descBand.y, layout.descBand.w, layout.descBand.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 2;
        ctx.strokeRect(layout.descBand.x, layout.descBand.y, layout.descBand.w, layout.descBand.h);
      }

      function drawDescription() {
        // Do NOT scale/stretch the text just because the band is taller.
        // Keep a stable font size and wrap into multiple lines when needed.
        const band = layout.descBand;
        const maxW = band.w * 0.9;
        const baseFs = Math.round(gridCanvas.height * 0.045);
        const fs = Math.max(18, Math.min(46, baseFs));

        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = `${fs}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;

        const words = String(description || '').split(/\s+/g).filter(Boolean);
        const lines = [];
        let line = '';
        for (let i = 0; i < words.length; i++) {
          const test = line ? `${line} ${words[i]}` : words[i];
          if (ctx.measureText(test).width <= maxW || !line) {
            line = test;
          } else {
            lines.push(line);
            line = words[i];
          }
        }
        if (line) lines.push(line);
        const limited = lines.slice(0, 3);
        const lineH = Math.round(fs * 1.25);
        const totalH = limited.length * lineH;
        const startY = band.y + (band.h - totalH) / 2 + fs; // baseline
        const cx = band.x + band.w / 2;
        for (let i = 0; i < limited.length; i++) {
          ctx.fillText(limited[i], cx, startY + i * lineH);
        }
        ctx.restore();
      }

      function drawElementInRect(el, rc, mode = 'contain') {
        if (!el) return;
        const srcW = (el.videoWidth || el.width || 16);
        const srcH = (el.videoHeight || el.height || 9);
        const ar = srcW / srcH;
        let w = rc.w;
        let h = Math.round(w / ar);
        if (mode === 'cover') {
          // Scale to fill, then clip to rc
          const scale = Math.max(rc.w / srcW, rc.h / srcH);
          w = Math.round(srcW * scale);
          h = Math.round(srcH * scale);
          const x = rc.x + Math.floor((rc.w - w) / 2);
          const y = rc.y + Math.floor((rc.h - h) / 2);
          try {
            ctx.save();
            ctx.beginPath();
            ctx.rect(rc.x, rc.y, rc.w, rc.h);
            ctx.clip();
            ctx.drawImage(el, x, y, w, h);
            ctx.restore();
          } catch (e) {
            try { ctx.restore(); } catch (e2) { /* ignore */ }
          }
          return;
        }

        // Default: contain (letterbox/pillarbox)
        if (h > rc.h) {
          h = rc.h;
          w = Math.round(h * ar);
        }
        const x = rc.x + Math.floor((rc.w - w) / 2);
        const y = rc.y + Math.floor((rc.h - h) / 2);
        try { ctx.drawImage(el, x, y, w, h); } catch (e) { /* ignore draw failures */ }
      }

      function drawHoverOutline(idx) {
        if (idx < 0 || idx >= layout.cells.length) return;
        const rc = layout.cells[idx];
        ctx.save();
        ctx.strokeStyle = iconColor;
        const baseWidth = Math.max(3, Math.round(Math.min(rc.w, rc.h) * 0.02));
        ctx.lineWidth = baseWidth * 2;
        ctx.shadowColor = 'rgba(255,169,77,0.55)';
        ctx.shadowBlur = Math.max(16, Math.round(rc.w * 0.12));
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4);
        ctx.restore();
      }

      function pickPreviewTime(v) {
        const dur = Math.max(10, v.duration || 60);
        const mid = dur * 0.5;
        const span = Math.min(30, dur * 0.6);
        let t = mid + (Math.random() - 0.5) * span;
        t = Math.max(1, Math.min(dur - 5, t));
        return t;
      }

      function startPreview(idx) {
        const v = previewVideos[idx];
        if (!v) return;
        try {
          if (v.readyState >= 1) v.currentTime = pickPreviewTime(v);
          v.muted = true;
          v.play().catch(() => {});
          previewWindows[idx].until = performance.now() + 3500;
        } catch (e) { /* ignore */ }
      }

      function stopPreview(idx) {
        const v = previewVideos[idx];
        if (!v) return;
        try { v.pause(); } catch (e) { /* ignore */ }
        previewWindows[idx].until = 0;
      }

      function setHover(idx) {
        if (playingFull) return;
        if (idx === hoverIndex) return;
        if (hoverIndex >= 0) stopPreview(hoverIndex);
        hoverIndex = idx;
        if (idx >= 0) {
          description = entries[idx].description;
          startPreview(idx);
        } else {
          description = 'Hover a thumbnail to preview a random snippet.';
        }
      }

      function startFull(idx) {
        const v = fullVideos[idx];
        if (!v) return;
        fullIndex = idx;
        playingFull = true;
        lastMouseMoveTs = performance.now();
        chromeTarget = 1;
        chromeAnimStart = lastMouseMoveTs;
        description = `${entries[idx].title}: ${entries[idx].description}`;
        try {
          v.muted = !opts.allowSound;
          if (!v.muted) v.volume = 1.0;
          v.currentTime = 0;
          v.play().catch(() => {});
        } catch (e) { /* ignore */ }
        animation.phase = 'in';
        animation.start = performance.now();
        animation.from = layout.cells[idx];
        const frames = getActiveRects();
        const fillRect = computeVideoRect(frames.videoRect, v);
        animation.to = fillRect;
      }

      function startZoomOut(idx) {
        if (idx === -1) return;
        const v = fullVideos[idx];
        if (v) {
          try { v.pause(); } catch (e) { /* ignore */ }
        }
        animation.phase = 'out';
        animation.start = performance.now();
        animation.from = lastFullRect || animation.to || layout.cells[idx];
        animation.to = layout.cells[idx];
        playingFull = false;
      }

      function drawGridCells(now) {
        layout.cells.forEach((rc, idx) => {
          const thumb = thumbs[idx];
          const preview = previewVideos[idx];
          const showPreview = hoverIndex === idx && preview && preview.readyState >= 2;
          if (showPreview && previewWindows[idx].until && now > previewWindows[idx].until) {
            startPreview(idx);
          }
          // Thumbnails should be strict 16:9 tiles, filled edge-to-edge.
          drawElementInRect(showPreview ? preview : thumb, rc, 'cover');
        });
      }

      const fullscreenScale = () => 1;

      // Toggle this to true to restore the fullscreen button (commented by default)
      const ENABLE_FULLSCREEN_ICON = false; // set true to re-enable fullscreen icon

      function buildControlsLayout(surfaceRect, videoRect, scale = 1) {
        const BAR_H = baseBarHeight * scale;
        const PAD = Math.round(BAR_H * 0.28);
        const ICON = Math.round(BAR_H * 0.74);
        const topOffset = PAD * 0.45;
        const bottomOffset = PAD * 1.6;
        const topBar = { x: surfaceRect.x, y: surfaceRect.y + topOffset, w: surfaceRect.w, h: BAR_H };
        const bottomBar = { x: surfaceRect.x, y: surfaceRect.y + surfaceRect.h - BAR_H - bottomOffset, w: surfaceRect.w, h: BAR_H };

        const backRect = { x: topBar.x + PAD * 0.6, y: topBar.y + (BAR_H - ICON * 1.05) / 2, w: ICON * 1.05, h: ICON * 1.05 };
        const titleRect = { x: topBar.x + PAD * 2, y: surfaceRect.y, w: topBar.w - PAD * 4, h: topBar.y + topBar.h - surfaceRect.y };

        const progressH = Math.max(4, Math.round(BAR_H * 0.16));
        const progressW = Math.min(bottomBar.w - PAD * 4, videoRect.w - PAD * 2);
        const progressRect = {
          x: bottomBar.x + (bottomBar.w - progressW) / 2,
          y: bottomBar.y + PAD * 0.18,
          w: progressW,
          h: progressH
        };

        // Place icons relative to the tablet bottom: evenly between progress bar and surfaceRect bottom
        const totalBottomSpace = (surfaceRect.y + surfaceRect.h) - (progressRect.y + progressRect.h);
        const iconRowY = progressRect.y + progressRect.h + totalBottomSpace * 0.5 - ICON / 2;
        const playRect = { x: bottomBar.x + PAD, y: iconRowY, w: ICON, h: ICON };
        const volumeRect = { x: playRect.x + ICON + PAD * 0.5, y: iconRowY, w: ICON, h: ICON };
          const sliderW = Math.min(bottomBar.w * 0.22, Math.max(180, videoRect.w * 0.2));
        const volumeSliderRect = {
          x: volumeRect.x + ICON + PAD * 0.4,
          y: iconRowY + (ICON - BAR_H * 0.26) / 2,
          w: sliderW,
          h: BAR_H * 0.26
        };

        const timeRect = {
          x: bottomBar.x + bottomBar.w / 2 - 110,
          y: iconRowY + (ICON - Math.round(BAR_H * 0.4)) / 2,
          w: 220,
          h: Math.round(BAR_H * 0.4)
        };

        const clusterGap = Math.round(PAD * 0.6);
        const clusterGapSmall = Math.max(4, Math.round(PAD * 0.24));
        const boxW = Math.round(ICON * 1.4);
        const boxH = Math.round(ICON * 0.95);
        const dividerW = Math.max(4, Math.round(PAD * 0.35));

        // Compute from the right edge inward so removing the fullscreen icon
        // simply collapses space and shifts the remaining icons right.
        let cursor = bottomBar.x + bottomBar.w - PAD; // rightmost inner edge
        let fullscreenRect = null;
        if (ENABLE_FULLSCREEN_ICON) {
          cursor -= boxW; // fullscreen occupies rightmost slot
          fullscreenRect = { x: cursor, y: iconRowY, w: ICON, h: ICON };
          cursor -= clusterGap;
        }
        // tablet / capture icon sits next (or becomes rightmost if fullscreen disabled)
        cursor -= boxW;
        const tabletRect = { x: cursor, y: iconRowY, w: ICON, h: ICON };
        cursor -= clusterGap;

        // Divider between right-side icons and the playback-rate/pitch cluster
        cursor -= dividerW;
        cursor -= clusterGap;

        // speed and pitch cluster (closer together)
        cursor -= boxW;
        const speedRect = { x: cursor, y: iconRowY, w: boxW, h: ICON };
        cursor -= clusterGapSmall;
        cursor -= boxW;
        const pitchRect = { x: cursor, y: iconRowY + (ICON - boxH) / 2, w: boxW, h: boxH };
        const dividerRect = { x: speedRect.x + speedRect.w + Math.round(clusterGapSmall / 2), y: iconRowY + Math.round(ICON * 0.15), w: dividerW, h: Math.round(ICON * 0.7) };

        return {
          barH: BAR_H,
          topBar,
          bottomBar,
          backRect,
          titleRect,
          playRect,
          volumeRect,
          volumeSliderRect,
          timeRect,
          speedRect: pitchRect,
          pitchRect: speedRect,
          tabletRect,
          fullscreenRect,
          dividerRect,
          progressRect,
          fontFamily: '"Source Sans 3","Segoe UI",sans-serif',
          surfaceRect,
          videoRect
        };
      }

      function drawIcon(ctxTarget, rect, glyph) {
        ctxTarget.save();
        ctxTarget.fillStyle = iconColor;
        ctxTarget.textAlign = 'center';
        ctxTarget.textBaseline = 'middle';
        const size = Math.round(rect.h * 0.9);
        ctxTarget.font = `${size}px ${iconFont}`;
        ctxTarget.fillText(glyph, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
        ctxTarget.restore();
      }

      function drawBackButton(ctxTarget, rect) {
        drawIcon(ctxTarget, rect, 'arrow_back');
      }

      function drawPlayButton(ctxTarget, rect, paused) {
        drawIcon(ctxTarget, rect, paused ? 'play_arrow' : 'pause');
      }

      function drawMuteButton(ctxTarget, rect, muted) {
        drawIcon(ctxTarget, rect, muted ? 'volume_off' : 'volume_up');
      }

      function drawProgressBar(ctxTarget, rect, video) {
        ctxTarget.fillStyle = 'rgba(255,255,255,0.22)';
        ctxTarget.fillRect(rect.x, rect.y, rect.w, rect.h);
        const progress = video && video.duration ? (video.currentTime / video.duration) : 0;
        ctxTarget.fillStyle = iconColor;
        ctxTarget.fillRect(rect.x, rect.y, rect.w * progress, rect.h);
        const dotX = rect.x + rect.w * progress;
        ctxTarget.fillStyle = '#fff';
        ctxTarget.beginPath();
        ctxTarget.arc(dotX, rect.y + rect.h / 2, Math.max(5, rect.h * 0.8), 0, Math.PI * 2);
        ctxTarget.fill();
      }

      function formatTime(t) {
        if (!isFinite(t) || t < 0) return '0:00';
        const minutes = Math.floor(t / 60);
        const seconds = Math.floor(t % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }

      function buildTopPanelLayout() {
        const CW = topPanelCanvas ? topPanelCanvas.width : gridCanvas.width;
        const CH = topPanelCanvas ? topPanelCanvas.height : Math.round(gridCanvas.height * 0.12);
        const PAD = Math.round(Math.max(14, CH * 0.22));
        const ICON = Math.round(Math.min(CH * 0.72, CW * 0.09));
        const backRect = { x: PAD, y: (CH - ICON) / 2, w: ICON, h: ICON };
        const titleRect = { x: PAD + ICON + PAD * 0.6, y: 0, w: CW - (PAD + ICON + PAD * 0.6) - PAD, h: CH };
        return { surface: { x: 0, y: 0, w: CW, h: CH }, backRect, titleRect, barH: CH };
      }

      function buildBottomPanelLayout() {
        const CW = bottomPanelCanvas ? bottomPanelCanvas.width : gridCanvas.width;
        const CH = bottomPanelCanvas ? bottomPanelCanvas.height : Math.round(gridCanvas.height * 0.12);
        const PAD = Math.round(Math.max(12, CH * 0.18));
        const ICON = Math.round(Math.min(CH * 0.72, CW * 0.085));
        const progressH = Math.max(4, Math.round(CH * 0.14));
        const progressRect = { x: PAD, y: Math.round(PAD * 0.55), w: CW - PAD * 2, h: progressH };

        const iconRowY = Math.round(progressRect.y + progressRect.h + (CH - (progressRect.y + progressRect.h) - ICON) * 0.55);
        const playRect = { x: PAD, y: iconRowY, w: ICON, h: ICON };
        const volumeRect = { x: playRect.x + ICON + PAD * 0.55, y: iconRowY, w: ICON, h: ICON };
        const sliderW = Math.min(CW * 0.22, Math.max(180, CW * 0.2));
        const volumeSliderRect = { x: volumeRect.x + ICON + PAD * 0.5, y: iconRowY + (ICON - CH * 0.22) / 2, w: sliderW, h: CH * 0.22 };

        const timeRect = { x: CW / 2 - 120, y: iconRowY + (ICON - Math.round(CH * 0.38)) / 2, w: 240, h: Math.round(CH * 0.38) };

        const clusterGap = Math.round(PAD * 0.7);
        const clusterGapSmall = Math.max(4, Math.round(PAD * 0.24));
        const boxW = Math.round(ICON * 1.4);
        const boxH = Math.round(ICON * 0.95);
        const dividerW = Math.max(4, Math.round(PAD * 0.35));

        // Match the fullscreen toggle behavior of the main controls; keep disabled by default.
        const ENABLE_FULLSCREEN_ICON = false; // toggle to true to re-enable

        let cursor = CW - PAD; // rightmost inner edge
        let fullscreenRect = null;
        if (ENABLE_FULLSCREEN_ICON) {
          cursor -= ICON;
          fullscreenRect = { x: cursor, y: iconRowY, w: ICON, h: ICON };
          cursor -= clusterGap;
        }
        cursor -= ICON;
        const tabletRect = { x: cursor, y: iconRowY, w: ICON, h: ICON };
        cursor -= clusterGap;
        // divider
        cursor -= dividerW;
        cursor -= clusterGap;
        // speed and pitch cluster
        cursor -= boxW;
        const speedRect = { x: cursor, y: iconRowY, w: boxW, h: ICON };
        cursor -= clusterGapSmall;
        cursor -= boxW;
        const pitchRect = { x: cursor, y: iconRowY + (ICON - boxH) / 2, w: boxW, h: boxH };
        const dividerRect = { x: speedRect.x + speedRect.w + Math.round(clusterGapSmall / 2), y: iconRowY + Math.round(ICON * 0.15), w: dividerW, h: Math.round(ICON * 0.7) };

        return {
          surface: { x: 0, y: 0, w: CW, h: CH },
          playRect,
          volumeRect,
          volumeSliderRect,
          timeRect,
          speedRect: pitchRect,
          pitchRect: speedRect,
          tabletRect,
          fullscreenRect,
          dividerRect,
          progressRect,
          barH: CH,
          fontFamily: '"Source Sans 3","Segoe UI",sans-serif'
        };
      }

      function drawPanelIcon(ctx2, rect, glyph, alpha = 1) {
        ctx2.save();
        ctx2.globalAlpha = alpha;
        ctx2.fillStyle = iconColor;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        const size = Math.round(rect.h * 0.9);
        ctx2.font = `${size}px ${iconFont}`;
        ctx2.fillText(glyph, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
        ctx2.restore();
      }

      function drawPanelProgress(ctx2, rect, video, alpha = 1) {
        ctx2.save();
        ctx2.globalAlpha = alpha;
        ctx2.fillStyle = 'rgba(255,255,255,0.22)';
        ctx2.fillRect(rect.x, rect.y, rect.w, rect.h);
        const progress = video && video.duration ? (video.currentTime / video.duration) : 0;
        ctx2.fillStyle = iconColor;
        ctx2.fillRect(rect.x, rect.y, rect.w * progress, rect.h);
        const dotX = rect.x + rect.w * progress;
        ctx2.fillStyle = '#fff';
        ctx2.beginPath();
        ctx2.arc(dotX, rect.y + rect.h / 2, Math.max(5, rect.h * 0.8), 0, Math.PI * 2);
        ctx2.fill();
        ctx2.restore();
      }

      function drawTabletPanels(alpha, entry, video) {
        if (!topPanelCtx || !bottomPanelCtx || !topPanelCanvas || !bottomPanelCanvas) return;
        const a = Math.max(0, Math.min(1, alpha));
        const topUI = buildTopPanelLayout();
        const botUI = buildBottomPanelLayout();

        topPanelCtx.clearRect(0, 0, topPanelCanvas.width, topPanelCanvas.height);
        bottomPanelCtx.clearRect(0, 0, bottomPanelCanvas.width, bottomPanelCanvas.height);

        // Background bars (fill entire panels)
        topPanelCtx.save();
        topPanelCtx.globalAlpha = 0.9 * a;
        topPanelCtx.fillStyle = 'rgba(12,12,12,0.82)';
        topPanelCtx.fillRect(0, 0, topPanelCanvas.width, topPanelCanvas.height);
        topPanelCtx.restore();

        bottomPanelCtx.save();
        bottomPanelCtx.globalAlpha = 0.9 * a;
        bottomPanelCtx.fillStyle = 'rgba(12,12,12,0.82)';
        bottomPanelCtx.fillRect(0, 0, bottomPanelCanvas.width, bottomPanelCanvas.height);
        bottomPanelCtx.restore();

        // Top panel content
        drawPanelIcon(topPanelCtx, topUI.backRect, 'arrow_back_2', a);
        topPanelCtx.save();
        topPanelCtx.globalAlpha = a;
        topPanelCtx.fillStyle = iconColor;
        topPanelCtx.textAlign = 'center';
        topPanelCtx.textBaseline = 'middle';
        topPanelCtx.font = `${Math.round(topUI.barH * 0.42)}px "Source Sans 3","Segoe UI",sans-serif`;
        topPanelCtx.fillText(entry ? entry.title : '', topUI.titleRect.x + topUI.titleRect.w / 2, topUI.titleRect.y + topUI.titleRect.h / 2 + 1);
        topPanelCtx.restore();

        if (video) {
          // Bottom panel content
          const playGlyph = video.paused ? 'play_circle' : 'pause_circle';
          drawPanelIcon(bottomPanelCtx, botUI.playRect, playGlyph, a);

          const volumeLevel = video.muted ? 0 : (video.volume || 0);
          let volGlyph = 'volume_up';
          if (video.muted || volumeLevel <= 0.0001) volGlyph = 'no_sound';
          else if (volumeLevel <= 0.3) volGlyph = 'volume_mute';
          else if (volumeLevel <= 0.7) volGlyph = 'volume_down';
          else volGlyph = 'volume_up';
          drawPanelIcon(bottomPanelCtx, botUI.volumeRect, volGlyph, a);

          if (uiState.volumeHover) {
            bottomPanelCtx.save();
            bottomPanelCtx.globalAlpha = a;
            bottomPanelCtx.fillStyle = 'rgba(255,255,255,0.15)';
            bottomPanelCtx.fillRect(botUI.volumeSliderRect.x, botUI.volumeSliderRect.y, botUI.volumeSliderRect.w, botUI.volumeSliderRect.h);
            const filled = Math.max(0, Math.min(1, volumeLevel));
            bottomPanelCtx.fillStyle = iconColor;
            bottomPanelCtx.fillRect(botUI.volumeSliderRect.x, botUI.volumeSliderRect.y, botUI.volumeSliderRect.w * filled, botUI.volumeSliderRect.h);
            const dotX = botUI.volumeSliderRect.x + botUI.volumeSliderRect.w * filled;
            bottomPanelCtx.fillStyle = '#fff';
            bottomPanelCtx.beginPath();
            bottomPanelCtx.arc(dotX, botUI.volumeSliderRect.y + botUI.volumeSliderRect.h / 2, Math.max(4, Math.round(botUI.volumeSliderRect.h * 0.6)), 0, Math.PI * 2);
            bottomPanelCtx.fill();
            bottomPanelCtx.restore();
          }
              // Draw divider between speed/pitch cluster and right-side icons
              try {
                if (botUI.dividerRect) {
                  bottomPanelCtx.save();
                  bottomPanelCtx.globalAlpha = a * 0.65;
                  bottomPanelCtx.fillStyle = 'rgba(255,255,255,0.18)';
                  bottomPanelCtx.fillRect(botUI.dividerRect.x, botUI.dividerRect.y, botUI.dividerRect.w, botUI.dividerRect.h);
                  bottomPanelCtx.restore();
                }
              } catch (e) { /* ignore */ }

              drawPanelIcon(bottomPanelCtx, botUI.tabletRect, uiState.tabletView ? 'picture_in_picture_center' : 'capture', a);
          // Time display
          bottomPanelCtx.save();
          bottomPanelCtx.globalAlpha = a;
          bottomPanelCtx.fillStyle = iconColor;
          bottomPanelCtx.textAlign = 'center';
          bottomPanelCtx.textBaseline = 'middle';
          bottomPanelCtx.font = `${Math.round(botUI.barH * 0.32)}px ${botUI.fontFamily}`;
          bottomPanelCtx.fillText(`${formatTime(video.currentTime || 0)} / ${formatTime(video.duration || 0)}`,
            botUI.timeRect.x + botUI.timeRect.w / 2,
            botUI.timeRect.y + botUI.timeRect.h / 2 + 1);
          bottomPanelCtx.restore();

          // Right cluster
          bottomPanelCtx.save();
          bottomPanelCtx.globalAlpha = a;
          bottomPanelCtx.fillStyle = iconColor;
          bottomPanelCtx.textAlign = 'center';
          bottomPanelCtx.textBaseline = 'middle';
          bottomPanelCtx.font = `${Math.round(botUI.speedRect.h * 0.5)}px ${botUI.fontFamily}`;
          const rate = playbackRates[Math.max(0, Math.min(playbackRates.length - 1, uiState.playbackRateIndex))];
          bottomPanelCtx.fillText(`${rate}x`, botUI.speedRect.x + botUI.speedRect.w / 2, botUI.speedRect.y + botUI.speedRect.h / 2 + 1);
          bottomPanelCtx.restore();

          bottomPanelCtx.save();
          bottomPanelCtx.globalAlpha = a;
          bottomPanelCtx.fillStyle = iconColor;
          bottomPanelCtx.textAlign = 'center';
          bottomPanelCtx.textBaseline = 'middle';
          bottomPanelCtx.font = `${Math.round(botUI.pitchRect.h * 0.40)}px ${botUI.fontFamily}`;
          const pitchLabel = uiState.preservePitch ? ['Pitch', 'Shift'] : ['Time', 'Stretch'];
          bottomPanelCtx.fillText(pitchLabel[0], botUI.pitchRect.x + botUI.pitchRect.w / 2, botUI.pitchRect.y + botUI.pitchRect.h * 0.38);
          bottomPanelCtx.fillText(pitchLabel[1], botUI.pitchRect.x + botUI.pitchRect.w / 2, botUI.pitchRect.y + botUI.pitchRect.h * 0.78);
          bottomPanelCtx.restore();

          // Draw tablet/capture icon
          drawPanelIcon(bottomPanelCtx, botUI.tabletRect, uiState.tabletView ? 'picture_in_picture_center' : 'capture', a);
          // Fullscreen icon intentionally removed (commented out). To re-enable,
          // uncomment the next line and set ENABLE_FULLSCREEN_ICON = true above.
          // drawPanelIcon(bottomPanelCtx, botUI.fullscreenRect, uiState.fullscreen ? 'fullscreen_exit' : 'fullscreen', a);

          // Progress bar
          drawPanelProgress(bottomPanelCtx, botUI.progressRect, video, a);
        }

        try { topPanelTexture.needsUpdate = true; } catch (e) { /* ignore */ }
        try { bottomPanelTexture.needsUpdate = true; } catch (e) { /* ignore */ }
      }

      function drawControls(ui, video, entry, alpha = 1) {
        if (!video || !playingFull || !ui || animation.phase === 'in' || alpha <= 0) return;
        const barAlpha = 0.9;
        const textColor = iconColor;

        // Bars (bottom bar visually extends to screen edge)
        ctrlCtx.save();
        ctrlCtx.globalAlpha = barAlpha * alpha;
        ctrlCtx.fillStyle = 'rgba(12,12,12,0.82)';
        ctrlCtx.fillRect(ui.topBar.x, ui.topBar.y, ui.topBar.w, ui.topBar.h);
        const bottomFillH = (ui.surfaceRect.y + ui.surfaceRect.h) - ui.bottomBar.y;
        ctrlCtx.fillRect(ui.bottomBar.x, ui.bottomBar.y, ui.bottomBar.w, bottomFillH);
        ctrlCtx.restore();

        // Top bar content
        ctrlCtx.save(); ctrlCtx.globalAlpha = alpha; drawIcon(ctrlCtx, ui.backRect, 'arrow_back_2'); ctrlCtx.restore();
        ctrlCtx.save();
        ctrlCtx.fillStyle = textColor;
        ctrlCtx.textAlign = 'center';
        ctrlCtx.textBaseline = 'middle';
        ctrlCtx.font = `${Math.round(ui.barH * 0.5)}px ${ui.fontFamily || '"Source Sans 3", "Segoe UI", sans-serif'}`;
        const title = entry ? entry.title : '';
        ctrlCtx.globalAlpha = alpha;
        ctrlCtx.fillText(title, ui.titleRect.x + ui.titleRect.w / 2, ui.titleRect.y + ui.titleRect.h / 2 + 1);
        ctrlCtx.restore();

        // Bottom left cluster: play + volume
        const playGlyph = video.paused ? 'play_circle' : 'pause_circle';
        ctrlCtx.save(); ctrlCtx.globalAlpha = alpha; drawIcon(ctrlCtx, ui.playRect, playGlyph); ctrlCtx.restore();

        // Volume icon & slider
        const volumeLevel = video.muted ? 0 : (video.volume || 0);
        let volGlyph = 'volume_up';
        if (video.muted || volumeLevel <= 0.0001) volGlyph = 'no_sound';
        else if (volumeLevel <= 0.3) volGlyph = 'volume_mute';
        else if (volumeLevel <= 0.7) volGlyph = 'volume_down';
        else volGlyph = 'volume_up';
        ctrlCtx.save(); ctrlCtx.globalAlpha = alpha; drawIcon(ctrlCtx, ui.volumeRect, volGlyph); ctrlCtx.restore();
        if (uiState.volumeHover) {
          ctrlCtx.save();
          ctrlCtx.globalAlpha = alpha;
          ctrlCtx.fillStyle = 'rgba(255,255,255,0.15)';
          ctrlCtx.fillRect(ui.volumeSliderRect.x, ui.volumeSliderRect.y, ui.volumeSliderRect.w, ui.volumeSliderRect.h);
          const filled = Math.max(0, Math.min(1, volumeLevel));
          ctrlCtx.fillStyle = iconColor;
          ctrlCtx.fillRect(ui.volumeSliderRect.x, ui.volumeSliderRect.y, ui.volumeSliderRect.w * filled, ui.volumeSliderRect.h);
          const dotX = ui.volumeSliderRect.x + ui.volumeSliderRect.w * filled;
          ctrlCtx.fillStyle = '#fff';
          ctrlCtx.beginPath();
          ctrlCtx.arc(dotX, ui.volumeSliderRect.y + ui.volumeSliderRect.h / 2, Math.max(4, Math.round(ui.volumeSliderRect.h * 0.6)), 0, Math.PI * 2);
          ctrlCtx.fill();
          ctrlCtx.restore();
        }

        // Time display (center bottom)
        ctrlCtx.save();
        ctrlCtx.fillStyle = textColor;
        ctrlCtx.textAlign = 'center';
        ctrlCtx.textBaseline = 'middle';
        ctrlCtx.font = `${Math.round(ui.barH * 0.35)}px "Source Sans 3","Segoe UI",sans-serif`;
        const elapsed = video.currentTime || 0;
        const duration = video.duration || 0;
        const timeStr = `${formatTime(elapsed)} / ${formatTime(duration)}`;
        ctrlCtx.globalAlpha = alpha;
        ctrlCtx.fillText(timeStr, ui.timeRect.x + ui.timeRect.w / 2, ui.timeRect.y + ui.timeRect.h / 2 + 1);
        ctrlCtx.restore();

        // Right cluster: speed, pitch/time toggle, tablet view, fullscreen
        ctrlCtx.save();
        ctrlCtx.fillStyle = textColor;
        ctrlCtx.textAlign = 'center';
        ctrlCtx.textBaseline = 'middle';
        ctrlCtx.font = `${Math.round(ui.speedRect.h * 0.5)}px ${ui.fontFamily || '"Source Sans 3","Segoe UI",sans-serif'}`;
        const rate = playbackRates[Math.max(0, Math.min(playbackRates.length - 1, uiState.playbackRateIndex))];
        ctrlCtx.globalAlpha = alpha;
        ctrlCtx.fillText(`${rate}x`, ui.speedRect.x + ui.speedRect.w / 2, ui.speedRect.y + ui.speedRect.h / 2 + 1);
        ctrlCtx.restore();

        ctrlCtx.save();
        ctrlCtx.fillStyle = textColor;
        ctrlCtx.textAlign = 'center';
        ctrlCtx.textBaseline = 'middle';
        ctrlCtx.font = `${Math.round(ui.pitchRect.h * 0.40)}px ${ui.fontFamily || '"Source Sans 3","Segoe UI",sans-serif'}`;
        const pitchLabel = uiState.preservePitch ? ['Pitch', 'Shift'] : ['Time', 'Stretch'];
        ctrlCtx.globalAlpha = alpha;
        ctrlCtx.fillText(pitchLabel[0], ui.pitchRect.x + ui.pitchRect.w / 2, ui.pitchRect.y + ui.pitchRect.h * 0.38);
        ctrlCtx.fillText(pitchLabel[1], ui.pitchRect.x + ui.pitchRect.w / 2, ui.pitchRect.y + ui.pitchRect.h * 0.78);
        ctrlCtx.restore();

        ctrlCtx.save(); ctrlCtx.globalAlpha = alpha; drawIcon(ctrlCtx, ui.tabletRect, uiState.tabletView ? 'picture_in_picture_center' : 'capture'); ctrlCtx.restore();
        // Fullscreen control removed for now. Uncomment to restore and set ENABLE_FULLSCREEN_ICON = true above.
        // ctrlCtx.save(); ctrlCtx.globalAlpha = alpha; drawIcon(ctrlCtx, ui.fullscreenRect, uiState.fullscreen ? 'fullscreen_exit' : 'fullscreen'); ctrlCtx.restore();

        // Progress bar
        ctrlCtx.save(); ctrlCtx.globalAlpha = alpha; drawProgressBar(ctrlCtx, ui.progressRect, video); ctrlCtx.restore();

        // Draw divider if present (between speed/pitch cluster and right icons)
        try {
          if (ui.dividerRect) {
            ctrlCtx.save(); ctrlCtx.globalAlpha = alpha * 0.85; ctrlCtx.fillStyle = 'rgba(255,255,255,0.12)'; ctrlCtx.fillRect(ui.dividerRect.x, ui.dividerRect.y, ui.dividerRect.w, ui.dividerRect.h); ctrlCtx.restore();
          }
        } catch (e) { /* ignore */ }
      }

      function renderFull(now) {
        if (fullIndex < 0 || !animation.to) return;
        const video = fullVideos[fullIndex];
        let rect = animation.to;
        if (animation.phase === 'in' || animation.phase === 'out') {
          const t = Math.min(1, (now - animation.start) / opts.zoomDuration);
          const eased = easeInOutQuad(t);
          rect = lerpRect(animation.from || animation.to, animation.to || animation.from, eased);
          if (t >= 1) {
            if (animation.phase === 'in') {
              animation.phase = 'hold';
            } else {
              animation.phase = 'idle';
              fullIndex = -1;
              lastFullRect = null;
              return;
            }
          }
        }
        const frames = getActiveRects();
        const targetRect = computeVideoRect(frames.videoRect, video);
        // Slight horizontal overdraw to hide tiny gaps at tablet edges
        const overdraw = targetRect.w * 0.01;
        const inflated = {
          x: targetRect.x - overdraw * 0.5,
          y: targetRect.y,
          w: targetRect.w + overdraw,
          h: targetRect.h
        };
        // Clamp horizontally within surface
        inflated.x = Math.max(frames.surfaceRect.x, inflated.x);
        if (inflated.x + inflated.w > frames.surfaceRect.x + frames.surfaceRect.w) {
          inflated.w = (frames.surfaceRect.x + frames.surfaceRect.w) - inflated.x;
        }
        const finalTarget = inflated;
        // Force the drawn rect to the current target to keep strict 16:9 sizing
        animation.to = finalTarget;
        rect = finalTarget;
        lastFullRect = rect;
        const uiScale = uiState.fullscreen ? fullscreenScale() : 1;
        ctx.save();
        // Black background to hide underlying imagery when gaps appear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
        if (DEBUG_SCREEN_OUTLINE) {
          try {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0); // ensure no stray transforms
            // Bright hot pink outline for the intended 16:9 surface (with fixed height)
            ctx.strokeStyle = 'rgba(255, 0, 255, 0.95)';
            ctx.lineWidth = Math.max(4, Math.round(gridCanvas.width * 0.005));
            ctx.strokeRect(frames.surfaceRect.x, frames.surfaceRect.y, frames.surfaceRect.w, frames.surfaceRect.h);
            // Also outline the actual video rect being used (green)
            const vidRect = computeVideoRect(frames.videoRect, video || thumbs[fullIndex]);
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.lineWidth = Math.max(2, Math.round(gridCanvas.width * 0.0035));
            ctx.strokeRect(vidRect.x, vidRect.y, vidRect.w, vidRect.h);
            ctx.restore();
          } catch (e) { /* ignore */ }
        }
        drawElementInRect(video || thumbs[fullIndex], rect);
        const usePanels = (!uiState.fullscreen);
        if (usePanels) {
          ensureTabletPanels();
          const panelsReady = !!(topPanelMesh && bottomPanelMesh && topPanelCtx && bottomPanelCtx && topPanelCanvas && bottomPanelCanvas);
          if (panelsReady) {
            if (topPanelMesh) topPanelMesh.visible = true;
            if (bottomPanelMesh) bottomPanelMesh.visible = true;
            drawTabletPanels(chromeVisible, entries[fullIndex], video);
          } else {
            if (topPanelMesh) topPanelMesh.visible = false;
            if (bottomPanelMesh) bottomPanelMesh.visible = false;
            const ui = buildControlsLayout(frames.surfaceRect, targetRect, uiScale);
            ctrlCtx.clearRect(0, 0, controlsCanvas.width, controlsCanvas.height);
            drawControls(ui, video, entries[fullIndex], chromeVisible);
            ctx.drawImage(controlsCanvas, 0, 0);
          }
        } else {
          if (topPanelMesh) topPanelMesh.visible = false;
          if (bottomPanelMesh) bottomPanelMesh.visible = false;
          const ui = buildControlsLayout(frames.surfaceRect, targetRect, uiScale);
          ctrlCtx.clearRect(0, 0, controlsCanvas.width, controlsCanvas.height);
          drawControls(ui, video, entries[fullIndex], chromeVisible);
          ctx.drawImage(controlsCanvas, 0, 0);
        }
        ctx.restore();
      }

      function render() {
        const now = performance.now();
        if (playingFull) {
          if (now - lastMouseMoveTs > chromeHideDelay && chromeTarget !== 0) {
            chromeTarget = 0; chromeAnimStart = now;
          }
          const t = Math.min(1, (now - chromeAnimStart) / chromeFadeDuration);
          chromeVisible = chromeTarget === 1 ? t : 1 - t;
        } else {
          chromeVisible = 1; chromeTarget = 1;
        }
        ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        ctrlCtx.clearRect(0, 0, controlsCanvas.width, controlsCanvas.height);
        drawBackground();
        drawGridCells(now);
        drawDescription();
        if (hoverIndex >= 0 && !playingFull) drawHoverOutline(hoverIndex);
        if (playingFull || animation.phase === 'in' || animation.phase === 'out') {
          renderFull(now);
        }
        if (!playingFull && !uiState.fullscreen) {
          if (topPanelMesh) topPanelMesh.visible = false;
          if (bottomPanelMesh) bottomPanelMesh.visible = false;
        }
        // Composite controls for non-playing state too (e.g., grid view overlays in future)
        // Currently only drawn during playback.
        try { texture.needsUpdate = true; } catch (e) { /* ignore */ }
        requestAnimationFrame(render);
      }
      render();

      
      function handleFullClick(pt) {
        if (!playingFull || fullIndex < 0 || !lastFullRect) return;
        const frames = getActiveRects();
        if (!frames) return;
        const uiScale = uiState.fullscreen ? fullscreenScale() : 1;

        // Panel planes: pt is in panel-canvas coordinates.
        if (!uiState.fullscreen && pt && (pt.target === 'top' || pt.target === 'bottom')) {
          const video = fullVideos[fullIndex];
          if (!video) return;
          const within = (r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;

          if (pt.target === 'top') {
            const topUI = buildTopPanelLayout();
            if (within(topUI.backRect)) {
              startZoomOut(fullIndex);
              return;
            }
            return;
          }

          const botUI = buildBottomPanelLayout();
          if (within(botUI.playRect)) {
            if (video.paused) video.play().catch(() => {});
            else video.pause();
            return;
          }
          if (within(botUI.volumeRect)) {
            toggleMute(video);
            uiState.volumeHover = true;
            return;
          }
          if (uiState.volumeHover && within(botUI.volumeSliderRect)) {
            const ratio = Math.max(0, Math.min(1, (pt.x - botUI.volumeSliderRect.x) / botUI.volumeSliderRect.w));
            if (ratio <= 0.001) { uiState.lastVolume = video.volume || uiState.lastVolume || 0.5; video.muted = true; video.volume = 0; }
            else { video.muted = false; video.volume = ratio; uiState.lastVolume = ratio; }
            return;
          }
          if (pt.y >= botUI.progressRect.y - 4 && pt.y <= botUI.progressRect.y + botUI.progressRect.h + 4) {
            const ratio = Math.max(0, Math.min(1, (pt.x - botUI.progressRect.x) / botUI.progressRect.w));
            if (video && video.duration) { try { video.currentTime = video.duration * ratio; } catch (e) { /* ignore */ } }
            return;
          }
          if (within(botUI.speedRect)) { uiState.playbackRateIndex = (uiState.playbackRateIndex + 1) % playbackRates.length; applySettingsToAllVideos(); return; }
          if (within(botUI.pitchRect)) { uiState.preservePitch = !uiState.preservePitch; applySettingsToAllVideos(); return; }
          if (within(botUI.tabletRect)) { if (!uiState.fullscreen) setTabletView(!uiState.tabletView); return; }
          // Fullscreen toggle intentionally disabled (commented out).
          // if (within(botUI.fullscreenRect)) { toggleFullscreenMode(); return; }
          return;
        }

        if (!uiState.fullscreen) {
          if (pt.x < frames.surfaceRect.x || pt.x > frames.surfaceRect.x + frames.surfaceRect.w || pt.y < frames.surfaceRect.y || pt.y > frames.surfaceRect.y + frames.surfaceRect.h) return;
        }
        const ui = buildControlsLayout(frames.surfaceRect, lastFullRect, uiScale);
        const handled = { any: false };
        const within = (r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
        const video = fullVideos[fullIndex];
        if (within(ui.backRect)) {
          if (uiState.fullscreen) { /* fullscreen disabled */ }
          startZoomOut(fullIndex);
          handled.any = true; return;
        }
        if (within(ui.playRect)) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          handled.any = true; return;
        }
        if (within(ui.volumeRect)) {
          toggleMute(video);
          uiState.volumeHover = true;
          handled.any = true; return;
        }
        if (uiState.volumeHover && within(ui.volumeSliderRect)) {
          const ratio = Math.max(0, Math.min(1, (pt.x - ui.volumeSliderRect.x) / ui.volumeSliderRect.w));
          if (video) {
            if (ratio <= 0.001) { uiState.lastVolume = video.volume || uiState.lastVolume || 0.5; video.muted = true; video.volume = 0; }
            else { video.muted = false; video.volume = ratio; uiState.lastVolume = ratio; }
          }
          handled.any = true; return;
        }
        if (pt.y >= ui.progressRect.y - 4 && pt.y <= ui.progressRect.y + ui.progressRect.h + 4) {
          const ratio = Math.max(0, Math.min(1, (pt.x - ui.progressRect.x) / ui.progressRect.w));
          if (video && video.duration) { try { video.currentTime = video.duration * ratio; } catch (e) { /* ignore */ } }
          handled.any = true; return;
        }
        if (within(ui.speedRect)) { uiState.playbackRateIndex = (uiState.playbackRateIndex + 1) % playbackRates.length; applySettingsToAllVideos(); handled.any = true; return; }
        if (within(ui.pitchRect)) { uiState.preservePitch = !uiState.preservePitch; applySettingsToAllVideos(); handled.any = true; return; }
        if (within(ui.tabletRect)) { if (!uiState.fullscreen) setTabletView(!uiState.tabletView); handled.any = true; return; }
        // Fullscreen toggle intentionally disabled (commented out).
        // if (within(ui.fullscreenRect)) { toggleFullscreenMode(); handled.any = true; return; }
        if (handled.any) return;
        // If click fell inside control bars but not on actionable UI, ignore to prevent play/pause toggles
        if (pt.y <= ui.topBar.y + ui.topBar.h || pt.y >= ui.bottomBar.y) return;
        if (video) { if (video.paused) video.play().catch(() => {}); else video.pause(); }
      }


      function handlePointerMove(ev) {
        if (uiState.fullscreen && ev && ev.currentTarget && ev.currentTarget !== gridCanvas) return;
        const pt = pointFromEvent(ev);
        lastMouseMoveTs = performance.now();
        // If a pending single-click is scheduled, cancel it when the pointer
        // moves beyond a small threshold to avoid toggling play/pause during drags.
        try {
          if (pendingSingleClick && pendingClickPos && pt) {
            const dx = pt.x - pendingClickPos.x;
            const dy = pt.y - pendingClickPos.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 36) { // ~6px threshold
              clearPendingSingleClick();
            }
          }
        } catch (e) { /* ignore */ }
        const frames = getActiveRects();
        if (chromeTarget === 0) { chromeTarget = 1; chromeAnimStart = lastMouseMoveTs; }
        if (playingFull) {
          if (!uiState.fullscreen && pt && pt.target === 'bottom') {
            const botUI = buildBottomPanelLayout();
            const video = fullVideos[fullIndex];
            if (!video) return;

            if (dragState && dragState.type === 'progress') {
              const ratio = Math.max(0, Math.min(1, (pt.x - botUI.progressRect.x) / botUI.progressRect.w));
              try { if (video.duration) video.currentTime = video.duration * ratio; } catch (e) { /* ignore */ }
              ev.stopImmediatePropagation?.();
              ev.stopPropagation?.();
              ev.preventDefault?.();
              return;
            }
            if (dragState && dragState.type === 'volume') {
              const ratio = Math.max(0, Math.min(1, (pt.x - botUI.volumeSliderRect.x) / botUI.volumeSliderRect.w));
              try {
                if (ratio <= 0.001) {
                  uiState.lastVolume = video.volume || uiState.lastVolume || 0.5;
                  video.muted = true;
                  video.volume = 0;
                } else {
                  video.muted = false;
                  video.volume = ratio;
                  uiState.lastVolume = ratio;
                }
              } catch (e) { /* ignore */ }
              uiState.volumeHover = true;
              ev.stopImmediatePropagation?.();
              ev.stopPropagation?.();
              ev.preventDefault?.();
              return;
            }

            const inVol = (pt.x >= botUI.volumeRect.x && pt.x <= botUI.volumeRect.x + botUI.volumeRect.w && pt.y >= botUI.volumeRect.y && pt.y <= botUI.volumeRect.y + botUI.volumeRect.h) ||
              (pt.x >= botUI.volumeSliderRect.x && pt.x <= botUI.volumeSliderRect.x + botUI.volumeSliderRect.w && pt.y >= botUI.volumeSliderRect.y && pt.y <= botUI.volumeSliderRect.y + botUI.volumeSliderRect.h);
            uiState.volumeHover = !!inVol;
            return;
          }

          const video = fullVideos[fullIndex];
          const targetRect = computeVideoRect(frames.videoRect, video);
          lastFullRect = targetRect || lastFullRect || animation.to;
          const uiScale = uiState.fullscreen ? fullscreenScale() : 1;
          const ui = (lastFullRect && frames) ? buildControlsLayout(frames.surfaceRect, lastFullRect, uiScale) : null;
          if (dragState && ui) {
            if (dragState.type === 'progress') {
              const ratio = Math.max(0, Math.min(1, (pt.x - ui.progressRect.x) / ui.progressRect.w));
              try { const v = fullVideos[fullIndex]; if (v && v.duration) v.currentTime = v.duration * ratio; } catch (e) { /* ignore */ }
              ev.stopImmediatePropagation?.();
              ev.stopPropagation?.();
              ev.preventDefault?.();
              return;
            }
            if (dragState.type === 'volume') {
              const ratio = Math.max(0, Math.min(1, (pt.x - ui.volumeSliderRect.x) / ui.volumeSliderRect.w));
              try {
                const v = fullVideos[fullIndex];
                if (v) {
                  if (ratio <= 0.001) {
                    uiState.lastVolume = v.volume || uiState.lastVolume || 0.5;
                    v.muted = true;
                    v.volume = 0;
                  } else {
                    v.muted = false;
                    v.volume = ratio;
                    uiState.lastVolume = ratio;
                  }
                }
              } catch (e) { /* ignore */ }
              uiState.volumeHover = true;
              ev.stopImmediatePropagation?.();
              ev.stopPropagation?.();
              ev.preventDefault?.();
              return;
            }
          }
          if (ui) {
            const inVol = pt && ((pt.x >= ui.volumeRect.x && pt.x <= ui.volumeRect.x + ui.volumeRect.w && pt.y >= ui.volumeRect.y && pt.y <= ui.volumeRect.y + ui.volumeRect.h) ||
              (pt.x >= ui.volumeSliderRect.x && pt.x <= ui.volumeSliderRect.x + ui.volumeSliderRect.w && pt.y >= ui.volumeSliderRect.y && pt.y <= ui.volumeSliderRect.y + ui.volumeSliderRect.h));
            uiState.volumeHover = !!inVol;
          }
        } else {
          const outOfSurface = !pt || !frames || pt.x < frames.surfaceRect.x || pt.y < frames.surfaceRect.y || pt.x > frames.surfaceRect.x + frames.surfaceRect.w || pt.y > frames.surfaceRect.y + frames.surfaceRect.h;
          if (outOfSurface) { setHover(-1); return; }
          if (pt.x < cellsBounds.minX || pt.x > cellsBounds.maxX || pt.y < cellsBounds.minY || pt.y > cellsBounds.maxY) { setHover(-1); return; }
          const idx = cellIndexFromPoint(pt);
          setHover(idx);
        }
      }

      function handlePointerLeave() {
        if (!playingFull) setHover(-1);
        uiState.volumeHover = false;
        dragState = null;
      }

      function handleClick(ev) {
        if (uiState.fullscreen && ev && ev.currentTarget && ev.currentTarget !== gridCanvas) return;
        const pt = pointFromEvent(ev);
        if (!pt) return;
        const frames = getActiveRects();
        if (!frames) return;
        if (!uiState.fullscreen) {
          // In tablet panel mode, pt is in panel coordinates; skip main-surface bounds.
          const isPanel = playingFull && (pt.target === 'top' || pt.target === 'bottom');
          if (!isPanel) {
            if (pt.x < frames.surfaceRect.x || pt.x > frames.surfaceRect.x + frames.surfaceRect.w || pt.y < frames.surfaceRect.y || pt.y > frames.surfaceRect.y + frames.surfaceRect.h) return;
          }
        }
        const now = performance.now();
        const isDouble = (handleClick._last && (now - handleClick._last) < 320);
        handleClick._last = now;
        const clearPending = () => { clearPendingSingleClick(); };
        if (playingFull) {
          // Tablet panel planes handle controls; main plane is direct video click.
          if (!uiState.fullscreen && (pt.target === 'top' || pt.target === 'bottom')) {
            clearPending();
            handleFullClick(pt);
            return;
          }

          const video = fullVideos[fullIndex];
          const targetRect = computeVideoRect(frames.videoRect, video);
          const uiScale = uiState.fullscreen ? fullscreenScale() : 1;
          const ui = buildControlsLayout(frames.surfaceRect, lastFullRect || targetRect || frames.videoRect, uiScale);
          const overControls = pt.y <= ui.topBar.y + ui.topBar.h || pt.y >= ui.bottomBar.y;
          if (isDouble && !overControls) { clearPending(); /* fullscreen disabled */ /* toggleFullscreenMode(); */ return; }
          if (overControls) { clearPending(); handleFullClick(pt); return; }
          clearPending();
          pendingClickPos = pt ? { x: pt.x, y: pt.y } : null;
          pendingSingleClick = setTimeout(() => {
            try { handleFullClick(pt); } catch (e) { /* ignore */ }
            pendingSingleClick = null;
            pendingClickPos = null;
          }, 240);
          return;
        }
        clearPending();
        const idx = cellIndexFromPoint(pt);
        if (idx >= 0) {
          startFull(idx);
        } else {
          // Click on canvas outside thumbnails toggles play/pause if a video is active
          const v = fullVideos[fullIndex];
          if (v) {
            if (v.paused) v.play().catch(() => {});
            else v.pause();
          }
          if (isDouble) { /* fullscreen disabled on double-click */ /* toggleFullscreenMode(); */ }
        }
      }

      function handlePointerDown(ev) {
        if (uiState.fullscreen && ev && ev.currentTarget && ev.currentTarget !== gridCanvas) return;
        const pt = pointFromEvent(ev);
        lastMouseMoveTs = performance.now();
        if (!pt || !playingFull || fullIndex < 0) return;

        // Bottom panel drag targets
        if (!uiState.fullscreen && pt.target === 'bottom') {
          const video = fullVideos[fullIndex];
          if (!video) return;
          const ui = buildBottomPanelLayout();
          const within = (r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
          if (within(ui.progressRect)) {
            dragState = { type: 'progress' };
            const ratio = Math.max(0, Math.min(1, (pt.x - ui.progressRect.x) / ui.progressRect.w));
            try { if (video.duration) video.currentTime = video.duration * ratio; } catch (e) { /* ignore */ }
            ev.stopImmediatePropagation?.(); ev.stopPropagation?.(); ev.preventDefault?.();
            return;
          }
          if (within(ui.volumeSliderRect)) {
            dragState = { type: 'volume' };
            const ratio = Math.max(0, Math.min(1, (pt.x - ui.volumeSliderRect.x) / ui.volumeSliderRect.w));
            try {
              if (ratio <= 0.001) { uiState.lastVolume = video.volume || uiState.lastVolume || 0.5; video.muted = true; video.volume = 0; }
              else { video.muted = false; video.volume = ratio; uiState.lastVolume = ratio; }
            } catch (e) { /* ignore */ }
            uiState.volumeHover = true;
            ev.stopImmediatePropagation?.(); ev.stopPropagation?.(); ev.preventDefault?.();
            return;
          }
          if (within(ui.volumeRect)) {
            dragState = null;
            return;
          }
          return;
        }

        const frames = getActiveRects();
        const video = fullVideos[fullIndex];
        const targetRect = computeVideoRect(frames.videoRect, video);
        const uiScale = uiState.fullscreen ? fullscreenScale() : 1;
        const ui = buildControlsLayout(frames.surfaceRect, lastFullRect || targetRect || frames.videoRect, uiScale);
        const within = (r) => pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
        if (within(ui.progressRect)) {
          dragState = { type: 'progress' };
          const ratio = Math.max(0, Math.min(1, (pt.x - ui.progressRect.x) / ui.progressRect.w));
          try { const v = fullVideos[fullIndex]; if (v && v.duration) v.currentTime = v.duration * ratio; } catch (e) { /* ignore */ }
          ev.stopImmediatePropagation?.(); ev.stopPropagation?.(); ev.preventDefault?.();
          return;
        }
        if (within(ui.volumeSliderRect)) {
          dragState = { type: 'volume' };
          const ratio = Math.max(0, Math.min(1, (pt.x - ui.volumeSliderRect.x) / ui.volumeSliderRect.w));
          try { const v = fullVideos[fullIndex]; if (v) { if (ratio <= 0.001) { uiState.lastVolume = v.volume || uiState.lastVolume || 0.5; v.muted = true; v.volume = 0; } else { v.muted = false; v.volume = ratio; uiState.lastVolume = ratio; } } } catch (e) { /* ignore */ }
          uiState.volumeHover = true;
          ev.stopImmediatePropagation?.(); ev.stopPropagation?.(); ev.preventDefault?.();
          return;
        }
        if (within(ui.volumeRect)) {
          dragState = null;
          return;
        }
      }

      function handlePointerUp(ev) {
        if (uiState.fullscreen && ev && ev.currentTarget && ev.currentTarget !== gridCanvas) return;
        dragState = null;
        uiState.volumeHover = false;
      }

      const dom = renderer.domElement;
      dom.addEventListener('pointermove', handlePointerMove);
      dom.addEventListener('pointerleave', handlePointerLeave);
      dom.addEventListener('click', handleClick);
      dom.addEventListener('pointerdown', handlePointerDown);
      dom.addEventListener('pointerup', handlePointerUp);
      const handleGlobalPointerMove = () => {
        lastMouseMoveTs = performance.now();
        if (chromeTarget === 0) { chromeTarget = 1; chromeAnimStart = lastMouseMoveTs; }
      };
      window.addEventListener('pointermove', handleGlobalPointerMove);
      try {
        document.addEventListener('fullscreenchange', () => {
          uiState.fullscreen = !!document.fullscreenElement;
          if (!uiState.fullscreen) {
            hideFullscreenOverlay();
            if (renderer && renderer.domElement && renderer.domElement.style) renderer.domElement.style.display = '';
          }
        });
      } catch (e) { /* ignore */ }

      // Keyboard shortcuts (YouTube-like)
      function handleKeydown(ev) {
        if (!playingFull || fullIndex < 0) return;
        const video = fullVideos[fullIndex];
        if (!video) return;
        const key = (ev.key || '').toLowerCase();
        const shift = ev.shiftKey;
        const ctrl = ev.ctrlKey || ev.metaKey;
        const prevent = () => { try { ev.preventDefault(); } catch (e) { /* ignore */ } };

        const seekBy = (delta) => {
          if (!video.duration || !isFinite(video.duration)) return;
          try { video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta)); } catch (e) { /* ignore */ }
        };
        const setVolume = (delta) => {
          let v = video.muted ? 0 : video.volume || 0;
          v = Math.max(0, Math.min(1, v + delta));
          video.volume = v;
          if (v > 0) { video.muted = false; uiState.lastVolume = v; }
        };

        // Toggle play/pause
        if (key === ' ' || key === 'k') { prevent(); video.paused ? video.play().catch(() => {}) : video.pause(); return; }
        // Mute
        if (key === 'm') { prevent(); toggleMute(video); return; }
        // Fullscreen - keyboard shortcut disabled (commented out)
        // if (key === 'f') { prevent(); toggleFullscreenMode(); return; }
        // Seek
        if (key === 'j') { prevent(); seekBy(-10); return; }
        if (key === 'l') { prevent(); seekBy(10); return; }
        if (key === 'arrowleft') { prevent(); seekBy(-5); return; }
        if (key === 'arrowright') { prevent(); seekBy(5); return; }
        // Volume
        if (key === 'arrowup') { prevent(); setVolume(0.05); return; }
        if (key === 'arrowdown') { prevent(); setVolume(-0.05); return; }
        // Rate change
        if (key === ',' && shift) { prevent(); uiState.playbackRateIndex = Math.max(0, uiState.playbackRateIndex - 1); applySettingsToAllVideos(); return; }
        if (key === '.' && shift) { prevent(); uiState.playbackRateIndex = Math.min(playbackRates.length - 1, uiState.playbackRateIndex + 1); applySettingsToAllVideos(); return; }
        // Frame step when paused
        if (key === ',' && video.paused) { prevent(); seekBy(-1 / 30); return; }
        if (key === '.' && video.paused) { prevent(); seekBy(1 / 30); return; }
        // Number seek (0-9)
        if ('0123456789'.includes(key)) {
          prevent();
          const digit = parseInt(key, 10);
          if (video.duration && isFinite(video.duration)) {
            const pct = digit === 0 ? 0 : digit / 10;
            try { video.currentTime = video.duration * pct; } catch (e) { /* ignore */ }
          }
          return;
        }
        // Captions toggle (placeholder)
        if (key === 'c') { prevent(); /* hook up to captions when available */ return; }
        // Opacity cycling placeholders
        if (key === 'o' || key === 'w' || key === '+' || key === '-') { prevent(); /* reserved for caption styling */ return; }
        // Theater mode analog (toggle tablet view)
        if (key === 't') { prevent(); if (!uiState.tabletView) setTabletView(true); else setTabletView(false); return; }
      }
      document.addEventListener('keydown', handleKeydown);

      function restoreOriginalMaterial() {
        try {
          if (overlayMesh && overlayMesh.parent) {
            const parent = overlayMesh.parent;
            parent.remove(overlayMesh);
            try { overlayMesh.geometry?.dispose?.(); } catch (e) { /* ignore */ }
            try { overlayMesh.material?.dispose?.(); } catch (e) { /* ignore */ }
            overlayMesh = null;
          }
          if (screenMesh && screenMesh.userData && screenMesh.userData._origMaterial) {
            screenMesh.material = screenMesh.userData._origMaterial;
            delete screenMesh.userData._origMaterial;
          }
        } catch (e) { console.warn('[VideoPlayer] restoreOriginalMaterial failed', e); }
      }

      function applyToMesh(mesh) {
        if (!mesh || !texture) return false;
        if (!mesh.userData._origMaterial) mesh.userData._origMaterial = mesh.material;
        // Remove old overlay if present
        if (overlayMesh && overlayMesh.parent) {
          const parent = overlayMesh.parent;
          parent.remove(overlayMesh);
          try { overlayMesh.geometry?.dispose?.(); } catch (e) { /* ignore */ }
          try { overlayMesh.material?.dispose?.(); } catch (e) { /* ignore */ }
          overlayMesh = null;
        }
        // Create a dedicated overlay plane (16:9 fit) to avoid stretching
        try {
          const created = createScreenOverlay({ screenMesh: mesh, texture, gridCanvas, renderer });
          if (created) { overlayMesh = created; return true; }
        } catch (e) { /* ignore overlay failure */ }
        // fallback: apply directly
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (mat) {
          mat.map = texture;
          try { mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.0; mat.emissiveMap = texture; } catch (e) { /* ignore */ }
          mat.needsUpdate = true;
          return true;
        }
        return false;
      }

      function applyToMeshById(idOrName) {
        if (!tabletGroup) return false;
        let found = null;
        tabletGroup.traverse((node) => {
          if (!node.isMesh) return;
          if (node.uuid === idOrName || node.name === idOrName || (node.name && node.name.indexOf(idOrName) !== -1)) {
            found = node;
          }
        });
        if (!found) return false;
        return applyToMesh(found);
      }

      const api = {
        canvas: gridCanvas,
        texture,
        setPlaybackRate(rate) { return rate; },
        setPreservePitch(v) { return !!v; },
        reset() { description = 'Hover a thumbnail to preview a random snippet.'; },
        applyToMesh,
        applyToMeshById,
        restoreOriginalMaterial,
        destroy() {
          dom.removeEventListener('pointermove', handlePointerMove);
          dom.removeEventListener('pointerleave', handlePointerLeave);
          dom.removeEventListener('click', handleClick);
          dom.removeEventListener('pointerdown', handlePointerDown);
          dom.removeEventListener('pointerup', handlePointerUp);
          try { window.removeEventListener('pointermove', handleGlobalPointerMove); } catch (e) { /* ignore */ }
          try { document.removeEventListener('keydown', handleKeydown); } catch (e) { /* ignore */ }
          restoreOriginalMaterial();
        }
      };

      try { window.__videoPlayerLastApi = api; } catch (e) { /* ignore */ }
      return api;
    },

    version: '1.0.0'
  };

  // Export as ES6 module
  export default VideoPlayer;
