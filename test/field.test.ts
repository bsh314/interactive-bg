import { describe, expect, it } from 'vitest';
import { createKeyframeField, type FieldParams } from '../src/styles/topo/field';

const params: FieldParams = { seed: 7, scale: 0.01, octaves: 2, cellSize: 10 };

function fieldAt(time: number) {
  const field = createKeyframeField(params);
  field.resize(100, 50);
  const blend = field.advance(time);
  return { field, blend };
}

describe('createKeyframeField', () => {
  it('sizes the grid to cover the area', () => {
    const { field } = fieldAt(0);
    expect(field.cols).toBe(11);
    expect(field.rows).toBe(6);
    expect(field.keyA).toHaveLength(66);
  });

  it('keeps values within [-1, 1]', () => {
    const { field } = fieldAt(0);
    for (const v of [...field.keyA, ...field.keyB]) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it('blends linearly between keyframes', () => {
    const { blend } = fieldAt(0);
    expect(blend).toBe(0);
    const field = createKeyframeField(params);
    field.resize(100, 50);
    field.advance(0);
    expect(field.advance(0.01)).toBeCloseTo(0.5);
  });

  it('builds the same keyframes progressively as when sampled directly', () => {
    const stepped = createKeyframeField(params);
    stepped.resize(100, 50);
    for (let t = 0; t <= 0.05; t += 0.001) stepped.advance(t);

    const direct = createKeyframeField(params);
    direct.resize(100, 50);
    direct.advance(0.04); // samples A at 0.04 and B at 0.06 from scratch
    expect(Array.from(stepped.keyA)).toEqual(Array.from(direct.keyA));
    expect(Array.from(stepped.keyB)).toEqual(Array.from(direct.keyB));
  });

  it('only resamples when parameters or size actually change', () => {
    const { field } = fieldAt(0);
    const version = field.version;
    field.configure({ ...params });
    field.resize(100, 50);
    field.advance(0);
    expect(field.version).toBe(version);

    field.configure({ ...params, seed: 8 });
    field.advance(0);
    expect(field.version).toBe(version + 1);
  });
});
