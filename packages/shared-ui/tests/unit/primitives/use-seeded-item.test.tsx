import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SearchableItem } from '../../../src/primitives/typeahead';
import { useSeededItem, useSeededItems } from '../../../src/primitives/use-seeded-item';

/** Mimics a backend that ignores the `ids` filter and returns its full list,
 *  unordered relative to what was asked for — the exact shape of the regression
 *  this hook guards against (never trust `items[0]`). */
const seedFullList = async (_ids: string[]): Promise<SearchableItem[]> => [
  { id: 'ou-9', label: 'Zzz' },
  { id: 'ou-1', label: 'Engineering' },
];

describe('useSeededItem', () => {
  it('resolves to the item matching the id, even when seed returns other items first', async () => {
    const { result } = renderHook(() => useSeededItem('ou-1', seedFullList));
    expect(result.current[0]).toBeNull();
    await waitFor(() => expect(result.current[0]).toEqual({ id: 'ou-1', label: 'Engineering' }));
  });

  it('returns null when id is empty', async () => {
    const { result } = renderHook(() => useSeededItem(null, seedFullList));
    await waitFor(() => expect(result.current[0]).toBeNull());
  });

  it('returns null when the id is not present among resolved items', async () => {
    const { result } = renderHook(() => useSeededItem('missing', seedFullList));
    await waitFor(() => expect(result.current[0]).toBeNull());
  });
});

describe('useSeededItems', () => {
  it('maps each id to its matching item, in id order, regardless of seed order', async () => {
    const { result } = renderHook(() => useSeededItems(['ou-1', 'ou-9'], seedFullList));
    expect(result.current[0]).toEqual([]);
    await waitFor(() =>
      expect(result.current[0]).toEqual([
        { id: 'ou-1', label: 'Engineering' },
        { id: 'ou-9', label: 'Zzz' },
      ]),
    );
  });

  it('returns an empty array when given no ids', async () => {
    const { result } = renderHook(() => useSeededItems([], seedFullList));
    await waitFor(() => expect(result.current[0]).toEqual([]));
  });
});
