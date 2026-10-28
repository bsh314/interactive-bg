import type { StyleRenderer } from '../../core/style';
import { createFloatBuffer, reserve, type FloatBuffer } from '../../shared/buffer';
import { traceContours } from './contours';
import { resolveTopoOptions, type TopoOptions } from './options';
import { createTerrain } from './terrain';

/** Marching squares on the CPU, stroked with the Canvas 2D API. */
export function createTopoCanvas2D(ctx: CanvasRenderingContext2D, initial: TopoOptions): StyleRenderer<TopoOptions> {
  let options = resolveTopoOptions(initial);
  const terrain = createTerrain(options);
  let field = new Float32Array(0);

  // Segments are collected into reusable buffers and stroked from the context's
  // own path, so a frame allocates nothing. Path2D objects per frame pile up as
  // native garbage faster than the browser frees them.
  // Line segments as x1, y1, x2, y2.
  const minor = createFloatBuffer(4096);
  const major = createFloatBuffer(1024);

  function collectSegment(x1: number, y1: number, x2: number, y2: number, level: number): void {
    const buffer = options.majorEvery > 0 && level % options.majorEvery === 0 ? major : minor;
    const data = reserve(buffer, 4);
    data[buffer.length++] = x1;
    data[buffer.length++] = y1;
    data[buffer.length++] = x2;
    data[buffer.length++] = y2;
  }

  function stroke(buffer: FloatBuffer, color: string, lineWidth: number): void {
    const { data, length } = buffer;
    ctx.beginPath();
    for (let k = 0; k < length; k += 4) {
      ctx.moveTo(data[k], data[k + 1]);
      ctx.lineTo(data[k + 2], data[k + 3]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  /** Blend the keyframes and add the pointer bump into `field`. */
  function sampleField(blend: number, pointerX: number, pointerY: number, bump: number): void {
    const { cols, rows, keyA, keyB } = terrain.field;
    const size = cols * rows;
    if (field.length !== size) field = new Float32Array(size);
    for (let idx = 0; idx < size; idx++) {
      const a = keyA[idx];
      field[idx] = a + (keyB[idx] - a) * blend;
    }

    if (bump === 0) return;
    const { cellSize, pointerRadius } = options;
    const radius2 = pointerRadius * pointerRadius;
    // Beyond 3 radii the bump adds < 0.0001, so only touch the cells around the pointer.
    const reach = 3 * pointerRadius;
    const i0 = Math.max(0, Math.floor((pointerX - reach) / cellSize));
    const i1 = Math.min(cols - 1, Math.ceil((pointerX + reach) / cellSize));
    const j0 = Math.max(0, Math.floor((pointerY - reach) / cellSize));
    const j1 = Math.min(rows - 1, Math.ceil((pointerY + reach) / cellSize));
    for (let j = j0; j <= j1; j++) {
      const dy = j * cellSize - pointerY;
      for (let i = i0; i <= i1; i++) {
        const dx = i * cellSize - pointerX;
        field[j * cols + i] += bump * Math.exp(-(dx * dx + dy * dy) / radius2);
      }
    }
  }

  return {
    update(next) {
      options = resolveTopoOptions(next);
      terrain.configure(options);
    },
    render(frame) {
      const blend = terrain.advance(frame);
      const { pointer } = frame;
      sampleField(blend, pointer.x, pointer.y, options.pointerStrength * pointer.influence);

      minor.length = major.length = 0;
      const { cols, rows } = terrain.field;
      traceContours(field, cols, rows, options.cellSize, options.levelStep, collectSegment);

      ctx.globalAlpha = options.lineOpacity;
      stroke(minor, options.lineColor, options.lineWidth);
      if (options.majorEvery > 0) stroke(major, options.majorLineColor, options.majorLineWidth);
    },
  };
}
