import { describe, expect, it } from 'vitest';
import { dots } from '../src/dots';

describe('dots', () => {
  it('animates only while the dots wander', () => {
    expect(dots().definition.animates(dots().options)).toBe(true);
    expect(dots().definition.animates(dots({ jitter: 0 }).options)).toBe(false);
  });

  it('idles at the wander frame rate, never below 5 fps', () => {
    expect(dots().definition.idleFps?.(dots().options)).toBe(14);
    expect(dots().definition.idleFps?.(dots({ jitter: 0.1 }).options)).toBe(5);
  });
});
