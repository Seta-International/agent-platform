import { describe, expect, it } from 'vitest';
import { halfvec } from '../src/halfvec.ts';

// customType() returns a PgCustomColumnBuilder. The mapping functions and SQL type
// are stored on builder.config.customTypeParams, not on the builder itself.
// (PgCustomColumn exposes the public methods, but building a column requires a table
// reference that's unavailable in unit tests.)
interface BuilderInternals {
  config: {
    customTypeParams: {
      dataType: (config: unknown) => string;
      toDriver: (v: number[]) => string;
      fromDriver: (v: string) => number[];
    };
    fieldConfig: unknown;
  };
}

describe('halfvec Drizzle customType', () => {
  it('encodes a number[] to a pgvector string literal', () => {
    const t = halfvec('e', { dimensions: 3 }) as unknown as BuilderInternals;
    const driverValue = t.config.customTypeParams.toDriver([0.1, 0.2, 0.3]);
    expect(driverValue).toBe('[0.1,0.2,0.3]');
  });

  it('parses a pgvector string literal back to a number[]', () => {
    const t = halfvec('e', { dimensions: 3 }) as unknown as BuilderInternals;
    const value = t.config.customTypeParams.fromDriver('[0.1,0.2,0.3]');
    expect(value).toEqual([0.1, 0.2, 0.3]);
  });

  it('produces the right SQL declaration', () => {
    const t = halfvec('e', { dimensions: 1536 }) as unknown as BuilderInternals;
    const sqlType = t.config.customTypeParams.dataType(t.config.fieldConfig);
    expect(sqlType).toBe('halfvec(1536)');
  });
});
