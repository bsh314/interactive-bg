import type { Frame } from '../../core/style';
import { createKeyframeField, type KeyframeField } from './field';
import type { ResolvedTopoOptions } from './options';

/** The animated height field both topo renderers draw: keyframes plus the clock that drives them. */
export interface Terrain {
  readonly field: KeyframeField;
  configure(options: ResolvedTopoOptions): void;
  /** Move the terrain forward by one frame and return the blend factor between the keyframes. */
  advance(frame: Frame): number;
}

export function createTerrain(initial: ResolvedTopoOptions): Terrain {
  const field = createKeyframeField(initial);
  let speed = initial.speed;
  let time = 0;
  return {
    field,
    configure(options) {
      field.configure(options);
      speed = options.speed;
    },
    advance(frame) {
      field.resize(frame.width, frame.height);
      if (!frame.reducedMotion) time += frame.dt * speed;
      return field.advance(time);
    },
  };
}
