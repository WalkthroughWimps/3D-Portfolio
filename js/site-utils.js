const DEFAULT_MUTED_REASON = "Audio muted for copyright reasons.";

// This blocking head script selects the saved header layout before its markup
// can paint. The shared settings store takes over once bootstrap mounts.
try {
    document.documentElement.dataset.initialHeaderLayout =
        localStorage.getItem('site.header.useLegacy') === 'true' ? 'legacy' : 'modern';
    document.documentElement.dataset.initialNavbarLayout =
        localStorage.getItem('site.header.useLegacyNavbar') === 'true' ? 'legacy' : 'modern';
} catch {
    document.documentElement.dataset.initialHeaderLayout = 'modern';
    document.documentElement.dataset.initialNavbarLayout = 'modern';
}

// Conditional utilities must not paint in their old positions while the shared
// shell is loading. A genuine startup failure restores the HTML alternatives.
function revealStartupAlternatives(event) {
    document.documentElement.dataset.uiStartupFailed = 'true';
    const entry = document.getElementById('portfolioEntry');
    if (entry && (event.type === 'site:startup-failed' || !document.body.classList.contains('start-entry-ready'))) {
        entry.hidden = false;
        entry.inert = false;
        document.body.classList.add('start-entry-active');
        const scene = document.getElementById('settingsControllerScene');
        if (scene) { scene.inert = true; scene.setAttribute('aria-hidden', 'true'); }
    }
}
window.addEventListener('site:startup-failed', revealStartupAlternatives);
window.addEventListener('error', event => {
    if (event.target === window || event.target?.matches?.('script[type="module"]')) revealStartupAlternatives(event);
}, true);

// Site controls reserve right click for their own interactions.
document.addEventListener('contextmenu', event => event.preventDefault(), { capture: true });

function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

function formatMutedAudioAttribution(options = {}) {
    const {
        mutedReason = DEFAULT_MUTED_REASON,
        musicTitle,
        sourceTitle,
        sourceType,
        preferItalics = false,
        addFinalPeriod = false,
    } = options;

    const reason = clean(mutedReason) || DEFAULT_MUTED_REASON;
    const title = clean(musicTitle);
    if (!title) {
        return reason;
    }

    const source = clean(sourceTitle);
    const type = clean(sourceType).toLowerCase();
    const applyStyle = preferItalics ? (text) => text : (text) => text;
    const formattedTitle = applyStyle(title);

    let reference = `Music reference: ${formattedTitle}`;
    if (source) {
        const suffix = type === "soundtrack" ? " soundtrack" : "";
        reference += ` (${source}${suffix})`;
    }

    let output = `${reason} ${reference}`;
    if (addFinalPeriod && !output.endsWith(".")) {
        output += ".";
    }

    return output;
}

function renderMutedAudioAttribution(target, options = {}) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) {
        console.warn("[site-utils] renderMutedAudioAttribution target not found:", target);
        return null;
    }

    const text = formatMutedAudioAttribution(options);
    element.textContent = text;
    return text;
}

function drawTextToCanvas(canvas, text, opts = {}) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const {
        padding = 24,
        font = "24px system-ui",
        lineHeight = 32,
        color = "#FFFFFF",
        background = "rgba(0,0,0,0.65)",
        maxWidth = Math.max(0, canvas.width - padding * 2),
    } = opts;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.font = font;
    context.fillStyle = color;
    context.textBaseline = "top";

    const words = String(text || "").split(/\s+/).filter(Boolean);
    let line = "";
    let y = padding;

    const flushLine = (value) => {
        context.fillText(value, padding, y);
        y += lineHeight;
    };

    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > maxWidth && line) {
            flushLine(line);
            line = word;
        } else {
            line = candidate;
        }
    }

    if (line) {
        flushLine(line);
    }

    return canvas;
}

let cachedAttributions = null;
let cachedUrl = null;
let loadingPromise = null;

