import { describe, expect, it } from 'vitest';
import { traceContours } from '../src/styles/topo/contours';

type Segment = [number, number, number, number, number];

// `field` is row-major: [topLeft, topRight, bottomLeft, bottomRight] for a 2×2 grid.
function collect(field: number[], cols: number, rows: number, step: number): Segment[] {
  const out: Segment[] = [];
  traceContours(field, cols, rows, 10, step, (...s) => out.push(s));
  return out;
}

describe('traceContours', () => {
  it('emits nothing for a flat field', () => {
    expect(collect([0.3, 0.3, 0.3, 0.3], 2, 2, 1)).toEqual([]);
  });

  it('traces a horizontal line through a vertical gradient', () => {
    // Top row 0, bottom row 1 → the 0.5 contour crosses the middle.
    const segments = collect([0, 0, 1, 1], 2, 2, 0.5);
    const mid = segments.filter((s) => s[4] === 1);
    expect(mid).toEqual([[0, 5, 10, 5, 1]]);
  });

  it('interpolates the crossing point along an edge', () => {
    // Left column 0, right column 1 → 0.25 contour at x = 2.5.
    const segments = collect([0, 1, 0, 1], 2, 2, 0.25).filter((s) => s[4] === 1);
    expect(segments).toEqual([[2.5, 0, 2.5, 10, 1]]);
  });

  it('splits saddle cells into two segments', () => {
    // Row-major: top-left and bottom-right high, the other two low.
    const segments = collect([1, 0, 0, 1], 2, 2, 0.5).filter((s) => s[4] === 1);
    expect(segments).toHaveLength(2);
  });

  it('handles negative thresholds', () => {
    const segments = collect([-1, -1, 0, 0], 2, 2, 0.5);
    // Level -2 (t = -1) touches every corner, so the whole cell is "above" it.
    expect(segments.map((s) => s[4])).toEqual([-1, 0]);
  });
});
