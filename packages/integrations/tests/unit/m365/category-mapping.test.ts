import type { PlannerSessionScope } from '@seta/planner';
import { describe, expect, it, vi } from 'vitest';
import type {
  PullCategoryMappingDeps,
  PullCategoryMappingInput,
} from '../../../src/backend/m365/plans/category-mapping.ts';
import { pullCategoryMapping } from '../../../src/backend/m365/plans/category-mapping.ts';

// Minimal stub — only fields the implementation passes through to deps.
const session: PlannerSessionScope = {
  user_id: 'U1',
  tenant_id: 'T1',
  session_id: 'S1',
  email: 'test@example.com',
  display_name: 'Test User',
  role_summary: { roles: [], cross_tenant_read: false },
  role_summary_hash: 'hash',
  accessible_group_ids: [],
  cross_tenant_read: false,
  built_at: new Date(),
  invalidated_at: null,
};

function makeDeps(
  overrides: Partial<{
    listLabels: PullCategoryMappingDeps['planner']['listLabels'];
    createLabel: PullCategoryMappingDeps['planner']['createLabel'];
    setCategoryDescriptions: PullCategoryMappingDeps['planner']['setCategoryDescriptions'];
  }> = {},
): PullCategoryMappingDeps {
  return {
    planner: {
      listLabels: overrides.listLabels ?? vi.fn().mockResolvedValue([]),
      createLabel: overrides.createLabel ?? vi.fn().mockResolvedValue({ id: 'LABEL-NEW' }),
      setCategoryDescriptions:
        overrides.setCategoryDescriptions ?? vi.fn().mockResolvedValue(undefined),
    },
  };
}

// Typed helper to extract the slots argument from a setCategoryDescriptions mock call.
function getSlotsArg(
  mockFn: ReturnType<typeof vi.fn>,
): Record<number, { name?: string | null; label_id?: string | null }> {
  const call = mockFn.mock.calls[0] as
    | [
        {
          plan_id: string;
          slots: Record<number, { name?: string | null; label_id?: string | null }>;
          session: PlannerSessionScope;
        },
      ]
    | undefined;
  if (!call) throw new Error('setCategoryDescriptions was not called');
  return call[0].slots;
}

