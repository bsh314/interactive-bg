# Contributing

## Development

```bash
npm install
npm run dev           # demo at http://localhost:5173 (index.html), hot-reloading src/
npm run test          # unit tests (vitest)
npm run typecheck
npm run build         # dist/: ESM + CJS (one file per module), UMD (one file), .d.ts + .d.cts
npm run size          # bundle size of each import path, as an app gets it (after build)
npm run build:demo    # the demo page into site/, as deployed to GitHub Pages
npm run preview:demo  # serve site/ locally
npm run check         # typecheck + test + build
npm run bench         # frame-time benchmark (see below)
npm run bench:memory  # memory & CPU benchmark (macOS, needs Google Chrome)
```

## Project layout

```
src/
  index.ts            public API: engine, every style (both renderers), style-writing helpers
  topo/ dots/ plus/   the per-style import paths, one module each:
    index.ts            interactive-bg/<style>           both renderers
    webgl.ts            interactive-bg/<style>/webgl     WebGL2 only
    canvas2d.ts         interactive-bg/<style>/canvas2d  Canvas 2D only
  core/               shared engine, used by every style
    engine.ts         createBackground: canvas, sizing, frame loop, pointer, visibility
    surface.ts        renderer contract and selection (preference, fallback)
    webgl-renderer.ts   webglRenderer(): WebGL2 context, background colour, blending, context loss
    canvas2d-renderer.ts canvas2dRenderer(): 2D context, background colour, CSS-pixel transform
    style.ts          style contract: defineStyle, Frame, StyleRenderer
    webgl.ts          shader helpers
    color.ts          CSS colour → RGBA
  shared/
    noise.ts          seeded simplex noise
    grid.ts           grid styles' motion model: layout, wander, pointer falloff, click waves
    grid-webgl.ts     the grid styles' shared vertex-shader preamble and uniforms
    buffer.ts         growable Float32Array reused across frames
  styles/
    dots/             dot grid: webgl (vertex shader) + canvas2d renderers
    plus/             "+" grid: webgl (vertex + fragment shader) + canvas2d renderers
    topo/             one folder per style
      definition.ts   everything but the renderers: name, defaults, animates
      options.ts      options, defaults, resolving
      field.ts        terrain height field: noise keyframes, built progressively
      terrain.ts      the field plus the clock that drives it
      webgl.ts        fragment-shader renderer
      canvas2d.ts     marching squares + Canvas 2D strokes
      contours.ts     marching squares
test/                 vitest unit tests
docs/                 guides linked from the README
bench/                performance benchmarks (served by `npm run dev`)
scripts/size.mjs      bundle-size report
scripts/fix-types.mjs post-build: .js extensions in .d.ts, .d.cts copies for require()
.github/workflows/    ci.yml (checks), release.yml (npm via Changesets), pages.yml (demo)
index.html            demo page (served by `npm run dev`)
```

## Adding a style

1. Create `src/styles/<name>/` with the options, the renderers and a `definition.ts` that exports everything but the renderers as a `StyleBase` (see `styles/topo/`).
2. Create the import paths in `src/<name>/`: `index.ts` (both renderers), `webgl.ts` and `canvas2d.ts`, each calling `defineStyle()` with the definition and its renderers.
3. Register them: the entries in `vite.config.ts`, `exports` and `typesVersions` in `package.json`, and the factory and options type in `src/index.ts`.
4. Add tests in `test/`, an options table to `README.md`, and the style to the demo. Check `npm run size`.
5. Run `npm run changeset` and pick **minor**, because a new style is a new feature.

Engine features that every style can use (a new engine option, a new `Frame` field) belong in `src/core/`. Keep style-specific options out of the engine.

## Benchmarks

`npm run bench` opens `bench/index.html`. It drives frames synchronously on a 1920×1080 canvas and reports ms per frame (`?renderer=canvas2d|webgl`, `?dpr=1|2`, `?frames=N`, `?flush=0` to skip forcing rasterization). `npm run bench:memory` runs each scenario in a fresh headless Chrome. It reports JS heap, canvas size, and the physical footprint and CPU time of the renderer and GPU processes, each compared with a blank page. Unlike RSS, the physical footprint includes GPU memory. It also measures a "floor": an empty animated canvas. `bench/realtime.html` runs the real animation loop and reports main-thread ms per second, draws per second and wake-ups per second, first with plain drift, then with the pointer moving, then with it resting over the page (`?style=topo|dots|plus`, `?renderer=`).

## How the renderers work

For `topo`, the WebGL renderer draws the contour lines per pixel in a fragment shader, so its cost doesn't depend on line density. The Canvas 2D renderer traces them on the CPU (marching squares), so it gets slower with more levels or a finer `resolution`.

`plus` works much like `dots`. Each sign's eased angle is kept on the CPU, using a cheap polynomial in place of `atan2`. This work is skipped entirely on frames where nothing it depends on has changed, such as a resting pointer once the signs have settled, and a sign counts as settled once its arm tips are within 0.05 px of where they're heading, so the frame rate drops back to idle quickly. In WebGL, the angles go to the GPU in one small buffer, uploaded only on frames where they changed, then a vertex shader places every sign and a fragment shader draws the cross. In Canvas 2D, each weight is one path of round-capped lines.

For `dots`, the WebGL renderer places every dot in a vertex shader and draws them all in one call. The CPU only sets a few values per frame. The Canvas 2D renderer computes every dot's position on the CPU and draws the dots as round-capped zero-length lines, which is about 4× faster than `arc()` and looks the same. For `dots`, Canvas 2D is a good choice too: it uses about 20 MB less memory than WebGL for about the same total CPU, at a somewhat higher main-thread cost.

Most memory goes to the canvas pixels on the GPU, so it grows with screen size and with the square of `maxDpr`. `1.5` (the default) looks practically the same as `2` for thin lines; `1` saves roughly 40% more on large screens.

## Versioning and releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets) and follow semver.

1. **Record a change.** Run `npm run changeset`, choose patch, minor or major, and write a short summary. Commit the generated `.changeset/*.md` together with your change.
2. **Bump the version.** `npm run version-packages` applies the pending changesets, updates `package.json` and writes `CHANGELOG.md`.
3. **Stage.** `npm run release` runs every check and then stages the version on npm with `npm stage publish`.
4. **Approve.** A maintainer approves the staged version on npmjs.com (or `npm stage approve <id>`) with 2FA, which makes it public.

On GitHub, `.github/workflows/release.yml` runs steps 1–3 for you. Each push to `main` opens or updates a **"Version Packages"** PR. Merging that PR stages the new version on npm and creates its git tag and GitHub release; it goes public once approved. The workflow uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers), so there is no npm token: the package's npm settings list this repository's `release.yml` as a trusted publisher allowed to stage. Under **Settings → Actions → General**, Actions must be allowed to create pull requests. `.github/workflows/ci.yml` runs `npm run check` on every PR.
