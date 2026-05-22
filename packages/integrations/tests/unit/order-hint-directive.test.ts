import { describe, expect, it } from 'vitest';
import { directiveBetween } from '../../src/m365/plans/order-hint-directive.ts';

describe('directiveBetween', () => {
  it.each([
    [null, null, ' !'],
    ['a', null, 'a !'],
    [null, 'z', ' z!'],
    ['a', 'z', 'a z!'],
    ['', '', ' !'],
    ['8597', '8598', '8597 8598!'],
  ])('prev=%j next=%j → %j', (prev, next, expected) => {
    expect(directiveBetween(prev, next)).toBe(expected);
  });
});
