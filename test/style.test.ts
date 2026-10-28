import { describe, expect, it } from 'vitest';
import { canvas2dRenderer } from '../src/core/canvas2d-renderer';
import { defineStyle } from '../src/core/style';
import { createSurface, type Renderer, type Surface } from '../src/core/surface';
import * as dotsAuto from '../src/dots';
import * as dotsCanvas2d from '../src/dots/canvas2d';
import * as dotsWebgl from '../src/dots/webgl';
import * as plusAuto from '../src/plus';
import * as plusCanvas2d from '../src/plus/canvas2d';
import * as plusWebgl from '../src/plus/webgl';
import { topo } from '../src/topo';
import * as topoCanvas2d from '../src/topo/canvas2d';
import * as topoWebgl from '../src/topo/webgl';

describe('defineStyle', () => {
  const renderer = { update() {}, render() {} };
  const dots = defineStyle<{ size: number; color: string }>({
    name: 'dots',
    defaults: { size: 2, color: '#fff' },
    animates: () => false,
    renderers: [canvas2dRenderer(() => renderer)],
  });

  it('fills in defaults for options that are not given', () => {
    expect(dots({ size: 4 }).options).toEqual({ size: 4, color: '#fff' });
    expect(dots().options).toEqual({ size: 2, color: '#fff' });
  });

  it('exposes the name and defaults on the factory', () => {
    expect(dots.styleName).toBe('dots');
    expect(dots.defaults).toEqual({ size: 2, color: '#fff' });
  });

  it('rejects a style without any renderer', () => {
    expect(() => defineStyle({ name: 'empty', defaults: {}, animates: () => false, renderers: [] })).toThrow(
      /no renderer/,
    );
  });
});

describe('style entry points', () => {
  const names = (factory: { (): { definition: { renderers: readonly Renderer<never>[] } } }) =>
    factory().definition.renderers.map((r) => r.name);

  it.each([
    ['topo', topo, topoWebgl.topo, topoCanvas2d.topo],
    ['dots', dotsAuto.dots, dotsWebgl.dots, dotsCanvas2d.dots],
    ['plus', plusAuto.plus, plusWebgl.plus, plusCanvas2d.plus],
  ])('%s: auto has WebGL then Canvas 2D, the others only their own', (name, auto, webgl, canvas2d) => {
    expect(names(auto)).toEqual(['webgl', 'canvas2d']);
    expect(names(webgl)).toEqual(['webgl']);
    expect(names(canvas2d)).toEqual(['canvas2d']);
    // Same style either way: name, defaults and behaviour come from one definition.
    for (const variant of [webgl, canvas2d]) {
      expect(variant.styleName).toBe(name);
      expect(variant.defaults).toBe(auto.defaults);
    }
  });
});

describe('createSurface', () => {
  const canvas = {} as HTMLCanvasElement;
  const tried: string[] = [];
  const fake = (name: 'webgl' | 'canvas2d', works: boolean): Renderer<object> => ({
    name,
    create() {
      tried.push(name);
      return works ? ({ name } as Surface<object>) : null;
    },
  });
  const pick = (renderers: Renderer<object>[], preference: 'auto' | 'webgl' | 'canvas2d') => {
    tried.length = 0;
    return createSurface(() => canvas, renderers, {}, preference, () => {})?.name ?? null;
  };

  it("uses the style's order on auto, falling back to the next renderer", () => {
    expect(pick([fake('webgl', true), fake('canvas2d', true)], 'auto')).toBe('webgl');
    expect(pick([fake('webgl', false), fake('canvas2d', true)], 'auto')).toBe('canvas2d');
    expect(tried).toEqual(['webgl', 'canvas2d']);
  });

  it('tries the preferred renderer first, if the style has it', () => {
    expect(pick([fake('webgl', true), fake('canvas2d', true)], 'canvas2d')).toBe('canvas2d');
    expect(pick([fake('webgl', true)], 'canvas2d')).toBe('webgl');
  });

  it('gives each renderer after a failed one a fresh canvas', () => {
    const canvases: string[] = [];
    let current = 'first';
    const record = (name: 'webgl' | 'canvas2d', works: boolean): Renderer<object> => ({
      name,
      create(canvas) {
        canvases.push(`${name} on ${canvas as unknown as string}`);
        return works ? ({ name } as Surface<object>) : null;
      },
    });
    const surface = createSurface(
      () => current as unknown as HTMLCanvasElement,
      [record('webgl', false), record('canvas2d', true)],
      {},
      'auto',
      () => {},
      () => (current = 'fresh'),
    );
    expect(surface?.name).toBe('canvas2d');
    expect(canvases).toEqual(['webgl on first', 'canvas2d on fresh']);
  });

  it('gives up with null when no renderer works here', () => {
    expect(pick([fake('webgl', false)], 'auto')).toBeNull();
  });
});

describe('topo', () => {
  it('animates only while it has a speed', () => {
    expect(topo().definition.animates(topo().options)).toBe(true);
    expect(topo().definition.animates(topo({ speed: 0 }).options)).toBe(false);
  });
});
