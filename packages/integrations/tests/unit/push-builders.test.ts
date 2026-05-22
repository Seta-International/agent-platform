import { describe, expect, it } from 'vitest';
import {
  buildBucketPatch,
  buildBucketTaskBoardTaskFormatPatch,
  buildPlanDetailsPatch,
  buildPlanPatch,
  buildTaskDetailsPatch,
  buildTaskPatch,
} from '../../src/m365/plans/push-builders.ts';

describe('buildPlanPatch', () => {
  it('returns empty body when title not in changedFields', () => {
    const r = buildPlanPatch({
      local: { title: 'B' },
      snapshot: { title: 'A' },
      changedFields: [],
    });
    expect(r.body).toEqual({});
    expect(r.conflicts).toEqual([]);
  });

  it('includes title when locally changed and changedFields lists it', () => {
    const r = buildPlanPatch({
      local: { title: 'B' },
      snapshot: { title: 'A' },
      changedFields: ['title'],
    });
    expect(r.body).toEqual({ title: 'B' });
    expect(r.conflicts).toEqual([]);
  });

  it('flags a conflict on 412-retry when both sides changed title', () => {
    const r = buildPlanPatch({
      local: { title: 'Local' },
      snapshot: { title: 'Base' },
      remote: { title: 'Remote' },
      changedFields: ['title'],
    });
    expect(r.body).toEqual({});
    expect(r.conflicts).toEqual([
      { field: 'title', local: 'Local', remote: 'Remote', snapshot: 'Base' },
    ]);
  });
});

describe('buildPlanDetailsPatch', () => {
  it('includes only changed slots in categoryDescriptions', () => {
    const r = buildPlanDetailsPatch({
      local: { categoryDescriptions: { category1: 'Bug', category2: 'Doc' } },
      snapshot: { categoryDescriptions: { category1: 'Old', category2: 'Doc' } },
      changedFields: ['categoryDescriptions'],
    });
    expect(r.body).toEqual({ categoryDescriptions: { category1: 'Bug' } });
  });

  it('emits null for a removed slot', () => {
    const r = buildPlanDetailsPatch({
      local: { categoryDescriptions: { category1: 'Bug' } },
      snapshot: { categoryDescriptions: { category1: 'Bug', category2: 'Old' } },
      changedFields: ['categoryDescriptions'],
    });
    expect(r.body).toEqual({ categoryDescriptions: { category2: null } });
  });

  it('flags per-key conflict on 412-retry', () => {
    const r = buildPlanDetailsPatch({
      local: { categoryDescriptions: { category1: 'Local' } },
      snapshot: { categoryDescriptions: { category1: 'Base' } },
      remote: { categoryDescriptions: { category1: 'Remote' } },
      changedFields: ['categoryDescriptions'],
    });
    expect(r.body).toEqual({});
    expect(r.conflicts).toEqual([
      {
        field: 'categoryDescriptions.category1',
        local: 'Local',
        remote: 'Remote',
        snapshot: 'Base',
      },
    ]);
  });
});

describe('buildBucketPatch', () => {
  it('includes name and orderHint when both listed and changed', () => {
    const r = buildBucketPatch({
      local: { name: 'B', orderHint: '5' },
      snapshot: { name: 'A', orderHint: '4' },
      changedFields: ['name', 'orderHint'],
    });
    expect(r.body).toEqual({ name: 'B', orderHint: '5' });
  });

  it('omits a field that did not change locally even if listed', () => {
    const r = buildBucketPatch({
      local: { name: 'A', orderHint: '5' },
      snapshot: { name: 'A', orderHint: '4' },
      changedFields: ['name', 'orderHint'],
    });
    expect(r.body).toEqual({ orderHint: '5' });
  });
});

