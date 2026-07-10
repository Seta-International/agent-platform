import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkAllocationEffort,
  fetchAllocations,
  previewReassignAllocation,
  previewReassignWorkerAllocations,
  reassignAllocation,
  reassignWorkerAllocations,
  splitAllocation,
} from '../../../src/api/pm-client';

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

describe('checkAllocationEffort', () => {
  it('builds the query string and returns the peak/exceeds/conflicts result', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ peak_pct: 130, exceeds: true, conflicts: [] }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await checkAllocationEffort({
      worker_id: 'w1',
      date_from: '2026-01-01',
      date_to: '2026-06-30',
      planned_pct: 50,
      exclude_allocation_id: 'a1',
    });
    expect(out).toEqual({ peak_pct: 130, exceeds: true, conflicts: [] });
    const url = spy.mock.calls[0]?.[0] as string;
    expect(url).toContain('/api/pm/v1/allocations/effort-check?');
    expect(url).toContain('worker_id=w1');
    expect(url).toContain('planned_pct=50');
    expect(url).toContain('exclude_allocation_id=a1');
  });
});

describe('splitAllocation', () => {
  it('POSTs to the split endpoint and returns the result', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            updated_id: 'a1',
            updated_version: 2,
            continuation_id: 'a2',
            warning: null,
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await splitAllocation('a1', {
      new_end_date: '2026-02-28',
      continuation: { planned_pct: 50 },
    });
    expect(out).toEqual({
      updated_id: 'a1',
      updated_version: 2,
      continuation_id: 'a2',
      warning: null,
    });
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pm/v1/allocations/a1/split');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      new_end_date: '2026-02-28',
      continuation: { planned_pct: 50 },
    });
  });
});

describe('reassignAllocation', () => {
  it('POSTs to the reassign endpoint and returns the result', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            source_updated_version: 2,
            target_ids: ['t1', 't2'],
            warnings: [],
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await reassignAllocation('a1', {
      source: { date_to: '2026-02-28' },
      targets: [
        { project_id: 'p1', date_from: '2026-03-01', planned_pct: 40, bucket: 'billable' },
        { project_id: 'p2', date_from: '2026-03-01', planned_pct: 60, bucket: 'billable' },
      ],
    });
    expect(out).toEqual({
      source_updated_version: 2,
      target_ids: ['t1', 't2'],
      warnings: [],
    });
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pm/v1/allocations/a1/reassign');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({
      source: { date_to: '2026-02-28' },
      targets: [
        { project_id: 'p1', date_from: '2026-03-01', planned_pct: 40, bucket: 'billable' },
        { project_id: 'p2', date_from: '2026-03-01', planned_pct: 60, bucket: 'billable' },
      ],
    });
  });
});

describe('previewReassignAllocation', () => {
  it('POSTs to the reassign/preview endpoint and returns the impact', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            worker_name: 'Nguyen Van A',
            source: {
              project_name: 'Automotive',
              account_name: 'Aeris',
              bucket: 'billable',
              date_from: '2026-08-09',
              date_to: '2026-09-30',
              planned_pct: 100,
            },
            targets: [
              {
                project_name: 'CRM',
                account_name: 'Samsung',
                bucket: 'billable',
                date_from: '2026-10-01',
                date_to: '2026-12-31',
                planned_pct: 50,
              },
            ],
            peak_pct: 100,
            exceeds: false,
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await previewReassignAllocation('a1', {
      source: { date_to: '2026-09-30' },
      targets: [{ project_id: 'p1', date_from: '2026-10-01', planned_pct: 50, bucket: 'billable' }],
    });
    expect(out.peak_pct).toBe(100);
    expect(out.targets[0]?.project_name).toBe('CRM');
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pm/v1/allocations/a1/reassign/preview');
    expect(opts.method).toBe('POST');
  });

  it('throws an error carrying the details payload so callers can tell which row failed', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'VALIDATION',
            message: 'allocation end 2026-08-30 is after the project end 2026-06-30',
            details: { field: 'target', index: 0 },
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    await expect(
      previewReassignAllocation('a1', {
        source: { date_to: '2026-08-30' },
        targets: [
          { project_id: 'p1', date_from: '2026-09-01', planned_pct: 50, bucket: 'billable' },
        ],
      }),
    ).rejects.toMatchObject({
      message: 'allocation end 2026-08-30 is after the project end 2026-06-30',
      details: { field: 'target', index: 0 },
    });
  });
});

describe('reassignWorkerAllocations', () => {
  it('POSTs to the reassign-group endpoint and returns the result', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            updated: [{ allocation_id: 'a1', version: 2 }],
            target_ids: ['t1'],
            warnings: [],
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await reassignWorkerAllocations({
      worker_id: 'w1',
      allocation_ids: ['a1'],
      source: { date_to: '2026-06-30' },
      targets: [
        { project_id: 'p1', date_from: '2026-07-01', planned_pct: 100, bucket: 'billable' },
      ],
    });
    expect(out).toEqual({
      updated: [{ allocation_id: 'a1', version: 2 }],
      target_ids: ['t1'],
      warnings: [],
    });
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pm/v1/allocations/reassign-group');
    expect(opts.method).toBe('POST');
  });
});

describe('previewReassignWorkerAllocations', () => {
  it('POSTs to the reassign-group/preview endpoint and returns the impact', async () => {
    const spy = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({
            worker_name: 'An Đình Luận',
            sources: [
              {
                project_name: 'Watchtower',
                account_name: 'Aeris',
                bucket: 'billable',
                date_from: '2026-01-01',
                date_to: '2026-06-30',
                planned_pct: 30,
              },
            ],
            targets: [
              {
                project_name: 'NewProj',
                account_name: 'NewCo',
                bucket: 'billable',
                date_from: '2026-07-01',
                date_to: null,
                planned_pct: 100,
              },
            ],
            peak_pct: 100,
            exceeds: false,
            peak_from: null,
            peak_to: null,
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', spy);
    const out = await previewReassignWorkerAllocations({
      worker_id: 'w1',
      allocation_ids: ['a1'],
      source: { date_to: '2026-06-30' },
      targets: [
        { project_id: 'p1', date_from: '2026-07-01', planned_pct: 100, bucket: 'billable' },
      ],
    });
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]?.project_name).toBe('Watchtower');
    const [url, opts] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pm/v1/allocations/reassign-group/preview');
    expect(opts.method).toBe('POST');
  });
});
