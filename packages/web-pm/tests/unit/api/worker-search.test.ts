import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerSearch } from '../../../src/api/worker-search';

afterEach(() => vi.restoreAllMocks());

describe('workerSearch', () => {
  it('maps People rows to entity options', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({ workers: [{ worker_id: 'w1', full_name: 'Alice' }] }),
          }) as unknown as Response,
      ),
    );
    const out = await workerSearch.search('al');
    expect(out).toEqual([{ value: 'w1', label: 'Alice' }]);
  });
});
