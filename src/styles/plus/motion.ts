// The plus-specific part of the motion model; the rest is shared with other
// grid styles in shared/grid.ts.

/** atan(r) for r in [-1, 1], within 1e-5 rad: much cheaper than Math.atan2. */
function atanUnit(r: number): number {
  const r2 = r * r;
  return r * (0.99997726 + r2 * (-0.33262347 + r2 * (0.19354346 + r2 * (-0.11643287 + r2 * (0.05265332 - 0.0117212 * r2)))));
}

/**
 * The smallest turn that points one of a sign's arms along (dx, dy). A "+"
 * looks the same every 90°, so this is always within ±45°.
 */
export function facingAngle(dx: number, dy: number): number {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= ay) return ax === 0 ? 0 : atanUnit(dy / dx);
  // Steeper than 45°: the vertical arm is closer, a quarter turn away from the horizontal one.
  return -atanUnit(dx / dy);
}
