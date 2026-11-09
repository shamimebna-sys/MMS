/** Fixed buckets. Percentiles are the bucket's upper edge; `max` is the exact sample. */
export const HISTOGRAM_UPPER_MS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000] as const;

export const HISTOGRAM_BUCKETS = HISTOGRAM_UPPER_MS.length + 1;

export class DurationHistogram {
  private readonly buckets: number[];
  count = 0;
  errors = 0;
  slow = 0;
  max: number | null = null;

  constructor(private readonly upper: readonly number[] = HISTOGRAM_UPPER_MS) {
    this.buckets = Array.from({ length: upper.length + 1 }, () => 0);
  }

  record(value: number, isError: boolean, slowAt: number): void {
    const sample = Number.isFinite(value) && value > 0 ? value : 0;
    this.count += 1;
    if (isError) this.errors += 1;
    if (sample >= slowAt) this.slow += 1;
    if (this.max === null || sample > this.max) this.max = sample;
    const index = this.bucket(sample);
    this.buckets[index] = (this.buckets[index] ?? 0) + 1;
  }

  /** Approximate. Returns the inclusive upper edge of the bucket that crosses `fraction`. */
  percentile(fraction: number): number | null {
    if (this.count === 0) return null;
    const target = Math.max(1, Math.ceil(this.count * fraction));
    let seen = 0;
    for (let index = 0; index < this.buckets.length; index += 1) {
      seen += this.buckets[index] ?? 0;
      if (seen >= target) {
        if (index >= this.upper.length) return this.max;
        return this.upper[index] ?? this.max;
      }
    }
    return this.max;
  }

  reset(): void {
    this.buckets.fill(0);
    this.count = 0;
    this.errors = 0;
    this.slow = 0;
    this.max = null;
  }

  private bucket(sample: number): number {
    for (let index = 0; index < this.upper.length; index += 1) {
      const edge = this.upper[index] ?? Number.POSITIVE_INFINITY;
      if (sample <= edge) return index;
    }
    return this.upper.length;
  }
}
