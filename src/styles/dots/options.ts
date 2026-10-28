export interface DotsOptions {
  /** Dot colour. Any CSS colour. */
  color: string;
  /** Opacity of the dots, from `0` to `1`. Multiplies any alpha in the colour. */
  opacity: number;
  /** Dot radius in CSS pixels. */
  size: number;
  /**
   * Distance between neighbouring dots in CSS pixels. The grid also keeps at least half of
   * this as empty space along every edge, so dots at the edges aren't clipped.
   */
  spacing: number;
  /** How far each dot wanders around its place, in CSS pixels. `0` = still. */
  jitter: number;
  /** How fast the dots wander, in cycles per second. `0` = still. */
  jitterSpeed: number;
  /** Radius around the pointer within which dots are pushed away, in CSS pixels. */
  pointerRadius: number;
  /** How far the dots right next to the pointer are pushed, in CSS pixels. Negative values pull them in. */
  pointerStrength: number;
  /** How fast a click wave travels outwards, in CSS pixels per second. */
  waveSpeed: number;
  /** How far a click wave pushes dots, in CSS pixels. `0` disables waves. */
  waveStrength: number;
  /** Width of a click wave's ring, in CSS pixels. */
  waveWidth: number;
  /** How long a click wave lasts before it has faded out, in seconds. */
  waveDuration: number;
}

export const dotsDefaults: Readonly<DotsOptions> = Object.freeze({
  color: '#8b95a5',
  opacity: 0.6,
  size: 1.6,
  spacing: 26,
  jitter: 1.2,
  jitterSpeed: 0.35,
  pointerRadius: 160,
  pointerStrength: 22,
  waveSpeed: 520,
  waveStrength: 10,
  waveWidth: 60,
  waveDuration: 1.8,
});

/** Options after clamping: what the renderers consume. */
export type ResolvedDotsOptions = DotsOptions;

export function resolveDotsOptions(options: DotsOptions): ResolvedDotsOptions {
  return {
    ...options,
    opacity: Math.min(1, Math.max(0, options.opacity)),
    size: Math.max(0.1, options.size),
    spacing: Math.max(4, options.spacing),
    jitter: Math.max(0, options.jitter),
    jitterSpeed: Math.max(0, options.jitterSpeed),
    pointerRadius: Math.max(1, options.pointerRadius),
    waveSpeed: Math.max(1, options.waveSpeed),
    waveWidth: Math.max(1, options.waveWidth),
    waveDuration: Math.max(0.05, options.waveDuration),
  };
}
