// Global site configuration (non-a11y settings)
window.siteConfig = window.siteConfig || {};

// Site-wide media preferences
window.siteConfig.autoplayApproved = true; // Jump page handles audio permission, so auto-approve here
window.siteConfig.soundEnabled = true;     // Global sound enable/disable
window.siteConfig.volume = 1.0;            // Master volume level (0.0 - 1.0)
window.siteConfig.audioSyncMs = -270;      // Global audio sync offset in milliseconds

// Site-wide theme preferences
window.siteConfig.colorTheme = 'default';  // Color theme identifier
window.siteConfig.animations = true;       // Enable/disable animations site-wide

// Base URL for externally hosted media (leave empty for local-relative behavior)
window.siteConfig.MEDIA_BASE = window.siteConfig.MEDIA_BASE || '';

// Helper to resolve media paths: if MEDIA_BASE is set, join base + path, else return the original path
window.mediaUrl = function (path) {
	const base = (window.siteConfig && window.siteConfig.MEDIA_BASE) ? String(window.siteConfig.MEDIA_BASE).replace(/\/+$/,'') : '';
	if (!base) return path;
	return base + '/' + String(path).replace(/^\/+/, '');
};
