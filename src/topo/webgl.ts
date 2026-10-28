import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { topoStyle } from '../styles/topo/definition';
import type { TopoOptions } from '../styles/topo/options';
import { createTopoWebGL } from '../styles/topo/webgl';

export type { TopoOptions };

/** Animated topographic contour lines, drawn with WebGL2 only: nothing is drawn in browsers without it. */
export const topo: StyleFactory<TopoOptions> = defineStyle({ ...topoStyle, renderers: [webglRenderer(createTopoWebGL)] });
