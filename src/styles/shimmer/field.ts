import type { ResolvedShimmerOptions } from './options';

/** Long side of the CPU fallback's field. The reference field is very soft. */
export const CPU_RESOLUTION = 128;
/** The reference's clock runs at this many time units per second. */
export const TIME_RATE = 0.22;
/** How much of the warped colour replaces the base colour. */
const COLOR_MIX = 0.8;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const LUT_SIZE = 2048;
const SIN_LUT = new Float32Array(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) SIN_LUT[i] = Math.sin((i / LUT_SIZE) * TAU);

/** Interpolated sine lookup: the CPU field is trig-heavy and runs every frame. */
function fastSin(x: number): number {
  let t = (x * LUT_SIZE) / TAU;
  t -= Math.floor(t / LUT_SIZE) * LUT_SIZE;
  const i = t | 0;
  const f = t - i;
  return SIN_LUT[i] + (SIN_LUT[i + 1] - SIN_LUT[i]) * f;
}

function fastCos(x: number): number {
  return fastSin(x + HALF_PI);
}

/**
 * The CPU mirror of the reference shader. `time` is the style clock in seconds;
 * the field is evaluated at `width` × `height` and written into `image`.
 * Coordinates are top-left based; the shader flips its UVs to match.
 */
export function renderShimmer(
  image: ImageData,
  width: number,
  height: number,
  time: number,
  pointerX: number,
  pointerY: number,
  influence: number,
  options: ResolvedShimmerOptions,
  base: readonly [number, number, number],
): void {
  const data = image.data;
  const t = time * TIME_RATE * options.speed;
  const frequency = options.frequency;
  const colorScale = options.colorScale;
  const warp = options.warp;
  const chroma = options.chroma;
  const opacity = options.opacity;
  const pointer = options.pointerStrength * influence;
  const aspect = Math.max(1, width) / Math.max(1, height);

  const distort = (x: number, y: number, offset: number): number => {
    let px = x + offset;
    let py = y + offset;
    for (let i = 1; i < 7; i++) {
      px += (warp * 0.3 * fastSin(i * 5 * py + t)) / i;
      py += (warp * 0.1 * fastCos(i * 3 * px + t)) / i;
    }
    return px;
  };

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;

      // Optional pointer lens, in screen-height units like the shader.
      let su = u;
      let sv = v;
      if (pointer > 0) {
        const dx = (u - pointerX) * aspect;
        const dy = v - pointerY;
        const lens = Math.exp(-(dx * dx + dy * dy) / 0.03) * pointer;
        su += (dx / aspect) * lens;
        sv += dy * lens;
      }

      const r = fastSin(distort(su, sv, 0) * frequency) * 0.5 + 0.5;
      const g = fastSin(distort(su, sv, chroma) * frequency) * 0.5 + 0.5;
      const b = fastSin(distort(su, sv, 2 * chroma) * frequency) * 0.5 + 0.5;
      const pr = Math.pow(r, colorScale);
      const pg = Math.pow(g, colorScale);
      const pb = Math.pow(b, colorScale);

      const red = base[0] * (1 - COLOR_MIX) + pr * COLOR_MIX;
      const green = base[1] * (1 - COLOR_MIX) + pg * COLOR_MIX;
      const blue = base[2] * (1 - COLOR_MIX) + pb * COLOR_MIX;

      const o = (y * width + x) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, red)) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.max(0, green)) * 255);
      data[o + 2] = Math.round(Math.min(1, Math.max(0, blue)) * 255);
      data[o + 3] = Math.round(opacity * 255);
    }
  }
}
