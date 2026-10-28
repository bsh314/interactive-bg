import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { plusStyle } from '../styles/plus/definition';
import type { PlusOptions } from '../styles/plus/options';
import { createPlusWebGL } from '../styles/plus/webgl';

export type { PlusOptions };

/** A grid of "+" signs, drawn with WebGL2 only: nothing is drawn in browsers without it. */
export const plus: StyleFactory<PlusOptions> = defineStyle({ ...plusStyle, renderers: [webglRenderer(createPlusWebGL)] });
