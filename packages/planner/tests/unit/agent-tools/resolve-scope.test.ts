import { describe, expect, it, vi } from 'vitest';
import {
  resolveGroupScope,
  resolvePlanScope,
} from '../../../src/backend/agent-tools/resolve-scope.ts';

vi.mock('../../../src/backend/read-helpers.ts', () => ({
  listMemberGroupsWithState: vi.fn(),
  getGroupState: vi.fn(),
  groupFilterFor: vi.fn(),
}));

vi.mock('../../../src/backend/domain/list-plans.ts', () => ({
  listPlans: vi.fn(),
}));

import { listPlans } from '../../../src/backend/domain/list-plans.ts';
import {
  getGroupState,
  groupFilterFor,
  listMemberGroupsWithState,
} from '../../../src/backend/read-helpers.ts';

const mockListMemberGroups = vi.mocked(listMemberGroupsWithState);
const mockGetGroupState = vi.mocked(getGroupState);
const mockGroupFilterFor = vi.mocked(groupFilterFor);
const mockListPlans = vi.mocked(listPlans);

function live(id: string, name: string) {
  return { id, name, archived: false };
}

const fakeSession = { user_id: 'u1', tenant_id: 't1' } as never;

describe('resolveGroupScope', () => {
  it('returns ok when groupId provided and user has access', async () => {
    mockGroupFilterFor.mockResolvedValue(['grp-1', 'grp-2']);
    mockListMemberGroups.mockResolvedValue([
      live('grp-1', 'Engineering'),
      live('grp-2', 'Platform'),
    ]);

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-1' });
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering' });
  });

  it('names the group for an admin who is not a member of it', async () => {
    mockGroupFilterFor.mockResolvedValue(null);
    mockGetGroupState.mockResolvedValue(live('grp-any', 'Operations'));

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-any' });
    expect(res).toEqual({ ok: true, id: 'grp-any', name: 'Operations' });
  });

  it('returns notFound for an admin when the group id does not exist', async () => {
    mockGroupFilterFor.mockResolvedValue(null);
    mockGetGroupState.mockResolvedValue(null);

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-ghost' });
    expect(res).toEqual({ notFound: true });
  });

  it('returns archived when the group id resolves to an archived group', async () => {
    mockGroupFilterFor.mockResolvedValue(null);
    mockGetGroupState.mockResolvedValue({ id: 'grp-old', name: 'Helios', archived: true });

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-old' });
    expect(res).toEqual({ archived: true, id: 'grp-old', name: 'Helios' });
  });

  it('returns notFound when groupId provided but user lacks access', async () => {
    mockGroupFilterFor.mockResolvedValue(['grp-2']);
    mockListMemberGroups.mockResolvedValue([live('grp-2', 'Platform')]);

    const res = await resolveGroupScope(fakeSession, { groupId: 'grp-1' });
    expect(res).toEqual({ notFound: true });
  });

  it('matches by name — single match returns ok', async () => {
    mockListMemberGroups.mockResolvedValue([
      live('grp-1', 'Engineering Team'),
      live('grp-2', 'Platform Team'),
    ]);

    const res = await resolveGroupScope(fakeSession, { groupName: 'engineering' });
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering Team' });
  });

  it('matches by name — an active match wins over an archived namesake', async () => {
    mockListMemberGroups.mockResolvedValue([
      { id: 'grp-old', name: 'Engineering Team', archived: true },
      live('grp-1', 'Engineering Team'),
    ]);

    const res = await resolveGroupScope(fakeSession, { groupName: 'engineering' });
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering Team' });
  });

  it('matches by name — multiple matches returns ambiguous', async () => {
    mockListMemberGroups.mockResolvedValue([
      live('grp-1', 'Engineering Backend'),
      live('grp-2', 'Engineering Frontend'),
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
    mockListMemberGroups.mockResolvedValue([live('grp-1', 'Engineering')]);

    const res = await resolveGroupScope(fakeSession, { groupName: 'marketing' });
    expect(res).toEqual({ notFound: true });
  });

  it('auto-resolves — single group returns ok', async () => {
    mockListMemberGroups.mockResolvedValue([live('grp-1', 'Engineering')]);

    const res = await resolveGroupScope(fakeSession, {});
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering' });
  });

  it('auto-resolves — archived groups do not count towards the caller"s groups', async () => {
    mockListMemberGroups.mockResolvedValue([
      live('grp-1', 'Engineering'),
      { id: 'grp-old', name: 'Helios', archived: true },
    ]);

    const res = await resolveGroupScope(fakeSession, {});
    expect(res).toEqual({ ok: true, id: 'grp-1', name: 'Engineering' });
  });

  it('auto-resolves — multiple groups returns ambiguous', async () => {
    mockListMemberGroups.mockResolvedValue([
      live('grp-1', 'Engineering'),
      live('grp-2', 'Platform'),
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