describe('pullCategoryMapping', () => {
  it('no-op when remote and local match', async () => {
    const deps = makeDeps({
      listLabels: vi.fn().mockResolvedValue([
        { id: 'L1', name: 'Urgent', category_slot: 1 },
        { id: 'L3', name: 'Bug', category_slot: 3 },
      ]),
    });

    const input: PullCategoryMappingInput = {
      planId: 'PLAN-1',
      planDetails: {
        id: 'PLAN-1',
        '@odata.etag': 'etag1',
        categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
      },
      localCategoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
      session,
    };

    const result = await pullCategoryMapping(input, deps);

    expect(deps.planner.createLabel).not.toHaveBeenCalled();
    expect(deps.planner.setCategoryDescriptions).not.toHaveBeenCalled();
    expect(result.descriptionsApplied).toBe(0);
    expect(result.createdLabelIds).toEqual([]);
  });

  it('creates labels and applies descriptions on initial pull', async () => {
    let callCount = 0;
    const createLabel = vi.fn().mockImplementation(async () => {
      callCount++;
      return { id: `LABEL-CREATED-${callCount}` };
    });
    const setCategoryDescriptions = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({ createLabel, setCategoryDescriptions });

    const input: PullCategoryMappingInput = {
      planId: 'PLAN-1',
      planDetails: {
        id: 'PLAN-1',
        '@odata.etag': 'etag1',
        categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
      },
      localCategoryDescriptions: {},
      session,
    };

    const result = await pullCategoryMapping(input, deps);

    expect(createLabel).toHaveBeenCalledTimes(2);
    expect(createLabel).toHaveBeenCalledWith({
      plan_id: 'PLAN-1',
      name: 'Urgent',
      color: '#9ca3af',
      session,
    });
    expect(createLabel).toHaveBeenCalledWith({
      plan_id: 'PLAN-1',
      name: 'Bug',
      color: '#9ca3af',
      session,
    });

    expect(setCategoryDescriptions).toHaveBeenCalledOnce();
    const slots = getSlotsArg(setCategoryDescriptions);
    expect(slots[1]).toEqual({ name: 'Urgent', label_id: 'LABEL-CREATED-1' });
    expect(slots[3]).toEqual({ name: 'Bug', label_id: 'LABEL-CREATED-2' });

    expect(result.descriptionsApplied).toBe(2);
    expect(result.createdLabelIds).toHaveLength(2);
  });

  it('reuses existing label with same name', async () => {
    const createLabel = vi.fn();
    const setCategoryDescriptions = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({
      listLabels: vi
        .fn()
        .mockResolvedValue([{ id: 'L-EXISTING', name: 'Existing', category_slot: null }]),
      createLabel,
      setCategoryDescriptions,
    });

    const input: PullCategoryMappingInput = {
      planId: 'PLAN-1',
      planDetails: {
        id: 'PLAN-1',
        '@odata.etag': 'etag1',
        categoryDescriptions: { category1: 'Existing' },
      },
      localCategoryDescriptions: {},
      session,
    };

    const result = await pullCategoryMapping(input, deps);

    expect(createLabel).not.toHaveBeenCalled();
    expect(setCategoryDescriptions).toHaveBeenCalledOnce();
    const slots = getSlotsArg(setCategoryDescriptions);
    expect(slots[1]).toEqual({ name: 'Existing', label_id: 'L-EXISTING' });

    expect(result.createdLabelIds).toEqual([]);
    expect(result.descriptionsApplied).toBe(1);
  });

  it('clears slot when remote becomes null', async () => {
    const createLabel = vi.fn();
    const setCategoryDescriptions = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({ createLabel, setCategoryDescriptions });

    const input: PullCategoryMappingInput = {
      planId: 'PLAN-1',
      planDetails: {
        id: 'PLAN-1',
        '@odata.etag': 'etag1',
        categoryDescriptions: { category2: null },
      },
      localCategoryDescriptions: { category2: 'OldName' },
      session,
    };

    const result = await pullCategoryMapping(input, deps);

    expect(createLabel).not.toHaveBeenCalled();
    expect(setCategoryDescriptions).toHaveBeenCalledOnce();
    const slots = getSlotsArg(setCategoryDescriptions);
    expect(slots[2]).toEqual({ name: null, label_id: null });

    expect(result.descriptionsApplied).toBe(1);
  });

  it('handles mixed: set, clear, and no-op slots', async () => {
    let newLabelId = 0;
    const createLabel = vi.fn().mockImplementation(async () => {
      newLabelId++;
      return { id: `LABEL-D-${newLabelId}` };
    });
    const setCategoryDescriptions = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({
      listLabels: vi.fn().mockResolvedValue([
        { id: 'L-A', name: 'A', category_slot: 1 },
        { id: 'L-B', name: 'B', category_slot: 2 },
        { id: 'L-C', name: 'C', category_slot: 3 },
      ]),
      createLabel,
      setCategoryDescriptions,
    });

    const input: PullCategoryMappingInput = {
      planId: 'PLAN-1',
      planDetails: {
        id: 'PLAN-1',
        '@odata.etag': 'etag1',
        // slot 1: A→A (no-op), slot 2: B→null (clear), slot 3: C→D (rename needs new label)
        categoryDescriptions: { category1: 'A', category2: null, category3: 'D' },
      },
      localCategoryDescriptions: { category1: 'A', category2: 'B', category3: 'C' },
      session,
    };

    const result = await pullCategoryMapping(input, deps);

    // slot 1 unchanged — skipped
    expect(createLabel).toHaveBeenCalledTimes(1);
    expect(createLabel).toHaveBeenCalledWith({
      plan_id: 'PLAN-1',
      name: 'D',
      color: '#9ca3af',
      session,
    });

    expect(setCategoryDescriptions).toHaveBeenCalledOnce();
    const slots = getSlotsArg(setCategoryDescriptions);
    expect(slots[1]).toBeUndefined(); // slot 1 was skipped
    expect(slots[2]).toEqual({ name: null, label_id: null });
    expect(slots[3]).toEqual({ name: 'D', label_id: 'LABEL-D-1' });

    expect(result.descriptionsApplied).toBe(2);
    expect(result.createdLabelIds).toHaveLength(1);
  });

  it('reuses created label for duplicate slot names within one pull', async () => {
    let callCount = 0;
    const createLabel = vi.fn().mockImplementation(async () => {
      callCount++;
      return { id: `LABEL-SAME-${callCount}` };
    });
    const setCategoryDescriptions = vi.fn().mockResolvedValue(undefined);

    const deps = makeDeps({ createLabel, setCategoryDescriptions });

    const input: PullCategoryMappingInput = {
      planId: 'PLAN-1',
      planDetails: {
        id: 'PLAN-1',
        '@odata.etag': 'etag1',
        categoryDescriptions: { category1: 'Same', category5: 'Same' },
      },
      localCategoryDescriptions: {},
      session,
    };

    const result = await pullCategoryMapping(input, deps);

    // createLabel called only once despite two slots sharing the same name
    expect(createLabel).toHaveBeenCalledOnce();
    expect(createLabel).toHaveBeenCalledWith({
      plan_id: 'PLAN-1',
      name: 'Same',
      color: '#9ca3af',
      session,
    });

    expect(setCategoryDescriptions).toHaveBeenCalledOnce();
    const slots = getSlotsArg(setCategoryDescriptions);
    // Both slots must share the same label_id
    expect(slots[1]).toEqual({ name: 'Same', label_id: 'LABEL-SAME-1' });
    expect(slots[5]).toEqual({ name: 'Same', label_id: 'LABEL-SAME-1' });

    expect(result.descriptionsApplied).toBe(2);
    expect(result.createdLabelIds).toHaveLength(1);
  });
});
