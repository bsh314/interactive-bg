import { parseColor } from '../../core/color';
import type { Frame, StyleRenderer } from '../../core/style';
import { createProgram, FULLSCREEN_VERTEX_SHADER, getUniforms } from '../../core/webgl';
import { TIME_RATE } from './field';
import { resolveShimmerOptions, type ShimmerOptions } from './options';

// A faithful port of the reference's `sr-ground-canvas` shader: a pair of
// coupled sine waves warp the UVs six times, the three channels are offset
// slightly, and the resulting sine bands are raised to a high power.
const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uFrequency;
uniform float uColorScale;
uniform vec3 uBaseColor;
uniform float uChroma;
uniform float uWarp;
uniform float uOpacity;
uniform vec3 uPointer; // x, y, strength × influence

out vec4 fragColor;

vec2 distort(vec2 p, float offset) {
  p += offset;
  for (float i = 1.0; i < 7.0; i++) {
    p.x += uWarp * 0.3 / i * sin(i * 5.0 * p.y + uTime);
    p.y += uWarp * 0.1 / i * cos(i * 3.0 * p.x + uTime);
  }
  return p;
}

void main() {
  // gl_FragCoord is bottom-up; flip it so pointer coordinates are top-down.
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);

  float aspect = uRes.x / uRes.y;
  vec2 d = (uv - uPointer.xy) * vec2(aspect, 1.0);
  uv += vec2(d.x / aspect, d.y) * exp(-dot(d, d) / 0.03) * uPointer.z;

  float r = sin(distort(uv, 0.0).x * uFrequency) * 0.5 + 0.5;
  float g = sin(distort(uv, uChroma).x * uFrequency) * 0.5 + 0.5;
  float b = sin(distort(uv, 2.0 * uChroma).x * uFrequency) * 0.5 + 0.5;
  vec3 colour = pow(vec3(r, g, b), vec3(uColorScale));
  vec3 finalColour = mix(uBaseColor, colour, 0.8);
  fragColor = vec4(finalColour * uOpacity, uOpacity);
}`;

const UNIFORMS = [
  'uRes',
  'uTime',
  'uFrequency',
  'uColorScale',
  'uBaseColor',
  'uChroma',
  'uWarp',
  'uOpacity',
  'uPointer',
] as const;

/** The exact analytic band field from the reference, running in WebGL2. */
export function createShimmerWebGL(gl: WebGL2RenderingContext, initial: ShimmerOptions): StyleRenderer<ShimmerOptions> {
  let options = resolveShimmerOptions(initial);
  let clock = 0;

  const program = createProgram(gl, FULLSCREEN_VERTEX_SHADER, FRAGMENT);
  const uniforms = program ? getUniforms(gl, program, UNIFORMS) : null;

  return {
    update(next) {
      options = resolveShimmerOptions(next);
    },
    render(frame: Frame) {
      if (!program || !uniforms) return; // context lost during setup
      if (!frame.reducedMotion && options.speed > 0) clock += frame.dt;

      const [baseR, baseG, baseB] = parseColor(options.baseColor);
      gl.useProgram(program);
      gl.uniform2f(uniforms.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uniforms.uTime, clock * TIME_RATE * options.speed);
      gl.uniform1f(uniforms.uFrequency, options.frequency);
      gl.uniform1f(uniforms.uColorScale, options.colorScale);
      gl.uniform3f(uniforms.uBaseColor, baseR, baseG, baseB);
      gl.uniform1f(uniforms.uChroma, options.chroma);
      gl.uniform1f(uniforms.uWarp, options.warp);
      gl.uniform1f(uniforms.uOpacity, options.opacity);
      gl.uniform3f(
        uniforms.uPointer,
        frame.pointer.x / Math.max(1, frame.width),
        frame.pointer.y / Math.max(1, frame.height),
        frame.reducedMotion ? 0 : options.pointerStrength * frame.pointer.influence,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteProgram(program);
    },
  };
}