describe('buildTaskPatch', () => {
  const base = {
    title: 'T',
    dueDateTime: null as string | null,
    startDateTime: null as string | null,
    priority: 5,
    percentComplete: 0,
    bucketId: 'B-1',
    assigneePriority: undefined as string | undefined,
    appliedCategories: {},
    assignments: {},
    conversationThreadId: null as string | null,
  };

  it('emits only listed-and-changed fields', () => {
    const r = buildTaskPatch({
      local: { ...base, title: 'New', percentComplete: 50 },
      snapshot: { ...base, title: 'Old', percentComplete: 0 },
      changedFields: ['title', 'percentComplete', 'priority'],
    });
    expect(r.body).toEqual({ title: 'New', percentComplete: 50 });
  });

  it('omits fields not in changedFields even when value differs', () => {
    const r = buildTaskPatch({
      local: { ...base, title: 'New', percentComplete: 50 },
      snapshot: { ...base, title: 'Old', percentComplete: 0 },
      changedFields: ['title'],
    });
    expect(r.body).toEqual({ title: 'New' });
  });

  it('emits dict patches for appliedCategories with mixed add/remove', () => {
    const r = buildTaskPatch({
      local: { ...base, appliedCategories: { category1: true, category2: true } },
      snapshot: { ...base, appliedCategories: { category2: true, category3: true } },
      changedFields: ['appliedCategories'],
    });
    expect(r.body).toEqual({
      appliedCategories: { category1: true, category3: null },
    });
  });

  it('emits dict patches for assignments adding a new assignee', () => {
    const r = buildTaskPatch({
      local: {
        ...base,
        assignments: {
          'oid-1': { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' },
        },
      },
      snapshot: { ...base, assignments: {} },
      changedFields: ['assignments'],
    });
    expect(r.body).toEqual({
      assignments: {
        'oid-1': { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' },
      },
    });
  });

  it('emits null for removed assignee', () => {
    const r = buildTaskPatch({
      local: { ...base, assignments: {} },
      snapshot: {
        ...base,
        assignments: { 'oid-1': { '@odata.type': '#microsoft.graph.plannerAssignment' } },
      },
      changedFields: ['assignments'],
    });
    expect(r.body).toEqual({ assignments: { 'oid-1': null } });
  });

  it('flags a scalar conflict on 412-retry', () => {
    const r = buildTaskPatch({
      local: { ...base, title: 'Local' },
      snapshot: { ...base, title: 'Base' },
      remote: { ...base, title: 'Remote' },
      changedFields: ['title'],
    });
    expect(r.body).toEqual({});
    expect(r.conflicts).toEqual([
      { field: 'title', local: 'Local', remote: 'Remote', snapshot: 'Base' },
    ]);
  });
});

describe('buildTaskDetailsPatch', () => {
  it('emits description change with null support', () => {
    const r = buildTaskDetailsPatch({
      local: {
        description: null,
        previewType: undefined,
        checklist: {},
        references: {},
      },
      snapshot: {
        description: 'old',
        previewType: undefined,
        checklist: {},
        references: {},
      },
      changedFields: ['description'],
    });
    expect(r.body).toEqual({ description: null });
  });

  it('emits checklist dict patch with add + remove', () => {
    const r = buildTaskDetailsPatch({
      local: {
        description: 'd',
        previewType: undefined,
        checklist: {
          'cl-1': { title: 'kept', isChecked: false, orderHint: ' !' },
          'cl-2': { title: 'new', isChecked: false, orderHint: ' !' },
        },
        references: {},
      },
      snapshot: {
        description: 'd',
        previewType: undefined,
        checklist: {
          'cl-1': { title: 'kept', isChecked: false, orderHint: ' !' },
          'cl-3': { title: 'gone', isChecked: false, orderHint: ' !' },
        },
        references: {},
      },
      changedFields: ['checklist'],
    });
    expect(r.body).toEqual({
      checklist: {
        'cl-2': { title: 'new', isChecked: false, orderHint: ' !' },
        'cl-3': null,
      },
    });
  });
});

describe('buildBucketTaskBoardTaskFormatPatch', () => {
  it('emits orderHint when changed', () => {
    const r = buildBucketTaskBoardTaskFormatPatch({
      local: { orderHint: '8597 8598!' },
      snapshot: { orderHint: '7A$6' },
      changedFields: ['orderHint'],
    });
    expect(r.body).toEqual({ orderHint: '8597 8598!' });
  });

  it('flags conflict on 412-retry when remote also moved', () => {
    const r = buildBucketTaskBoardTaskFormatPatch({
      local: { orderHint: 'L' },
      snapshot: { orderHint: 'S' },
      remote: { orderHint: 'R' },
      changedFields: ['orderHint'],
    });
    expect(r.body).toEqual({});
    expect(r.conflicts).toEqual([{ field: 'orderHint', local: 'L', remote: 'R', snapshot: 'S' }]);
  });
});
