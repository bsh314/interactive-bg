import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { createPlusCanvas2D } from '../styles/plus/canvas2d';
import { plusStyle } from '../styles/plus/definition';
import type { PlusOptions } from '../styles/plus/options';
import { createPlusWebGL } from '../styles/plus/webgl';

export type { PlusOptions };

/** A grid of "+" signs, drawn with WebGL2 where available and Canvas 2D otherwise. */
export const plus: StyleFactory<PlusOptions> = defineStyle({
  ...plusStyle,
  renderers: [webglRenderer(createPlusWebGL), canvas2dRenderer(createPlusCanvas2D)],
});
