import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { createFluidCanvas2D } from '../styles/fluid/canvas2d';
import { fluidStyle } from '../styles/fluid/definition';
import type { FluidOptions } from '../styles/fluid/options';
import { createFluidWebGL } from '../styles/fluid/webgl';

export type { FluidOptions };

/** An interactive fluid simulation, drawn with WebGL2 where available and a CPU simulation otherwise. */
export const fluid: StyleFactory<FluidOptions> = defineStyle({
  ...fluidStyle,
  renderers: [webglRenderer(createFluidWebGL), canvas2dRenderer(createFluidCanvas2D)],
});
