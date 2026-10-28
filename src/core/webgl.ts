/**
 * Vertex shader for one triangle that covers the whole viewport, drawn with
 * `gl.drawArrays(gl.TRIANGLES, 0, 3)` and no vertex buffers. Pair it with a
 * fragment shader that works per pixel from `gl_FragCoord`.
 */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Compile and link a shader program. Returns `null` if the context is lost, and
 * throws with the driver's message if a shader doesn't compile or link (the
 * engine then falls back to the style's next renderer). Nothing is left behind
 * on failure.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const program = gl.createProgram();
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  try {
    vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!program || !vertex || !fragment) {
      gl.deleteProgram(program);
      return null;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`interactive-bg: shader link error: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    // Linked programs keep their own copy; the shader objects aren't needed either way.
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}

/** Look up uniform locations by name. */
export function getUniforms<N extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly N[],
): Record<N, WebGLUniformLocation | null> {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<
    N,
    WebGLUniformLocation | null
  >;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`interactive-bg: shader error: ${log}`);
  }
  return shader;
}
