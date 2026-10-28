import type { Frame } from '../core/style';

// The motion model shared by the grid styles (dots, plus): a grid of marks that
// wander around their places, react to the pointer and to click waves. The
// WebGL vertex shaders mirror parts of it in GLSL (grid-webgl.ts); keep them in step.

export const TAU = Math.PI * 2;

/** At most this many waves play at once; a new click replaces the oldest. */
export const MAX_WAVES = 8;

export interface Grid {
  cols: number;
  rows: number;
  /** Position of mark (0, 0), in CSS pixels. */
  originX: number;
  originY: number;
}

/**
 * A grid that fits inside the canvas, centred, leaving at least half a
 * `spacing` of padding on every side so marks at the edges are never clipped.
 * Any space left over is shared equally between opposite sides. A canvas too
 * small for the padding still gets one mark, in its centre.
 */
export function gridLayout(width: number, height: number, spacing: number): Grid {
  const cols = Math.max(1, Math.floor(width / spacing));
  const rows = Math.max(1, Math.floor(height / spacing));
  return {
    cols,
    rows,
    originX: (width - (cols - 1) * spacing) / 2,
    originY: (height - (rows - 1) * spacing) / 2,
  };
}

/** A stable pseudo-random phase in [0, 2π) for mark (i, j). */
export function cellPhase(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233 + salt) * 43758.5453;
  return (s - Math.floor(s)) * TAU;
}

/**
 * Each mark's wander phases (px, py) as cos px, sin px, cos py, sin py,
 * recomputed only when the grid changes size. The wander offset is
 * `jitter × (sin(clock + px), cos(clock × 1.3 + py))`; see wanderClock.
 */
export function createPhaseCache(): (cols: number, rows: number) => Float32Array {
  let phases = new Float32Array(0);
  let phaseCols = 0;
  return (cols, rows) => {
    if (phaseCols === cols && phases.length === cols * rows * 4) return phases;
    phases = new Float32Array(cols * rows * 4);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 4;
        const px = cellPhase(i, j, 0);
        const py = cellPhase(i, j, 1);
        phases[k] = Math.cos(px);
        phases[k + 1] = Math.sin(px);
        phases[k + 2] = Math.cos(py);
        phases[k + 3] = Math.sin(py);
      }
    }
    phaseCols = cols;
    return phases;
  };
}

/**
 * The trig of the wander clock for one frame. With a mark's cached phases
 * (createPhaseCache), its offset is
 *   x = jitter × (sx × cos px + cx × sin px)   = jitter × sin(clock + px)
 *   y = jitter × (cy × cos py − sy × sin py)   = jitter × cos(clock × 1.3 + py)
 * so a frame needs four trig calls in all instead of two per mark.
 */
export function wanderClock(clock: number): { sx: number; cx: number; sy: number; cy: number } {
  return { sx: Math.sin(clock), cx: Math.cos(clock), sy: Math.sin(clock * 1.3), cy: Math.cos(clock * 1.3) };
}

/** How strongly the pointer affects a mark `distance` away: 1 at the pointer, easing to 0 at `radius`. */
export function pointerFalloff(distance: number, radius: number): number {
  const k = Math.max(0, 1 - distance / radius);
  return k * k;
}

/** Height of a wave's ring at `distance` from its centre: 1 on the ring, fading over `width` either side. */
export function waveRing(distance: number, ringRadius: number, width: number): number {
  const x = (distance - ringRadius) / width;
  return Math.exp(-x * x);
}

/** How much of a wave is left at `age`: 1 when it starts, easing out to 0 at `duration`. */
export function waveEnvelope(age: number, duration: number): number {
  const k = Math.max(0, 1 - age / duration);
  return k * k;
}

/** The wander moves each mark at most this far between frames, in CSS pixels; finer steps can't be seen. */
const WANDER_STEP = 0.25;

/**
 * Frame rate that keeps every wander step below WANDER_STEP. The fastest a mark
 * wanders is along y: amplitude × angular speed × 1.3.
 */
export function wanderFps(jitter: number, jitterSpeed: number): number {
  const maxSpeed = jitter * jitterSpeed * TAU * 1.3;
  return Math.ceil(maxSpeed / WANDER_STEP);
}

/** Idle frame rate for a wandering grid: just enough for a smooth wander, at least 5 fps. */
export function wanderIdleFps(options: { jitter: number; jitterSpeed: number }): number {
  return Math.max(5, wanderFps(options.jitter, options.jitterSpeed));
}

export interface Wave {
  x: number;
  y: number;
  age: number;
}

/** The click waves currently playing. */
export interface WaveList {
  readonly waves: readonly Wave[];
  /**
   * Start waves for this frame's clicks (unless `enabled` is false), age the
   * rest, and drop those older than `duration` seconds.
   */
  advance(frame: Frame, duration: number, enabled: boolean): void;
  /** Writes each wave as x, y, ring radius, envelope into `out` (MAX_WAVES × 4), zeroing unused slots. */
  pack(out: Float32Array, speed: number, duration: number): void;
}

export function createWaveList(): WaveList {
  const waves: Wave[] = [];
  return {
    waves,
    advance(frame, duration, enabled) {
      for (const wave of waves) wave.age += frame.dt;
      for (let k = waves.length - 1; k >= 0; k--) {
        if (waves[k].age >= duration) waves.splice(k, 1);
      }
      if (!enabled) return;
      for (const click of frame.clicks) {
        if (waves.length === MAX_WAVES) waves.shift();
        waves.push({ x: click.x, y: click.y, age: 0 });
      }
    },
    pack(out, speed, duration) {
      out.fill(0);
      for (let k = 0; k < waves.length; k++) {
        const wave = waves[k];
        out[k * 4] = wave.x;
        out[k * 4 + 1] = wave.y;
        out[k * 4 + 2] = speed * wave.age;
        out[k * 4 + 3] = waveEnvelope(wave.age, duration);
      }
    },
  };
}
