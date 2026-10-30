# interactive-bg

[![npm](https://img.shields.io/npm/v/interactive-bg)](https://www.npmjs.com/package/interactive-bg)
[![CI](https://github.com/bsh314/interactive-bg/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bsh314/interactive-bg/actions/workflows/ci.yml)
[![downloads](https://img.shields.io/npm/dm/interactive-bg)](https://www.npmjs.com/package/interactive-bg)
[![types](https://img.shields.io/npm/types/interactive-bg)](https://www.npmjs.com/package/interactive-bg)
[![license](https://img.shields.io/npm/l/interactive-bg)](LICENSE)

Animated backgrounds that react to the pointer, for hero sections, cards and full pages. One `<canvas>`, no dependencies, under 7 kB gzipped for the style you use.

**[Live demo](https://bsh314.github.io/interactive-bg/)**

| `topo` | `dots` | `plus` |
| --- | --- | --- |
| ![topo](https://raw.githubusercontent.com/bsh314/interactive-bg/main/docs/topo.png) | ![dots](https://raw.githubusercontent.com/bsh314/interactive-bg/main/docs/dots.png) | ![plus](https://raw.githubusercontent.com/bsh314/interactive-bg/main/docs/plus.png) |
| Topographic contour lines that drift slowly. The terrain rises under the pointer. | A grid of dots. The pointer pushes them aside; a click sends out a wave. | A grid of "+" signs that turn to point at the pointer; a click sends out a wave. |

- **Small.** Import one style with one renderer and ship only that: 4.5–6.9 kB gzipped, engine included.
- **Cheap to run.** Idle animation renders at the lowest frame rate that still looks smooth, stops when nothing moves, and pauses off-screen and in background tabs. The grid styles idle on less CPU than an empty animated canvas.
- **GPU first.** WebGL2, with Canvas 2D as a fallback or as a deliberate choice.
- **Polite.** Respects `prefers-reduced-motion`, caps pixel density, never blocks clicks on your content.
- **Typed.** Every option is typed and can be changed at runtime.

## Quick start

```bash
npm install interactive-bg
```

```js
import { createBackground } from 'interactive-bg';
import { dots } from 'interactive-bg/dots';

createBackground('#hero', dots({ spacing: 24 }));
```

The first argument is where it goes:

- an element or selector: the background fills that element (it gets `position: relative` if it was static);
- `null`: a fixed background behind the whole page;
- your own `<canvas>`: drawn into directly.

Without a bundler:

```html
<script src="https://unpkg.com/interactive-bg"></script>
<script>
  InteractiveBg.createBackground(null, InteractiveBg.topo());
</script>
```

## Ship only what you use

Every style comes in three builds. They have the same name and options, so switching is a one-line change.

```js
import { topo } from 'interactive-bg/topo';          // WebGL2, falls back to Canvas 2D
import { topo } from 'interactive-bg/topo/webgl';    // WebGL2 only
import { topo } from 'interactive-bg/topo/canvas2d'; // Canvas 2D only
```

What your app bundles, `createBackground` included (minified / gzipped):

| Style  | Both renderers  | WebGL only      | Canvas 2D only  |
| ------ | --------------- | --------------- | --------------- |
| `topo` | 20.0 / 8.1 kB   | 16.5 / 6.9 kB   | 12.5 / 5.3 kB   |
| `dots` | 17.9 / 7.3 kB   | 14.4 / 6.0 kB   | 10.4 / 4.5 kB   |
| `plus` | 19.3 / 8.0 kB   | 16.2 / 6.8 kB   | 11.7 / 5.0 kB   |

With a single renderer there is no fallback: if the browser can't provide it, the background stays empty, `bg.renderer` is `null`, and your page carries on.

## Performance

Full-screen 1920×1080 background in Chrome on an Apple M1 Pro.

| Style, renderer   | Main thread, idle | Main thread, pointer moving | CPU, idle | CPU, pointer moving | Memory  |
| ----------------- | ----------------- | --------------------------- | --------- | ------------------- | ------- |
| `topo`, WebGL     | 1.5%              | 1.7%                        | 7%        | 12%                 | ~95 MB  |
| `topo`, Canvas 2D | 4.5%              | 10%                         | 10%       | 21%                 | ~105 MB |
| `dots`, WebGL     | 0.2%              | 0.4%                        | 4.4%      | 11%                 | ~90 MB  |
| `dots`, Canvas 2D | 0.4%              | 1.7%                        | 4.3%      | 12%                 | ~70 MB  |
| `plus`, WebGL     | 0.1%              | 0.9%                        | 3.6%      | 11%                 | ~90 MB  |
| `plus`, Canvas 2D | 0.4%              | 2.5%                        | 3.9%      | 13%                 | ~70 MB  |
| Empty canvas, 30 fps, for reference | — | —                    | 6.4%      | —                   | ~85 MB  |

- **Main thread**: share of the page's main thread the background takes, so what's left for your app.
- **CPU** and **Memory**: the browser's renderer and GPU processes, as % of one core and MB above a blank page. Most of the memory is the canvas itself, which the browser needs for any full-screen canvas.

Reproduce with `npm run bench:memory` and `bench/realtime.html`; see [CONTRIBUTING.md](CONTRIBUTING.md#benchmarks).

## API

```js
const bg = createBackground(target, style, engineOptions);

bg.setOptions({ spacing: 32 });          // the style's options, any time
bg.setEngineOptions({ idleFps: 15 });    // engine options, any time (except renderer)
bg.pause();
bg.resume();
bg.destroy();                            // removes the canvas, listeners and GPU context

bg.renderer;                             // 'webgl' | 'canvas2d' | null
```

In React, create it in an effect and destroy it in the cleanup:

```jsx
useEffect(() => {
  const bg = createBackground(ref.current, dots());
  return () => bg.destroy();
}, []);
```

## Engine options

Shared by every style.

| Option                 | Default  | What it does                                                                                     |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `backgroundColor`      | `null`   | Fill behind the pattern. `null` keeps the canvas transparent.                                    |
| `fadeOutTop`, `fadeOutRight`, `fadeOutBottom`, `fadeOutLeft` | `0` | Fade the pattern out over this many px towards that edge. The background colour stays solid. |
| `interactive`          | `true`   | React to the pointer and to clicks.                                                              |
| `maxFps`               | `60`     | Frame-rate cap while reacting to the pointer or a click. `0` = uncapped.                         |
| `idleFps`              | `30`     | Frame-rate cap for the ambient animation. Styles may use less.                                   |
| `maxDpr`               | `1.5`    | Pixel-density cap. Memory grows with its square; `1.5` looks the same as `2` for thin lines.     |
| `respectReducedMotion` | `true`   | Hold the ambient animation still for users who prefer reduced motion.                            |
| `renderer`             | `'auto'` | `'webgl'` or `'canvas2d'` to try that one first. Fixed at creation.                              |

## Style options

<details>
<summary><code>topo</code></summary>

| Option            | Default      | What it does                                                        |
| ----------------- | ------------ | ------------------------------------------------------------------- |
| `lineColor`       | `#5b6576`    | Colour of regular lines.                                            |
| `majorLineColor`  | `#7dd3a8`    | Colour of every `majorEvery`-th line.                               |
| `lineOpacity`     | `0.5`        | Opacity of all lines, `0`–`1`.                                      |
| `lineWidth`       | `1`          | Regular line width in px.                                           |
| `majorLineWidth`  | `1.75`       | Major line width in px.                                             |
| `majorEvery`      | `5`          | Every n-th line is a major line. `0` = none.                        |
| `levels`          | `12`         | Number of contour levels. Higher = denser.                          |
| `scale`           | `0.0025`     | Size of the landforms. Lower = larger and smoother.                 |
| `octaves`         | `2`          | Detail layers. Higher = rougher terrain.                            |
| `speed`           | `0.025`      | How fast the terrain changes. `0` = static.                         |
| `resolution`      | `6`          | Sampling cell size in px. Lower = smoother lines, more CPU.         |
| `seed`            | `1332056948` | Which landscape. Use `Math.random() * 2 ** 32` for a new one each load. |
| `pointerRadius`   | `100`        | Reach of the pointer in px.                                         |
| `pointerStrength` | `0.35`       | Height of the bump under the pointer. Negative = a crater.          |

</details>

<details>
<summary><code>dots</code></summary>

| Option            | Default   | What it does                                                         |
| ----------------- | --------- | -------------------------------------------------------------------- |
| `color`           | `#8b95a5` | Dot colour.                                                          |
| `opacity`         | `0.6`     | Opacity, `0`–`1`.                                                    |
| `size`            | `1.6`     | Dot radius in px.                                                    |
| `spacing`         | `26`      | Distance between dots in px. The grid keeps half of this as padding. |
| `jitter`          | `1.2`     | How far each dot wanders, in px. `0` = still.                        |
| `jitterSpeed`     | `0.35`    | Wander speed in cycles per second.                                   |
| `pointerRadius`   | `160`     | Reach of the pointer in px.                                          |
| `pointerStrength` | `22`      | How far dots next to the pointer are pushed, in px. Negative = pulled in. |
| `waveStrength`    | `10`      | How far a click wave pushes dots, in px. `0` = no waves.             |
| `waveSpeed`       | `520`     | Wave speed in px per second.                                         |
| `waveWidth`       | `60`      | Width of the wave's ring in px.                                      |
| `waveDuration`    | `1.8`     | Seconds until a wave has faded out.                                  |

</details>

<details>
<summary><code>plus</code></summary>

| Option         | Default   | What it does                                                            |
| -------------- | --------- | ----------------------------------------------------------------------- |
| `color`        | `#8b95a5` | Sign colour.                                                            |
| `opacity`      | `0.6`     | Opacity, `0`–`1`.                                                       |
| `size`         | `4`       | Arm length from the centre in px.                                       |
| `weight`       | `1.2`     | Stroke weight in px.                                                    |
| `spacing`      | `28`      | Distance between signs in px. The grid keeps half of this as padding.   |
| `jitter`       | `1`       | How far each sign wanders, in px. `0` = still.                          |
| `jitterSpeed`  | `0.35`    | Wander speed in cycles per second.                                      |
| `pointerAlign` | `1`       | How fully signs turn to point an arm at the pointer, `0`–`1`.           |
| `turnTime`     | `0.25`    | How smoothly signs turn, in seconds. `0` = instantly.                   |
| `waveAlign`    | `1`       | How fully signs on a click wave turn to face the click, `0`–`1`.        |
| `waveWeight`   | `1.5`     | Extra stroke weight on the wave's crest. `1` = double.                  |
| `waveSpeed`    | `520`     | Wave speed in px per second.                                            |
| `waveWidth`    | `60`      | Width of the wave's ring in px.                                         |
| `waveDuration` | `1.8`     | Seconds until a wave has faded out.                                     |

</details>

## Your own style

The engine handles the canvas, sizing, frame loop, pointer, visibility, reduced motion, background colour and edge fades. A style only says what to draw, in WebGL2, Canvas 2D or both. See [docs/custom-styles.md](docs/custom-styles.md).

## Browser support

Current Chrome, Edge, Firefox and Safari (15+). WebGL2 is used where available; every built-in style also has a Canvas 2D renderer.

## Contributing

Development setup, project layout, benchmarks and releases: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
