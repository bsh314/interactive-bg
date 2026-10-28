import { parseColor } from '../../core/color';
import type { StyleRenderer } from '../../core/style';
import { createProgram, FULLSCREEN_VERTEX_SHADER, getUniforms } from '../../core/webgl';
import { resolveTopoOptions, type TopoOptions } from './options';
import { createTerrain } from './terrain';

const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uKeyA;
uniform sampler2D uKeyB;
uniform float uBlend;
uniform vec2 uGrid;       // cols, rows
uniform float uCellSize;  // CSS px between grid samples
uniform float uDpr;
uniform float uHeight;    // canvas height in device px
uniform vec3 uPointer;    // x, y (CSS px), bump height
uniform float uRadius2;
uniform float uStep;      // height difference between contour levels
uniform float uMajorEvery;
uniform vec2 uHalfWidth;  // half line widths (device px): minor, major
uniform vec4 uMinor;      // straight RGBA, opacity applied
uniform vec4 uMajor;

out vec4 outColor;

float heightAt(ivec2 c) {
  return mix(texelFetch(uKeyA, c, 0).r, texelFetch(uKeyB, c, 0).r, uBlend);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) / uDpr;

  // Bilinear interpolation of the height field (same surface the CPU renderer traces).
  vec2 g = p / uCellSize;
  vec2 cell = clamp(floor(g), vec2(0.0), uGrid - 2.0);
  vec2 f = g - cell;
  ivec2 c = ivec2(cell);
  float h = mix(
    mix(heightAt(c), heightAt(c + ivec2(1, 0)), f.x),
    mix(heightAt(c + ivec2(0, 1)), heightAt(c + ivec2(1, 1)), f.x),
    f.y);

  vec2 d = p - uPointer.xy;
  h += uPointer.z * exp(-dot(d, d) / uRadius2);

  // Distance to the nearest contour, in device pixels, from the screen-space gradient.
  float v = h / uStep;
  float level = floor(v + 0.5);
  float dist = abs(v - level) / max(fwidth(v), 1e-5);

  bool major = uMajorEvery > 0.0 && mod(level, uMajorEvery) == 0.0;
  float halfWidth = major ? uHalfWidth.y : uHalfWidth.x;
  vec4 line = major ? uMajor : uMinor;
  // Analytic antialiasing: coverage ramps over one pixel at the line edge.
  float a = line.a * clamp(halfWidth + 0.5 - dist, 0.0, 1.0);
  outColor = vec4(line.rgb * a, a); // premultiplied; the engine blends it over the background
}`;

const UNIFORMS = [
  'uKeyA', 'uKeyB', 'uBlend', 'uGrid', 'uCellSize', 'uDpr', 'uHeight', 'uPointer', 'uRadius2',
  'uStep', 'uMajorEvery', 'uHalfWidth', 'uMinor', 'uMajor',
] as const;

/**
 * Per-pixel contour lines in a fragment shader. The CPU only uploads the two noise
 * keyframes when they change (once per keyframe interval) and sets a few uniforms per frame.
 */
export function createTopoWebGL(gl: WebGL2RenderingContext, initial: TopoOptions): StyleRenderer<TopoOptions> {
  let options = resolveTopoOptions(initial);
  const terrain = createTerrain(options);

  const program = createProgram(gl, FULLSCREEN_VERTEX_SHADER, FRAGMENT);
  const uniforms = program ? getUniforms(gl, program, UNIFORMS) : null;
  const textures = [gl.createTexture(), gl.createTexture()] as const;
  for (const texture of textures) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  let textureCols = 0;
  let textureRows = 0;
  let uploadedVersion = -1;

  /** Upload the keyframes when they changed since the last frame. */
  function upload(): void {
    const { field } = terrain;
    const resized = textureCols !== field.cols || textureRows !== field.rows;
    if (!resized && uploadedVersion === field.version) return;
    const keys = [field.keyA, field.keyB];
    for (let unit = 0; unit < 2; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
      if (resized) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, field.cols, field.rows, 0, gl.RED, gl.FLOAT, keys[unit]);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, field.cols, field.rows, gl.RED, gl.FLOAT, keys[unit]);
      }
    }
    textureCols = field.cols;
    textureRows = field.rows;
    uploadedVersion = field.version;
  }

  return {
    update(next) {
      options = resolveTopoOptions(next);
      terrain.configure(options);
    },
    render(frame) {
      const blend = terrain.advance(frame);
      if (!program || !uniforms) return; // context lost during setup; the engine recreates us
      upload();

      const minor = parseColor(options.lineColor);
      const major = parseColor(options.majorLineColor);
      const opacity = options.lineOpacity;
      const { field } = terrain;

      gl.useProgram(program);
      gl.uniform1i(uniforms.uKeyA, 0);
      gl.uniform1i(uniforms.uKeyB, 1);
      gl.uniform1f(uniforms.uBlend, blend);
      gl.uniform2f(uniforms.uGrid, field.cols, field.rows);
      gl.uniform1f(uniforms.uCellSize, options.cellSize);
      gl.uniform1f(uniforms.uDpr, frame.dpr);
      gl.uniform1f(uniforms.uHeight, gl.drawingBufferHeight);
      gl.uniform3f(uniforms.uPointer, frame.pointer.x, frame.pointer.y, options.pointerStrength * frame.pointer.influence);
      gl.uniform1f(uniforms.uRadius2, options.pointerRadius * options.pointerRadius);
      gl.uniform1f(uniforms.uStep, options.levelStep);
      gl.uniform1f(uniforms.uMajorEvery, options.majorEvery);
      gl.uniform2f(uniforms.uHalfWidth, (options.lineWidth * frame.dpr) / 2, (options.majorLineWidth * frame.dpr) / 2);
      gl.uniform4f(uniforms.uMinor, minor[0], minor[1], minor[2], minor[3] * opacity);
      gl.uniform4f(uniforms.uMajor, major[0], major[1], major[2], major[3] * opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.deleteTexture(textures[0]);
      gl.deleteTexture(textures[1]);
      gl.deleteProgram(program);
    },
  };
}
