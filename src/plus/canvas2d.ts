import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { createPlusCanvas2D } from '../styles/plus/canvas2d';
import { plusStyle } from '../styles/plus/definition';
import type { PlusOptions } from '../styles/plus/options';

export type { PlusOptions };

/** A grid of "+" signs, drawn with Canvas 2D only. */
export const plus: StyleFactory<PlusOptions> = defineStyle({ ...plusStyle, renderers: [canvas2dRenderer(createPlusCanvas2D)] });
