# interactive-bg

## 0.2.0

### Minor Changes

- ff7581a: Add the `fluid` style: a real-time fluid simulation that follows the pointer in curling, smoke-like plumes, with a gentle burst on mount and a stronger burst on click. It picks a new hue several times a second by default; set `color` to keep it one colour, and tune `curl`, `force`, `radius`, `fade`, `resolution` and `shading`. The WebGL2 renderer solves the fluid on the GPU; the Canvas 2D renderer runs the same solver on a smaller CPU grid, so the style still works without WebGL2 or float render targets.
- ff7581a: Add the `shimmer` style: the iridescent, warped light-band field from the HyperFrames ground canvas, reimplemented from its live shader. Six coupled sine/cosine warps, per-channel dispersion, a high-power sine field and an 80/20 base mix produce the bands. It bends under the pointer by default (set `pointerStrength: 0` to keep it ambient), supports an `opacity` veil for light page backgrounds, and ships with WebGL2 and a low-resolution Canvas 2D fallback.

## 0.1.1

### Patch Changes

- b8634fb: Published from GitHub Actions with npm trusted publishing. No changes to the library.

## 0.1.0

### Minor Changes

- 5804c59: Initial release: `createBackground()` with a shared rendering engine (WebGL2 with Canvas 2D fallback, frame-rate limits, pointer tracking, pause when hidden, optional fade-outs towards each edge) and three styles: `topo` (animated, pointer-reactive topographic contour lines), `dots` (a wandering dot grid that the pointer pushes aside, with click waves) and `plus` (a wandering grid of "+" signs that turn to point at the pointer, with click waves that turn them to face the click and make them heavier). Each style can be imported with both renderers (`interactive-bg/<style>`) or just one (`interactive-bg/<style>/webgl`, `interactive-bg/<style>/canvas2d`), so apps only bundle what they use. Custom styles can be added with `defineStyle()`, `webglRenderer()` and `canvas2dRenderer()`.
