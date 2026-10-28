export type RGBA = readonly [r: number, g: number, b: number, a: number];

const TRANSPARENT: RGBA = [0, 0, 0, 0];

let probe: CanvasRenderingContext2D | null = null;
const cache = new Map<string, RGBA>();

/**
 * Resolve any CSS colour to straight (non-premultiplied) sRGB components in 0–1,
 * by letting the browser paint it into a 1×1 canvas. Results are cached.
 */
export function parseColor(color: string | null): RGBA {
  if (!color || color === 'transparent') return TRANSPARENT;
  const cached = cache.get(color);
  if (cached) return cached;

  if (!probe) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
    if (!probe) return [0, 0, 0, 1];
  }
  probe.clearRect(0, 0, 1, 1);
  // An invalid colour leaves fillStyle unchanged, so it falls back to black.
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  const rgba: RGBA = [r / 255, g / 255, b / 255, a / 255];
  if (cache.size > 64) cache.clear();
  cache.set(color, rgba);
  return rgba;
}
