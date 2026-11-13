export interface FluidOptions {
  /**
   * Colour of the smoke, as any CSS colour. `null` (the default) cycles through
   * hues over time; set a colour to keep every splat that colour.
   */
  color: string | null;
  /** How many times per second the smoke picks a new hue while `color` is `null`. */
  colorSpeed: number;
  /** Opacity of the smoke, from `0` to `1`. Multiplies any alpha in `color`. */
  opacity: number;
  /** How strongly the fluid curls back on itself: vorticity confinement. `0` = no swirl. */
  curl: number;
  /** How hard pointer movement stirs the fluid. `0` = the pointer only adds dye. */
  force: number;
  /** Radius of each splash, in CSS pixels. */
  radius: number;
  /** Roughly how long the smoke takes to fade out, in seconds. */
  fade: number;
  /**
   * Simulation grid size: the longer side of the velocity/dye field, in cells.
   * Higher is smoother and more detailed, at more CPU or GPU cost. The Canvas 2D
   * fallback runs the whole simulation at this resolution.
   */
  resolution: number;
  /** Light the smoke from the dye's own gradients, for a sense of depth. */
  shading: boolean;
}

export const fluidDefaults: Readonly<FluidOptions> = Object.freeze({
  color: null,
  colorSpeed: 10,
  opacity: 0.85,
  curl: 10,
  force: 6000,
  radius: 75,
  fade: 0.3,
  resolution: 128,
  shading: true,
});

/** Options after clamping: what the simulation and the renderers consume. */
export type ResolvedFluidOptions = FluidOptions;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function resolveFluidOptions(options: FluidOptions): ResolvedFluidOptions {
  return {
    ...options,
    colorSpeed: Math.max(0, options.colorSpeed),
    opacity: clamp(options.opacity, 0, 1),
    curl: clamp(options.curl, 0, 100),
    force: Math.max(0, options.force),
    radius: Math.max(2, options.radius),
    fade: Math.max(0.2, options.fade),
    resolution: Math.round(clamp(options.resolution, 48, 192)),
  };
}
