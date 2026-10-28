export interface TopoOptions {
  /** Stroke colour of regular contour lines. Any CSS colour. */
  lineColor: string;
  /** Stroke colour of every `majorEvery`-th ("index") line. Defaults to `lineColor`. */
  majorLineColor?: string;
  /** Opacity of all lines, from `0` (invisible) to `1` (opaque). Multiplies any alpha in the colours. */
  lineOpacity: number;
  /** Width of regular lines, in CSS pixels. */
  lineWidth: number;
  /** Width of index lines, in CSS pixels. */
  majorLineWidth: number;
  /** Every n-th contour is drawn as an index line. `0` disables index lines. */
  majorEvery: number;
  /** Number of contour levels across the full elevation range. More = denser lines. */
  levels: number;
  /** Noise frequency per CSS pixel. Smaller = larger, smoother landforms. */
  scale: number;
  /** Noise octaves. More = more detailed, rougher terrain (and more CPU). */
  octaves: number;
  /** How fast the terrain morphs, in noise units per second. `0` = static. */
  speed: number;
  /** Size of a sampling cell in CSS pixels. Smaller = smoother lines, more CPU. */
  resolution: number;
  /** Seed for the terrain. Same seed, same landscape. Pass a random number for a different one on every load. */
  seed: number;
  /** Radius of the pointer's influence, in CSS pixels. */
  pointerRadius: number;
  /** Height of the bump under the pointer. Negative values dig a crater. */
  pointerStrength: number;
}

export const topoDefaults: Readonly<TopoOptions> = Object.freeze({
  lineColor: '#5b6576',
  majorLineColor: '#7dd3a8',
  lineOpacity: 0.5,
  lineWidth: 1,
  majorLineWidth: 1.75,
  majorEvery: 5,
  levels: 12,
  scale: 0.0025,
  octaves: 2,
  speed: 0.025,
  resolution: 6,
  seed: 1332056948,
  pointerRadius: 100,
  pointerStrength: 0.35,
});

/** Options after clamping and deriving: what the field and the renderers consume. */
export interface ResolvedTopoOptions {
  lineColor: string;
  majorLineColor: string;
  lineOpacity: number;
  lineWidth: number;
  majorLineWidth: number;
  /** Integer; `0` = no index lines. */
  majorEvery: number;
  /** Height difference between neighbouring contour levels. */
  levelStep: number;
  /** Grid spacing of the height field, in CSS pixels. */
  cellSize: number;
  octaves: number;
  scale: number;
  speed: number;
  seed: number;
  pointerRadius: number;
  pointerStrength: number;
}

export function resolveTopoOptions(options: TopoOptions): ResolvedTopoOptions {
  return {
    lineColor: options.lineColor,
    majorLineColor: options.majorLineColor ?? options.lineColor,
    lineOpacity: Math.min(1, Math.max(0, options.lineOpacity)),
    lineWidth: Math.max(0.1, options.lineWidth),
    majorLineWidth: Math.max(0.1, options.majorLineWidth),
    majorEvery: Math.max(0, Math.round(options.majorEvery)),
    // The height field spans roughly [-1, 1], so the levels cover a range of 2.
    levelStep: 2 / Math.max(1, options.levels),
    cellSize: Math.max(2, options.resolution),
    octaves: Math.max(1, Math.round(options.octaves)),
    scale: options.scale,
    // The keyframes only step forwards in time; morphing backwards looks the same, so use the magnitude.
    speed: Math.abs(options.speed),
    seed: options.seed,
    pointerRadius: Math.max(1, options.pointerRadius),
    pointerStrength: options.pointerStrength,
  };
}
