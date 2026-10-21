// Frame conversion and easing shared by the controller's authored UI and camera tracks.
// The clip getter stays live because GLTF loading assigns the clip after scene setup.
export function createStartCameraFlow({ getClip, totalFrames, cameraStartFrame, cameraEndFrame }) {
    function frameToTime(frame) {
        const clip = getClip();
        if(!clip) return 0;
        const clamped = Math.min(Math.max(frame, 1), totalFrames);
        return ((clamped - 1) / (totalFrames - 1)) * clip.duration;
    }

    function timeToFrame(time) {
        const clip = getClip();
        if(!clip) return 1;
        const ratio = clip.duration ? time / clip.duration : 0;
        return 1 + ratio * (totalFrames - 1);
    }

    function frameToClipTime(frame, clipItem, startFrame, endFrame) {
        if(!clipItem) return 0;
        const span = Math.max(1, endFrame - startFrame);
        const clamped = Math.min(Math.max(frame, startFrame), endFrame);
        return ((clamped - startFrame) / span) * clipItem.duration;
    }

    function getCameraHoldTime(clipItem) {
        if(!clipItem) return 0;
        const base = frameToClipTime(cameraEndFrame, clipItem, cameraStartFrame, cameraEndFrame);
        const end = Math.max(0, clipItem.duration - 1e-4);
        return Math.min(base, end);
    }

    return { frameToTime, timeToFrame, frameToClipTime, getCameraHoldTime };
}

export function easeInOutPower(t, power) {
    const p = Math.max(0.5, Math.min(6, power || 3));
    return t < 0.5
        ? Math.pow(2 * t, p) / 2
        : 1 - Math.pow(-2 * t + 2, p) / 2;
}
