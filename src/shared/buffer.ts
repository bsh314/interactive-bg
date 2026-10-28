/**
 * Numbers collected during a frame, in an array that's reused from frame to
 * frame and only ever grows, so drawing allocates nothing once it's warm.
 */
export interface FloatBuffer {
  data: Float32Array<ArrayBuffer>;
  length: number;
}

export function createFloatBuffer(capacity: number): FloatBuffer {
  return { data: new Float32Array(capacity), length: 0 };
}

/** Make room for `count` more values (doubling the array if needed) and return the array to write into. */
export function reserve(buffer: FloatBuffer, count: number): Float32Array<ArrayBuffer> {
  if (buffer.length + count > buffer.data.length) {
    const grown = new Float32Array(Math.max(buffer.data.length * 2, buffer.length + count));
    grown.set(buffer.data);
    buffer.data = grown;
  }
  return buffer.data;
}
