---
'interactive-bg': minor
---

Add the `shimmer` style: the iridescent, warped light-band field from the HyperFrames ground canvas, reimplemented from its live shader. Six coupled sine/cosine warps, per-channel dispersion, a high-power sine field and an 80/20 base mix produce the bands. It bends under the pointer by default (set `pointerStrength: 0` to keep it ambient), supports an `opacity` veil for light page backgrounds, and ships with WebGL2 and a low-resolution Canvas 2D fallback.
