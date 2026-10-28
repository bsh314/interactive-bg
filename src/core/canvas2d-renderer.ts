import type { StyleRenderer } from './style';
import { fades, type Fade, type Renderer } from './surface';

const SIDES: readonly (keyof Fade)[] = ['top', 'right', 'bottom', 'left'];

/**
 * Draw a style with Canvas 2D. The engine clears to the background colour and
 * sets the transform so the style draws in CSS pixels.
 */
export function canvas2dRenderer<O>(
  createRenderer: (ctx: CanvasRenderingContext2D, options: O) => StyleRenderer<O>,
): Renderer<O> {
  return {
    name: 'canvas2d',
    create(canvas, options) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const renderer = createRenderer(ctx, options);

      // One gradient per side, kept while the canvas size and fade length stay the same.
      const gradients: { gradient: CanvasGradient | null; size: number; length: number }[] = SIDES.map(() => ({
        gradient: null,
        size: 0,
        length: 0,
      }));

      /**
       * Erase the style's drawing gradually along one side: nothing `length` px in from the edge,
       * all of it at the edge. Erasing multiplies, so overlapping sides combine.
       */
      const fadeSide = (side: number, length: number, width: number, height: number): void => {
        const horizontal = side === 1 || side === 3; // right, left
        const size = horizontal ? width : height;
        const cache = gradients[side];
        if (!cache.gradient || cache.size !== size || cache.length !== length) {
          // From the inner end of the strip to the edge.
          const [x0, y0, x1, y1] = [
            [0, length, 0, 0], // top
            [width - length, 0, width, 0], // right
            [0, height - length, 0, height], // bottom
            [length, 0, 0, 0], // left
          ][side];
          cache.gradient = ctx.createLinearGradient(x0, y0, x1, y1);
          cache.gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
          cache.gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
          cache.size = size;
          cache.length = length;
        }
        const strip = Math.min(length, size);
        ctx.fillStyle = cache.gradient;
        if (side === 0) ctx.fillRect(0, 0, width, strip);
        else if (side === 1) ctx.fillRect(width - strip, 0, strip, height);
        else if (side === 2) ctx.fillRect(0, height - strip, width, strip);
        else ctx.fillRect(0, 0, strip, height);
      };

      return {
        name: 'canvas2d',
        update(next) {
          renderer.update(next);
        },
        render(frame, backgroundColor, fade) {
          const { width, height, dpr } = frame;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, width, height);
          // With a fade, the background goes in last, behind the faded drawing, so it stays solid.
          const fading = fades(fade);
          if (backgroundColor && !fading) {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
          }
          const busy = renderer.render(frame) === true;
          if (fading) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'destination-out';
            for (let side = 0; side < SIDES.length; side++) {
              const length = fade[SIDES[side]];
              if (length > 0) fadeSide(side, length, width, height);
            }
            if (backgroundColor) {
              ctx.globalCompositeOperation = 'destination-over';
              ctx.fillStyle = backgroundColor;
              ctx.fillRect(0, 0, width, height);
            }
            ctx.globalCompositeOperation = 'source-over';
          }
          return busy;
        },
        clear() {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        },
        destroy() {
          renderer.destroy?.();
        },
      };
    },
  };
}
