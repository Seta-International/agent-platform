import { describe, expect, it } from 'vitest';
import {
  PRODUCT_GATE_EXEMPT,
  PRODUCT_IDS,
  PRODUCT_NAMESPACES,
  productForNamespace,
} from '../../src/products.ts';

describe('product catalog', () => {
  it('lists the four products and maps namespaces', () => {
    expect([...PRODUCT_IDS].sort()).toEqual(['hiring', 'people', 'planner', 'pm']);
    expect(PRODUCT_NAMESPACES.has('pm')).toBe(true);
    expect(PRODUCT_NAMESPACES.has('admin')).toBe(false);
    expect(productForNamespace('people')).toBe('people');
    expect(PRODUCT_GATE_EXEMPT.has('people.self.read')).toBe(true);
  });
});
