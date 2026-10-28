import type { Frame, RendererName } from './style';

/** How far in from each edge the style's drawing fades out, in CSS pixels. `0` = no fade on that side. */
export interface Fade {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Whether any side fades. */
export function fades(fade: Fade): boolean {
  return fade.top > 0 || fade.right > 0 || fade.bottom > 0 || fade.left > 0;
}

/** A canvas context plus the style renderer drawing into it. */
export interface Surface<O> {
  readonly name: RendererName;
  update(options: O): void;
  /**
   * Clear to `backgroundColor` (`null` = transparent) and let the style draw, then fade the
   * style's drawing out towards the edges as `fade` says, keeping the background colour solid.
   * Fades on several sides multiply. Returns `true` while the style has a short-lived effect playing.
   */
  render(frame: Frame, backgroundColor: string | null, fade: Fade): boolean;
  /** Leave the canvas blank. */
  clear(): void;
  destroy(): void;
}

/**
 * One way to draw a style: a kind of canvas context plus the style's renderer
 * for it. Made with `webglRenderer()` or `canvas2dRenderer()`, each in its own
 * module, so a style only bundles the backends it lists.
 */
export interface Renderer<O> {
  readonly name: RendererName;
  /** Set up on `canvas`, or return `null` if this kind of context isn't available. */
  create(canvas: HTMLCanvasElement, options: O, invalidate: () => void): Surface<O> | null;
}

/**
 * Set up the first renderer that works here, trying them in the style's order,
 * with `preference` (if the style has it) first. `null` if none works.
 *
 * A canvas keeps the first kind of context it hands out, so after a renderer
 * fails, `replaceCanvas` (if given) swaps in a fresh canvas for the next one.
 */
export function createSurface<O>(
  canvas: () => HTMLCanvasElement,
  renderers: readonly Renderer<O>[],
  options: O,
  preference: 'auto' | RendererName,
  invalidate: () => void,
  replaceCanvas?: () => void,
): Surface<O> | null {
  const ordered =
    preference === 'auto'
      ? renderers
      : [...renderers.filter((r) => r.name === preference), ...renderers.filter((r) => r.name !== preference)];
  for (const [k, renderer] of ordered.entries()) {
    if (k > 0) replaceCanvas?.();
    const surface = renderer.create(canvas(), options, invalidate);
    if (surface) return surface;
  }
  return null;
}
