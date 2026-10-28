import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { createDotsCanvas2D } from '../styles/dots/canvas2d';
import { dotsStyle } from '../styles/dots/definition';
import type { DotsOptions } from '../styles/dots/options';
import { createDotsWebGL } from '../styles/dots/webgl';

export type { DotsOptions };

/** A grid of wandering dots, drawn with WebGL2 where available and Canvas 2D otherwise. */
export const dots: StyleFactory<DotsOptions> = defineStyle({
  ...dotsStyle,
  renderers: [webglRenderer(createDotsWebGL), canvas2dRenderer(createDotsCanvas2D)],
});
