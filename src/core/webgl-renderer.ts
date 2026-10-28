import { parseColor, type RGBA } from './color';
import type { StyleRenderer } from './style';
import { fades, type Fade, type Renderer } from './surface';
import { createProgram, FULLSCREEN_VERTEX_SHADER, getUniforms } from './webgl';

const WEBGL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false, // styles antialias in their shaders; MSAA would only cost memory
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  powerPreference: 'low-power',
};

// The edge fades, drawn after the style. Mode 0 scales what's there by how much of it each side
// keeps (1 inside, down to 0 at a fading edge, multiplied over the sides) with blend
// ZERO, ONE_MINUS_SRC_ALPHA. Mode 1 paints the premultiplied background colour behind it, where
// the drawing is transparent (blend ONE_MINUS_DST_ALPHA, ONE).
const FADE_FRAGMENT = `#version 300 es
precision highp float;
uniform float uMode;
uniform vec4 uFade;    // top, right, bottom, left, device px (0 = no fade)
uniform vec2 uSize;    // drawing buffer size, device px
uniform vec4 uColor;   // premultiplied background colour
out vec4 outColor;

float keep(float distance, float length) {
  return length > 0.0 ? clamp(distance / length, 0.0, 1.0) : 1.0;
}

void main() {
  if (uMode > 0.5) {
    outColor = uColor;
    return;
  }
  vec2 p = gl_FragCoord.xy; // origin at the bottom left
  float kept = keep(uSize.y - p.y, uFade.x) * keep(uSize.x - p.x, uFade.y) * keep(p.y, uFade.z) * keep(p.x, uFade.w);
  outColor = vec4(0.0, 0.0, 0.0, 1.0 - kept);
}`;

/**
 * Draw a style with WebGL2. The engine clears to the background colour, sets
 * the viewport and premultiplied-alpha blending, and recreates the renderer
 * after a lost context is restored.
 */
export function webglRenderer<O>(createRenderer: (gl: WebGL2RenderingContext, options: O) => StyleRenderer<O>): Renderer<O> {
  return {
    name: 'webgl',
    create(canvas, initial, invalidate) {
      const gl = canvas.getContext('webgl2', WEBGL_ATTRIBUTES);
      if (!gl) return null;

      let options = initial;
      // `null` while the context is lost: its GPU resources are gone.
      let renderer: StyleRenderer<O> | null;
      try {
        renderer = createRenderer(gl, options);
      } catch (error) {
        // E.g. a shader this GPU's driver rejects: let the engine try the next renderer.
        console.warn('interactive-bg: WebGL setup failed, trying the next renderer', error);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return null;
      }
      // Compiled the first time a fade is drawn, and again after a lost context.
      let fadePass: {
        program: WebGLProgram;
        uniforms: Record<'uMode' | 'uFade' | 'uSize' | 'uColor', WebGLUniformLocation | null>;
      } | null = null;

      const onLost = (event: Event): void => {
        event.preventDefault(); // allow the context to be restored
        renderer = null;
        fadePass = null;
      };

      /** Fade the drawing out towards the edges (`fade` in CSS px), then put `background` (RGBA) behind it. */
      const fadeEdges = (fade: Fade, dpr: number, background: RGBA): void => {
        if (!fadePass) {
          const program = createProgram(gl, FULLSCREEN_VERTEX_SHADER, FADE_FRAGMENT);
          if (!program) return; // context lost
          fadePass = { program, uniforms: getUniforms(gl, program, ['uMode', 'uFade', 'uSize', 'uColor'] as const) };
        }
        const { uniforms } = fadePass;
        gl.useProgram(fadePass.program);
        gl.uniform1f(uniforms.uMode, 0);
        gl.uniform4f(uniforms.uFade, fade.top * dpr, fade.right * dpr, fade.bottom * dpr, fade.left * dpr);
        gl.uniform2f(uniforms.uSize, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const [r, g, b, a] = background;
        if (a > 0) {
          gl.uniform1f(uniforms.uMode, 1);
          gl.uniform4f(uniforms.uColor, r * a, g * a, b * a, a);
          gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      };

      const onRestored = (): void => {
        renderer = createRenderer(gl, options);
        invalidate();
      };

      canvas.addEventListener('webglcontextlost', onLost);
      canvas.addEventListener('webglcontextrestored', onRestored);

      return {
        name: 'webgl',
        update(next) {
          options = next;
          renderer?.update(next);
        },
        render(frame, backgroundColor, fade) {
          if (!renderer) return false;
          const background = parseColor(backgroundColor);
          const [r, g, b, a] = background;
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          // With a fade, the background goes in last, behind the faded drawing, so it stays solid.
          const fading = fades(fade);
          if (fading) gl.clearColor(0, 0, 0, 0);
          else gl.clearColor(r * a, g * a, b * a, a);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          const busy = renderer.render(frame) === true;
          if (fading) fadeEdges(fade, frame.dpr, background);
          return busy;
        },
        clear() {
          if (!renderer) return;
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        },
        destroy() {
          canvas.removeEventListener('webglcontextlost', onLost);
          canvas.removeEventListener('webglcontextrestored', onRestored);
          renderer?.destroy?.();
          renderer = null;
          if (fadePass) gl.deleteProgram(fadePass.program);
          fadePass = null;
        },
      };
    },
  };
}
