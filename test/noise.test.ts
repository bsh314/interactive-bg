import { describe, expect, it } from 'vitest';
import { createNoise3D } from '../src/shared/noise';

describe('createNoise3D', () => {
  it('is deterministic for a given seed', () => {
    const a = createNoise3D(42);
    const b = createNoise3D(42);
    for (let i = 0; i < 50; i++) {
      expect(a(i * 0.37, i * 0.11, i * 0.05)).toBe(b(i * 0.37, i * 0.11, i * 0.05));
    }
  });

  it('differs between seeds', () => {
    const a = createNoise3D(1);
    const b = createNoise3D(2);
    expect(a(0.3, 1.7, 0.9)).not.toBe(b(0.3, 1.7, 0.9));
  });

  it('stays within [-1, 1]', () => {
    const noise = createNoise3D(7);
    for (let i = 0; i < 5000; i++) {
      const v = noise(Math.sin(i) * 100, Math.cos(i * 1.3) * 100, i * 0.01);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
