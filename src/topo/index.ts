import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { createTopoCanvas2D } from '../styles/topo/canvas2d';
import { topoStyle } from '../styles/topo/definition';
import type { TopoOptions } from '../styles/topo/options';
import { createTopoWebGL } from '../styles/topo/webgl';

export type { TopoOptions };

/** Animated topographic contour lines, drawn with WebGL2 where available and Canvas 2D otherwise. */
export const topo: StyleFactory<TopoOptions> = defineStyle({
  ...topoStyle,
  renderers: [webglRenderer(createTopoWebGL), canvas2dRenderer(createTopoCanvas2D)],
});
