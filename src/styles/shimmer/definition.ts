import type { StyleBase } from '../../core/style';
import { shimmerDefaults, type ShimmerOptions } from './options';

/**
 * Iridescent light bands, reproduced from the reference's `sr-ground-canvas`:
 * six coupled sine/cosine warps, per-channel offsets and a high-power sine
 * field, mixed 80% with a base colour.
 */
export const shimmerStyle: StyleBase<ShimmerOptions> = {
  name: 'shimmer',
  defaults: shimmerDefaults,
  animates: (options) => options.speed > 0,
  // The field drifts slowly; 24 fps is plenty and keeps the CPU fallback cheap.
  idleFps: () => 16,
};
