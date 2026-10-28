import type { Frame, Point, RendererName, Style, StyleDefinition } from './style';
import { createSurface, type Fade, type Surface } from './surface';

/** Options shared by every style: how and when the background is rendered. */
export interface EngineOptions {
  /**
   * Rendering backend, chosen when the background is created (changing it later has no effect).
   * `'auto'` uses the style's renderers in their own order (WebGL2 first for the built-in styles)
   * and falls back to the next when the browser lacks one. Naming one tries it first.
   */
  renderer: 'auto' | RendererName;
  /** Fill colour painted behind the style. `null` or `'transparent'` keeps the canvas transparent. */
  backgroundColor: string | null;
  /**
   * Fade the pattern out towards the top edge over this many CSS pixels: from its own opacity
   * this far in from the edge to fully transparent at the edge. The background colour isn't
   * faded. `0` = no fade. Fades on several sides multiply where they overlap.
   */
  fadeOutTop: number;
  /** Like `fadeOutTop`, towards the right edge. */
  fadeOutRight: number;
  /** Like `fadeOutTop`, towards the bottom edge. */
  fadeOutBottom: number;
  /** Like `fadeOutTop`, towards the left edge. */
  fadeOutLeft: number;
  /** React to the pointer and to clicks / taps. */
  interactive: boolean;
  /**
   * Upper limit for the canvas pixel density. Canvas memory grows with its square:
   * a 1920×1080 canvas takes 8 MB at 1, 18 MB at 1.5 and 32 MB at 2.
   */
  maxDpr: number;
  /** Frame-rate cap while the pointer is moving the background. `0` = uncapped. */
  maxFps: number;
  /** Frame-rate cap while only the style's own animation runs. Lower saves CPU and battery. `0` = same as `maxFps`. */
  idleFps: number;
  /** Hold the style's own animation still when the user prefers reduced motion. */
  respectReducedMotion: boolean;
}

export const engineDefaults: Readonly<EngineOptions> = Object.freeze({
  renderer: 'auto',
  backgroundColor: null,
  fadeOutTop: 0,
  fadeOutRight: 0,
  fadeOutBottom: 0,
  fadeOutLeft: 0,
  interactive: true,
  maxDpr: 1.5,
  maxFps: 60,
  idleFps: 30,
  respectReducedMotion: true,
});

export interface Background<O extends object> {
  readonly canvas: HTMLCanvasElement;
  /** Name of the style, e.g. `'topo'`. */
  readonly style: string;
  /**
   * The rendering backend actually in use, or `null` when none of the style's renderers works in
   * this browser (e.g. a WebGL-only style without WebGL2): the background then stays blank.
   */
  readonly renderer: RendererName | null;
  readonly options: Readonly<O>;
  readonly engineOptions: Readonly<EngineOptions>;
  /** Update any of the style's options on the fly. */
  setOptions(options: Partial<O>): void;
  /** Update any engine options on the fly (except `renderer`). */
  setEngineOptions(options: Partial<EngineOptions>): void;
  pause(): void;
  resume(): void;
  /** Stop rendering, remove listeners and (if it was created by us) the canvas. */
  destroy(): void;
}

/**
 * Mount an interactive background.
 *
 * - `target` `null`/omitted: a fixed, full-viewport canvas is placed behind the page.
 * - `target` is a `<canvas>`: it is drawn into directly and sized by your CSS.
 * - `target` is any other element (or a selector): a canvas is appended that
 *   fills it. The element gets `position: relative` if it was `static`.
 *
 * @example createBackground('#hero', topo({ levels: 14 }), { maxFps: 30 })
 */
