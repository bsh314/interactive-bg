import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { createTopoCanvas2D } from '../styles/topo/canvas2d';
import { topoStyle } from '../styles/topo/definition';
import type { TopoOptions } from '../styles/topo/options';

export type { TopoOptions };

/** Animated topographic contour lines, drawn with Canvas 2D only. */
export const topo: StyleFactory<TopoOptions> = defineStyle({ ...topoStyle, renderers: [canvas2dRenderer(createTopoCanvas2D)] });
