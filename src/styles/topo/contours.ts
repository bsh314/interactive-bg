export type SegmentSink = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  level: number,
) => void;

/**
 * Marching squares over a regular grid of samples.
 *
 * `field` holds `cols * rows` samples in row-major order, spaced `cellSize`
 * apart. Contour lines are traced at every multiple of `step`; each segment is
 * passed to `emit` together with its integer level index (threshold / step).
 */
export function traceContours(
  field: ArrayLike<number>,
  cols: number,
  rows: number,
  cellSize: number,
  step: number,
  emit: SegmentSink,
): void {
  if (step <= 0) return;

  for (let j = 0; j < rows - 1; j++) {
    const y0 = j * cellSize;
    const y1 = y0 + cellSize;
    for (let i = 0; i < cols - 1; i++) {
      const idx = j * cols + i;
      // a ── b
      // │    │
      // d ── c
      const a = field[idx];
      const b = field[idx + 1];
      const c = field[idx + cols + 1];
      const d = field[idx + cols];

      const min = Math.min(a, b, c, d);
      const max = Math.max(a, b, c, d);
      const first = Math.ceil(min / step);
      const last = Math.floor(max / step);
      if (first > last) continue;

      const x0 = i * cellSize;
      const x1 = x0 + cellSize;

      for (let level = first; level <= last; level++) {
        const t = level * step;
        const code =
          (a >= t ? 8 : 0) | (b >= t ? 4 : 0) | (c >= t ? 2 : 0) | (d >= t ? 1 : 0);
        if (code === 0 || code === 15) continue;

        // Crossing points on each edge (only valid when that edge is crossed).
        const topX = x0 + cellSize * frac(t, a, b);
        const rightY = y0 + cellSize * frac(t, b, c);
        const bottomX = x0 + cellSize * frac(t, d, c);
        const leftY = y0 + cellSize * frac(t, a, d);

        switch (code) {
          case 1:
          case 14:
            emit(x0, leftY, bottomX, y1, level);
            break;
          case 2:
          case 13:
            emit(bottomX, y1, x1, rightY, level);
            break;
          case 3:
          case 12:
            emit(x0, leftY, x1, rightY, level);
            break;
          case 4:
          case 11:
            emit(topX, y0, x1, rightY, level);
            break;
          case 6:
          case 9:
            emit(topX, y0, bottomX, y1, level);
            break;
          case 7:
          case 8:
            emit(x0, leftY, topX, y0, level);
            break;
          case 5:
          case 10: {
            // Saddle: disambiguate with the cell centre.
            const centreAbove = (a + b + c + d) / 4 >= t;
            const isolateAC = (code === 5) === centreAbove;
            if (isolateAC) {
              emit(x0, leftY, topX, y0, level);
              emit(bottomX, y1, x1, rightY, level);
            } else {
              emit(topX, y0, x1, rightY, level);
              emit(x0, leftY, bottomX, y1, level);
            }
            break;
          }
        }
      }
    }
  }
}

function frac(t: number, from: number, to: number): number {
  const d = to - from;
  return d === 0 ? 0.5 : (t - from) / d;
}
