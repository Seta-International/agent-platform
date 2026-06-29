import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAllocations } from '../../../src/api/pm-client';

afterEach(() => vi.restoreAllMocks());

describe('fetchAllocations', () => {
  it('builds the query string from params and unwraps allocations', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ allocations: [{ allocation_id: 'a1' }] }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await fetchAllocations({
      account_id: 'acc1',
      active_from: '2026-01-01',
      active_to: '2026-06-30',
    });
    expect(out).toEqual([{ allocation_id: 'a1' }]);
    const url = spy.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/pm/v1/allocations?');
    expect(url).toContain('account_id=acc1');
    expect(url).toContain('active_from=2026-01-01');
    expect(url).toContain('active_to=2026-06-30');
  });
});
