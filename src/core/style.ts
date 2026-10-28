import type { Renderer } from './surface';

export type RendererName = 'webgl' | 'canvas2d';

/** A position in CSS pixels relative to the canvas. */
export interface Point {
  x: number;
  y: number;
}

/** The pointer as a style sees it. */
export interface Pointer extends Point {
  /** Eases from 0 to 1 while the pointer is over the canvas, and back when it leaves. Always 0 when not interactive. */
  influence: number;
}

/** What a style gets for each frame. The engine reuses this object: read it during `render()`, don't keep it. */
export interface Frame {
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;
  /** Pixel density the canvas is rendered at. */
  dpr: number;
  /** Seconds since the previous frame (`0` on the first frame after a pause). */
  dt: number;
  /**
   * The user prefers reduced motion (and `respectReducedMotion` is on): hold the
   * style's own ambient animation still. Reactions to the pointer and clicks may still play.
   */
  reducedMotion: boolean;
  pointer: Pointer;
  /** Clicks / taps on the canvas since the previous frame. Empty when not interactive. */
  clicks: readonly Point[];
}

/**
 * Draws one style into a canvas. The engine has already cleared the canvas, and
 * takes care of the background colour and the edge fades, so just draw the pattern:
 * - Canvas 2D: the transform is set so you draw in CSS pixels.
 * - WebGL: the viewport covers the canvas, and blending is set up for premultiplied alpha
 *   (`ONE, ONE_MINUS_SRC_ALPHA`), so output premultiplied colour.
 */
export interface StyleRenderer<O> {
  /** The style's options changed. */
  update(options: O): void;
  /**
   * Draw one frame. Return `true` while a short-lived effect (e.g. a click ripple)
   * is still playing: the engine then keeps rendering at the full frame rate.
   */
  render(frame: Frame): boolean | void;
  /** Free GPU resources and the like. */
  destroy?(): void;
}

export interface StyleDefinition<O extends object> {
  /** Unique, lowercase name, e.g. `'topo'`. */
  name: string;
  defaults: Readonly<O>;
  /**
   * Whether the background moves on its own with these options. When it doesn't,
   * the engine only renders on pointer movement and option changes.
   */
  animates(options: O): boolean;
  /**
   * The lowest frame rate at which the ambient animation still looks smooth with
   * these options. The engine renders the ambient animation at the lower of this
   * and its `idleFps`. Omit to always use `idleFps`.
   */
  idleFps?(options: O): number;
  /**
   * How the style can be drawn, made with `webglRenderer()` and `canvas2dRenderer()`, in order of
   * preference: the engine uses the first one the browser supports. At least one.
   */
  renderers: readonly Renderer<O>[];
}

/** Everything about a style except how it's drawn: shared by its WebGL-only, Canvas 2D-only and auto builds. */
export type StyleBase<O extends object> = Omit<StyleDefinition<O>, 'renderers'>;

/** A style with its options filled in, ready for `createBackground()`. */
export interface Style<O extends object> {
  readonly definition: StyleDefinition<O>;
  readonly options: Readonly<O>;
}

export interface StyleFactory<O extends object> {
  (options?: Partial<O>): Style<O>;
  readonly styleName: string;
  readonly defaults: Readonly<O>;
}

/**
 * Turn a style definition into the function users call, e.g. `topo({ levels: 14 })`.
 */
export function defineStyle<O extends object>(definition: StyleDefinition<O>): StyleFactory<O> {
  if (definition.renderers.length === 0) {
    throw new Error(`interactive-bg: style "${definition.name}" has no renderer`);
  }
  const factory = (options: Partial<O> = {}): Style<O> => ({
    definition,
    options: { ...definition.defaults, ...options },
  });
  return Object.assign(factory, { styleName: definition.name, defaults: definition.defaults });
}
