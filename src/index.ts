// Engine
export { createBackground, engineDefaults } from './core/engine';
export type { Background, EngineOptions } from './core/engine';

// Styles, each drawn with WebGL2 where available and Canvas 2D otherwise. To bundle only
// one renderer, import from 'interactive-bg/<style>/webgl' or 'interactive-bg/<style>/canvas2d'.
export { topo } from './topo/index';
export type { TopoOptions } from './topo/index';
export { dots } from './dots/index';
export type { DotsOptions } from './dots/index';
export { plus } from './plus/index';
export type { PlusOptions } from './plus/index';

// Writing your own style
export { defineStyle } from './core/style';
export type {
  Frame,
  Point,
  Pointer,
  RendererName,
  Style,
  StyleBase,
  StyleDefinition,
  StyleFactory,
  StyleRenderer,
} from './core/style';
export type { Fade, Renderer, Surface } from './core/surface';
export { webglRenderer } from './core/webgl-renderer';
export { canvas2dRenderer } from './core/canvas2d-renderer';
export { createProgram, FULLSCREEN_VERTEX_SHADER, getUniforms } from './core/webgl';
export { parseColor } from './core/color';
export type { RGBA } from './core/color';
export { createNoise3D } from './shared/noise';
export type { Noise3D } from './shared/noise';
