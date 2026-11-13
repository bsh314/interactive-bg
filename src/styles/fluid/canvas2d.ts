import type { Frame, StyleRenderer } from '../../core/style';
import { splatColor, type RGB } from './color';
import { resolveFluidOptions, type FluidOptions } from './options';
import { BURST_DYE, BURST_FORCE, BURST_RADIUS, IDLE_CLEAR, IDLE_DECAY, IDLE_DELAY } from './settings';
import { createFluidSimulation, type FluidSimulation } from './simulation';
import { simulationSize } from './size';

const TAU = Math.PI * 2;

/**
 * The CPU fallback: the same stable-fluids simulation as the WebGL renderer,
 * on a small grid, upscaled as one image. It is softer than the GPU version but
 * keeps the style working without WebGL2 (or the float render-target extension).
 */
export function createFluidCanvas2D(ctx: CanvasRenderingContext2D, initial: FluidOptions): StyleRenderer<FluidOptions> {
  let options = resolveFluidOptions(initial);
  let sim: FluidSimulation | null = null;
  let image: ImageData | null = null;
  let target: HTMLCanvasElement | null = null;
  let targetCtx: CanvasRenderingContext2D | null = null;
  let builtWidth = 0;
  let builtHeight = 0;
  let builtResolution = -1;

  let clock = 0;
  let active = 0;
  let idleTime = 0;
  let lastX = 0;
  let lastY = 0;
  let wasInside = false;
  let burstPending = true;

  function allocate(width: number, height: number): void {
    const grid = simulationSize(options.resolution, width, height);
    sim = createFluidSimulation(grid.width, grid.height);
    target = document.createElement('canvas');
    target.width = grid.width;
    target.height = grid.height;
    targetCtx = target.getContext('2d');
    image = targetCtx?.createImageData(grid.width, grid.height) ?? null;
    builtWidth = width;
    builtHeight = height;
    builtResolution = options.resolution;
    burstPending = true;
  }

  function wake(): void {
    active = Math.max(active, IDLE_CLEAR + 0.5);
    idleTime = 0;
  }

  function splatAt(
    frame: Frame,
    x: number,
    y: number,
    vx: number,
    vy: number,
    colour: RGB,
    radius: number,
  ): void {
    sim?.splat(x, y, vx, vy, colour, radius, frame.width, frame.height);
  }

  function burst(frame: Frame): void {
    const colour = splatColor(options, clock);
    const dye: RGB = [colour[0] * BURST_DYE, colour[1] * BURST_DYE, colour[2] * BURST_DYE];
    const angle = Math.random() * TAU;
    const speed = options.force * BURST_FORCE;
    splatAt(
      frame,
      frame.width * (0.34 + Math.random() * 0.18),
      frame.height * (0.4 + Math.random() * 0.2),
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      dye,
      options.radius * BURST_RADIUS,
    );
    wake();
  }

  function click(frame: Frame, x: number, y: number): void {
    const colour = splatColor(options, clock);
    const dye: RGB = [colour[0] * 10, colour[1] * 10, colour[2] * 10];
    const dx = 10 * (Math.random() - 0.5);
    const dy = 30 * (Math.random() - 0.5);
    splatAt(frame, x, y, dx, dy, dye, options.radius);
    wake();
  }

  function draw(frame: Frame): void {
    if (!sim || !image || !target || !targetCtx) return;
    const { dyeR, dyeG, dyeB } = sim;
    const data = image.data;
    for (let k = 0; k < dyeR.length; k++) {
      const r = Math.min(1, Math.max(0, dyeR[k]));
      const g = Math.min(1, Math.max(0, dyeG[k]));
      const b = Math.min(1, Math.max(0, dyeB[k]));
      const density = Math.max(r, Math.max(g, b));
      const scale = density > 0.0001 ? 255 / density : 0;
      const o = k * 4;
      data[o] = Math.round(r * scale);
      data[o + 1] = Math.round(g * scale);
      data[o + 2] = Math.round(b * scale);
      data[o + 3] = Math.round(density * 255);
    }
    targetCtx.putImageData(image, 0, 0);
    ctx.globalAlpha = options.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(target, 0, 0, frame.width, frame.height);
    ctx.globalAlpha = 1;
  }

  return {
    update(next) {
      options = resolveFluidOptions(next);
    },
    render(frame) {
      if (
        !sim ||
        frame.width !== builtWidth ||
        frame.height !== builtHeight ||
        options.resolution !== builtResolution
      ) {
        allocate(frame.width, frame.height);
      }

      if (frame.reducedMotion) {
        // One static splash, then hold it: no simulation steps and no pointer splats.
        if (burstPending) {
          burstPending = false;
          burst(frame);
        }
        draw(frame);
        return false;
      }

      const dt = Math.min(frame.dt, 1 / 60);
      const { pointer } = frame;

      if (burstPending) {
        burstPending = false;
        burst(frame);
      }

      if (pointer.influence > 0) {
        if (wasInside) {
          const moveX = pointer.x - lastX;
          const moveY = pointer.y - lastY;
          const dx = moveX / Math.max(1, frame.width);
          const dy = moveY / Math.max(1, frame.height);
          // Like a real mousemove stream: don't keep adding dye to a resting pointer.
          if (Math.hypot(moveX, moveY) > 0.5) {
            const colour = splatColor(options, clock);
            const strength = options.force * pointer.influence;
            splatAt(frame, pointer.x, pointer.y, dx * strength, dy * strength, colour, options.radius);
            wake();
          }
        }
        lastX = pointer.x;
        lastY = pointer.y;
        wasInside = true;
      } else {
        wasInside = false;
      }

      for (const clickPoint of frame.clicks) click(frame, clickPoint.x, clickPoint.y);

      if (dt > 0) {
        idleTime += dt;
        if (idleTime >= IDLE_CLEAR) {
          sim?.clear();
          idleTime = 0;
          active = 0;
          draw(frame);
          return false;
        }
        const effective =
          idleTime > IDLE_DELAY ? { ...options, fade: Math.min(options.fade, IDLE_DECAY) } : options;
        sim?.step(dt, effective);
        clock += dt;
        active = Math.max(0, active - dt);
      }

      draw(frame);
      return active > 0;
    },
  };
}
