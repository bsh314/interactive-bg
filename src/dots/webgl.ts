import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { dotsStyle } from '../styles/dots/definition';
import type { DotsOptions } from '../styles/dots/options';
import { createDotsWebGL } from '../styles/dots/webgl';

export type { DotsOptions };

/** A grid of wandering dots, drawn with WebGL2 only: nothing is drawn in browsers without it. */
export const dots: StyleFactory<DotsOptions> = defineStyle({ ...dotsStyle, renderers: [webglRenderer(createDotsWebGL)] });
