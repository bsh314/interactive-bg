---
'interactive-bg': minor
---

Initial release: `createBackground()` with a shared rendering engine (WebGL2 with Canvas 2D fallback, frame-rate limits, pointer tracking, pause when hidden, optional fade-outs towards each edge) and three styles: `topo` (animated, pointer-reactive topographic contour lines), `dots` (a wandering dot grid that the pointer pushes aside, with click waves) and `plus` (a wandering grid of "+" signs that turn to point at the pointer, with click waves that turn them to face the click and make them heavier). Each style can be imported with both renderers (`interactive-bg/<style>`) or just one (`interactive-bg/<style>/webgl`, `interactive-bg/<style>/canvas2d`), so apps only bundle what they use. Custom styles can be added with `defineStyle()`, `webglRenderer()` and `canvas2dRenderer()`.
