import { describe, expect, it } from 'vitest';
import type {
  KnownEtags,
  LocalPlanState,
  RemoteState,
} from '../../../src/backend/m365/plans/walker.ts';
import { walk } from '../../../src/backend/m365/plans/walker.ts';

const baseLocal: LocalPlanState = {
  plan: { id: 'P-1', title: 'A' },
  planDetails: { categoryDescriptions: {} },
  buckets: [],
  tasks: [],
};

function makeRemote(overrides?: Partial<RemoteState>): RemoteState {
  return {
    plan: { id: 'P-EXT', '@odata.etag': 'W/"p1"', title: 'A' },
    planDetails: { id: 'PD-EXT', '@odata.etag': 'W/"pd1"', categoryDescriptions: {} },
    buckets: [],
    tasks: [],
    ...overrides,
  };
}

function emptyEtags(): KnownEtags {
  return {
    buckets: new Map(),
    tasks: new Map(),
    taskDetails: new Map(),
    boardFormats: new Map(),
  };
}

describe('walk — plan title LWW', () => {
  it('no changes: empty state, etags match, snapshot matches — WalkActions is fully empty', () => {
    const result = walk({
      local: baseLocal,
      remote: makeRemote(),
      knownEtags: emptyEtags(),
      snapshot: { plan: { title: 'A' } },
    });

    expect(result.changedTaskExternalIds).toEqual([]);
    expect(result.removedTaskExternalIds).toEqual([]);
    expect(result.changedBucketExternalIds).toEqual([]);
    expect(result.removedBucketExternalIds).toEqual([]);
    expect(result.planFieldsToApply).toEqual({});
    expect(result.fieldConflicts).toEqual([]);
    expect(result.categoryDescriptionsToApply).toBeUndefined();
  });

  it('plan title remote-wins: remote changed, local matches snapshot → planFieldsToApply.title', () => {
    const result = walk({
      local: { ...baseLocal, plan: { id: 'P-1', title: 'A' } },
      remote: makeRemote({ plan: { id: 'P-EXT', '@odata.etag': 'W/"p1"', title: 'B' } }),
      knownEtags: emptyEtags(),
      snapshot: { plan: { title: 'A' } },
    });

    expect(result.planFieldsToApply.title).toBe('B');
    expect(result.fieldConflicts).toEqual([]);
  });

  it('plan title conflict: both local and remote diverged from snapshot → fieldConflicts', () => {
    const result = walk({
      local: { ...baseLocal, plan: { id: 'P-1', title: 'X' } },
      remote: makeRemote({ plan: { id: 'P-EXT', '@odata.etag': 'W/"p1"', title: 'Y' } }),
      knownEtags: emptyEtags(),
      snapshot: { plan: { title: 'A' } },
    });

    expect(result.planFieldsToApply).toEqual({});
    expect(result.fieldConflicts).toHaveLength(1);
    expect(result.fieldConflicts[0]).toMatchObject({
      scope: 'plan',
      field: 'title',
      local: 'X',
      remote: 'Y',
      snapshot: 'A',
    });
  });

  it('plan title noop: local === remote — no actions', () => {
    const result = walk({
      local: { ...baseLocal, plan: { id: 'P-1', title: 'A' } },
      remote: makeRemote({ plan: { id: 'P-EXT', '@odata.etag': 'W/"p1"', title: 'A' } }),
      knownEtags: emptyEtags(),
      snapshot: { plan: { title: 'A' } },
    });

    expect(result.planFieldsToApply).toEqual({});
    expect(result.fieldConflicts).toEqual([]);
  });
});

