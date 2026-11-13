/** Grid size for a view: the longer side gets `resolution` cells. */
export function simulationSize(
  resolution: number,
  width: number,
  height: number,
): { width: number; height: number } {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const long = Math.max(16, Math.round(resolution));
  if (aspect >= 1) return { width: long, height: Math.max(12, Math.round(long / aspect)) };
  return { width: Math.max(12, Math.round(long * aspect)), height: long };
}
