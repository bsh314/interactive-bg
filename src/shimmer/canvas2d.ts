import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { createShimmerCanvas2D } from '../styles/shimmer/canvas2d';
import { shimmerStyle } from '../styles/shimmer/definition';
import type { ShimmerOptions } from '../styles/shimmer/options';

export type { ShimmerOptions };

/** Iridescent light bands, drawn with Canvas 2D only. */
export const shimmer: StyleFactory<ShimmerOptions> = defineStyle({
  ...shimmerStyle,
  renderers: [canvas2dRenderer(createShimmerCanvas2D)],
});
