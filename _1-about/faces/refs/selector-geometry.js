/** Dimensions shared by the plate mechanism and its stationary housing. */
export function getRefsSelectorGeometry(config, cabinet) {
  const portrait = cabinet.faceFrames.portrait;
  const rx = Math.max(.01, portrait.width * .44);
  const rz = Math.max(.01, portrait.height * .44);
  const frontY = cabinet.frontY + Math.min(.012, cabinet.depth * .2);
  const available = Math.max(.004, cabinet.rearY - frontY - .012);
  const spacing = Math.min(config.plateSpacing, available / config.plateCount);
  const thickness = Math.min(.006, spacing * .55,
    Math.max(.002, cabinet.depth * .14));
  const labelOffset = Math.min(.001, spacing * .18);
  const rimOffset = Math.min(.0005, spacing * .08);
  const frontProjection = Math.max(thickness / 2 + labelOffset,
    thickness * .68 + rimOffset);
  const envelope = thickness / 2 + frontProjection;
  const freeGap = spacing - envelope;
  const cradleHalf = Math.min(thickness * .18, freeGap * .2);
  const cradleOffset = thickness / 2 + cradleHalf + freeGap * .12;
  const angle = config.selectorAngle * Math.PI / 180;
  // Both C shells, their rolled edges, and the grabber live beyond the plate rim.
  const cageInnerScale = 1.065;
  const cageOuterScale = 1.12;
  const cageLip = Math.min(.002, Math.max(.0008, Math.min(rx, rz) * .012));
  const outerX = Math.max(rx,
    Math.hypot(rx * Math.cos(angle), rz * Math.sin(angle))) * cageOuterScale + cageLip;
  const margin = Math.max(.006, rx * .025);
  const armReach = Math.max(rz * (cageOuterScale + .035),
    (outerX + margin / 2) / Math.sin(angle));
  const openSeparation = 2 * armReach * Math.sin(angle);
  return {cx: portrait.x, cz: portrait.z, rx, rz, frontY,
    spacing, thickness, envelope, cradleHalf, cradleOffset, armReach,
    cageInnerScale, cageOuterScale, cageLip, cageOuterX: outerX,
    withdrawTravel: openSeparation, openClearance: openSeparation - 2 * outerX,
    labelOffset, rimOffset, storageY: Array.from({length: config.plateCount},
      (_, i) => frontY + spacing * (i + 1))};
}
