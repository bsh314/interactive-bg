import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { fluidStyle } from '../styles/fluid/definition';
import type { FluidOptions } from '../styles/fluid/options';
import { createFluidWebGL } from '../styles/fluid/webgl';

export type { FluidOptions };

/** An interactive fluid simulation, drawn with WebGL2 only. */
export const fluid: StyleFactory<FluidOptions> = defineStyle({
  ...fluidStyle,
  renderers: [webglRenderer(createFluidWebGL)],
});
