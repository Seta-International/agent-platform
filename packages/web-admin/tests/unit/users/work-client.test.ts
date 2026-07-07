import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkerAllocation,
  deleteWorkerAllocation,
  getWorkerProfile,
  listWorkerAllocations,
  listWorkersBrief,
  patchWorker,
} from '../../../src/users/api/work-client.ts';

function stubFetch(json: unknown, status = 200): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(json), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe('work-client', () => {
  it('getWorkerProfile hits people workers/:id', async () => {
    const fn = stubFetch({ worker_id: 'w1', job_title: 'Dev', version: 1 });
    await getWorkerProfile('w1');
    expect(fn).toHaveBeenCalledWith('/api/people/v1/workers/w1', { credentials: 'include' });
  });

  it('listWorkersBrief batches ids and returns [] for empty input without fetching', async () => {
    const fn = stubFetch({ rows: [] });
    expect(await listWorkersBrief([])).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
    await listWorkersBrief(['a', 'b']);
    expect(fn).toHaveBeenCalledWith('/api/people/v1/workers?ids=a%2Cb', {
      credentials: 'include',
    });
  });

  it('listWorkerAllocations filters by worker', async () => {
    const fn = stubFetch({ allocations: [] });
    await listWorkerAllocations('w1');
    expect(fn).toHaveBeenCalledWith('/api/pm/v1/allocations?worker_id=w1', {
      credentials: 'include',
    });
  });

  it('patchWorker sends expected_version and patch', async () => {
    const fn = stubFetch({ worker_id: 'w1', version: 2 });
    await patchWorker('w1', 1, { org_unit_id: 'ou1' });
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      expected_version: 1,
      patch: { org_unit_id: 'ou1' },
    });
  });

  it('createWorkerAllocation posts to pm', async () => {
    const fn = stubFetch({ allocation_id: 'al1' }, 201);
    await createWorkerAllocation({ project_id: 'p1', worker_id: 'w1', status: 'tentative' });
    expect(fn.mock.calls[0]?.[0]).toBe('/api/pm/v1/allocations');
  });

  it('deleteWorkerAllocation deletes by id', async () => {
    const fn = stubFetch(null, 204);
    await deleteWorkerAllocation('al1');
    expect(fn.mock.calls[0]?.[0]).toBe('/api/pm/v1/allocations/al1');
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });
});
