import type { Frame } from '../core/style';
import { TAU, type Grid } from './grid';

/** The uniforms GRID_VERTEX_GLSL declares; set them with setGridUniforms(). */
export const GRID_UNIFORMS = ['uCols', 'uOrigin', 'uSpacing', 'uViewport', 'uDpr', 'uClock', 'uJitter'] as const;

/**
 * Vertex-shader preamble for the grid styles, which draw one GL point per mark.
 * Mirrors gridLayout, cellPhase and the wander in grid.ts; keep them in step.
 */
export const GRID_VERTEX_GLSL = `
uniform int uCols;
uniform vec2 uOrigin;         // CSS px of mark (0, 0)
uniform float uSpacing;
uniform vec2 uViewport;       // canvas size in CSS px
uniform float uDpr;
uniform float uClock;         // wander phase, radians
uniform float uJitter;

float phase(vec2 ij, float salt) {
  return fract(sin(ij.x * 12.9898 + ij.y * 78.233 + salt) * 43758.5453) * ${TAU.toFixed(6)};
}

// This vertex's mark as (column, row). Integer maths: float division can put the first
// mark of a row at the end of the previous one on some GPUs.
vec2 markCell() {
  return vec2(float(gl_VertexID % uCols), float(gl_VertexID / uCols));
}

vec2 restPosition(vec2 ij) {
  return uOrigin + ij * uSpacing;
}

vec2 wander(vec2 ij) {
  return uJitter * vec2(sin(uClock + phase(ij, 0.0)), cos(uClock * 1.3 + phase(ij, 1.0)));
}

// CSS px (origin top left) to clip space.
vec4 toClip(vec2 p) {
  vec2 clip = p / uViewport * 2.0 - 1.0;
  return vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

export function setGridUniforms(
  gl: WebGL2RenderingContext,
  uniforms: Record<(typeof GRID_UNIFORMS)[number], WebGLUniformLocation | null>,
  grid: Grid,
  frame: Frame,
  spacing: number,
  clock: number,
  jitter: number,
): void {
  gl.uniform1i(uniforms.uCols, grid.cols);
  gl.uniform2f(uniforms.uOrigin, grid.originX, grid.originY);
  gl.uniform1f(uniforms.uSpacing, spacing);
  gl.uniform2f(uniforms.uViewport, frame.width, frame.height);
  gl.uniform1f(uniforms.uDpr, frame.dpr);
  gl.uniform1f(uniforms.uClock, clock);
  gl.uniform1f(uniforms.uJitter, jitter);
}
