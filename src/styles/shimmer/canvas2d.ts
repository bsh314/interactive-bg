import { parseColor } from '../../core/color';
import type { Frame, StyleRenderer } from '../../core/style';
import { CPU_RESOLUTION, renderShimmer } from './field';
import { resolveShimmerOptions, type ShimmerOptions } from './options';

function fieldSize(width: number, height: number): { width: number; height: number } {
  const aspect = Math.max(1, width) / Math.max(1, height);
  if (aspect >= 1) return { width: CPU_RESOLUTION, height: Math.max(1, Math.round(CPU_RESOLUTION / aspect)) };
  return { width: Math.max(1, Math.round(CPU_RESOLUTION * aspect)), height: CPU_RESOLUTION };
}

/** CPU mirror of the analytic band field, at low resolution and upscaled. */
const CPU_FPS = 12;

export function createShimmerCanvas2D(
  ctx: CanvasRenderingContext2D,
  initial: ShimmerOptions,
): StyleRenderer<ShimmerOptions> {
  let options = resolveShimmerOptions(initial);
  let clock = 0;
  let accumulator = 0;
  let hasFrame = false;

  let target: HTMLCanvasElement | null = null;
  let targetCtx: CanvasRenderingContext2D | null = null;
  let image: ImageData | null = null;
  let fieldWidth = 0;
  let fieldHeight = 0;
  let builtWidth = 0;
  let builtHeight = 0;

  function allocate(width: number, height: number): void {
    const size = fieldSize(width, height);
    fieldWidth = size.width;
    fieldHeight = size.height;
    target = document.createElement('canvas');
    target.width = fieldWidth;
    target.height = fieldHeight;
    targetCtx = target.getContext('2d');
    image = targetCtx?.createImageData(fieldWidth, fieldHeight) ?? null;
    builtWidth = width;
    builtHeight = height;
    accumulator = 0;
    hasFrame = false;
  }

  return {
    update(next) {
      options = resolveShimmerOptions(next);
    },
    render(frame: Frame) {
      if (!image || frame.width !== builtWidth || frame.height !== builtHeight) {
        allocate(frame.width, frame.height);
      }
      if (!image || !target || !targetCtx) return;

      // Recompute the field at 20 fps; the engine may call us at 60 fps while
      // the pointer moves, but this field is slow and soft.
      if (frame.reducedMotion) {
        if (!hasFrame) {
          const [baseR, baseG, baseB] = parseColor(options.baseColor);
          renderShimmer(
            image,
            fieldWidth,
            fieldHeight,
            clock,
            0.5,
            0.5,
            0,
            options,
            [baseR, baseG, baseB],
          );
          targetCtx.putImageData(image, 0, 0);
          hasFrame = true;
        }
      } else {
        accumulator += frame.dt;
        if (!hasFrame || accumulator >= 1 / CPU_FPS) {
          clock += accumulator;
          accumulator = 0;
          const [baseR, baseG, baseB] = parseColor(options.baseColor);
          renderShimmer(
            image,
            fieldWidth,
            fieldHeight,
            clock,
            frame.pointer.x / Math.max(1, frame.width),
            frame.pointer.y / Math.max(1, frame.height),
            frame.pointer.influence,
            options,
            [baseR, baseG, baseB],
          );
          targetCtx.putImageData(image, 0, 0);
          hasFrame = true;
        }
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(target, 0, 0, frame.width, frame.height);
    },
  };
}
