import { describe, expect, it } from 'vitest';
import { canvas2dRenderer } from '../src/core/canvas2d-renderer';
import type { Frame } from '../src/core/style';
import type { Fade, Surface } from '../src/core/surface';

const none: Fade = { top: 0, right: 0, bottom: 0, left: 0 };
const bottom = (length: number): Fade => ({ ...none, bottom: length });

/** A 2D context that records the fills and composite operations the surface makes. */
function recordingCanvas() {
  const calls: string[] = [];
  const stops: [number, string][] = [];
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown,
    setTransform() {},
    clearRect() {
      calls.push('clear');
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const fill = typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'gradient';
      calls.push(`fill ${fill} ${ctx.globalCompositeOperation} ${x},${y},${w},${h}`);
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      calls.push(`gradient ${x0},${y0}→${x1},${y1}`);
      return { addColorStop: (offset: number, color: string) => stops.push([offset, color]) };
    },
  };
  const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls, stops };
}

function setup() {
  const { canvas, calls, stops } = recordingCanvas();
  const style = canvas2dRenderer(() => ({
    update() {},
    render() {
      calls.push('style');
    },
  }));
  const surface = style.create(canvas, {}, () => {}) as Surface<object>;
  return { surface, calls, stops };
}

const frame: Frame = {
  width: 300,
  height: 200,
  dpr: 1,
  dt: 0,
  reducedMotion: false,
  pointer: { x: 0, y: 0, influence: 0 },
  clicks: [],
};

describe('edge fades (Canvas 2D)', () => {
  it('paints the background first and draws on top when there is no fade', () => {
    const { surface, calls } = setup();
    surface.render(frame, '#123', none);
    expect(calls).toEqual(['clear', 'fill #123 source-over 0,0,300,200', 'style']);
  });

  it('erases the bottom strip gradually, then puts the background behind', () => {
    const { surface, calls, stops } = setup();
    surface.render(frame, '#123', bottom(80));
    expect(calls).toEqual([
      'clear',
      'style',
      'gradient 0,120→0,200',
      'fill gradient destination-out 0,120,300,80',
      'fill #123 destination-over 0,0,300,200',
    ]);
    // Nothing erased at the top of the strip, everything at the bottom edge.
    expect(stops).toEqual([
      [0, 'rgba(0, 0, 0, 0)'],
      [1, 'rgba(0, 0, 0, 1)'],
    ]);
  });

  it('keeps a transparent canvas transparent, and reuses the gradient', () => {
    const { surface, calls } = setup();
    surface.render(frame, null, bottom(80));
    calls.length = 0;
    surface.render(frame, null, bottom(80));
    expect(calls).toEqual(['clear', 'style', 'fill gradient destination-out 0,120,300,80']);
  });

  it('fades over the whole height when the fade is taller than the canvas', () => {
    const { surface, calls } = setup();
    surface.render(frame, null, bottom(500));
    expect(calls).toContain('gradient 0,-300→0,200');
    expect(calls).toContain('fill gradient destination-out 0,0,300,200');
  });

  it('fades each side from its inner end to the edge', () => {
    const { surface, calls } = setup();
    surface.render(frame, null, { top: 30, right: 40, bottom: 0, left: 50 });
    expect(calls).toEqual([
      'clear',
      'style',
      'gradient 0,30→0,0',
      'fill gradient destination-out 0,0,300,30',
      'gradient 260,0→300,0',
      'fill gradient destination-out 260,0,40,200',
      'gradient 50,0→0,0',
      'fill gradient destination-out 0,0,50,200',
    ]);
  });
});
