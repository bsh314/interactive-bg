import type { StyleRenderer } from '../../core/style';
import { createFloatBuffer, reserve, type FloatBuffer } from '../../shared/buffer';
import {
  createPhaseCache,
  createWaveList,
  gridLayout,
  MAX_WAVES,
  pointerFalloff,
  TAU,
  wanderClock,
  waveRing,
} from '../../shared/grid';
import { WAVE_GROW } from './motion';
import { resolveDotsOptions, type DotsOptions } from './options';

/** Dots grown by waves are drawn in this many size steps per unit of growth (steps of ~0.25 px). */
const SIZE_STEPS = 4;
/** Growth beyond this is clamped (two overlapping wave crests). */
const MAX_SIZE_STEP = 2 * SIZE_STEPS;

/**
 * Every dot's position computed on the CPU. Dots are drawn as zero-length lines
 * with round caps: that renders the same round dots as `arc()`, about 4× faster.
 */
export function createDotsCanvas2D(ctx: CanvasRenderingContext2D, initial: DotsOptions): StyleRenderer<DotsOptions> {
  let options = resolveDotsOptions(initial);
  const waves = createWaveList();
  // Each wave as x, y, ring radius, envelope, worked out once per frame instead of once per dot.
  const waveData = new Float32Array(MAX_WAVES * 4);
  let clock = 0;

  // Dot centres as x, y pairs, one buffer per size step; dots outside a wave all land in step 0.
  const sizes = Array.from({ length: MAX_SIZE_STEP + 1 }, () => createFloatBuffer(256));

  function add(buffer: FloatBuffer, x: number, y: number): void {
    const data = reserve(buffer, 2);
    data[buffer.length++] = x;
    data[buffer.length++] = y;
  }

  function stroke(buffer: FloatBuffer, radius: number): void {
    const { data, length } = buffer;
    ctx.lineWidth = 2 * radius;
    ctx.beginPath();
    for (let k = 0; k < length; k += 2) {
      ctx.moveTo(data[k], data[k + 1]);
      // A tiny length: some browsers skip the caps of exactly zero-length lines.
      ctx.lineTo(data[k] + 0.01, data[k + 1]);
    }
    ctx.stroke();
  }

  const phasesFor = createPhaseCache();

  return {
    update(next) {
      options = resolveDotsOptions(next);
    },
    render(frame) {
      if (!frame.reducedMotion) clock += frame.dt * options.jitterSpeed * TAU;
      waves.advance(frame, options.waveDuration, options.waveStrength !== 0);

      const { spacing, size, jitter, pointerRadius, waveWidth, waveStrength } = options;
      const { cols, rows, originX, originY } = gridLayout(frame.width, frame.height, spacing);
      const wander = phasesFor(cols, rows);
      const { sx, cx, sy, cy } = wanderClock(clock);
      const push = options.pointerStrength * frame.pointer.influence;
      const { x: px, y: py } = frame.pointer;
      const waveCount = waves.waves.length;
      waves.pack(waveData, options.waveSpeed, options.waveDuration);
      // Further than 3 widths from its ring a wave moves a dot by less than e⁻⁹ of its strength.
      const waveReach = 3 * waveWidth;
      for (const buffer of sizes) buffer.length = 0;

      for (let j = 0; j < rows; j++) {
        const restY = originY + j * spacing;
        for (let i = 0; i < cols; i++) {
          const restX = originX + i * spacing;
          const k = (j * cols + i) * 4;
          let x = restX + jitter * (sx * wander[k] + cx * wander[k + 1]);
          let y = restY + jitter * (cy * wander[k + 2] - sy * wander[k + 3]);

          if (push !== 0) {
            const dx = restX - px;
            const dy = restY - py;
            if (Math.abs(dx) < pointerRadius && Math.abs(dy) < pointerRadius) {
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance > 0 && distance < pointerRadius) {
                const amount = (push * pointerFalloff(distance, pointerRadius)) / distance;
                x += dx * amount;
                y += dy * amount;
              }
            }
          }

          let grow = 0;
          for (let w = 0; w < waveCount * 4; w += 4) {
            const dx = restX - waveData[w];
            const dy = restY - waveData[w + 1];
            const outer = waveData[w + 2] + waveReach;
            if (Math.abs(dx) > outer || Math.abs(dy) > outer) continue;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance === 0 || Math.abs(distance - waveData[w + 2]) > waveReach) continue;
            const ring = waveRing(distance, waveData[w + 2], waveWidth) * waveData[w + 3];
            const amount = (waveStrength * ring) / distance;
            x += dx * amount;
            y += dy * amount;
            grow += ring;
          }

          add(sizes[Math.min(MAX_SIZE_STEP, Math.round(grow * SIZE_STEPS))], x, y);
        }
      }

      ctx.globalAlpha = options.opacity;
      ctx.strokeStyle = options.color;
      ctx.lineCap = 'round';
      for (let step = 0; step <= MAX_SIZE_STEP; step++) {
        if (sizes[step].length > 0) stroke(sizes[step], size * (1 + (WAVE_GROW * step) / SIZE_STEPS));
      }
      return waveCount > 0;
    },
  };
}
