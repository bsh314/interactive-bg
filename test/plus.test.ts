import { describe, expect, it } from 'vitest';
import type { Frame } from '../src/core/style';
import { plus } from '../src/plus';
import { createPlusCanvas2D } from '../src/styles/plus/canvas2d';
import { facingAngle } from '../src/styles/plus/motion';
import { resolvePlusOptions, wavesEnabled } from '../src/styles/plus/options';
import { createSignTurns } from '../src/styles/plus/turns';

interface Stroke {
  lineWidth: number;
  /** One entry per arm: [x0, y0, x1, y1]. */
  arms: number[][];
}

/** Just enough of a 2D context to record what the plus renderer strokes. */
function recordingContext() {
  const strokes: Stroke[] = [];
  let current: Stroke | null = null;
  let start: number[] = [];
  const ctx = {
    lineWidth: 1,
    globalAlpha: 1,
    strokeStyle: '',
    lineCap: 'butt',
    beginPath() {
      current = { lineWidth: ctx.lineWidth, arms: [] };
    },
    moveTo(x: number, y: number) {
      start = [x, y];
    },
    lineTo(x: number, y: number) {
      current!.arms.push([...start, x, y]);
    },
    stroke() {
      strokes.push(current!);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    width: 200,
    height: 200,
    dpr: 1,
    dt: 0,
    reducedMotion: true,
    pointer: { x: 0, y: 0, influence: 0 },
    clicks: [],
    ...overrides,
  };
}

const angleOf = ([x0, y0, x1, y1]: number[]) => Math.atan2(y1 - y0, x1 - x0);
const centreOf = ([x0, y0, x1, y1]: number[]) => [(x0 + x1) / 2, (y0 + y1) / 2];

/** The first arm of the sign whose centre is closest to (x, y). */
function armNear(strokes: Stroke[], x: number, y: number): number[] {
  const arms = strokes.flatMap((s) => s.arms.filter((_, k) => k % 2 === 0));
  return arms.reduce((best, arm) => {
    const distance = (a: number[]) => Math.hypot(centreOf(a)[0] - x, centreOf(a)[1] - y);
    return distance(arm) < distance(best) ? arm : best;
  });
}

describe('plus', () => {
  // turnTime 0: signs snap to their angle, so one frame shows where they're heading.
  const options = { ...plus.defaults, jitter: 0, spacing: 20, turnTime: 0 };

  it('draws upright crosses of two equal arms when nothing is happening', () => {
    const { ctx, strokes } = recordingContext();
    createPlusCanvas2D(ctx, options).render(frame());
    expect(strokes).toHaveLength(1);
    const [first, second] = strokes[0].arms;
    expect(angleOf(first)).toBeCloseTo(0);
    expect(Math.abs(angleOf(second))).toBeCloseTo(Math.PI / 2);
    expect(Math.hypot(first[2] - first[0], first[3] - first[1])).toBeCloseTo(2 * options.size);
  });

  it('turns every sign, near or far, so an arm points at the pointer', () => {
    const { ctx, strokes } = recordingContext();
    createPlusCanvas2D(ctx, options).render(frame({ pointer: { x: 107, y: 103, influence: 1 } }));
    for (const [x, y] of [[110, 110], [170, 30], [30, 170], [10, 10]]) {
      const arm = armNear(strokes, x, y);
      expect((arm[0] + arm[2]) / 2).toBeCloseTo(x); // the sign at (x, y)
      const toPointer = Math.atan2(103 - y, 107 - x);
      // Off by a multiple of 90° at most: one of the four arms points at the pointer.
      expect(Math.abs(facingAngle(Math.cos(angleOf(arm) - toPointer), Math.sin(angleOf(arm) - toPointer)))).toBeLessThan(1e-4);
    }
  });

  it('keeps every sign at least half a spacing in from the edges', () => {
    const { ctx, strokes } = recordingContext();
    createPlusCanvas2D(ctx, options).render(frame());
    const centres = strokes[0].arms.map(centreOf);
    expect(centres.every(([x, y]) => x >= 10 && y >= 10 && x <= 190 && y <= 190)).toBe(true);
    expect(centres.length).toBe(2 * 10 * 10); // signs at 10, 30, …, 190 in each direction
  });

  it('eases back to upright once the pointer leaves', () => {
    const { ctx, strokes } = recordingContext();
    const renderer = createPlusCanvas2D(ctx, { ...options, turnTime: 0.25 });
    for (let k = 0; k < 100; k++) renderer.render(frame({ dt: 0.016, pointer: { x: 107, y: 103, influence: 1 } }));
    let busy = true;
    for (let k = 0; k < 300 && busy; k++) {
      strokes.length = 0;
      busy = renderer.render(frame({ dt: 0.016, pointer: { x: 107, y: 103, influence: 0 } })) === true;
    }
    expect(busy).toBe(false);
    expect(strokes[0].arms.every((arm) => Math.abs(angleOf(arm) % (Math.PI / 2)) < 0.01)).toBe(true);
  });

  it('eases signs towards their angle and reports when they have settled', () => {
    const { ctx, strokes } = recordingContext();
    const renderer = createPlusCanvas2D(ctx, { ...options, turnTime: 0.25 });
    const hover = { pointer: { x: 107, y: 103, influence: 1 } };
    const angleAt = () => angleOf(armNear(strokes, 130, 130));

    expect(renderer.render(frame({ ...hover, dt: 0.016 }))).toBe(true); // still turning
    const first = Math.abs(angleAt());
    strokes.length = 0;
    renderer.render(frame({ ...hover, dt: 0.016 }));
    const second = Math.abs(angleAt());
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);

    let busy = true;
    for (let k = 0; k < 200 && busy; k++) busy = renderer.render(frame({ ...hover, dt: 0.016 })) === true;
    expect(busy).toBe(false); // settled: the engine can drop back to its idle frame rate
  });

  it('turns the short way round, never more than 45° away from upright', () => {
    const turns = createSignTurns();
    const grid = { cols: 1, rows: 1, originX: 0, originY: 0 };
    const resolved = resolvePlusOptions({ ...plus.defaults, turnTime: 0.25 });
    const at = (x: number, y: number) => turns.update(frame({ dt: 0.05, pointer: { x, y, influence: 1 } }), resolved, grid, []);
    // Pointer just past the diagonal on either side: the target flips from about −45° to +45°,
    // which looks the same, so the sign keeps easing smoothly instead of spinning 90°.
    for (let k = 0; k < 40; k++) at(-10, -10.5);
    const before = turns.data[0];
    at(-10.5, -10);
    expect(Math.abs(turns.data[0] - before)).toBeLessThan(0.1);
    expect(Math.abs(turns.data[0])).toBeLessThanOrEqual(Math.PI / 4 + 1e-6);
  });

  it('turns by at most 45° to face any direction', () => {
    expect(facingAngle(1, 0)).toBe(0);
    expect(facingAngle(0, -1)).toBeCloseTo(0); // straight up: the vertical arm already points there
    expect(Math.abs(facingAngle(1, 1))).toBeCloseTo(Math.PI / 4); // ±45° look the same
    expect(facingAngle(-1, 0.2)).toBeCloseTo(-Math.atan(0.2));
    expect(facingAngle(0, 0)).toBe(0);
    for (let a = -Math.PI; a <= Math.PI; a += 0.1) {
      expect(Math.abs(facingAngle(Math.cos(a), Math.sin(a)))).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
    }
  });

  it('makes signs heavier and turns them as a click wave passes', () => {
    const { ctx, strokes } = recordingContext();
    const renderer = createPlusCanvas2D(ctx, options);
    // A larger canvas, so some signs are out of the wave's reach.
    const big = { width: 600, height: 600 };
    expect(renderer.render(frame({ ...big, clicks: [{ x: 100, y: 100 }] }))).toBe(true);
    strokes.length = 0;
    // After 0.1 s the ring is waveSpeed × 0.1 = 52 px from the click.
    renderer.render(frame({ ...big, dt: 0.1 }));
    const widths = strokes.map((s) => s.lineWidth);
    expect(Math.max(...widths)).toBeGreaterThan(options.weight * 1.5);
    expect(Math.min(...widths)).toBe(options.weight);
    // A sign on the crest, diagonal from the click, turns towards facing it (45°).
    expect(Math.abs(angleOf(armNear(strokes, 130, 130)))).toBeGreaterThan(0.3);
  });

  it('clamps alignment to 0–1 and only starts waves that change something', () => {
    expect(resolvePlusOptions({ ...plus.defaults, pointerAlign: 3 }).pointerAlign).toBe(1);
    expect(wavesEnabled(resolvePlusOptions(plus.defaults))).toBe(true);
    expect(wavesEnabled(resolvePlusOptions({ ...plus.defaults, waveAlign: 0, waveWeight: 0 }))).toBe(false);
  });

  it('animates only while the signs wander, at the wander frame rate', () => {
    expect(plus().definition.animates(plus().options)).toBe(true);
    expect(plus().definition.animates(plus({ jitterSpeed: 0 }).options)).toBe(false);
    expect(plus().definition.idleFps?.(plus().options)).toBeGreaterThanOrEqual(5);
  });
});
