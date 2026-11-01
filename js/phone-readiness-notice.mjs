const STORAGE_KEY = 'phone-readiness-notice-seen-v1';
const NOTICE_ID = 'phone-readiness-notice';

function isPhoneLike() {
    if (navigator.userAgentData?.mobile === true) return true;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile/i.test(ua)) return true;
    return matchMedia('(max-width: 600px) and (pointer: coarse)').matches;
}

function wasSeen() {
    if (window.__phoneReadinessNoticeSeen) return true;
    for (const name of ['localStorage', 'sessionStorage']) {
        try {
            if (window[name].getItem(STORAGE_KEY) === '1') return true;
        } catch { /* Private browsing or disabled storage. */ }
    }
    return false;
}

function markSeen() {
    window.__phoneReadinessNoticeSeen = true;
    for (const name of ['localStorage', 'sessionStorage']) {
        try {
            window[name].setItem(STORAGE_KEY, '1');
        } catch { /* The in-memory flag still prevents duplicates on this page. */ }
    }
}

export function showPhoneReadinessNotice() {
    if (!isPhoneLike() || wasSeen() || document.getElementById(NOTICE_ID)) return;

    const style = document.createElement('style');
    style.id = `${NOTICE_ID}-style`;
    style.textContent = `
        #${NOTICE_ID} {
            position: fixed;
            z-index: 1000;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
            left: max(12px, env(safe-area-inset-left, 0px));
            right: max(12px, env(safe-area-inset-right, 0px));
            box-sizing: border-box;
            max-width: 440px;
            max-height: min(40dvh, 170px);
            margin-inline: auto;
            overflow-y: auto;
            padding: 14px 58px 14px 16px;
            border: 1px solid #8eb8d1;
            border-color: var(--secondary-color, #8eb8d1);
            border-radius: 12px;
            background: #102b3d;
            background: color-mix(in srgb, var(--primary-color, #102b3d) 35%, #102b3d);
            color: #fff;
            box-shadow: 0 5px 18px #0009;
            font: 15px/1.4 system-ui, sans-serif;
        }
        #${NOTICE_ID} strong { display: block; font-size: 16px; margin-bottom: 3px; }
        #${NOTICE_ID} p { margin: 0; }
        #${NOTICE_ID} button {
            position: absolute;
            top: 6px;
            right: 6px;
            width: 44px;
            height: 44px;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: inherit;
            font: 28px/1 system-ui, sans-serif;
            cursor: pointer;
        }
        #${NOTICE_ID} button:focus-visible { outline: 3px solid #fff; outline-offset: -4px; }
    `;

    const notice = document.createElement('aside');
    notice.id = NOTICE_ID;
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    const title = document.createElement('strong');
    title.textContent = 'Phone version not ready yet';
    const message = document.createElement('p');
    message.textContent = 'This site is still being prepared for phones. For the best experience, visit on a desktop.';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss phone notice');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => {
        notice.remove();
        style.remove();
    }, { once: true });
    notice.append(title, message, dismiss);
    document.head.append(style);
    document.body.append(notice);
    markSeen();
}
