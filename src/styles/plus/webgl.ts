import { parseColor } from '../../core/color';
import type { StyleRenderer } from '../../core/style';
import { createProgram, getUniforms } from '../../core/webgl';
import { createWaveList, gridLayout, TAU } from '../../shared/grid';
import { GRID_UNIFORMS, GRID_VERTEX_GLSL, setGridUniforms } from '../../shared/grid-webgl';
import { resolvePlusOptions, wavesEnabled, type PlusOptions } from './options';
import { createSignTurns } from './turns';

// Wander mirrors canvas2d.ts; each sign's angle and wave height come from SignTurns (aTurn).
const VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aTurn; // angle (radians), wave-crest height

${GRID_VERTEX_GLSL}
uniform float uSize;          // arm length, CSS px
uniform float uWeight;        // stroke weight, CSS px
uniform float uWaveWeight;

out vec2 vAxis;               // cos, sin of the sign's angle
out float vArm;               // device px
out float vHalfWeight;        // device px
out float vPointSize;         // device px

void main() {
  vec2 ij = markCell();
  vec2 p = restPosition(ij) + wander(ij);

  vAxis = vec2(cos(aTurn.x), sin(aTurn.x));
  vArm = uSize * uDpr;
  vHalfWeight = 0.5 * uWeight * (1.0 + uWaveWeight * min(aTurn.y, 2.0)) * uDpr;
  vPointSize = 2.0 * (vArm + vHalfWeight) + 2.0; // room for the antialiased edge
  gl_PointSize = vPointSize;
  gl_Position = toClip(p);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec4 uColor;          // straight RGBA, opacity applied
in vec2 vAxis;
in float vArm;
in float vHalfWeight;
in float vPointSize;
out vec4 outColor;

// Distance to a round-capped arm of half-length vArm along x.
float arm(vec2 q) {
  return length(vec2(max(abs(q.x) - vArm, 0.0), q.y)) - vHalfWeight;
}

void main() {
  vec2 p = (gl_PointCoord - 0.5) * vPointSize;
  vec2 q = vec2(dot(p, vAxis), dot(p, vec2(-vAxis.y, vAxis.x))); // into the sign's frame
  float d = min(arm(q), arm(q.yx));
  float a = uColor.a * clamp(0.5 - d, 0.0, 1.0);
  outColor = vec4(uColor.rgb * a, a); // premultiplied; the engine blends it over the background
}`;

const UNIFORMS = [...GRID_UNIFORMS, 'uSize', 'uWeight', 'uWaveWeight', 'uColor'] as const;

/**
 * Every sign is one GL point: the vertex shader places it and the fragment
 * shader draws the cross. Angles are eased on the CPU (SignTurns) and uploaded
 * only on frames where they changed.
 */
export function createPlusWebGL(gl: WebGL2RenderingContext, initial: PlusOptions): StyleRenderer<PlusOptions> {
  let options = resolvePlusOptions(initial);
  const waves = createWaveList();
  const turns = createSignTurns();
  let clock = 0;
  let uploaded = -1; // sign count the buffer was last sized for

  const program = createProgram(gl, VERTEX, FRAGMENT);
  const uniforms = program ? getUniforms(gl, program, UNIFORMS) : null;
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return {
    update(next) {
      options = resolvePlusOptions(next);
    },
    render(frame) {
      if (!frame.reducedMotion) clock += frame.dt * options.jitterSpeed * TAU;
      waves.advance(frame, options.waveDuration, wavesEnabled(options));
      const grid = gridLayout(frame.width, frame.height, options.spacing);
      turns.update(frame, options, grid, waves.waves);
      const busy = waves.waves.length > 0 || turns.settling;
      if (!program || !uniforms) return busy; // context lost during setup

      const count = grid.cols * grid.rows;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (uploaded !== count) {
        gl.bufferData(gl.ARRAY_BUFFER, turns.data, gl.DYNAMIC_DRAW);
        uploaded = count;
      } else if (turns.changed) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, turns.data);
      }

      const color = parseColor(options.color);
      gl.useProgram(program);
      setGridUniforms(gl, uniforms, grid, frame, options.spacing, clock, options.jitter);
      gl.uniform1f(uniforms.uSize, options.size);
      gl.uniform1f(uniforms.uWeight, options.weight);
      gl.uniform1f(uniforms.uWaveWeight, options.waveWeight);
      gl.uniform4f(uniforms.uColor, color[0], color[1], color[2], color[3] * options.opacity);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
      return busy;
    },
    destroy() {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
    },
  };
}
