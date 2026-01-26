import { assetUrl, isLocalDev } from "./assets-config.js";
import { loadDebugIfEnabled } from "./debug/debug-loader.js";
const isLocalHost = isLocalDev();
const ATTRIBUTION_TEST_CASES = [
    { musicTitle: "Pas Si Simple", sourceTitle: "Amelie", sourceType: "soundtrack" },
    { musicTitle: "Any Song (parody)", sourceTitle: "Zico", sourceType: "" },
    { musicTitle: "Mystery Track", sourceTitle: "", sourceType: "soundtrack" },
    { musicTitle: "", sourceTitle: "Whatever", sourceType: "soundtrack" },
    { musicTitle: "   Trim Me   ", sourceTitle: "  Some Film  ", sourceType: "soundtrack" },
    { musicTitle: "No SourceType", sourceTitle: "A Film", sourceType: null },
];
const FULL_ATTR_TEST_KEYS = [
    "test_full_complete",
    "test_full_missing_creator_url",
    "test_full_missing_license_url"
];
if (isLocalHost) {
    window.setAssetsBase = (urlOrBlank) => {
        if (!urlOrBlank) {
            localStorage.removeItem("ASSETS_BASE");
        } else {
            localStorage.setItem("ASSETS_BASE", String(urlOrBlank));
        }
        location.reload();
    };
    window.clearAssetsBase = () => {
        localStorage.removeItem("ASSETS_BASE");
        location.reload();
    };
}
// Bind controls to SiteA11y and implement jump UI with visualizer
(function(){
    // Helper storage keys
    const AUDIO_ALLOWED_KEY = 'site.audio.allowed';
    const AUDIO_VOLUME_KEY = 'site.audio.volume';
    const AUDIO_SYNC_KEY = 'site.audio.sync';
    const AUDIO_MUTED_KEY = 'site.audio.muted';

    // File paths (relative to site root)
    const MEDIA = {
        counts: {
            video: assetUrl('Videos/start-page/counting-hq.webm'),
            audio: assetUrl('Videos/start-page/counting.opus')
        },
        alphabet: {
            video: assetUrl('Videos/start-page/alphabet-hq.webm'),
            audio: assetUrl('Videos/start-page/alphabet.opus')
        }
    };

    // Elements
    const saveBtn = document.getElementById('save_a11y');
    const resetBtn = document.getElementById('reset_a11y');
    const permModal = document.getElementById('permissionModal');
    const permAllow = document.getElementById('permAllow');
    const permDeny = document.getElementById('permDeny');
    const jumpContainer = document.getElementById('jumpContainer');
    const jumpVideo = document.getElementById('jumpVideo');
    const jumpAudio = document.getElementById('jumpAudio');
    const syncSlider = document.getElementById('syncSlider');
    const syncLeft = document.getElementById('syncLeft');
    const syncRight = document.getElementById('syncRight');
    const syncDisplay = document.getElementById('syncDisplay');
    const volumeSlider = document.getElementById('volumeSlider');
    const volDown = document.getElementById('volDown');
    const volUp = document.getElementById('volUp');
    const volumeDisplay = document.getElementById('volumeDisplay');
    const tabNumbers = document.getElementById('tab-numbers');
    const tabAlphabet = document.getElementById('tab-alphabet');
    const nextBtn = document.getElementById('nextBtn');
    const a11ySection = document.getElementById('a11ySection');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const leadText = document.getElementById('leadText');

    const topTabA11y = document.getElementById('topTabA11y');
    const topTabAudio = document.getElementById('topTabAudio');
    const tabInfo = document.getElementById('tabInfo');

    function setTabInfo(text){
        if(tabInfo){
            tabInfo.textContent = text;
        }
    }

    // Modal elements
    const modalTabA11y = document.getElementById('modalTabA11y');
    const modalTabAudio = document.getElementById('modalTabAudio');
    const modalA11yContent = document.getElementById('modalA11yContent');
    const modalAudioContent = document.getElementById('modalAudioContent');
    const modalSync = document.getElementById('modalSync');
    const modalClose = document.getElementById('modalClose');
    const modalClose2 = document.getElementById('modalClose2');
    const modalSaveA11y = document.getElementById('modalSaveA11y');

    // Visualizer
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    const vizDb = document.getElementById('vizDb');

    // WebAudio nodes
    let audioCtx = null;
    let mediaSource = null; // from jumpAudio
    let analyser = null;
    let delayNode = null;
    let destinationGain = null;
    let suppressVolumeEvent = false;
    let vizPeakDb = -Infinity;
    let vizPeakColor = '#2aa198';

    // State
    let currentVideoKey = 'counts';
    let storedVolume = parseFloat(localStorage.getItem(AUDIO_VOLUME_KEY) || '0.25');
    let storedMuted = (localStorage.getItem(AUDIO_MUTED_KEY) === 'true');
    // default sync to 270 ms if nothing stored
    let storedSync = parseInt(localStorage.getItem(AUDIO_SYNC_KEY) || '270', 10);
    let isOrchestrating = false;

    // Initialize UI values
    syncSlider.value = storedSync;
    if(modalSync) modalSync.value = storedSync;
    syncDisplay.textContent = `Sync: ${storedSync} ms`;

    function showPermissionIfNeeded(){
        const allowed = localStorage.getItem(AUDIO_ALLOWED_KEY);
        if(allowed === null){
            permModal.classList.remove('hidden');
            permModal.style.display = 'flex';
        }
    }

    permAllow.addEventListener('click', async ()=>{
        localStorage.setItem(AUDIO_ALLOWED_KEY, 'true');
        localStorage.setItem(AUDIO_MUTED_KEY, 'false');
        storedMuted = false;
        storedVolume = 0.25;
        localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
        ensureAudioRouting();
        applyVolumeAndMuted();
        try{ await audioCtx.resume(); }catch(e){}
    });
    permDeny.addEventListener('click', ()=>{
        localStorage.setItem(AUDIO_ALLOWED_KEY, 'false');
        permModal.classList.add('hidden');
        permModal.style.display = 'none';
    });

    // Create audio context and routing to apply delay to audio and visualizer
    function ensureAudioRouting(){
        if(audioCtx) return;
        try{
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            mediaSource = audioCtx.createMediaElementSource(jumpAudio);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            delayNode = audioCtx.createDelay(3.0); // max 3s
            destinationGain = audioCtx.createGain();
            // route: mediaSource -> delayNode -> destinationGain -> analyser -> audioCtx.destination
            mediaSource.connect(delayNode);
            delayNode.connect(destinationGain);
            destinationGain.connect(analyser);
            analyser.connect(audioCtx.destination);
            applySyncValue(storedSync);
            applyVolumeAndMuted();
            startVisualizer();
        }catch(e){
            // WebAudio not supported or blocked
            audioCtx = null;
            mediaSource = null;
            analyser = null;
            delayNode = null;
            destinationGain = null;
        }
    }
    function resumeAudioContext(){
        if(audioCtx && audioCtx.state === 'suspended'){
            audioCtx.resume().catch(()=>{});
        }
    }

    function applySyncValue(ms){
        storedSync = parseInt(ms, 10) || 0;
        localStorage.setItem(AUDIO_SYNC_KEY, String(storedSync));
        syncDisplay.textContent = `Sync: ${storedSync} ms`;

        if(window.siteConfig) window.siteConfig.audioSyncMs = storedSync;

        if(!audioCtx || !delayNode) return;
        const audioDelaySec = Math.max(0, storedSync/1000);
        delayNode.delayTime.value = audioDelaySec;
        if(isPlaying) syncWhilePlaying();
    }

    function applyVolumeAndMuted(){
        // When WebAudio available use gain node and keep native element muted to avoid double audio.
        if(destinationGain){
            destinationGain.gain.value = storedMuted ? 0 : storedVolume;
            try{ jumpAudio.muted = false; }catch(e){}
            try{
                suppressVolumeEvent = true;
                jumpVideo.muted = true;
            }catch(e){} finally { suppressVolumeEvent = false; }
        }else{
            try{ jumpAudio.muted = false; jumpVideo.muted = storedMuted; jumpVideo.volume = storedVolume; }catch(e){}
        }
        // persist
        localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
        localStorage.setItem(AUDIO_MUTED_KEY, storedMuted ? 'true':'false');
        updateVolumeUI();
        resetPeakHold();
    }

    function updateVolumeUI(){
        if(volumeSlider){
            volumeSlider.value = Math.round(storedVolume * 100);
        }
        if(volumeDisplay){
            volumeDisplay.textContent = `Volume: ${Math.round(storedVolume * 100)}%`;
        }
    }

    function setVolumeFromPercent(percent){
        const clamped = Math.max(0, Math.min(100, percent));
        storedVolume = clamped / 100;
        storedMuted = storedVolume === 0;
        resumeAudioContext();
        applyVolumeAndMuted();
    }

    function resetPeakHold(){
        vizPeakDb = -Infinity;
        vizPeakColor = '#2aa198';
    }

    function loadVideo(key){
        currentVideoKey = key;
        const media = MEDIA[key];
        // Pause both
        jumpVideo.pause();
        jumpAudio.pause();

        // Set sources on both elements
        while(jumpVideo.firstChild) jumpVideo.removeChild(jumpVideo.firstChild);
        while(jumpAudio.firstChild) jumpAudio.removeChild(jumpAudio.firstChild);
        const vsrc = document.createElement('source'); vsrc.src = media.video; vsrc.type = 'video/webm';
        const asrc = document.createElement('source'); asrc.src = media.audio; asrc.type = 'audio/ogg; codecs=opus';
        jumpVideo.appendChild(vsrc);
        jumpAudio.appendChild(asrc);
        jumpVideo.load();
        jumpAudio.load();

        // Recreate audio routing to new element
        if(audioCtx){
            try{ mediaSource.disconnect(); }catch(e){}
            try{ analyser.disconnect(); }catch(e){}
            try{ delayNode.disconnect(); }catch(e){}
            try{ destinationGain.disconnect(); }catch(e){}
            try{ mediaSource = audioCtx.createMediaElementSource(jumpAudio); mediaSource.connect(delayNode); }catch(e){}
            try{ delayNode.connect(destinationGain); destinationGain.connect(analyser); analyser.connect(audioCtx.destination); }catch(e){}
        }
        // apply persisted settings
        applyVolumeAndMuted();
        applySyncValue(storedSync);
    }

    function preloadMedia(){
        Object.values(MEDIA).forEach((media)=>{
            const preloadVideo = document.createElement('video');
            preloadVideo.preload = 'auto';
            preloadVideo.src = media.video;
            preloadVideo.load();

            const preloadAudio = document.createElement('audio');
            preloadAudio.preload = 'auto';
            preloadAudio.src = media.audio;
            preloadAudio.load();
        });
    }

    // Orchestrate playback so sync offset works both positive and negative
    let isPlaying = false;
    // Whether orchestration (separate audio element + WebAudio) is available and should be used.
    let orchestrationSupported = true;
    function startAudioForVideoPlayback(){
        ensureAudioRouting();
        resumeAudioContext();
        const sync = storedSync;
        const ct = jumpVideo.currentTime || 0;
        if(sync >= 0){
            if(jumpAudio.readyState >= 1){
                try{ jumpAudio.currentTime = ct; }catch(e){}
            }
            if(delayNode) delayNode.delayTime.value = sync / 1000;
        }else{
            if(delayNode) delayNode.delayTime.value = 0;
            const audioOffset = Math.abs(sync) / 1000;
            if(jumpAudio.readyState >= 1){
                try{ jumpAudio.currentTime = ct + audioOffset; }catch(e){}
            }
        }
        jumpAudio.play().catch(()=>{
            // Allow video-only playback if audio is blocked.
            orchestrationSupported = false;
        });
    }

    // When user presses the visible video's play control, intercept and orchestrate (if supported)
    jumpVideo.addEventListener('play', (e)=>{
        if(!orchestrationSupported){
            // allow native playback
            isPlaying = true;
            return;
        }
        startAudioForVideoPlayback();
        isPlaying = true;
    });
    jumpVideo.addEventListener('pause', ()=>{
        if(isPlaying){
            try{ jumpAudio.pause(); }catch(e){}
            isPlaying = false;
        }
    });

    // When user seeks using visible video's UI, update audio currentTime
    jumpVideo.addEventListener('seeked', ()=>{
        try{ jumpAudio.currentTime = jumpVideo.currentTime; }catch(e){}
    });

    // If sync changes while playing, adjust without restarting.
    function syncWhilePlaying(){
        if(!isPlaying || !orchestrationSupported) return;
        const ct = jumpVideo.currentTime || 0;
        if(storedSync >= 0){
            if(delayNode) delayNode.delayTime.value = storedSync / 1000;
            try{ jumpAudio.currentTime = ct; }catch(e){}
        }else{
            if(delayNode) delayNode.delayTime.value = 0;
            const audioOffset = Math.abs(storedSync) / 1000;
            try{
                const target = ct + audioOffset;
                const duration = jumpAudio.duration || 0;
                jumpAudio.currentTime = duration ? Math.min(target, Math.max(0, duration - 0.05)) : target;
            }catch(e){}
        }
    }

    // Visualizer draw loop
    let vizAnimation = null;
    function startVisualizer(){
        if(!analyser || !canvasCtx) return;
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        const width = canvas.width;
        const height = canvas.height;
        const minDb = -54;
        const maxDb = 0;
        const silentThreshold = minDb;

        function draw(){
            analyser.getByteTimeDomainData(dataArray);
            let peak = 0;
            for(let i=0;i<dataArray.length;i++){
                const centered = (dataArray[i] - 128) / 128;
                const abs = Math.abs(centered);
                if(abs > peak) peak = abs;
            }
            const db = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
            const isSilent = !(Number.isFinite(db)) || db <= silentThreshold;
            const clampedDb = isSilent ? minDb : Math.max(minDb, Math.min(maxDb, db));
            const norm = (clampedDb - minDb) / (maxDb - minDb);
            const level = norm * height;

            let meterColor = '#2aa198';
            if(db > -6){
                meterColor = '#e44b4b';
            }else if(db > -18){
                meterColor = '#e3c14a';
            }

            if(!isSilent && db > vizPeakDb){
                vizPeakDb = db;
                vizPeakColor = meterColor;
            }

            canvasCtx.clearRect(0,0,width,height);
            canvasCtx.fillStyle = meterColor;
            canvasCtx.fillRect(0, height - level, width, level);

                if(Number.isFinite(vizPeakDb)){
                    const peakClamped = Math.max(minDb, Math.min(maxDb, vizPeakDb));
                    const peakNorm = (peakClamped - minDb) / (maxDb - minDb);
                const peakY = height - (peakNorm * height);
                canvasCtx.fillStyle = vizPeakColor;
                canvasCtx.fillRect(0, Math.max(0, peakY - 1), width, 2);
            }

            if(vizDb){
                if(isSilent){
                    vizDb.textContent = 'dB: -ꝏ';
                }else{
                    vizDb.textContent = `dB: ${db.toFixed(1)}`;
                }
            }
            vizAnimation = requestAnimationFrame(draw);
        }
        if(!vizAnimation) draw();
    }
    function stopVisualizer(){ if(vizAnimation){ cancelAnimationFrame(vizAnimation); vizAnimation=null;} }

    // Event bindings
    saveBtn.addEventListener('click', ()=>{
        const reducedMotion = document.getElementById('a11y_reduced_motion').checked;
        const highContrast = document.getElementById('a11y_high_contrast').checked;
        const textScale = (document.querySelector('input[name="a11y_text"]:checked')?.value)||'normal';
        const focusOutline = document.getElementById('a11y_focus_outlines').checked ? 'always':'auto';
        try{ window.SiteA11y.set({ reducedMotion, highContrast, textScale, focusOutline }); }catch(e){}

        a11ySection.style.display = 'none';
        jumpContainer.style.display = 'block';
        topTabA11y.classList.remove('active');
        topTabAudio.classList.add('active');
        leadText.textContent = 'Please customize volume and audio sync for best comfort and accuracy.';

        showPermissionIfNeeded();
        loadVideo(currentVideoKey);
        updateA11yDebugFlags();
    });

    resetBtn.addEventListener('click', ()=>{
        try { localStorage.removeItem('site.a11y.settings'); } catch {}
        window.SiteA11y.apply(window.SiteA11y.get());
        hydrate();
        updateA11yDebugFlags();
    });

    // Top tabs behavior
    topTabA11y.addEventListener('click', ()=>{
        topTabA11y.classList.add('active'); topTabAudio.classList.remove('active');
        a11ySection.style.display = 'block';
        jumpContainer.style.display = 'none';
        leadText.textContent = 'Letâ€™s tune a few preferences so the site works best for you.';
    });
    topTabAudio.addEventListener('click', ()=>{
        topTabAudio.classList.add('active'); topTabA11y.classList.remove('active');
        a11ySection.style.display = 'none';
        jumpContainer.style.display = 'block';
        leadText.textContent = 'Please customize volume and audio sync for best comfort and accuracy.';
        loadVideo(currentVideoKey);
        showPermissionIfNeeded();
    });

    if(nextBtn){
        nextBtn.addEventListener('click', ()=>{
            window.location.href = 'about.html';
        });
    }

    // Video tabs
    tabNumbers.addEventListener('click', ()=>{ tabNumbers.classList.add('active'); tabAlphabet.classList.remove('active'); loadVideo('counts'); });
    tabAlphabet.addEventListener('click', ()=>{ tabAlphabet.classList.add('active'); tabNumbers.classList.remove('active'); loadVideo('alphabet'); });

    function bindStepButton(button, leftDelta, rightDelta, handler){
        if(!button) return;
        button.addEventListener('pointerup', (e)=>{
            if(e.button === 0){
                handler(leftDelta);
            }
        });
        button.addEventListener('contextmenu', (e)=>{
            e.preventDefault();
            handler(rightDelta);
        });
    }

    // Sync arrows
    function changeSyncBy(deltaMs){
        let v = parseInt(syncSlider.value,10) + deltaMs;
        v = Math.max(-3000, Math.min(3000, v));
        syncSlider.value = v; applySyncValue(v);
    }
    bindStepButton(syncLeft, -10, -50, changeSyncBy);
    bindStepButton(syncRight, 10, 50, changeSyncBy);

    // Volume arrows
    function changeVolumeBy(deltaPct){
        const currentPct = Math.round(storedVolume * 100);
        setVolumeFromPercent(currentPct + deltaPct);
    }
    bindStepButton(volDown, -1, -5, changeVolumeBy);
    bindStepButton(volUp, 1, 5, changeVolumeBy);

    // Sliders input
    syncSlider.addEventListener('input', (e)=>{ applySyncValue(e.target.value); if(modalSync) modalSync.value = e.target.value; });
    if(modalSync) modalSync.addEventListener('input', (e)=>{ applySyncValue(e.target.value); syncSlider.value = e.target.value; });
    window.addEventListener('syncOffsetChanged', (e)=>{
        const ms = parseInt(e?.detail?.offsetMs, 10) || 0;
        storedSync = ms;
        syncSlider.value = ms;
        if(modalSync) modalSync.value = ms;
        syncDisplay.textContent = `Sync: ${ms} ms`;
        applySyncValue(ms);
    });
    if(volumeSlider) volumeSlider.addEventListener('input', (e)=>{ setVolumeFromPercent(parseInt(e.target.value, 10)); });

    // Capture native volume/mute changes on the video and persist them across pages
    // Note: users will use visible video's controls; we map them to stored values
    jumpVideo.addEventListener('volumechange', ()=>{
        if(suppressVolumeEvent) return;
        const vol = jumpVideo.volume;
        const muted = jumpVideo.muted;
        storedVolume = vol;
        storedMuted = muted;
        applyVolumeAndMuted();
    });

    // When metadata loaded apply persisted settings
    jumpVideo.addEventListener('loadedmetadata', ()=>{ applyVolumeAndMuted(); });
    jumpAudio.addEventListener('loadedmetadata', ()=>{ applyVolumeAndMuted(); });

    // Fallback to native video playback if orchestration fails
    function fallbackToNativePlayback(){
        try{
            // ensure video is unmuted if user didn't mute
            jumpVideo.muted = storedMuted;
            jumpVideo.volume = storedVolume;
            // stop audio element
            try{ jumpAudio.pause(); }catch(e){}
            // play video natively
            jumpVideo.play().catch(()=>{});
        }catch(e){}
    }

    // Settings modal handlers
    settingsBtn.addEventListener('click', ()=>{ settingsModal.classList.add('open'); });
    modalClose.addEventListener('click', ()=>{ settingsModal.classList.remove('open'); });
    modalClose2.addEventListener('click', ()=>{ settingsModal.classList.remove('open'); });

    modalTabA11y.addEventListener('click', ()=>{
        modalTabA11y.classList.add('active'); modalTabAudio.classList.remove('active');
        modalA11yContent.classList.remove('hidden'); modalAudioContent.classList.add('hidden');
    });
    modalTabAudio.addEventListener('click', ()=>{
        modalTabAudio.classList.add('active'); modalTabA11y.classList.remove('active');
        modalAudioContent.classList.remove('hidden'); modalA11yContent.classList.add('hidden');
    });

    modalSaveA11y.addEventListener('click', ()=>{
        document.getElementById('a11y_reduced_motion').checked = document.getElementById('modal_a11y_reduced_motion').checked;
        document.getElementById('a11y_high_contrast').checked = document.getElementById('modal_a11y_high_contrast').checked;
        saveBtn.click();
        settingsModal.classList.remove('open');
    });

    // Hydrate function
    function hydrate(){
        const s = window.SiteA11y.get();
        document.getElementById('a11y_reduced_motion').checked = !!s.reducedMotion;
        document.getElementById('a11y_high_contrast').checked = !!s.highContrast;
        const val = s.textScale === 'large' ? 'large' : 'normal';
        [...document.querySelectorAll('input[name="a11y_text"]')].forEach(r=>{ r.checked = (r.value===val); });
        document.getElementById('a11y_focus_outlines').checked = (s.focusOutline === 'always');
    }

    function updateA11yDebugFlags(){
        if(typeof window.SiteA11y?.get !== 'function') return;
        const settings = window.SiteA11y.get();
        const flags = {
            'Reduced motion': settings.reducedMotion ? 'T' : 'F',
            'High contrast': settings.highContrast ? 'T' : 'F',
            'Large text': settings.textScale === 'large' ? 'T' : 'F',
            'Always focus outlines': settings.focusOutline === 'always' ? 'T' : 'F',
        };
        const actions = {};
        if(saveBtn) actions['Save a11y prefs'] = () => saveBtn.click();
        if(resetBtn) actions['Reset a11y prefs'] = () => resetBtn.click();
        if(typeof window.registerDebugHooks === 'function'){
            window.registerDebugHooks({ flags, actions });
        }
    }

    window.addEventListener('debug-ui-ready', updateA11yDebugFlags);
    updateA11yDebugFlags();

    document.addEventListener('DOMContentLoaded', ()=>{
        hydrate();
        showPermissionIfNeeded();
        storedVolume = parseFloat(localStorage.getItem(AUDIO_VOLUME_KEY) || storedVolume);
        storedMuted = (localStorage.getItem(AUDIO_MUTED_KEY) === 'true');
        storedSync = parseInt(localStorage.getItem(AUDIO_SYNC_KEY) || storedSync, 10);
        syncSlider.value = storedSync;
        if(modalSync) modalSync.value = storedSync;
        applySyncValue(storedSync);
        preloadMedia();
        loadVideo(currentVideoKey);
        if(localStorage.getItem(AUDIO_ALLOWED_KEY) === 'true'){
            storedMuted = false;
            storedVolume = 0.25;
            localStorage.setItem(AUDIO_MUTED_KEY, 'false');
            localStorage.setItem(AUDIO_VOLUME_KEY, String(storedVolume));
            ensureAudioRouting();
            applyVolumeAndMuted();
            jumpVideo.play().catch(()=>{});
        }
        if (window.SiteUtils) {
            ATTRIBUTION_TEST_CASES.forEach((test, index) => {
                SiteUtils.renderMutedAudioAttribution(`#attr-test-${index + 1}`, test);
            });
                SiteUtils.loadAttributions().then(() => {
                    FULL_ATTR_TEST_KEYS.forEach((key, index) => {
                        SiteUtils.renderFullAttributionByKey(`#full-attr-test-${index + 1}`, key, {
                            missingText: ""
                        });
                    });
                }).catch(() => {});
        }
    });
})();

if ("serviceWorker" in navigator) {
    if (isLocalHost) {
        const clearedKey = "sw_cleared_once";
        if (!sessionStorage.getItem(clearedKey)) {
            navigator.serviceWorker.getRegistrations().then((regs) => {
                if (!regs || !regs.length) return;
                return Promise.all(regs.map((r) => r.unregister())).then(() => {
                    sessionStorage.setItem(clearedKey, "true");
                    location.reload();
                });
            }).catch(() => {});
        }
    } else {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
}

loadDebugIfEnabled();