export function createBackground<O extends object>(
  target: HTMLElement | string | null | undefined,
  style: Style<O>,
  engineOptions: Partial<EngineOptions> = {},
): Background<O> {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (typeof target === 'string' && !host) {
    throw new Error(`interactive-bg: no element matches "${target}"`);
  }

  const definition = style.definition;
  let options: O = { ...style.options };
  let engine: EngineOptions = { ...engineDefaults, ...engineOptions };
  let backgroundColor = resolveColor(engine.backgroundColor);
  let fade = resolveFade(engine);

  const ownsCanvas = !(host instanceof HTMLCanvasElement);
  // We may switch the host to `position: relative`; remember what to restore on destroy().
  const hostPosition = ownsCanvas && host ? host.style.position : null;
  let canvas = ownsCanvas ? mountCanvas(host ?? null) : (host as HTMLCanvasElement);
  const surface =
    createSurface(
      () => canvas,
      definition.renderers,
      options,
      engine.renderer,
      () => {
        needsDraw = true;
        wake();
      },
      // A renderer that failed may have claimed the canvas's context; the next one needs a fresh canvas.
      ownsCanvas
        ? () => {
            const fresh = mountCanvas(host ?? null);
            canvas.remove();
            canvas = fresh;
          }
        : undefined,
    ) ?? blankSurface(definition);

  // Canvas size in CSS pixels, and the pixel density it is rendered at.
  let width = 0;
  let height = 0;
  let dpr = 1;

  // Pointer state: `target*` is where the pointer is, the rest eases toward it.
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  let influence = 0;
  let targetInfluence = 0;
  /** Clicks since the last rendered frame, and the array handed to the style for the current one (swapped each frame). */
  let clicks: Point[] = [];
  let frameClicks: Point[] = [];
  // Reused for every frame: styles only read them during render().
  const pointer = { x: 0, y: 0, influence: 0 };
  const frameState: Frame = { width: 0, height: 0, dpr: 1, dt: 0, reducedMotion: false, pointer, clicks: frameClicks };
  /** The style reported a short-lived effect still playing in its last frame. */
  let styleBusy = false;

  let lastFrame = 0;
  let rafId = 0;
  let timerId = 0;
  let paused = false;
  let visible = true;
  let intersecting = true;
  let destroyed = false;
  let needsDraw = true;

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedMotionQuery?.matches ?? false;

  function holdStill(): boolean {
    return engine.respectReducedMotion && reducedMotion;
  }

  /** Is the style's own ambient animation running (as opposed to only reacting to the pointer)? */
  function animating(): boolean {
    return surface.name !== null && definition.animates(options) && !holdStill();
  }

  /** Does something need the full frame rate: the pointer's effect easing, or a style effect playing? */
  function busy(): boolean {
    return styleBusy || clicks.length > 0 || pointerEasing();
  }

  /** Frame rate for the ambient animation; `0` means uncapped for the engine options. */
  function effectiveIdleFps(): number {
    const configured =
      engine.maxFps <= 0
        ? engine.idleFps
        : engine.idleFps <= 0
          ? engine.maxFps
          : Math.min(engine.maxFps, engine.idleFps);
    const needed = definition.idleFps?.(options) ?? 0;
    if (needed <= 0) return configured;
    return configured <= 0 ? needed : Math.min(configured, needed);
  }

  function frameInterval(fps: number): number {
    return fps > 0 ? 1000 / fps : 0;
  }

  function canRun(): boolean {
    return !destroyed && !paused && visible;
  }

  /** Is the pointer's effect still catching up with the pointer? */
  function pointerEasing(): boolean {
    if (influence !== targetInfluence) return true;
    return influence > 0 && (Math.abs(targetX - pointerX) > 0.5 || Math.abs(targetY - pointerY) > 0.5);
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, Math.max(0.5, engine.maxDpr));
    if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    needsDraw = true;
  }

  function frame(now: number): void {
    rafId = 0;
    if (!canRun()) return;

    // Full frame rate only while reacting to the pointer or playing an effect.
    const minInterval = frameInterval(busy() ? engine.maxFps : effectiveIdleFps());
    // 15% tolerance so a 60 fps cap doesn't drop frames on 60 Hz displays.
    if (lastFrame && now - lastFrame < minInterval * 0.85) {
      schedule(minInterval - (now - lastFrame));
      return;
    }
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;

    const wasBusy = busy();
    // Frame-rate independent easing.
    const ease = 1 - Math.exp(-dt * 8);
    pointerX += (targetX - pointerX) * ease;
    pointerY += (targetY - pointerY) * ease;
    influence += (targetInfluence - influence) * ease;
    if (Math.abs(targetInfluence - influence) < 0.001) influence = targetInfluence;

    const moving = animating();
    if (moving || wasBusy || needsDraw) {
      needsDraw = false;
      [frameClicks, clicks] = [clicks, frameClicks];
      clicks.length = 0;
      pointer.x = pointerX;
      pointer.y = pointerY;
      pointer.influence = influence;
      frameState.width = width;
      frameState.height = height;
      frameState.dpr = dpr;
      frameState.dt = dt;
      frameState.reducedMotion = holdStill();
      frameState.clicks = frameClicks;
      styleBusy = surface.render(frameState, backgroundColor, fade);
    }

    // Nothing left to animate: stop until a pointer move, click, resize or option change wakes us.
    if (busy()) schedule();
    else if (moving) schedule(frameInterval(effectiveIdleFps()));
    else lastFrame = 0;
  }

  /** Request a frame `delay` ms from now. */
  function schedule(delay = 0): void {
    if (rafId || timerId || !canRun()) return;
    // requestAnimationFrame alone wakes up on every display refresh (up to 120–165 Hz),
    // so sleep through longer gaps with a timer and only then wait for the next frame.
    // The timer wakes slightly early so the next frame lands within frame()'s tolerance.
    if (delay > 8) {
      timerId = window.setTimeout(onTimer, delay * 0.8);
    } else {
      rafId = requestAnimationFrame(frame);
    }
  }

  function onTimer(): void {
    timerId = 0;
    schedule();
  }

  /** Render as soon as possible, cutting short any idle sleep. */
  function wake(): void {
    if (timerId) clearTimeout(timerId);
    timerId = 0;
    schedule();
  }

  function cancel(): void {
    if (rafId) cancelAnimationFrame(rafId);
    if (timerId) clearTimeout(timerId);
    rafId = timerId = 0;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!engine.interactive || !canRun()) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    if (inside && targetInfluence === 0) {
      // Entering: start where the pointer is instead of sliding in.
      pointerX = x;
      pointerY = y;
    }
    targetX = x;
    targetY = y;
    targetInfluence = inside ? 1 : 0;
    if (inside || influence > 0) wake();
  }

  function onPointerDown(event: PointerEvent): void {
    if (!engine.interactive || !canRun()) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    clicks.push({ x, y });
    wake();
  }

  function onPointerLeave(): void {
    targetInfluence = 0;
    wake();
  }

  function onVisibilityChange(): void {
    visible = document.visibilityState === 'visible' && intersecting;
    lastFrame = 0;
    if (visible) wake();
    else cancel();
  }

  function onReducedMotionChange(event: MediaQueryListEvent): void {
    reducedMotion = event.matches;
    needsDraw = true;
    wake();
  }

  // ResizeObserver doesn't fire when only the pixel density changes (e.g. the window moves to
  // another screen), so watch the current density with a media query, re-armed after each change.
  let dprQuery: MediaQueryList | null = null;
  function watchDpr(): void {
    dprQuery?.removeEventListener?.('change', onDprChange);
    dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) ?? null;
    dprQuery?.addEventListener?.('change', onDprChange);
  }
  function onDprChange(): void {
    resize();
    wake();
    watchDpr();
  }
  watchDpr();

  const resizeObserver = new ResizeObserver(() => {
    resize();
    wake();
  });
  resizeObserver.observe(canvas);

  const intersectionObserver =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          intersecting = entries[entries.length - 1].isIntersecting;
          onVisibilityChange();
        })
      : null;
  intersectionObserver?.observe(canvas);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotionQuery?.addEventListener?.('change', onReducedMotionChange);

  resize();
  schedule();

  return {
    canvas,
    style: definition.name,
    renderer: surface.name,
    get options() {
      return options;
    },
    get engineOptions() {
      return engine;
    },
    setOptions(next) {
      options = { ...options, ...next };
      surface.update(options);
      needsDraw = true;
      wake();
    },
    setEngineOptions(next) {
      const previous = engine;
      engine = { ...engine, ...next };
      backgroundColor = resolveColor(engine.backgroundColor);
      fade = resolveFade(engine);
      if (engine.maxDpr !== previous.maxDpr) resize();
      if (!engine.interactive) {
        influence = targetInfluence = 0;
        clicks.length = 0;
      }
      needsDraw = true;
      wake();
    },
    pause() {
      paused = true;
      cancel();
    },
    resume() {
      paused = false;
      lastFrame = 0;
      wake();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancel();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
      dprQuery?.removeEventListener?.('change', onDprChange);
      if (!ownsCanvas) surface.clear();
      surface.destroy();
      if (ownsCanvas) {
        // Free the GPU context now rather than at garbage collection: browsers cap live WebGL contexts.
        if (surface.name === 'webgl') canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.remove();
        if (host && hostPosition !== null) host.style.position = hostPosition;
      }
    },
  };
}

/** Stands in when none of the style's renderers works here: draws nothing, and says so once. */
function blankSurface<O extends object>(definition: StyleDefinition<O>): Omit<Surface<O>, 'name'> & { name: null } {
  const needs = definition.renderers.map((r) => (r.name === 'webgl' ? 'WebGL2' : 'Canvas 2D')).join(' or ');
  console.warn(`interactive-bg: style "${definition.name}" needs ${needs}, which this browser doesn't provide`);
  return { name: null, update() {}, render: () => false, clear() {}, destroy() {} };
}

function resolveFade(engine: EngineOptions): Fade {
  return {
    top: Math.max(0, engine.fadeOutTop),
    right: Math.max(0, engine.fadeOutRight),
    bottom: Math.max(0, engine.fadeOutBottom),
    left: Math.max(0, engine.fadeOutLeft),
  };
}

function resolveColor(color: string | null): string | null {
  return color && color !== 'transparent' ? color : null;
}

/** Create the background canvas inside `host`, or fixed behind the page when there is no host. */
function mountCanvas(host: HTMLElement | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: host ? 'absolute' : 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
    zIndex: host ? '0' : '-1',
  });
  if (host) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.prepend(canvas);
  } else {
    document.body.prepend(canvas);
  }
  return canvas;
}
