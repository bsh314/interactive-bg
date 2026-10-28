import { describe, expect, it } from 'vitest';
import type { Frame } from '../src/core/style';
import {
  cellPhase,
  createPhaseCache,
  createWaveList,
  gridLayout,
  MAX_WAVES,
  pointerFalloff,
  waveEnvelope,
  waveRing,
  wanderClock,
  wanderFps,
} from '../src/shared/grid';

const DURATION = 1.8;

function frame(dt: number, clicks: Frame['clicks'] = []): Frame {
  return { width: 800, height: 600, dpr: 1, dt, reducedMotion: false, pointer: { x: 0, y: 0, influence: 0 }, clicks };
}

describe('grid motion', () => {
  it('fits a centred grid inside the canvas with at least half a spacing of padding', () => {
    for (const [width, height, spacing] of [[800, 600, 25], [813, 590, 26], [1920, 1080, 28], [100, 70, 12]]) {
      const grid = gridLayout(width, height, spacing);
      const lastX = grid.originX + (grid.cols - 1) * spacing;
      const lastY = grid.originY + (grid.rows - 1) * spacing;
      expect(grid.originX).toBeGreaterThanOrEqual(spacing / 2);
      expect(grid.originY).toBeGreaterThanOrEqual(spacing / 2);
      expect(width - lastX).toBeCloseTo(grid.originX); // centred
      expect(height - lastY).toBeCloseTo(grid.originY);
      expect(grid.originX).toBeLessThan(1.5 * spacing); // as many marks as fit
      expect(grid.originY).toBeLessThan(1.5 * spacing);
    }
  });

  it('keeps one mark in the centre of a canvas too small for the padding', () => {
    expect(gridLayout(20, 20, 26)).toEqual({ cols: 1, rows: 1, originX: 10, originY: 10 });
  });

  it('affects marks closer to the pointer more', () => {
    expect(pointerFalloff(0, 100)).toBe(1);
    expect(pointerFalloff(30, 100)).toBeGreaterThan(pointerFalloff(60, 100));
    expect(pointerFalloff(100, 100)).toBe(0);
    expect(pointerFalloff(150, 100)).toBe(0);
  });

  it('peaks on the wave ring and fades with age', () => {
    expect(waveRing(200, 200, 50)).toBe(1);
    expect(waveRing(260, 200, 50)).toBeLessThan(0.3);
    expect(waveEnvelope(0, 2)).toBe(1);
    expect(waveEnvelope(1, 2)).toBeCloseTo(0.25);
    expect(waveEnvelope(2, 2)).toBe(0);
  });

  it('starts a wave per click and drops it once it has faded', () => {
    const waves = createWaveList();
    waves.advance(frame(0, [{ x: 10, y: 20 }]), DURATION, true);
    expect(waves.waves).toEqual([{ x: 10, y: 20, age: 0 }]);
    waves.advance(frame(DURATION / 2), DURATION, true);
    expect(waves.waves[0].age).toBeCloseTo(DURATION / 2);
    waves.advance(frame(DURATION), DURATION, true);
    expect(waves.waves).toHaveLength(0);
  });

  it('keeps at most MAX_WAVES, replacing the oldest', () => {
    const waves = createWaveList();
    const clicks = Array.from({ length: MAX_WAVES + 2 }, (_, k) => ({ x: k, y: 0 }));
    waves.advance(frame(0, clicks), DURATION, true);
    expect(waves.waves).toHaveLength(MAX_WAVES);
    expect(waves.waves[0].x).toBe(2);
  });

  it('ignores clicks when waves are disabled', () => {
    const waves = createWaveList();
    waves.advance(frame(0, [{ x: 1, y: 1 }]), DURATION, false);
    expect(waves.waves).toHaveLength(0);
  });

  it('packs waves for the shaders and zeroes unused slots', () => {
    const waves = createWaveList();
    waves.advance(frame(0, [{ x: 5, y: 6 }]), DURATION, true);
    waves.advance(frame(0.5), DURATION, true);
    const out = new Float32Array(MAX_WAVES * 4).fill(9);
    waves.pack(out, 100, 2);
    expect(Array.from(out.subarray(0, 4))).toEqual([5, 6, 50, waveEnvelope(0.5, 2)]);
    expect(out.subarray(4).every((v) => v === 0)).toBe(true);
  });

  it('computes the wander from cached phase trig, matching the direct formula', () => {
    const phases = createPhaseCache()(5, 4);
    for (const clock of [0, 1.7, 123.4]) {
      const { sx, cx, sy, cy } = wanderClock(clock);
      const [i, j] = [3, 2];
      const k = (j * 5 + i) * 4;
      expect(sx * phases[k] + cx * phases[k + 1]).toBeCloseTo(Math.sin(clock + cellPhase(i, j, 0)), 5);
      expect(cy * phases[k + 2] - sy * phases[k + 3]).toBeCloseTo(Math.cos(clock * 1.3 + cellPhase(i, j, 1)), 5);
    }
  });

  it('asks for just enough frames to keep the wander smooth', () => {
    // 1.2 px × 0.35 Hz peaks at ~3.4 px/s: ~14 fps keeps steps at or below 0.25 px.
    expect(wanderFps(1.2, 0.35)).toBe(14);
    expect(wanderFps(2.4, 0.35)).toBe(28);
  });
});
