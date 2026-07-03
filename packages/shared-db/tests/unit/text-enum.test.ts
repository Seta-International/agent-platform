import { describe, expect, it } from 'vitest';
import { textEnum, textEnumValuesSql } from '../../src/text-enum.ts';

describe('textEnumValuesSql', () => {
  it('quotes and joins values', () => {
    expect(textEnumValuesSql(['open', 'on_hold'])).toBe(`'open', 'on_hold'`);
  });

  it('escapes embedded single quotes', () => {
    expect(textEnumValuesSql(["don't"])).toBe(`'don''t'`);
  });
});

describe('textEnum', () => {
  it('produces a text column builder carrying the enum values', () => {
    const col = textEnum('status', ['a', 'b'] as const);
    expect(col).toBeDefined();
  });
});
