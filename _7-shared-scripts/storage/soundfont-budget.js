export const DEFAULT_BUDGET_BYTES = 250000000;
export function chargedBytes(payloadBytes) { return payloadBytes + Math.max(1048576, Math.ceil(payloadBytes * 0.05)); }
export function packageBytes(pkg) { return pkg.files.reduce((sum, file) => sum + file.size, 0); }
export function assessPackage(pkg, usedBytes = 0, budgetBytes = DEFAULT_BUDGET_BYTES) {
  const payloadBytes = packageBytes(pkg);
  const requiredBytes = chargedBytes(payloadBytes);
  return Object.freeze({ payloadBytes, requiredBytes, usedBytes, budgetBytes,
    fits: usedBytes + requiredBytes <= budgetBytes,
    shortfallBytes: Math.max(0, usedBytes + requiredBytes - budgetBytes) });
}
