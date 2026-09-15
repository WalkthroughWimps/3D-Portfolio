import * as THREE from 'three';

const smoothstep = (value) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    // Zero velocity and acceleration at both ends of each phase.
    return t * t * t * (t * (t * 6 - 15) + 10);
};

// Kept as a compatibility export for older debug pages.  The audited camera
// path is continuous and has no middle hold.
export const COMFORT_HOLD_MS = 0;

// End at an orbit-compatible pose so enabling controls does not move the camera.
export function createCameraTransition(camera, controls, positions, rotations, target, durationMs, startTime) {
    const points = positions.map((point) => new THREE.Vector3(...point));
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const quaternions = rotations.map((rotation) => new THREE.Quaternion(...rotation).normalize());
    const startPositionOffset = camera.position.clone().sub(points[0]);
    const startQuaternion = camera.quaternion.clone();
    const orbitTarget = target.clone();
    const endOffset = points.at(-1).clone().sub(orbitTarget);
    const radius = THREE.MathUtils.clamp(endOffset.length(), controls.minDistance, controls.maxDistance);
    endOffset.setLength(radius);
    const endPositionOffset = orbitTarget.clone().add(endOffset).sub(points.at(-1));
    const lookMatrix = new THREE.Matrix4();
    const lookQuaternion = new THREE.Quaternion();
    const movementMs = Math.max(1, durationMs);
    const totalMs = movementMs;

    return {
        target: orbitTarget,
        sample(now) {
            const elapsed = THREE.MathUtils.clamp(now - startTime, 0, totalMs);
            const progress = elapsed / totalMs;
            // One global easing curve prevents a zero-velocity stop in the
            // middle while retaining soft start/end motion.
            const t = smoothstep(progress);
            const endBlend = smoothstep((t - 0.65) / 0.35);
            camera.position.copy(curve.getPoint(t))
                .addScaledVector(startPositionOffset, 1 - smoothstep(t / 0.35))
                .addScaledVector(endPositionOffset, endBlend);
            const index = t * (quaternions.length - 1);
            const lower = Math.floor(index);
            camera.quaternion.copy(quaternions[lower]).slerp(quaternions[Math.min(lower + 1, quaternions.length - 1)], index - lower);
            camera.quaternion.slerp(startQuaternion, 1 - smoothstep(t / 0.2));
            lookMatrix.lookAt(camera.position, orbitTarget, camera.up);
            lookQuaternion.setFromRotationMatrix(lookMatrix);
            camera.quaternion.slerp(lookQuaternion, endBlend);
            camera.updateMatrixWorld(true);
            return progress;
        }
    };
}
