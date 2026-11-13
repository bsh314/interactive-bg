import { describe, expect, it } from 'vitest';
import { fluid } from '../src/fluid';
import { splatColor } from '../src/styles/fluid/color';
import { resolveFluidOptions } from '../src/styles/fluid/options';
import { createFluidSimulation } from '../src/styles/fluid/simulation';
import { simulationSize } from '../src/styles/fluid/size';

const options = resolveFluidOptions({
  ...fluid.defaults,
  color: null,
  force: 0,
  curl: 0,
  fade: 1e6,
});

function dyeSum(sim: ReturnType<typeof createFluidSimulation>): number {
  let sum = 0;
  for (let k = 0; k < sim.dyeR.length; k++) sum += sim.dyeR[k] + sim.dyeG[k] + sim.dyeB[k];
  return sum;
}

function dyeCentroid(sim: ReturnType<typeof createFluidSimulation>): { x: number; y: number } {
  let weight = 0;
  let x = 0;
  let y = 0;
  for (let j = 0; j < sim.height; j++) {
    for (let i = 0; i < sim.width; i++) {
      const w = sim.dyeR[j * sim.width + i];
      weight += w;
      x += w * (i + 0.5);
      y += w * (j + 0.5);
    }
  }
  return weight === 0 ? { x: 0, y: 0 } : { x: x / weight, y: y / weight };
}

describe('fluid', () => {
  it('does not report an ambient animation: it settles and lets the engine sleep', () => {
    expect(fluid().definition.animates(fluid().options)).toBe(false);
  });

  it('clamps its options', () => {
    const resolved = resolveFluidOptions({
      ...fluid.defaults,
      opacity: 4,
      curl: -2,
      force: -10,
      radius: 0,
      fade: 0,
      resolution: 999,
      colorSpeed: -1,
    });
    expect(resolved.opacity).toBe(1);
    expect(resolved.curl).toBe(0);
    expect(resolved.force).toBe(0);
    expect(resolved.radius).toBe(2);
    expect(resolved.fade).toBe(0.2);
    expect(resolved.resolution).toBe(192);
    expect(resolved.colorSpeed).toBe(0);
  });

  it('cycles hues when no colour is set, and holds still without colour speed', () => {
    const cycling = splatColor(options, 0);
    const later = splatColor(options, 2);
    expect(cycling).not.toEqual(later);
    for (const channel of cycling) expect(channel).toBeGreaterThanOrEqual(0);
    for (const channel of cycling) expect(channel).toBeLessThanOrEqual(1);

    const still = resolveFluidOptions({ ...options, colorSpeed: 0 });
    expect(splatColor(still, 0)).toEqual(splatColor(still, 10));
  });

  it('sizes the grid from the longer side', () => {
    expect(simulationSize(128, 800, 400)).toEqual({ width: 128, height: 64 });
    expect(simulationSize(128, 400, 800)).toEqual({ width: 64, height: 128 });
    expect(simulationSize(128, 1, 1)).toEqual({ width: 128, height: 128 });
  });

  it('adds dye and velocity around a splash, not across the whole field', () => {
    const sim = createFluidSimulation(64, 64);
    sim.splat(32, 32, 0, 0, [1, 1, 1], 8, 64, 64);
    const centre = sim.dyeR[32 * 64 + 32];
    expect(centre).toBeGreaterThan(0.05);
    expect(sim.dyeR[0]).toBe(0);
    expect(sim.dyeR[63]).toBe(0);
    expect(sim.dyeG[32 * 64 + 32]).toBeGreaterThan(0.05);
    expect(sim.dyeB[32 * 64 + 32]).toBeGreaterThan(0.05);
  });

  it('keeps the dye where it is when the fluid is still', () => {
    const sim = createFluidSimulation(48, 32);
    sim.splat(40, 24, 0, 0, [1, 1, 1], 6, 80, 48);
    const before = dyeSum(sim);
    for (let frame = 0; frame < 30; frame++) sim.step(1 / 60, options);
    expect(dyeSum(sim) / before).toBeCloseTo(1, 1);
  });

  it('carries dye along with the velocity field', () => {
    const sim = createFluidSimulation(64, 48);
    sim.splat(12, 24, 40, 0, [1, 1, 1], 6, 64, 48);
    const before = dyeCentroid(sim);
    for (let frame = 0; frame < 40; frame++) sim.step(1 / 60, options);
    const after = dyeCentroid(sim);
    expect(after.x).toBeGreaterThan(before.x + 2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(4);
  });

  it('can clear the field completely', () => {
    const sim = createFluidSimulation(48, 32);
    sim.splat(24, 16, 40, 0, [1, 1, 1], 8, 48, 32);
    sim.step(1 / 60, options);
    expect(dyeSum(sim)).toBeGreaterThan(0);
    sim.clear();
    expect(dyeSum(sim)).toBe(0);
  });

  it('fades the dye out over time', () => {
    const fading = resolveFluidOptions({ ...options, fade: 0.5 });
    const sim = createFluidSimulation(48, 32);
    sim.splat(24, 16, 0, 0, [1, 1, 1], 6, 48, 32);
    const before = dyeSum(sim);
    for (let frame = 0; frame < 120; frame++) sim.step(1 / 60, fading);
    expect(dyeSum(sim)).toBeLessThan(before * 0.5);
  });

  it('curls the field back on itself when curl is on', () => {
    const curling = resolveFluidOptions({ ...options, curl: 40 });
    const plain = createFluidSimulation(64, 48);
    const curled = createFluidSimulation(64, 48);
    for (const sim of [plain, curled]) {
      sim.splat(16, 24, 40, 10, [1, 1, 1], 10, 64, 48);
      for (let frame = 0; frame < 10; frame++) sim.step(1 / 60, options);
    }
    const before = dyeCentroid(curled);
    for (let frame = 0; frame < 40; frame++) curled.step(1 / 60, curling);
    const after = dyeCentroid(curled);
    expect(Number.isFinite(after.x)).toBe(true);
    expect(Number.isFinite(after.y)).toBe(true);
    expect(after.x === before.x && after.y === before.y).toBe(false);
  });
});