async function loadAttributions(url = "/data/attributions.json") {
    const resolvedUrl = url || "/data/attributions.json";
    if (cachedAttributions && cachedUrl === resolvedUrl) {
        return cachedAttributions;
    }
    if (loadingPromise && cachedUrl === resolvedUrl) {
        return loadingPromise;
    }

    cachedUrl = resolvedUrl;
    loadingPromise = fetch(resolvedUrl, { cache: "no-cache" })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to load attributions (${response.status})`);
            }
            return response.json();
        })
        .then((json) => {
            cachedAttributions = json;
            return json;
        })
        .catch((error) => {
            console.warn("[site-utils] loadAttributions failed", error);
            loadingPromise = null;
            cachedAttributions = null;
            throw error;
        });
    return loadingPromise;
}

function getAttribution(assetKey) {
    if (!assetKey || !cachedAttributions) return null;
    return cachedAttributions[assetKey] || null;
}

function formatFullAttribution(entry = {}) {
    if (!entry || typeof entry !== "object") return "";
    const precomputed = clean(entry.attributionText);
    if (precomputed) {
        return precomputed;
    }

    const title = clean(entry.trackTitle);
    const creator = clean(entry.creatorName);
    const creatorUrl = clean(entry.creatorUrl);
    const license = clean(entry.licenseName);
    const licenseUrl = clean(entry.licenseUrl);
    const sourceUrl = clean(entry.sourceUrl);
    const changes = clean(entry.changesMade);
    const isrc = clean(entry.isrc);

    const segments = [];
    if (title) {
        segments.push(`"${title}"`);
    }
    if (creator) {
        let piece = `by ${creator}`;
        if (creatorUrl) {
            piece += ` (${creatorUrl})`;
        }
        segments.push(piece);
    }
    if (license) {
        let piece = `licensed under ${license}`;
        if (licenseUrl) {
            piece += ` (${licenseUrl})`;
        }
        segments.push(piece);
    }

    let output = segments.join(". ");
    const suffixes = [];
    if (sourceUrl) suffixes.push(`Source: ${sourceUrl}`);
    if (isrc) suffixes.push(`ISRC: ${isrc}`);
    if (changes) suffixes.push(`Changes: ${changes}`);

    if (suffixes.length) {
        output = output ? `${output}. ${suffixes.join(". ")}` : suffixes.join(". ");
    }

    return output.trim();
}

function appendText(fragment, text) {
    if (text) {
        fragment.appendChild(document.createTextNode(text));
    }
}

function appendLink(fragment, label, href, opts = {}) {
    if (!href) {
        appendText(fragment, label);
        return;
    }
    const anchor = document.createElement("a");
    anchor.textContent = label;
    anchor.href = href;
    anchor.target = opts.linkTarget || "_blank";
    anchor.rel = opts.linkRel || "noreferrer noopener";
    fragment.appendChild(anchor);
}

function renderFullAttribution(target, entry, opts = {}) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) {
        console.warn("[site-utils] renderFullAttribution target not found:", target);
        return null;
    }

    const missingText = clean(opts.missingText);
    const fragment = document.createDocumentFragment();

    if (!entry || typeof entry !== "object") {
        if (missingText) {
            appendText(fragment, missingText);
        }
        element.replaceChildren(fragment);
        return null;
    }

    const title = clean(entry.trackTitle);
    const creator = clean(entry.creatorName);
    const creatorUrl = clean(entry.creatorUrl);
    const license = clean(entry.licenseName);
    const licenseUrl = clean(entry.licenseUrl);
    const sourceUrl = clean(entry.sourceUrl);
    const changes = clean(entry.changesMade);
    const isrc = clean(entry.isrc);

    let hasContent = false;

    if (title) {
        appendText(fragment, `"${title}"`);
        hasContent = true;
    }

    if (creator) {
        if (hasContent) appendText(fragment, " ");
        appendText(fragment, "by ");
        appendLink(fragment, creator, creatorUrl, opts);
        hasContent = true;
    }

    if (license) {
        if (hasContent) appendText(fragment, ". ");
        appendText(fragment, "Licensed under ");
        appendLink(fragment, license, licenseUrl, opts);
        hasContent = true;
    }

    if (sourceUrl) {
        if (hasContent) appendText(fragment, ". ");
        appendText(fragment, "Source: ");
        appendLink(fragment, sourceUrl, sourceUrl, opts);
        hasContent = true;
    }

    if (isrc) {
        if (hasContent) appendText(fragment, ". ");
        appendText(fragment, `ISRC: ${isrc}`);
        hasContent = true;
    }

    if (changes) {
        if (hasContent) appendText(fragment, ". ");
        appendText(fragment, `Changes: ${changes}`);
        hasContent = true;
    }

    if (!hasContent && missingText) {
        appendText(fragment, missingText);
    }

    element.replaceChildren(fragment);
    return entry;
}

async function renderFullAttributionByKey(target, assetKey, opts = {}) {
    if (!assetKey) {
        console.warn("[site-utils] renderFullAttributionByKey requires assetKey", target);
        renderFullAttribution(target, null, opts);
        return null;
    }

    try {
        const url = opts.dataUrl || opts.url;
        await loadAttributions(url);
        const entry = getAttribution(assetKey);
        if (!entry) {
            console.warn(`[site-utils] attribution not found for key: ${assetKey}`);
        }
        return renderFullAttribution(target, entry, opts);
    } catch (error) {
        console.warn("[site-utils] renderFullAttributionByKey failed", error);
        renderFullAttribution(target, null, opts);
        return null;
    }
}

const siteUtils = window.SiteUtils || {};
siteUtils.formatMutedAudioAttribution = formatMutedAudioAttribution;
siteUtils.renderMutedAudioAttribution = renderMutedAudioAttribution;
siteUtils.drawTextToCanvas = drawTextToCanvas;
siteUtils.loadAttributions = loadAttributions;
siteUtils.getAttribution = getAttribution;
siteUtils.formatFullAttribution = formatFullAttribution;
siteUtils.renderFullAttribution = renderFullAttribution;
siteUtils.renderFullAttributionByKey = renderFullAttributionByKey;
window.SiteUtils = siteUtils;

// Defer the import itself: this head script runs before some route import maps.
// Header layout selection above must stay synchronous; module loading must wait.
const startPhoneNotice = () => import('./phone-readiness-notice.mjs')
    .then(({ showPhoneReadinessNotice }) => showPhoneReadinessNotice())
    .catch(error => console.warn('[site-utils] phone notice unavailable', error));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPhoneNotice, { once: true });
else startPhoneNotice();

// Every site page shares the same sound choice, including pages without media controls.
const siteRootPath = new URL('../', document.currentScript?.src || location.href).pathname;
const siteRoute = location.pathname.startsWith(siteRootPath)
    ? location.pathname.slice(siteRootPath.length).replace(/\/+$/, '')
    : location.pathname.replace(/^\/+|\/+$/g, '');
if (siteRoute && siteRoute !== 'index.html') {
    const offerSoundConsent = () => {
        import('../_7-shared-scripts/audio-consent.js')
            .then(({ getAudioConsentState, ensureAudioConsentPrompt }) => {
                if (getAudioConsentState().shouldPrompt) return ensureAudioConsentPrompt();
                return undefined;
            })
            .catch(error => console.warn('[site-utils] sound consent prompt unavailable', error));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', offerSoundConsent, { once: true });
    else offerSoundConsent();
}
