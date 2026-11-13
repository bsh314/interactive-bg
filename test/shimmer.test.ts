import { describe, expect, it } from 'vitest';
import { shimmer } from '../src/shimmer';
import { renderShimmer } from '../src/styles/shimmer/field';
import { resolveShimmerOptions } from '../src/styles/shimmer/options';

const options = resolveShimmerOptions(shimmer.defaults);
const WHITE = [1, 1, 1] as const;

function image(width = 160, height = 100): ImageData {
  return { data: new Uint8ClampedArray(width * height * 4) } as ImageData;
}

function render(
  target: ImageData,
  influence = 0,
  overrides: Partial<typeof options> = {},
  base: readonly [number, number, number] = WHITE,
): void {
  renderShimmer(target, 160, 100, 1.5, 0.5, 0.5, influence, { ...options, ...overrides }, base);
}

describe('shimmer', () => {
  it('animates only while it flows, at a low idle frame rate', () => {
    expect(shimmer().definition.animates(shimmer().options)).toBe(true);
    expect(shimmer().definition.animates(shimmer({ speed: 0 }).options)).toBe(false);
    expect(shimmer().definition.idleFps?.(shimmer().options)).toBe(16);
  });

  it('uses the requested base colour and pointer bend by default', () => {
    expect(shimmer.defaults.baseColor).toBe('#5735ff');
    expect(shimmer.defaults.pointerStrength).toBe(0.35);
  });

  it('clamps its options', () => {
    const resolved = resolveShimmerOptions({
      ...shimmer.defaults,
      opacity: 4,
      speed: -1,
      frequency: 0,
      colorScale: 0,
      chroma: 1,
      warp: -1,
      pointerStrength: 9,
    });
    expect(resolved.opacity).toBe(1);
    expect(resolved.speed).toBe(0);
    expect(resolved.frequency).toBe(0.5);
    expect(resolved.colorScale).toBe(0.5);
    expect(resolved.chroma).toBe(0.2);
    expect(resolved.warp).toBe(0);
    expect(resolved.pointerStrength).toBe(1.5);
  });

  it('renders an opaque field with dark gaps and bright band crests', () => {
    const target = image();
    render(target);
    let dark = 0;
    let bright = 0;
    for (let k = 0; k < target.data.length; k += 4) {
      const value = Math.max(target.data[k], target.data[k + 1], target.data[k + 2]);
      if (target.data[k + 3] !== 255) continue;
      if (value < 80) dark++;
      if (value > 220) bright++;
    }
    expect(dark).toBeGreaterThan(0);
    expect(bright).toBeGreaterThan(0);
  });

  it('is deterministic for the same inputs', () => {
    const a = image();
    const b = image();
    render(a);
    render(b);
    expect(a.data).toEqual(b.data);
  });

  it('is grey without dispersion and coloured with it', () => {
    const grey = image();
    const colour = image();
    render(grey, 0, { chroma: 0 });
    render(colour, 0, { chroma: 0.08 });
    for (let k = 0; k < grey.data.length; k += 4) {
      expect(grey.data[k]).toBe(grey.data[k + 1]);
      expect(grey.data[k + 1]).toBe(grey.data[k + 2]);
    }
    let different = 0;
    for (let k = 0; k < colour.data.length; k += 4) {
      if (colour.data[k] !== colour.data[k + 1] || colour.data[k + 1] !== colour.data[k + 2]) different++;
    }
    expect(different).toBeGreaterThan(0);
  });

  it('uses the base colour in the dark parts of the field', () => {
    const target = image();
    render(target, 0, {}, [1, 0, 0]);
    let darkest = 255 * 3;
    let pixel = [0, 0, 0];
    for (let k = 0; k < target.data.length; k += 4) {
      const value = target.data[k] + target.data[k + 1] + target.data[k + 2];
      if (value < darkest) {
        darkest = value;
        pixel = [target.data[k], target.data[k + 1], target.data[k + 2]];
      }
    }
    expect(pixel[0]).toBeGreaterThan(pixel[1]);
    expect(pixel[0]).toBeGreaterThan(pixel[2]);
  });

  it('holds still at speed 0 and bends around the pointer', () => {
    const a = image();
    const b = image();
    render(a, 0, { speed: 0 });
    renderShimmer(b, 160, 100, 8, 0.5, 0.5, 0, { ...options, speed: 0 }, WHITE);
    expect(a.data).toEqual(b.data);

    const straight = image();
    const bent = image();
    render(straight, 0, { pointerStrength: 0 });
    render(bent, 1, { pointerStrength: 0.8 });
    expect(straight.data).not.toEqual(bent.data);
  });
});
