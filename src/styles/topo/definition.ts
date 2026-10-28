import type { StyleBase } from '../../core/style';
import { topoDefaults, type TopoOptions } from './options';

/**
 * Animated topographic contour lines. The terrain drifts slowly and rises
 * (or, with a negative `pointerStrength`, sinks) under the pointer.
 */
export const topoStyle: StyleBase<TopoOptions> = {
  name: 'topo',
  defaults: topoDefaults,
  animates: (options) => options.speed !== 0,
};
