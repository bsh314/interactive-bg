import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { createFluidCanvas2D } from '../styles/fluid/canvas2d';
import { fluidStyle } from '../styles/fluid/definition';
import type { FluidOptions } from '../styles/fluid/options';

export type { FluidOptions };

/** An interactive fluid simulation, solved on the CPU and drawn with Canvas 2D. */
export const fluid: StyleFactory<FluidOptions> = defineStyle({
  ...fluidStyle,
  renderers: [canvas2dRenderer(createFluidCanvas2D)],
});
