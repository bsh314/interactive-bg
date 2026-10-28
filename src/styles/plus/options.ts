export interface PlusOptions {
  /** Colour of the signs. Any CSS colour. */
  color: string;
  /** Opacity of the signs, from `0` to `1`. Multiplies any alpha in the colour. */
  opacity: number;
  /** Length of each arm from the centre, in CSS pixels. */
  size: number;
  /** Stroke weight of the arms, in CSS pixels. */
  weight: number;
  /**
   * Distance between neighbouring signs in CSS pixels. The grid also keeps at least half of
   * this as empty space along every edge, so signs at the edges aren't clipped.
   */
  spacing: number;
  /** How far each sign wanders around its place, in CSS pixels. `0` = still. */
  jitter: number;
  /** How fast the signs wander, in cycles per second. `0` = still. */
  jitterSpeed: number;
  /**
   * How fully the signs turn to face the pointer while it's over the background, from `0` (not at all)
   * to `1` (an arm of every sign points straight at the pointer).
   */
  pointerAlign: number;
  /**
   * How smoothly signs turn, in seconds: about how long a sign takes to cover two thirds of a turn.
   * `0` = they snap to their new angle at once.
   */
  turnTime: number;
  /** How fast a click wave travels outwards, in CSS pixels per second. */
  waveSpeed: number;
  /** How fully signs on a click wave's crest turn to face the click, from `0` to `1`. */
  waveAlign: number;
  /** How much heavier a click wave makes the signs it passes: `1` doubles the weight on the crest. */
  waveWeight: number;
  /** Width of a click wave's ring, in CSS pixels. */
  waveWidth: number;
  /** How long a click wave lasts before it has faded out, in seconds. */
  waveDuration: number;
}

export const plusDefaults: Readonly<PlusOptions> = Object.freeze({
  color: '#8b95a5',
  opacity: 0.6,
  size: 4,
  weight: 1.2,
  spacing: 28,
  jitter: 1,
  jitterSpeed: 0.35,
  pointerAlign: 1,
  turnTime: 0.25,
  waveSpeed: 520,
  waveAlign: 1,
  waveWeight: 1.5,
  waveWidth: 60,
  waveDuration: 1.8,
});

/** Options after clamping: what the renderers consume. */
export type ResolvedPlusOptions = PlusOptions;

const unit = (value: number) => Math.min(1, Math.max(0, value));

export function resolvePlusOptions(options: PlusOptions): ResolvedPlusOptions {
  return {
    ...options,
    opacity: unit(options.opacity),
    size: Math.max(0.5, options.size),
    weight: Math.max(0.1, options.weight),
    spacing: Math.max(4, options.spacing),
    jitter: Math.max(0, options.jitter),
    jitterSpeed: Math.max(0, options.jitterSpeed),
    pointerAlign: unit(options.pointerAlign),
    turnTime: Math.max(0, options.turnTime),
    waveSpeed: Math.max(1, options.waveSpeed),
    waveAlign: unit(options.waveAlign),
    waveWeight: Math.max(0, options.waveWeight),
    waveWidth: Math.max(1, options.waveWidth),
    waveDuration: Math.max(0.05, options.waveDuration),
  };
}

/** Clicks start a wave only if it would change something. */
export function wavesEnabled(options: ResolvedPlusOptions): boolean {
  return options.waveAlign !== 0 || options.waveWeight !== 0;
}
