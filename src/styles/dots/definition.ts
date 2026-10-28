import type { StyleBase } from '../../core/style';
import { wanderIdleFps } from '../../shared/grid';
import { dotsDefaults, type DotsOptions } from './options';

/**
 * A grid of dots that wander gently around their places. The pointer pushes
 * nearby dots away, more the closer they are, and clicks send out a wave.
 */
export const dotsStyle: StyleBase<DotsOptions> = {
  name: 'dots',
  defaults: dotsDefaults,
  animates: (options) => options.jitter > 0 && options.jitterSpeed > 0,
  // The wander is slow and sub-pixel, so it rarely needs the engine's full idle frame rate.
  idleFps: wanderIdleFps,
};
