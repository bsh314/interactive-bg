import type { StyleBase } from '../../core/style';
import { wanderIdleFps } from '../../shared/grid';
import { plusDefaults, type PlusOptions } from './options';

/**
 * A grid of "+" signs that wander gently around their places. While the
 * pointer is over the background, every sign turns smoothly so an arm points
 * at it. Clicks send out a wave that turns the signs on its crest to face the
 * click and makes them heavier as it passes.
 */
export const plusStyle: StyleBase<PlusOptions> = {
  name: 'plus',
  defaults: plusDefaults,
  animates: (options) => options.jitter > 0 && options.jitterSpeed > 0,
  // Same slow, sub-pixel wander as dots: it rarely needs the engine's full idle frame rate.
  idleFps: wanderIdleFps,
};
