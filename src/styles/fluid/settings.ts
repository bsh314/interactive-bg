// Shared by the GPU and CPU simulations, so both produce the same kind of smoke.

/** How much dye one splash adds at its centre. */
export const DYE_INTENSITY = 0.15;
/** Seconds for the velocity field to lose about two thirds of its strength. */
export const VELOCITY_FADE = 0.5;
/** How much of the previous pressure field is kept between frames, as in the reference. */
export const PRESSURE_RETENTION = 0.1;
/** Pressure solve iterations (the CPU fallback uses fewer to stay cheap). */
export const PRESSURE_ITERATIONS = 20;
export const CPU_PRESSURE_ITERATIONS = 14;
/** The initial burst is this fraction of the pointer force: just enough to set the smoke moving. */
export const BURST_FORCE = 0.003;
/** The initial burst covers this many times the pointer splash radius. */
export const BURST_RADIUS = 2.2;
/** The initial burst adds this many times the usual dye, so it reads on an otherwise empty canvas. */
export const BURST_DYE = 2.2;
/** Seconds after the last splash before the extra idle fade begins. */
export const IDLE_DELAY = 0.5;
/** Effective dye fade time while the pointer is idle, in seconds. */
export const IDLE_DECAY = 0.7;
/** Seconds after the last splash when the field is cleared completely. */
export const IDLE_CLEAR = 3.5;

/** The dye texture is this many times the simulation grid, up to a cap. */
export const DYE_SCALE = 8;
export const MAX_DYE_RESOLUTION = 1440;
