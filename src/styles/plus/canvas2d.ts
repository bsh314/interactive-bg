import type { StyleRenderer } from '../../core/style';
import { createFloatBuffer, reserve, type FloatBuffer } from '../../shared/buffer';
import { createPhaseCache, createWaveList, gridLayout, TAU, wanderClock } from '../../shared/grid';
import { resolvePlusOptions, wavesEnabled, type PlusOptions } from './options';
import { createSignTurns } from './turns';

/** Signs made heavier by waves are drawn in this many weight steps per unit of ring height. */
const WEIGHT_STEPS = 8;
/** Ring heights beyond this are clamped (two overlapping wave crests). */
const MAX_WEIGHT_STEP = 2 * WEIGHT_STEPS;

/**
 * Every sign's position computed on the CPU, with angles and weights from
 * SignTurns. All signs of one weight are a single path of round-capped lines,
 * stroked once.
 */
export function createPlusCanvas2D(ctx: CanvasRenderingContext2D, initial: PlusOptions): StyleRenderer<PlusOptions> {
  let options = resolvePlusOptions(initial);
  const waves = createWaveList();
  const phasesFor = createPhaseCache();
  const turns = createSignTurns();
  let clock = 0;

  // Signs as x, y, arm vector (dx, dy), one buffer per weight step; signs outside a wave all land in step 0.
  const weights = Array.from({ length: MAX_WEIGHT_STEP + 1 }, () => createFloatBuffer(512));

  function add(buffer: FloatBuffer, x: number, y: number, dx: number, dy: number): void {
    const data = reserve(buffer, 4);
    data[buffer.length++] = x;
    data[buffer.length++] = y;
    data[buffer.length++] = dx;
    data[buffer.length++] = dy;
  }

  function stroke(buffer: FloatBuffer, weight: number): void {
    const { data, length } = buffer;
    ctx.lineWidth = weight;
    ctx.beginPath();
    for (let k = 0; k < length; k += 4) {
      const x = data[k];
      const y = data[k + 1];
      const dx = data[k + 2];
      const dy = data[k + 3];
      // Two arms: along (dx, dy) and along its perpendicular (-dy, dx).
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.moveTo(x + dy, y - dx);
      ctx.lineTo(x - dy, y + dx);
    }
    ctx.stroke();
  }

  return {
    update(next) {
      options = resolvePlusOptions(next);
    },
    render(frame) {
      if (!frame.reducedMotion) clock += frame.dt * options.jitterSpeed * TAU;
      waves.advance(frame, options.waveDuration, wavesEnabled(options));

      const { spacing, size, jitter } = options;
      const grid = gridLayout(frame.width, frame.height, spacing);
      const { cols, rows, originX, originY } = grid;
      const wander = phasesFor(cols, rows);
      const { sx, cx, sy, cy } = wanderClock(clock);
      turns.update(frame, options, grid, waves.waves);
      const turn = turns.data;
      for (const buffer of weights) buffer.length = 0;

      for (let j = 0; j < rows; j++) {
        const restY = originY + j * spacing;
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const w = k * 4;
          const x = originX + i * spacing + jitter * (sx * wander[w] + cx * wander[w + 1]);
          const y = restY + jitter * (cy * wander[w + 2] - sy * wander[w + 3]);
          const angle = turn[k * 2];
          const step = Math.min(MAX_WEIGHT_STEP, Math.round(turn[k * 2 + 1] * WEIGHT_STEPS));
          if (angle === 0) {
            add(weights[step], x, y, size, 0);
          } else {
            // Angles stay within ±45°, where these short series are exact to ~1e-6.
            const a2 = angle * angle;
            const cos = 1 - a2 * (0.5 - a2 * (1 / 24 - a2 * (1 / 720 - a2 / 40320)));
            const sin = angle * (1 - a2 * (1 / 6 - a2 * (1 / 120 - a2 / 5040)));
            add(weights[step], x, y, size * cos, size * sin);
          }
        }
      }

      ctx.globalAlpha = options.opacity;
      ctx.strokeStyle = options.color;
      ctx.lineCap = 'round';
      for (let step = 0; step <= MAX_WEIGHT_STEP; step++) {
        if (weights[step].length > 0) {
          stroke(weights[step], options.weight * (1 + (options.waveWeight * step) / WEIGHT_STEPS));
        }
      }
      return waves.waves.length > 0 || turns.settling;
    },
  };
}
