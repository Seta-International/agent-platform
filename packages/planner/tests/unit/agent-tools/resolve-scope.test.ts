import { describe, expect, it, vi } from 'vitest';
import {
  resolveGroupScope,
  resolvePlanScope,
} from '../../../src/backend/agent-tools/resolve-scope.ts';

vi.mock('../../../src/backend/read-helpers.ts', () => ({
  listMemberGroups: vi.fn(),
  groupFilterFor: vi.fn(),
}));

vi.mock('../../../src/backend/domain/list-plans.ts', () => ({
  listPlans: vi.fn(),
}));

import { listPlans } from '../../../src/backend/domain/list-plans.ts';
import { groupFilterFor, listMemberGroups } from '../../../src/backend/read-helpers.ts';

const mockListMemberGroups = vi.mocked(listMemberGroups);
const mockGroupFilterFor = vi.mocked(groupFilterFor);
const mockListPlans = vi.mocked(listPlans);

const fakeSession = { user_id: 'u1', tenant_id: 't1' } as never;

describe('resolveGroupScope', () => {
  it('returns ok when groupId provided and user has access', async () => {
    mockGroupFilterFor.mockResolvedValue(['grp-1', 'grp-2']);
    mockListMemberGroups.mockResolvedValue([
      { id: 'grp-1', name: 'Engineering' },
      { id: 'grp-2', name: 'Platform' },
    ]);

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-1' });
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering' });
  });

  it('returns ok for admin even without group membership', async () => {
    mockGroupFilterFor.mockResolvedValue(null);
    mockListMemberGroups.mockResolvedValue([]);

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-any' });
    expect(res).toEqual({ ok: true, id: 'grp-any', name: 'grp-any' });
  });

  it('returns notFound when groupId provided but user lacks access', async () => {
    mockGroupFilterFor.mockResolvedValue(['grp-2']);
    mockListMemberGroups.mockResolvedValue([{ id: 'grp-2', name: 'Platform' }]);

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-1' });
    expect(res).toEqual({ notFound: true });
  });

  it('matches by name — single match returns ok', async () => {
    mockListMemberGroups.mockResolvedValue([
      { id: 'grp-1', name: 'Engineering Team' },
      { id: 'grp-2', name: 'Platform Team' },
    ]);

    const res = await resolveGroupScope(fakeSession, { groupName: 'engineering' });
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering Team' });
  });

  it('matches by name — multiple matches returns ambiguous', async () => {
    mockListMemberGroups.mockResolvedValue([
      { id: 'grp-1', name: 'Engineering Backend' },
      { id: 'grp-2', name: 'Engineering Frontend' },
    ]);

    const res = await resolveGroupScope(fakeSession, { groupName: 'engineering' });
    expect(res).toEqual({
      ambiguous: true,
      options: [
        { id: 'grp-1', name: 'Engineering Backend' },
        { id: 'grp-2', name: 'Engineering Frontend' },
      ],
    });
  });

  it('matches by name — no match returns notFound', async () => {
    mockListMemberGroups.mockResolvedValue([{ id: 'grp-1', name: 'Engineering' }]);

    const res = await resolveGroupScope(fakeSession, { groupName: 'marketing' });
    expect(res).toEqual({ notFound: true });
  });

  it('auto-resolves — single group returns ok', async () => {
    mockListMemberGroups.mockResolvedValue([{ id: 'grp-1', name: 'Engineering' }]);

    const res = await resolveGroupScope(fakeSession, {});
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering' });
  });

  it('auto-resolves — multiple groups returns ambiguous', async () => {
    mockListMemberGroups.mockResolvedValue([
      { id: 'grp-1', name: 'Engineering' },
      { id: 'grp-2', name: 'Platform' },
    ]);

    const res = await resolveGroupScope(fakeSession, {});
    expect(res).toEqual({
      ambiguous: true,
      options: [
        { id: 'grp-1', name: 'Engineering' },
        { id: 'grp-2', name: 'Platform' },
      ],
    });
  });

  it('auto-resolves — zero groups returns notFound', async () => {
    mockListMemberGroups.mockResolvedValue([]);

    const res = await resolveGroupScope(fakeSession, {});
    expect(res).toEqual({ notFound: true });
  });
});

describe('resolvePlanScope', () => {
  it('returns ok when planId provided and found', async () => {
    mockListPlans.mockResolvedValue([{ id: 'plan-1', name: 'Sprint 12' } as never]);

    const res = await resolvePlanScope(fakeSession, { planId: 'plan-1' });
    expect(res).toEqual({ ok: true, id: 'plan-1', name: 'Sprint 12' });
  });

  it('returns notFound when planId not in accessible plans', async () => {
    mockListPlans.mockResolvedValue([{ id: 'plan-2', name: 'Backlog' } as never]);

    const res = await resolvePlanScope(fakeSession, { planId: 'plan-1' });
    expect(res).toEqual({ notFound: true });
  });

  it('matches by name — single match returns ok', async () => {
    mockListPlans.mockResolvedValue([
      { id: 'plan-1', name: 'Sprint 12' } as never,
      { id: 'plan-2', name: 'Backlog' } as never,
    ]);

    const res = await resolvePlanScope(fakeSession, { planName: 'sprint' });
    expect(res).toEqual({ ok: true, id: 'plan-1', name: 'Sprint 12' });
  });

  it('matches by name — multiple matches returns ambiguous', async () => {
    mockListPlans.mockResolvedValue([
      { id: 'plan-1', name: 'Sprint 12' } as never,
      { id: 'plan-2', name: 'Sprint 13' } as never,
    ]);

    const res = await resolvePlanScope(fakeSession, { planName: 'sprint' });
    expect(res).toEqual({
      ambiguous: true,
      options: [
        { id: 'plan-1', name: 'Sprint 12' },
        { id: 'plan-2', name: 'Sprint 13' },
      ],
    });
  });

  it('auto-resolves — single plan returns ok', async () => {
    mockListPlans.mockResolvedValue([{ id: 'plan-1', name: 'Sprint 12' } as never]);

    const res = await resolvePlanScope(fakeSession, {});
    expect(res).toEqual({ ok: true, id: 'plan-1', name: 'Sprint 12' });
  });

  it('auto-resolves — zero plans returns notFound', async () => {
    mockListPlans.mockResolvedValue([]);

    const res = await resolvePlanScope(fakeSession, {});
    expect(res).toEqual({ notFound: true });
  });
});
