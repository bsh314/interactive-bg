import type { RGB } from './color';
import type { ResolvedFluidOptions } from './options';
import { CPU_PRESSURE_ITERATIONS, DYE_INTENSITY, VELOCITY_FADE } from './settings';

/**
 * The CPU fluid field: a stable-fluids solver at `resolution` cells on its longer
 * side. The Canvas 2D renderer draws it upscaled; the WebGL renderer runs the
 * same steps in shaders instead. Velocities are in grid cells per second; dye
 * channels are straight colour densities.
 */
export interface FluidSimulation {
  readonly width: number;
  readonly height: number;
  readonly dyeR: Float32Array;
  readonly dyeG: Float32Array;
  readonly dyeB: Float32Array;
  /** Add a splash of colour and velocity at `(x, y)`, in CSS pixels of a view of `viewWidth` × `viewHeight`. */
  splat(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: RGB,
    radius: number,
    viewWidth: number,
    viewHeight: number,
  ): void;
  /** Advance the simulation by `dt` seconds. */
  step(dt: number, options: ResolvedFluidOptions): void;
  /** Clear the velocity and dye fields. */
  clear(): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createFluidSimulation(width: number, height: number): FluidSimulation {
  const w = width;
  const h = height;
  const cells = w * h;

  let u = new Float32Array(cells);
  let v = new Float32Array(cells);
  let uNext = new Float32Array(cells);
  let vNext = new Float32Array(cells);
  let dyeR = new Float32Array(cells);
  let dyeG = new Float32Array(cells);
  let dyeB = new Float32Array(cells);
  let dyeRNext = new Float32Array(cells);
  let dyeGNext = new Float32Array(cells);
  let dyeBNext = new Float32Array(cells);
  const divergence = new Float32Array(cells);
  const curl = new Float32Array(cells);
  let pressure = new Float32Array(cells);
  let pressureNext = new Float32Array(cells);

  /** Bilinear sample of a field at grid coordinates, clamped at the edges. */
  function sample(field: Float32Array, x: number, y: number): number {
    const gx = clamp(x, 0, w - 1);
    const gy = clamp(y, 0, h - 1);
    const i0 = Math.floor(gx);
    const j0 = Math.floor(gy);
    const i1 = Math.min(i0 + 1, w - 1);
    const j1 = Math.min(j0 + 1, h - 1);
    const fx = gx - i0;
    const fy = gy - j0;
    const top = field[j0 * w + i0] * (1 - fx) + field[j0 * w + i1] * fx;
    const bottom = field[j1 * w + i0] * (1 - fx) + field[j1 * w + i1] * fx;
    return top * (1 - fy) + bottom * fy;
  }

  /** Zero the velocity along the walls, so the field doesn't leak. */
  function walls(): void {
    for (let i = 0; i < w; i++) {
      u[i] = 0;
      u[(h - 1) * w + i] = 0;
      v[i] = 0;
      v[(h - 1) * w + i] = 0;
    }
    for (let j = 0; j < h; j++) {
      u[j * w] = 0;
      u[j * w + w - 1] = 0;
      v[j * w] = 0;
      v[j * w + w - 1] = 0;
    }
  }

  function addCurl(dt: number, amount: number): void {
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        curl[k] = 0.5 * (v[k + 1] - v[k - 1] - (u[k + w] - u[k - w]));
      }
    }
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        const forceX = 0.5 * (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1]));
        const forceY = 0.5 * (Math.abs(curl[k - w]) - Math.abs(curl[k + w]));
        const length = Math.hypot(forceX, forceY) + 1e-4;
        const strength = (amount * curl[k] * dt) / length;
        u[k] = clamp(u[k] + forceX * strength, -1000, 1000);
        v[k] = clamp(v[k] + forceY * strength, -1000, 1000);
      }
    }
  }

  function project(dt: number, options: ResolvedFluidOptions): void {
    if (options.curl > 0) addCurl(dt, options.curl);
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        divergence[k] = 0.5 * (u[k + 1] - u[k - 1] + v[k + w] - v[k - w]);
      }
    }
    pressure.fill(0);
    for (let iteration = 0; iteration < CPU_PRESSURE_ITERATIONS; iteration++) {
      for (let j = 1; j < h - 1; j++) {
        for (let i = 1; i < w - 1; i++) {
          const k = j * w + i;
          pressureNext[k] =
            (pressure[k - 1] + pressure[k + 1] + pressure[k - w] + pressure[k + w] - divergence[k]) * 0.25;
        }
      }
      [pressure, pressureNext] = [pressureNext, pressure];
    }
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        u[k] -= 0.5 * (pressure[k + 1] - pressure[k - 1]);
        v[k] -= 0.5 * (pressure[k + w] - pressure[k - w]);
      }
    }
    walls();
  }

  function advectVelocity(dt: number, decay: number): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const sx = i - u[k] * dt;
        const sy = j - v[k] * dt;
        uNext[k] = sample(u, sx, sy) * decay;
        vNext[k] = sample(v, sx, sy) * decay;
      }
    }
    [u, uNext] = [uNext, u];
    [v, vNext] = [vNext, v];
    walls();
  }

  function advectDye(dt: number, decay: number): void {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        const sx = i - u[k] * dt;
        const sy = j - v[k] * dt;
        dyeRNext[k] = sample(dyeR, sx, sy) * decay;
        dyeGNext[k] = sample(dyeG, sx, sy) * decay;
        dyeBNext[k] = sample(dyeB, sx, sy) * decay;
      }
    }
    [dyeR, dyeRNext] = [dyeRNext, dyeR];
    [dyeG, dyeGNext] = [dyeGNext, dyeG];
    [dyeB, dyeBNext] = [dyeBNext, dyeB];
  }

  return {
    width: w,
    height: h,
    get dyeR() {
      return dyeR;
    },
    get dyeG() {
      return dyeG;
    },
    get dyeB() {
      return dyeB;
    },
    splat(x, y, vx, vy, color, radius, viewWidth, viewHeight) {
      const aspect = Math.max(1, viewWidth) / Math.max(1, viewHeight);
      const sigma = Math.max(0.0005, radius / viewHeight);
      const cx = x / Math.max(1, viewWidth);
      const cy = y / Math.max(1, viewHeight);
      const reachX = (sigma / aspect) * w * 3;
      const reachY = sigma * h * 3;
      const x0 = Math.max(0, Math.floor(cx * w - reachX));
      const x1 = Math.min(w - 1, Math.ceil(cx * w + reachX));
      const y0 = Math.max(0, Math.floor(cy * h - reachY));
      const y1 = Math.min(h - 1, Math.ceil(cy * h + reachY));
      // Velocities are in simulation texels per second, which is cells per second here.
      const velocityX = clamp(vx, -1000, 1000);
      const velocityY = clamp(vy, -1000, 1000);
      const sigma2 = sigma * sigma;
      for (let j = y0; j <= y1; j++) {
        const ny = (j + 0.5) / h;
        const dy = ny - cy;
        for (let i = x0; i <= x1; i++) {
          const nx = (i + 0.5) / w;
          const dx = (nx - cx) * aspect;
          const distance = dx * dx + dy * dy;
          if (distance > sigma2 * 9) continue;
          const falloff = Math.exp(-distance / sigma2);
          const k = j * w + i;
          u[k] = clamp(u[k] + velocityX * falloff, -1000, 1000);
          v[k] = clamp(v[k] + velocityY * falloff, -1000, 1000);
          dyeR[k] += color[0] * DYE_INTENSITY * falloff;
          dyeG[k] += color[1] * DYE_INTENSITY * falloff;
          dyeB[k] += color[2] * DYE_INTENSITY * falloff;
        }
      }
    },
    step(dt, options) {
      const stepTime = Math.min(dt, 1 / 30);
      if (stepTime <= 0) return;
      project(stepTime, options);
      advectVelocity(stepTime, 1 / (1 + stepTime / VELOCITY_FADE));
      advectDye(stepTime, 1 / (1 + stepTime / options.fade));
    },
    clear() {
      for (const field of [u, v, uNext, vNext, dyeR, dyeG, dyeB, dyeRNext, dyeGNext, dyeBNext, pressure, pressureNext, divergence, curl]) {
        field.fill(0);
      }
    },
  };
}
