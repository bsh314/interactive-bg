import type { Frame, StyleRenderer } from '../../core/style';
import { createProgram, getUniforms } from '../../core/webgl';
import { splatColor, type RGB } from './color';
import { resolveFluidOptions, type FluidOptions } from './options';
import {
  BURST_DYE,
  BURST_FORCE,
  BURST_RADIUS,
  DYE_INTENSITY,
  DYE_SCALE,
  IDLE_CLEAR,
  IDLE_DECAY,
  IDLE_DELAY,
  MAX_DYE_RESOLUTION,
  PRESSURE_ITERATIONS,
  PRESSURE_RETENTION,
  VELOCITY_FADE,
} from './settings';
import { simulationSize } from './size';

const TAU = Math.PI * 2;

// All passes are one full-screen triangle. Neighbouring texel coordinates are
// worked out once in the vertex shader and interpolated.
const VERTEX = `#version 300 es
precision highp float;

uniform vec2 uTexelSize;

out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  vL = vUv - vec2(uTexelSize.x, 0.0);
  vR = vUv + vec2(uTexelSize.x, 0.0);
  vT = vUv + vec2(0.0, uTexelSize.y);
  vB = vUv - vec2(0.0, uTexelSize.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const SPLAT = `#version 300 es
precision highp float;

uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;   // squared radius, in screens-heights
uniform float uAspect;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  outColor = vec4(texture(uTarget, vUv).rgb + splat, 1.0);
}`;

const ADVECTION = `#version 300 es
precision highp float;

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize;
  outColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}`;

const DIVERGENCE = `#version 300 es
precision highp float;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;

void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const CURL = `#version 300 es
precision highp float;

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;

void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `#version 300 es
precision highp float;

uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uStrength;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;

void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(velocity, vec2(-1000.0), vec2(1000.0)), 0.0, 1.0);
}`;

const PRESSURE = `#version 300 es
precision highp float;

uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;

void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + T + B - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `#version 300 es
precision highp float;

uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;

void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  outColor = vec4(velocity, 0.0, 1.0);
}`;

const CLEAR = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform float uValue;

in vec2 vUv;
out vec4 outColor;

void main() {
  outColor = vec4(uValue * texture(uTexture, vUv).rgb, 1.0);
}`;

const DISPLAY = `#version 300 es
precision highp float;

uniform sampler2D uDye;
uniform vec2 uTexelSize;
uniform float uOpacity;
uniform bool uShading;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;

