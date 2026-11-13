import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { createShimmerCanvas2D } from '../styles/shimmer/canvas2d';
import { shimmerStyle } from '../styles/shimmer/definition';
import type { ShimmerOptions } from '../styles/shimmer/options';
import { createShimmerWebGL } from '../styles/shimmer/webgl';

export type { ShimmerOptions };

/** Iridescent light bands, drawn with WebGL2 where available and Canvas 2D otherwise. */
export const shimmer: StyleFactory<ShimmerOptions> = defineStyle({
  ...shimmerStyle,
  renderers: [webglRenderer(createShimmerWebGL), canvas2dRenderer(createShimmerCanvas2D)],
});
