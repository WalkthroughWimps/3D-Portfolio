/** Turn the host cube while keeping the current OrbitControls target on its cube-local point. */
export function rotateCubeAtOrbitTarget(cube, camera, controls, rotate) {
  cube.updateMatrixWorld(true);
  const anchor = cube.worldToLocal(controls.target.clone());
  const before = controls.target.clone();
  rotate();
  cube.updateMatrixWorld(true);
  const shift = cube.localToWorld(anchor).sub(before);
  camera.position.add(shift);
  controls.target.add(shift);
  return shift;
}
