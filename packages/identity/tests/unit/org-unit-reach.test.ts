import { describe, expect, it } from 'vitest';
import { expandFromTree } from '../../src/backend/domain/org-unit-reach.ts';

const tree = [
  { org_unit_id: 'a', parent_id: null },
  { org_unit_id: 'b', parent_id: 'a' },
  { org_unit_id: 'c', parent_id: 'b' },
  { org_unit_id: 'd', parent_id: null },
];

describe('expandFromTree', () => {
  it('returns the node plus all descendants', () => {
    expect(expandFromTree(tree, ['a'])).toEqual({ a: ['a', 'b', 'c'] });
  });
  it('unknown root expands to itself only', () => {
    expect(expandFromTree(tree, ['zz'])).toEqual({ zz: ['zz'] });
  });
  it('handles multiple roots and leaves', () => {
    expect(expandFromTree(tree, ['b', 'd'])).toEqual({ b: ['b', 'c'], d: ['d'] });
  });
});
