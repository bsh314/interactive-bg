import { parseColor } from '../../core/color';
import type { StyleRenderer } from '../../core/style';
import { createProgram, getUniforms } from '../../core/webgl';
import { createWaveList, gridLayout, MAX_WAVES, TAU } from '../../shared/grid';
import { GRID_UNIFORMS, GRID_VERTEX_GLSL, setGridUniforms } from '../../shared/grid-webgl';
import { WAVE_GROW } from './motion';
import { resolveDotsOptions, type DotsOptions } from './options';

// Mirrors the motion model in shared/grid.ts: pointerFalloff, waveRing.
const VERTEX = `#version 300 es
precision highp float;

${GRID_VERTEX_GLSL}
uniform float uSize;          // dot radius, CSS px
uniform vec3 uPointer;        // x, y, push distance (strength × influence)
uniform float uPointerRadius;
uniform vec4 uWaves[${MAX_WAVES}];  // x, y, ring radius, envelope (0 = inactive)
uniform float uWaveStrength;
uniform float uWaveWidth;

out float vRadius;            // device px
out float vPointSize;         // device px

void main() {
  vec2 ij = markCell();
  vec2 rest = restPosition(ij);
  vec2 p = rest + wander(ij);

  vec2 d = rest - uPointer.xy;
  float dist = length(d);
  if (dist > 0.0 && dist < uPointerRadius) {
    float k = 1.0 - dist / uPointerRadius;
    p += d / dist * uPointer.z * k * k;
  }

  float grow = 0.0;
  for (int w = 0; w < ${MAX_WAVES}; w++) {
    vec4 wave = uWaves[w];
    if (wave.w <= 0.0) continue;
    vec2 dw = rest - wave.xy;
    float dd = length(dw);
    if (dd == 0.0) continue;
    float x = (dd - wave.z) / uWaveWidth;
    float ring = exp(-x * x) * wave.w;
    p += dw / dd * uWaveStrength * ring;
    grow += ring;
  }

  vRadius = uSize * (1.0 + ${WAVE_GROW.toFixed(3)} * grow) * uDpr;
  vPointSize = 2.0 * vRadius + 2.0; // room for the antialiased edge
  gl_PointSize = vPointSize;
  gl_Position = toClip(p);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec4 uColor;          // straight RGBA, opacity applied
in float vRadius;
in float vPointSize;
out vec4 outColor;

void main() {
  float dist = length(gl_PointCoord - 0.5) * vPointSize;
  float a = uColor.a * clamp(vRadius + 0.5 - dist, 0.0, 1.0);
  outColor = vec4(uColor.rgb * a, a); // premultiplied; the engine blends it over the background
}`;

const UNIFORMS = [
  ...GRID_UNIFORMS, 'uSize', 'uPointer', 'uPointerRadius', 'uWaves', 'uWaveStrength', 'uWaveWidth', 'uColor',
] as const;

/** Every dot is one GL point; the vertex shader places it, so the CPU only sets uniforms. */
export function createDotsWebGL(gl: WebGL2RenderingContext, initial: DotsOptions): StyleRenderer<DotsOptions> {
  let options = resolveDotsOptions(initial);
  const waves = createWaveList();
  const waveData = new Float32Array(MAX_WAVES * 4);
  let clock = 0;

  const program = createProgram(gl, VERTEX, FRAGMENT);
  const uniforms = program ? getUniforms(gl, program, UNIFORMS) : null;

  return {
    update(next) {
      options = resolveDotsOptions(next);
    },
    render(frame) {
      if (!frame.reducedMotion) clock += frame.dt * options.jitterSpeed * TAU;
      waves.advance(frame, options.waveDuration, options.waveStrength !== 0);
      if (!program || !uniforms) return waves.waves.length > 0; // context lost during setup

      waves.pack(waveData, options.waveSpeed, options.waveDuration);

      const grid = gridLayout(frame.width, frame.height, options.spacing);
      const color = parseColor(options.color);

      gl.useProgram(program);
      setGridUniforms(gl, uniforms, grid, frame, options.spacing, clock, options.jitter);
      gl.uniform1f(uniforms.uSize, options.size);
      gl.uniform3f(uniforms.uPointer, frame.pointer.x, frame.pointer.y, options.pointerStrength * frame.pointer.influence);
      gl.uniform1f(uniforms.uPointerRadius, options.pointerRadius);
      gl.uniform4fv(uniforms.uWaves, waveData);
      gl.uniform1f(uniforms.uWaveStrength, options.waveStrength);
      gl.uniform1f(uniforms.uWaveWidth, options.waveWidth);
      gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3] * options.opacity);
      gl.drawArrays(gl.POINTS, 0, grid.cols * grid.rows);
      return waves.waves.length > 0;
    },
    destroy() {
      gl.deleteProgram(program);
    },
  };
}
