import { canvas2dRenderer } from '../core/canvas2d-renderer';
import { defineStyle, type StyleFactory } from '../core/style';
import { createDotsCanvas2D } from '../styles/dots/canvas2d';
import { dotsStyle } from '../styles/dots/definition';
import type { DotsOptions } from '../styles/dots/options';

export type { DotsOptions };

/** A grid of wandering dots, drawn with Canvas 2D only. */
export const dots: StyleFactory<DotsOptions> = defineStyle({ ...dotsStyle, renderers: [canvas2dRenderer(createDotsCanvas2D)] });
