import type { StyleBase } from '../../core/style';
import { fluidDefaults, type FluidOptions } from './options';

/**
 * A GPU fluid simulation: pointer movement injects velocity and dye, the dye is
 * advected into curling plumes, and clicks send out a burst. A gentle splash
 * plays when the background appears; otherwise it is still until stirred.
 */
export const fluidStyle: StyleBase<FluidOptions> = {
  name: 'fluid',
  defaults: fluidDefaults,
  // Nothing animates on its own: the initial burst and every reaction keep the
  // engine awake by returning true from render() until the smoke has settled.
  animates: () => false,
};
