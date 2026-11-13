export interface ShimmerOptions {
  /** Opacity of the finished field, from `0` to `1`. `1` is the opaque reference canvas. */
  opacity: number;
  /** How fast the field flows. `1` matches the reference's slow drift. `0` = still. */
  speed: number;
  /** Sine frequency of the bands. Higher = more, narrower bands. The reference uses `7`. */
  frequency: number;
  /** Gamma applied to the bands. Higher = darker gaps and brighter crests. The reference uses `10`. */
  colorScale: number;
  /** Colour mixed into the 20% base of the field. The reference uses white. */
  baseColor: string;
  /** Separation between the red, green and blue channel warps: chromatic dispersion. The reference uses `0.02`. */
  chroma: number;
  /** Multiplier for the sine/cosine distortion. `1` is the reference; `0` = straight bands. */
  warp: number;
  /** Optional pointer lens that bends the bands locally. `0` keeps the reference's ambient field. */
  pointerStrength: number;
}

export const shimmerDefaults: Readonly<ShimmerOptions> = Object.freeze({
  opacity: 1,
  speed: 1,
  frequency: 7,
  colorScale: 10,
  baseColor: '#5735ff',
  chroma: 0.02,
  warp: 1,
  pointerStrength: 0.35,
});

/** Options after clamping: what the shader and the CPU field consume. */
export type ResolvedShimmerOptions = ShimmerOptions;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function resolveShimmerOptions(options: ShimmerOptions): ResolvedShimmerOptions {
  return {
    ...options,
    opacity: clamp(options.opacity, 0, 1),
    speed: Math.max(0, options.speed),
    frequency: clamp(options.frequency, 0.5, 40),
    colorScale: clamp(options.colorScale, 0.5, 40),
    chroma: clamp(options.chroma, 0, 0.2),
    warp: clamp(options.warp, 0, 4),
    pointerStrength: clamp(options.pointerStrength, 0, 1.5),
  };
}