describe('walk — bucket diffing', () => {
  it('bucket added remotely (etag absent locally) → changedBucketExternalIds', () => {
    const result = walk({
      local: baseLocal,
      remote: makeRemote({
        buckets: [
          { id: 'B-1', '@odata.etag': 'W/"b1"', name: 'Backlog', planId: 'P-EXT', orderHint: ' !' },
        ],
      }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.changedBucketExternalIds).toEqual(['B-1']);
    expect(result.removedBucketExternalIds).toEqual([]);
  });

  it('bucket etag advanced → changedBucketExternalIds', () => {
    const etags = emptyEtags();
    etags.buckets.set('B-1', 'W/"b0"');

    const result = walk({
      local: baseLocal,
      remote: makeRemote({
        buckets: [
          { id: 'B-1', '@odata.etag': 'W/"b1"', name: 'Backlog', planId: 'P-EXT', orderHint: ' !' },
        ],
      }),
      knownEtags: etags,
      snapshot: {},
    });

    expect(result.changedBucketExternalIds).toEqual(['B-1']);
  });

  it('bucket etag unchanged → NOT in changedBucketExternalIds', () => {
    const etags = emptyEtags();
    etags.buckets.set('B-1', 'W/"b1"');

    const result = walk({
      local: baseLocal,
      remote: makeRemote({
        buckets: [
          { id: 'B-1', '@odata.etag': 'W/"b1"', name: 'Backlog', planId: 'P-EXT', orderHint: ' !' },
        ],
      }),
      knownEtags: etags,
      snapshot: {},
    });

    expect(result.changedBucketExternalIds).toEqual([]);
    expect(result.removedBucketExternalIds).toEqual([]);
  });

  it('bucket removed remotely → removedBucketExternalIds', () => {
    const result = walk({
      local: {
        ...baseLocal,
        buckets: [{ id: 'bucket-uuid', external_id: 'B-X', name: 'Old', order_hint: ' !' }],
      },
      remote: makeRemote({ buckets: [] }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.removedBucketExternalIds).toEqual(['B-X']);
    expect(result.changedBucketExternalIds).toEqual([]);
  });
});

describe('walk — task diffing', () => {
  it('task added remotely (etag absent locally) → changedTaskExternalIds', () => {
    const result = walk({
      local: baseLocal,
      remote: makeRemote({
        tasks: [
          {
            id: 'T-1',
            '@odata.etag': 'W/"t1"',
            planId: 'P-EXT',
            bucketId: 'B-1',
            title: 'Do it',
            orderHint: ' !',
            percentComplete: 0,
            priority: 5,
            appliedCategories: {},
            assignments: {},
          },
        ],
      }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.changedTaskExternalIds).toEqual(['T-1']);
    expect(result.removedTaskExternalIds).toEqual([]);
  });

  it('task etag advanced → changedTaskExternalIds', () => {
    const etags = emptyEtags();
    etags.tasks.set('T-1', 'W/"t0"');

    const result = walk({
      local: baseLocal,
      remote: makeRemote({
        tasks: [
          {
            id: 'T-1',
            '@odata.etag': 'W/"t1"',
            planId: 'P-EXT',
            bucketId: 'B-1',
            title: 'Do it',
            orderHint: ' !',
            percentComplete: 0,
            priority: 5,
            appliedCategories: {},
            assignments: {},
          },
        ],
      }),
      knownEtags: etags,
      snapshot: {},
    });

    expect(result.changedTaskExternalIds).toEqual(['T-1']);
  });

  it('task etag unchanged → NOT in changedTaskExternalIds', () => {
    const etags = emptyEtags();
    etags.tasks.set('T-1', 'W/"t1"');

    const result = walk({
      local: baseLocal,
      remote: makeRemote({
        tasks: [
          {
            id: 'T-1',
            '@odata.etag': 'W/"t1"',
            planId: 'P-EXT',
            bucketId: 'B-1',
            title: 'Do it',
            orderHint: ' !',
            percentComplete: 0,
            priority: 5,
            appliedCategories: {},
            assignments: {},
          },
        ],
      }),
      knownEtags: etags,
      snapshot: {},
    });

    expect(result.changedTaskExternalIds).toEqual([]);
    expect(result.removedTaskExternalIds).toEqual([]);
  });

  it('task removed remotely → removedTaskExternalIds', () => {
    const result = walk({
      local: {
        ...baseLocal,
        tasks: [
          {
            id: 'task-uuid',
            external_id: 'T-X',
            external_etag: 'W/"t1"',
            title: 'Old',
            bucket_id: 'bucket-uuid',
          },
        ],
      },
      remote: makeRemote({ tasks: [] }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.removedTaskExternalIds).toEqual(['T-X']);
    expect(result.changedTaskExternalIds).toEqual([]);
  });
});

describe('walk — categoryDescriptions', () => {
  it('remote has different category → categoryDescriptionsToApply reflects remote', () => {
    const result = walk({
      local: { ...baseLocal, planDetails: { categoryDescriptions: {} } },
      remote: makeRemote({
        planDetails: {
          id: 'PD-EXT',
          '@odata.etag': 'W/"pd1"',
          categoryDescriptions: { category1: 'Urgent' },
        },
      }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.categoryDescriptionsToApply).toBeDefined();
    expect(result.categoryDescriptionsToApply?.category1).toBe('Urgent');
  });

  it('remote and local category match → categoryDescriptionsToApply is undefined', () => {
    const result = walk({
      local: { ...baseLocal, planDetails: { categoryDescriptions: { category1: 'X' } } },
      remote: makeRemote({
        planDetails: {
          id: 'PD-EXT',
          '@odata.etag': 'W/"pd1"',
          categoryDescriptions: { category1: 'X' },
        },
      }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.categoryDescriptionsToApply).toBeUndefined();
  });
});

describe('walk — null external_id handling', () => {
  it('local buckets with null external_id are ignored — no removedBucketExternalIds', () => {
    const result = walk({
      local: {
        ...baseLocal,
        buckets: [{ id: 'bucket-uuid', external_id: null, name: 'Unsynced', order_hint: ' !' }],
      },
      remote: makeRemote({ buckets: [] }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.removedBucketExternalIds).toEqual([]);
    expect(result.changedBucketExternalIds).toEqual([]);
  });

  it('local tasks with null external_id are ignored — no removedTaskExternalIds', () => {
    const result = walk({
      local: {
        ...baseLocal,
        tasks: [
          {
            id: 'task-uuid',
            external_id: null,
            external_etag: null,
            title: 'Unsynced',
            bucket_id: 'bucket-uuid',
          },
        ],
      },
      remote: makeRemote({ tasks: [] }),
      knownEtags: emptyEtags(),
      snapshot: {},
    });

    expect(result.removedTaskExternalIds).toEqual([]);
    expect(result.changedTaskExternalIds).toEqual([]);
  });
});
