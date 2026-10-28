import type { Frame } from '../../core/style';
import { MAX_WAVES, waveEnvelope, waveRing, type Grid, type Wave } from '../../shared/grid';
import { facingAngle } from './motion';
import type { ResolvedPlusOptions } from './options';

const QUARTER = Math.PI / 2;
/** A sign has finished turning once its arm tips are this close to where they're heading, in CSS pixels. */
const SETTLED_PX = 0.05;

/** The same turn, expressed within ±45° (a "+" looks the same every 90°). */
function wrap(angle: number): number {
  return angle - QUARTER * Math.round(angle / QUARTER);
}

/**
 * Each sign's angle and wave-crest height, kept between frames so signs ease
 * towards the angle they want instead of jumping to it. Both renderers use it.
 */
export interface SignTurns {
  /** Angle (radians) and wave-crest height of every sign, row-major, as pairs. */
  readonly data: Float32Array<ArrayBuffer>;
  /** Whether `data` changed in the last update. */
  readonly changed: boolean;
  /** Whether any sign is still turning towards its target. */
  readonly settling: boolean;
  update(frame: Frame, options: ResolvedPlusOptions, grid: Grid, waves: readonly Wave[]): void;
}

export function createSignTurns(): SignTurns {
  let data = new Float32Array(0);
  const waveData = new Float32Array(MAX_WAVES * 4);

  /** Work out each wave's ring radius and envelope once per frame instead of once per sign. */
  function packWaves(waves: readonly Wave[], speed: number, duration: number): void {
    for (let k = 0; k < waves.length; k++) {
      const wave = waves[k];
      waveData[k * 4] = wave.x;
      waveData[k * 4 + 1] = wave.y;
      waveData[k * 4 + 2] = speed * wave.age;
      waveData[k * 4 + 3] = waveEnvelope(wave.age, duration);
    }
  }
  let changed = false;
  let settling = false;
  // What the last update computed from: if none of it changes, neither do the angles.
  let lastX = NaN;
  let lastY = NaN;
  let lastAlign = NaN;
  let lastOriginX = NaN;
  let lastOriginY = NaN;
  let lastOptions: ResolvedPlusOptions | null = null;
  let hadWaves = false;

  return {
    get data() {
      return data;
    },
    get changed() {
      return changed;
    },
    get settling() {
      return settling;
    },
    update(frame, options, grid, waves) {
      const { cols, rows, originX, originY } = grid;
      const { spacing, waveSpeed, waveWidth, waveDuration, waveAlign } = options;
      const resized = data.length !== cols * rows * 2;
      if (resized) data = new Float32Array(cols * rows * 2);

      const align = options.pointerAlign * frame.pointer.influence;
      const { x: px, y: py } = frame.pointer;
      // Nothing is turning and nothing it depends on has moved: the angles are already right.
      // With no pointer, every sign is upright whatever the grid or options.
      const unchanged =
        !resized &&
        !settling &&
        !hadWaves &&
        waves.length === 0 &&
        align === lastAlign &&
        (align === 0 ||
          (px === lastX && py === lastY && originX === lastOriginX && originY === lastOriginY && options === lastOptions));
      hadWaves = waves.length > 0;
      if (unchanged) {
        changed = false;
        return;
      }
      lastX = px;
      lastY = py;
      lastAlign = align;
      lastOriginX = originX;
      lastOriginY = originY;
      lastOptions = options;

      // Each wave as x, y, ring radius, envelope. Further than 3 widths from its ring a wave is below e⁻⁹: skipped.
      const waveCount = waves.length;
      packWaves(waves, waveSpeed, waveDuration);
      const waveReach = 3 * waveWidth;
      const settled = SETTLED_PX / options.size;
      const ease = options.turnTime > 0 ? 1 - Math.exp(-frame.dt / options.turnTime) : 1;
      settling = false;

      for (let j = 0; j < rows; j++) {
        const restY = originY + j * spacing;
        for (let i = 0; i < cols; i++) {
          const restX = originX + i * spacing;

          let target = 0;
          // While the pointer is over the background, every sign turns to face it.
          if (align !== 0) target = align * facingAngle(restX - px, restY - py);

          let ring = 0;
          for (let w = 0; w < waveCount * 4; w += 4) {
            const dx = restX - waveData[w];
            const dy = restY - waveData[w + 1];
            const outer = waveData[w + 2] + waveReach;
            if (Math.abs(dx) > outer || Math.abs(dy) > outer) continue;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(distance - waveData[w + 2]) > waveReach) continue;
            const height = waveRing(distance, waveData[w + 2], waveWidth) * waveData[w + 3];
            ring += height;
            // On the crest, signs turn to face the click.
            target += waveAlign * Math.min(1, height) * facingAngle(dx, dy);
          }

          // Ease towards the target the short way round, so a sign never spins more than 45°.
          const k = (j * cols + i) * 2;
          const remaining = wrap(target - data[k]);
          if (Math.abs(remaining) < settled) {
            data[k] = wrap(target);
          } else {
            data[k] = wrap(data[k] + remaining * ease);
            settling = true;
          }
          data[k + 1] = ring;
        }
      }
      changed = true;
    },
  };
}