void main() {
  vec3 c = texture(uDye, vUv).rgb;
  if (uShading) {
    vec3 lc = texture(uDye, vL).rgb;
    vec3 rc = texture(uDye, vR).rgb;
    vec3 tc = texture(uDye, vT).rgb;
    vec3 bc = texture(uDye, vB).rgb;
    float dx = length(rc) - length(lc);
    float dy = length(tc) - length(bc);
    vec3 normal = normalize(vec3(dx, dy, length(uTexelSize)));
    float diffuse = clamp(dot(normal, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
    c *= diffuse;
  }
  vec3 colour = clamp(c, 0.0, 1.0);
  float alpha = clamp(max(colour.r, max(colour.g, colour.b)) * uOpacity, 0.0, 1.0);
  outColor = vec4(colour * uOpacity, alpha);
}`;

interface FBO {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}

interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap(): void;
}

interface Pass {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export function createFluidWebGL(gl: WebGL2RenderingContext, initial: FluidOptions): StyleRenderer<FluidOptions> {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('interactive-bg: fluid needs EXT_color_buffer_float');
  }

  let options = resolveFluidOptions(initial);

  function makePass(fragment: string, names: readonly string[]): Pass {
    const program = createProgram(gl, VERTEX, fragment);
    if (!program) throw new Error('interactive-bg: fluid could not create a shader program');
    return { program, uniforms: getUniforms(gl, program, names) };
  }

  const splatPass = makePass(SPLAT, ['uTarget', 'uPoint', 'uColor', 'uRadius', 'uAspect']);
  const advectionPass = makePass(ADVECTION, ['uVelocity', 'uSource', 'uDt', 'uDissipation', 'uTexelSize']);
  const divergencePass = makePass(DIVERGENCE, ['uVelocity', 'uTexelSize']);
  const curlPass = makePass(CURL, ['uVelocity', 'uTexelSize']);
  const vorticityPass = makePass(VORTICITY, ['uVelocity', 'uCurl', 'uDt', 'uStrength', 'uTexelSize']);
  const pressurePass = makePass(PRESSURE, ['uPressure', 'uDivergence', 'uTexelSize']);
  const gradientPass = makePass(GRADIENT, ['uPressure', 'uVelocity', 'uTexelSize']);
  const clearPass = makePass(CLEAR, ['uTexture', 'uValue']);
  const displayPass = makePass(DISPLAY, ['uDye', 'uOpacity', 'uShading', 'uTexelSize']);

  function createFBO(width: number, height: number): FBO {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error('interactive-bg: fluid could not allocate a render target');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('interactive-bg: fluid render target is incomplete');
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width, height };
  }

  function createDoubleFBO(width: number, height: number): DoubleFBO {
    const a = createFBO(width, height);
    const b = createFBO(width, height);
    const pair = {
      read: a,
      write: b,
      swap() {
        [pair.read, pair.write] = [pair.write, pair.read];
      },
    };
    return pair;
  }

  function deleteFBO(target: FBO): void {
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }

  let simWidth = 0;
  let simHeight = 0;
  let dyeWidth = 0;
  let dyeHeight = 0;
  let builtWidth = 0;
  let builtHeight = 0;
  let builtResolution = -1;
  let velocity: DoubleFBO;
  let dye: DoubleFBO;
  let pressure: DoubleFBO;
  let divergence: FBO;
  let curl: FBO;

  // Initialised below by allocate().
  velocity = createDoubleFBO(1, 1);
  dye = createDoubleFBO(1, 1);
  pressure = createDoubleFBO(1, 1);
  divergence = createFBO(1, 1);
  curl = createFBO(1, 1);

  function allocate(width: number, height: number): void {
    for (const target of [velocity.read, velocity.write, dye.read, dye.write, pressure.read, pressure.write, divergence, curl]) {
      deleteFBO(target);
    }
    const grid = simulationSize(options.resolution, width, height);
    const dyeGrid = simulationSize(
      Math.min(MAX_DYE_RESOLUTION, Math.max(256, options.resolution * DYE_SCALE)),
      width,
      height,
    );
    simWidth = grid.width;
    simHeight = grid.height;
    dyeWidth = dyeGrid.width;
    dyeHeight = dyeGrid.height;
    velocity = createDoubleFBO(simWidth, simHeight);
    dye = createDoubleFBO(dyeWidth, dyeHeight);
    pressure = createDoubleFBO(simWidth, simHeight);
    divergence = createFBO(simWidth, simHeight);
    curl = createFBO(simWidth, simHeight);
    burstPending = true;
  }

  function draw(pass: Pass, target: FBO): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(pass.program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function texture(unit: number, source: WebGLTexture): void {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, source);
  }

  function splatVelocity(pointX: number, pointY: number, vx: number, vy: number, radius: number, aspect: number): void {
    const { uniforms, program } = splatPass;
    texture(0, velocity.read.texture);
    gl.useProgram(program);
    gl.uniform1i(uniforms.uTarget, 0);
    gl.uniform2f(uniforms.uPoint, pointX, pointY);
    gl.uniform3f(uniforms.uColor, vx, vy, 0);
    gl.uniform1f(uniforms.uRadius, radius * radius);
    gl.uniform1f(uniforms.uAspect, aspect);
    draw(splatPass, velocity.write);
    velocity.swap();
  }

  function splatDye(pointX: number, pointY: number, colour: RGB, radius: number, aspect: number): void {
    const { uniforms, program } = splatPass;
    texture(0, dye.read.texture);
    gl.useProgram(program);
    gl.uniform1i(uniforms.uTarget, 0);
    gl.uniform2f(uniforms.uPoint, pointX, pointY);
    gl.uniform3f(uniforms.uColor, colour[0] * DYE_INTENSITY, colour[1] * DYE_INTENSITY, colour[2] * DYE_INTENSITY);
    gl.uniform1f(uniforms.uRadius, radius * radius);
    gl.uniform1f(uniforms.uAspect, aspect);
    draw(splatPass, dye.write);
    dye.swap();
  }

  function splatAt(
    x: number,
    y: number,
    vx: number,
    vy: number,
    colour: RGB,
    radiusPx: number,
    aspect: number,
    height: number,
  ): void {
    const pointX = x / (height * aspect);
    // Texture v points up; pointer y points down. Flip both the splash position
    // and the vertical velocity so the smoke follows the pointer's direction.
    const pointY = 1 - y / height;
    const radius = Math.max(0.0005, radiusPx / height);
    splatVelocity(pointX, pointY, vx, -vy, radius, aspect);
    splatDye(pointX, pointY, colour, radius, aspect);
  }

  function step(dt: number): void {
    gl.disable(gl.BLEND);
    const idleBoost = idleTime > IDLE_DELAY ? 1 / IDLE_DECAY : 0;
    // Vorticity confinement: the curl of the velocity becomes a force.
    gl.useProgram(curlPass.program);
    texture(0, velocity.read.texture);
    gl.uniform1i(curlPass.uniforms.uVelocity, 0);
    gl.uniform2f(curlPass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
    draw(curlPass, curl);

    gl.useProgram(vorticityPass.program);
    texture(0, velocity.read.texture);
    texture(1, curl.texture);
    gl.uniform1i(vorticityPass.uniforms.uVelocity, 0);
    gl.uniform1i(vorticityPass.uniforms.uCurl, 1);
    gl.uniform2f(vorticityPass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
    gl.uniform1f(vorticityPass.uniforms.uDt, dt);
    gl.uniform1f(vorticityPass.uniforms.uStrength, options.curl);
    draw(vorticityPass, velocity.write);
    velocity.swap();

    gl.useProgram(divergencePass.program);
    texture(0, velocity.read.texture);
    gl.uniform1i(divergencePass.uniforms.uVelocity, 0);
    gl.uniform2f(divergencePass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
    draw(divergencePass, divergence);

    gl.useProgram(clearPass.program);
    texture(0, pressure.read.texture);
    gl.uniform1i(clearPass.uniforms.uTexture, 0);
    gl.uniform1f(clearPass.uniforms.uValue, PRESSURE_RETENTION);
    draw(clearPass, pressure.write);
    pressure.swap();
    for (let iteration = 0; iteration < PRESSURE_ITERATIONS; iteration++) {
      gl.useProgram(pressurePass.program);
      texture(0, pressure.read.texture);
      texture(1, divergence.texture);
      gl.uniform1i(pressurePass.uniforms.uPressure, 0);
      gl.uniform1i(pressurePass.uniforms.uDivergence, 1);
      gl.uniform2f(pressurePass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
      draw(pressurePass, pressure.write);
      pressure.swap();
    }

    gl.useProgram(gradientPass.program);
    texture(0, pressure.read.texture);
    texture(1, velocity.read.texture);
    gl.uniform1i(gradientPass.uniforms.uPressure, 0);
    gl.uniform1i(gradientPass.uniforms.uVelocity, 1);
    gl.uniform2f(gradientPass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
    draw(gradientPass, velocity.write);
    velocity.swap();

    gl.useProgram(advectionPass.program);
    gl.uniform1i(advectionPass.uniforms.uVelocity, 0);
    gl.uniform1i(advectionPass.uniforms.uSource, 1);
    gl.uniform1f(advectionPass.uniforms.uDt, dt);
    gl.uniform2f(advectionPass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
    texture(0, velocity.read.texture);
    texture(1, velocity.read.texture);
    gl.uniform1f(advectionPass.uniforms.uDissipation, 1 / VELOCITY_FADE);
    draw(advectionPass, velocity.write);
    velocity.swap();

    gl.useProgram(advectionPass.program);
    gl.uniform1i(advectionPass.uniforms.uVelocity, 0);
    gl.uniform1i(advectionPass.uniforms.uSource, 1);
    gl.uniform1f(advectionPass.uniforms.uDt, dt);
    gl.uniform1f(advectionPass.uniforms.uDissipation, 1 / options.fade + idleBoost);
    gl.uniform2f(advectionPass.uniforms.uTexelSize, 1 / simWidth, 1 / simHeight);
    texture(0, velocity.read.texture);
    texture(1, dye.read.texture);
    draw(advectionPass, dye.write);
    dye.swap();
  }

  let clock = 0;
  let active = 0;
  let idleTime = 0;
  let lastX = 0;
  let lastY = 0;
  let wasInside = false;
  let burstPending = true;

  function wake(): void {
    active = Math.max(active, IDLE_CLEAR + 0.5);
    idleTime = 0;
  }

  function burst(x: number, y: number, radius: number, aspect: number, height: number): void {
    const colour = splatColor(options, clock);
    const dye: RGB = [colour[0] * BURST_DYE, colour[1] * BURST_DYE, colour[2] * BURST_DYE];
    const angle = Math.random() * TAU;
    const speed = options.force * BURST_FORCE;
    splatAt(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, dye, radius, aspect, height);
  }

  function click(x: number, y: number, aspect: number, height: number): void {
    const colour = splatColor(options, clock);
    const dye: RGB = [colour[0] * 10, colour[1] * 10, colour[2] * 10];
    const dx = 10 * (Math.random() - 0.5);
    const dy = 30 * (Math.random() - 0.5);
    splatAt(x, y, dx, dy, dye, options.radius, aspect, height);
    wake();
  }

  function mountSize(width: number, height: number): void {
    if (width === builtWidth && height === builtHeight && options.resolution === builtResolution) return;
    builtWidth = width;
    builtHeight = height;
    builtResolution = options.resolution;
    allocate(width, height);
  }

  /** Clear both sides of a double buffer. */
  function clearField(target: DoubleFBO): void {
    for (const fbo of [target.read, target.write]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
      gl.viewport(0, 0, fbo.width, fbo.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  function drawDye(frame: Frame): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(displayPass.program);
    texture(0, dye.read.texture);
    gl.uniform1i(displayPass.uniforms.uDye, 0);
    gl.uniform2f(displayPass.uniforms.uTexelSize, 1 / Math.max(1, frame.width * frame.dpr), 1 / Math.max(1, frame.height * frame.dpr));
    gl.uniform1f(displayPass.uniforms.uOpacity, options.opacity);
    gl.uniform1i(displayPass.uniforms.uShading, options.shading ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    update(next) {
      options = resolveFluidOptions(next);
    },
    render(frame: Frame) {
      mountSize(frame.width, frame.height);
      if (frame.reducedMotion) {
        // Hold the smoke still: one static splash, no simulation. The engine then stops.
        if (burstPending) {
          burstPending = false;
          const aspect = frame.width / Math.max(1, frame.height);
          const bx = frame.width * (0.34 + Math.random() * 0.18);
          const by = frame.height * (0.4 + Math.random() * 0.2);
          burst(bx, by, options.radius * BURST_RADIUS, aspect, frame.height);
        }
        drawDye(frame);
        return false;
      }

      const dt = Math.min(frame.dt, 1 / 60);
      const aspect = frame.width / Math.max(1, frame.height);
      const { pointer } = frame;

      if (burstPending) {
        burstPending = false;
        const bx = frame.width * (0.34 + Math.random() * 0.18);
        const by = frame.height * (0.4 + Math.random() * 0.2);
        burst(bx, by, options.radius * BURST_RADIUS, aspect, frame.height);
        wake();
      }

      if (pointer.influence > 0) {
        if (wasInside) {
          const moveX = pointer.x - lastX;
          const moveY = pointer.y - lastY;
          const dx = moveX / Math.max(1, frame.width);
          const dy = moveY / Math.max(1, frame.height);
          // Like a real mousemove stream: don't keep adding dye to a resting pointer.
          if (Math.hypot(moveX, moveY) > 0.5) {
            const colour = splatColor(options, clock);
            const strength = options.force * pointer.influence;
            splatAt(
              pointer.x,
              pointer.y,
              dx * strength,
              dy * strength,
              colour,
              options.radius,
              aspect,
              frame.height,
            );
            wake();
          }
        }
        lastX = pointer.x;
        lastY = pointer.y;
        wasInside = true;
      } else {
        wasInside = false;
      }

      for (const clickPoint of frame.clicks) click(clickPoint.x, clickPoint.y, aspect, frame.height);

      if (dt > 0) {
        idleTime += dt;
        if (idleTime >= IDLE_CLEAR) {
          clearField(dye);
          clearField(velocity);
          idleTime = 0;
          active = 0;
          drawDye(frame);
          return false;
        }
        step(dt);
        clock += dt;
        active = Math.max(0, active - dt);
      }

      drawDye(frame);
      return active > 0;
    },
    destroy() {
      for (const target of [
        velocity.read,
        velocity.write,
        dye.read,
        dye.write,
        pressure.read,
        pressure.write,
        divergence,
        curl,
      ]) {
        deleteFBO(target);
      }
      for (const pass of [
        splatPass,
        advectionPass,
        divergencePass,
        curlPass,
        vorticityPass,
        pressurePass,
        gradientPass,
        clearPass,
        displayPass,
      ]) {
        gl.deleteProgram(pass.program);
      }
    },
  };
}
