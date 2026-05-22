import { customType } from 'drizzle-orm/pg-core';

interface HalfvecConfig {
  dimensions: number;
}

/**
 * pgvector halfvec(N) — half-precision (16-bit) float vector. Requires pgvector >= 0.7.
 *
 * Driver representation is the pgvector text format: `[0.1,0.2,...]`. We use compact
 * (no spaces) on write because pgvector accepts either form and the wire payload is
 * smaller at 1536d × millions of rows.
 */
export const halfvec = customType<{ data: number[]; driverData: string; config: HalfvecConfig }>({
  dataType(config) {
    if (!config) throw new Error('halfvec requires { dimensions } config');
    return `halfvec(${config.dimensions})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    const inner = value.slice(1, -1);
    return inner.length === 0 ? [] : inner.split(',').map(Number);
  },
});
