---
'interactive-bg': minor
---

Add the `fluid` style: a real-time fluid simulation that follows the pointer in curling, smoke-like plumes, with a gentle burst on mount and a stronger burst on click. It picks a new hue several times a second by default; set `color` to keep it one colour, and tune `curl`, `force`, `radius`, `fade`, `resolution` and `shading`. The WebGL2 renderer solves the fluid on the GPU; the Canvas 2D renderer runs the same solver on a smaller CPU grid, so the style still works without WebGL2 or float render targets.
