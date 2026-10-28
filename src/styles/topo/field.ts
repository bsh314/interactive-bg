import { createNoise3D, type Noise3D } from '../../shared/noise';
import type { ResolvedTopoOptions } from './options';

/** Noise-time distance between sampled keyframes; frames in between are blended. */
const KEY_DT = 0.02;

export type FieldParams = Pick<ResolvedTopoOptions, 'seed' | 'scale' | 'octaves' | 'cellSize'>;

export interface KeyframeField {
  readonly cols: number;
  readonly rows: number;
  /** The terrain at time `t` is `keyA + (keyB - keyA) * blend`, see `advance()`. */
  readonly keyA: Float32Array;
  readonly keyB: Float32Array;
  /** Changes whenever the contents of `keyA` / `keyB` change. */
  readonly version: number;
  /** Apply new parameters; resamples only if something actually changed. */
  configure(params: FieldParams): void;
  /** Size of the area to cover, in CSS pixels. */
  resize(width: number, height: number): void;
  /** Bring the keyframes up to `time` and return the blend factor between them. */
  advance(time: number): number;
}

/**
 * The terrain height field, sampled on a grid `cellSize` pixels apart.
 *
 * Sampling noise for every grid point is the most expensive step, but the
 * terrain changes slowly. So noise is only sampled at keyframes KEY_DT apart
 * (A at `keyTime`, B at `keyTime + KEY_DT`) and every frame blends between them.
 * The keyframe after B is built a few rows per frame to avoid spikes.
 */
export function createKeyframeField(initial: FieldParams): KeyframeField {
  let params = initial;
  let noise: Noise3D = createNoise3D(params.seed);
  // Sum of octave amplitudes (1 + 1/2 + 1/4 + …), to normalise the result to [-1, 1].
  let norm = 2 - 2 ** (1 - params.octaves);

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let keyA = new Float32Array(0);
  let keyB = new Float32Array(0);
  let keyNext = new Float32Array(0);
  let keyTime = 0;
  let keyNextRows = 0;
  let valid = false;
  let version = 0;

  function allocate(): void {
    const nextCols = Math.ceil(width / params.cellSize) + 1;
    const nextRows = Math.ceil(height / params.cellSize) + 1;
    if (nextCols === cols && nextRows === rows) return;
    cols = nextCols;
    rows = nextRows;
    keyA = new Float32Array(cols * rows);
    keyB = new Float32Array(cols * rows);
    keyNext = new Float32Array(cols * rows);
    valid = false;
  }

  function sampleRows(target: Float32Array, t: number, fromRow: number, toRow: number): void {
    const { cellSize, octaves, scale } = params;
    for (let j = fromRow; j < toRow; j++) {
      const y = j * cellSize;
      for (let i = 0; i < cols; i++) {
        const x = i * cellSize;
        let value = 0;
        for (let o = 0, amp = 1, freq = scale; o < octaves; o++, amp *= 0.5, freq *= 2) {
          value += amp * noise(x * freq, y * freq, t + o * 17.3);
        }
        target[j * cols + i] = value / norm;
      }
    }
  }

  return {
    get cols() {
      return cols;
    },
    get rows() {
      return rows;
    },
    get keyA() {
      return keyA;
    },
    get keyB() {
      return keyB;
    },
    get version() {
      return version;
    },

    configure(next) {
      const prev = params;
      if (
        next.seed === prev.seed &&
        next.scale === prev.scale &&
        next.octaves === prev.octaves &&
        next.cellSize === prev.cellSize
      ) {
        return;
      }
      params = { seed: next.seed, scale: next.scale, octaves: next.octaves, cellSize: next.cellSize };
      if (next.seed !== prev.seed) noise = createNoise3D(next.seed);
      norm = 2 - 2 ** (1 - next.octaves);
      allocate();
      valid = false;
    },

    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      allocate();
    },

    advance(time) {
      if (!valid || time < keyTime || time >= keyTime + 2 * KEY_DT) {
        keyTime = time;
        sampleRows(keyA, keyTime, 0, rows);
        sampleRows(keyB, keyTime + KEY_DT, 0, rows);
        keyNextRows = 0;
        valid = true;
        version++;
      }
      if (time >= keyTime + KEY_DT) {
        sampleRows(keyNext, keyTime + 2 * KEY_DT, keyNextRows, rows);
        [keyA, keyB, keyNext] = [keyB, keyNext, keyA];
        keyTime += KEY_DT;
        keyNextRows = 0;
        version++;
      }
      // Spread the next keyframe over the first 80% of the interval.
      const progress = (time - keyTime) / KEY_DT;
      const wanted = Math.min(rows, Math.ceil((rows * progress) / 0.8));
      if (wanted > keyNextRows) {
        sampleRows(keyNext, keyTime + 2 * KEY_DT, keyNextRows, wanted);
        keyNextRows = wanted;
      }
      return progress;
    },
  };
}
