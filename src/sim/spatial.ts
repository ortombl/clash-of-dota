import type { Unit } from './types';

/** Uniform-grid spatial hash rebuilt every tick. Used by all targeting, vision and collision queries. */
export class SpatialHash {
  readonly cols: number; readonly rows: number; private buckets: Unit[][];
  constructor(private w: number, private h: number, private cell = 100) {
    this.cols = Math.ceil(w / cell) + 1; this.rows = Math.ceil(h / cell) + 1;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }
  clear() { for (const b of this.buckets) b.length = 0; }
  insert(u: Unit) {
    const cx = Math.min(this.cols - 1, Math.max(0, (u.x / this.cell) | 0));
    const cy = Math.min(this.rows - 1, Math.max(0, (u.y / this.cell) | 0));
    this.buckets[cy * this.cols + cx].push(u);
  }
  /** Appends candidates from every cell overlapping the circle. Callers still distance-check. */
  query(x: number, y: number, r: number, out: Unit[]): Unit[] {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.max(0, ((x - r) / c) | 0), x1 = Math.min(this.cols - 1, ((x + r) / c) | 0);
    const y0 = Math.max(0, ((y - r) / c) | 0), y1 = Math.min(this.rows - 1, ((y + r) / c) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = this.buckets[cy * this.cols + cx];
      for (let i = 0; i < b.length; i++) out.push(b[i]);
    }
    return out;
  }
}
