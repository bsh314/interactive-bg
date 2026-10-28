# Writing your own style

A style is defined once with `defineStyle()`, then used like the built-in ones. The engine takes care of the canvas, sizing, pixel density, the frame loop, the pointer, visibility, reduced motion, the background colour and recovering a lost WebGL context. The style only describes what to draw.

```ts
import { canvas2dRenderer, createBackground, defineStyle, type StyleRenderer } from 'interactive-bg';

interface DotsOptions {
  color: string;
  spacing: number;
}

export const dots = defineStyle<DotsOptions>({
  name: 'dots',
  defaults: { color: '#7dd3a8', spacing: 24 },
  // Does it move on its own? If not, the engine only redraws when the pointer moves or options change.
  animates: () => false,
  // How it's drawn, in order of preference. This one only has Canvas 2D.
  renderers: [
    canvas2dRenderer((ctx, initial: DotsOptions): StyleRenderer<DotsOptions> => {
      let options = initial;
      return {
        update(next) {
          options = next;
        },
        // Coordinates are in CSS pixels; the engine has cleared the canvas and handles the background colour and fade.
        render({ width, height, pointer }) {
          ctx.fillStyle = options.color;
          for (let y = 0; y < height; y += options.spacing) {
            for (let x = 0; x < width; x += options.spacing) {
              const near = Math.exp(-((x - pointer.x) ** 2 + (y - pointer.y) ** 2) / 8000) * pointer.influence;
              ctx.fillRect(x, y, 2 + 4 * near, 2 + 4 * near);
            }
          }
        },
      };
    }),
  ],
});

createBackground(null, dots({ spacing: 32 }));
```

- **`Frame`**: each `render(frame)` call gets:
  - the canvas size in CSS px and `dpr`
  - `dt`: seconds since the last frame
  - `reducedMotion`: when `true`, hold your ambient animation still
  - `pointer`: `x`, `y`, and `influence`, which eases from 0 to 1 while the pointer is over the canvas
  - `clicks`: the clicks / taps since the last frame
- **Short-lived effects**: return `true` from `render` while one is playing (like a click wave). The engine then keeps rendering at `maxFps` until you return `false`.
- **Slow ambient animation**: implement `idleFps(options)` to return the lowest frame rate that still looks smooth. The engine renders the ambient animation at the lower of that and its `idleFps`.
- **Renderers**: wrap a `(ctx, options)` function in `canvas2dRenderer()`, or a `(gl, options)` function in `webglRenderer()` for WebGL2, and list one or both in `renderers`, in order of preference. For WebGL, the engine sets the viewport and blending (premultiplied alpha) before each `render`, and recreates your renderer after a lost context is restored. To offer single-renderer builds of your own style like the built-in ones, put everything except `renderers` in a shared object (typed `StyleBase<O>`) and call `defineStyle()` once per combination, each in its own module. `FULLSCREEN_VERTEX_SHADER`, `createProgram()` and `getUniforms()` cover the usual full-screen shader setup, and `parseColor()` turns CSS colours into RGBA for uniforms.
- **Noise**: `createNoise3D(seed)` gives seeded 3D simplex noise.

See `src/styles/` for the built-in styles, and `src/topo/` for how one style is offered with both renderers or just one.
