import { defineStyle, type StyleFactory } from '../core/style';
import { webglRenderer } from '../core/webgl-renderer';
import { shimmerStyle } from '../styles/shimmer/definition';
import type { ShimmerOptions } from '../styles/shimmer/options';
import { createShimmerWebGL } from '../styles/shimmer/webgl';

export type { ShimmerOptions };

/** Iridescent light bands, drawn with WebGL2 only. */
export const shimmer: StyleFactory<ShimmerOptions> = defineStyle({
  ...shimmerStyle,
  renderers: [webglRenderer(createShimmerWebGL)],
});
