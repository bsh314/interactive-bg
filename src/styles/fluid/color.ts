import { parseColor } from '../../core/color';
import type { ResolvedFluidOptions } from './options';

export type RGB = readonly [number, number, number];

/** HSL (all in 0–1) to straight RGB. */
function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let k = t % 1;
    if (k < 0) k += 1;
    if (k < 1 / 6) return p + (q - p) * 6 * k;
    if (k < 1 / 2) return q;
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/** The colour of a splash made at `clock` seconds: the fixed colour, or the cycling hue. */
export function splatColor(options: ResolvedFluidOptions, clock: number): RGB {
  if (options.color) {
    const [r, g, b, a] = parseColor(options.color);
    return [r * a, g * a, b * a];
  }
  const step = Math.floor(clock * options.colorSpeed);
  const hue = (((0.55 + step * 0.61803398875) % 1) + 1) % 1;
  return hslToRgb(hue, 1, 0.5);
}
