import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '../../src/groups/api/groups-client.ts';
import { GroupDetail } from '../../src/groups/components/GroupDetail.tsx';

const setGroupRolesMock = vi.fn(async () => {});

vi.mock('../../src/groups/api/groups-client.ts', () => ({
  setGroupRoles: (id: string, roles: unknown) => setGroupRolesMock(id, roles),
  updateGroup: async () => {},
  deleteGroup: async () => {},
}));

vi.mock('../../src/api/org-unit-search.ts', () => ({
  orgUnitSearch: {
    source: {
      search: async () => [{ id: 'ou-1', label: 'Engineering' }],
      bootstrap: async () => [{ id: 'ou-1', label: 'Engineering' }],
    },
    // Regression guard: the real org-units endpoint ignores the `ids` filter and
    // returns the tenant's full list — here the requested id ('ou-1') is NOT first.
    // A resolver that trusted items[0] would show "Zzz" instead of "Engineering".
    seed: async () => [
      { id: 'ou-9', label: 'Zzz' },
      { id: 'ou-1', label: 'Engineering' },
    ],
  },
}));

const scopedGroup: Group = {
  group_id: 'g1',
  slug: 'ops',
  name: 'Ops',
  kind: 'custom',
  is_base: false,
  member_count: 2,
  roles: [{ role_slug: 'people.manager', scope_kind: 'org_unit', scope_id: 'ou-1' }],
};

function renderDetail(group: Group) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GroupDetail group={group} onDeleted={() => {}} />
    </QueryClientProvider>,
  );
}

describe('GroupDetail scope picker', () => {
  beforeEach(() => {
    setGroupRolesMock.mockClear();
  });

  it('shows the org-unit scope and unit label for a scoped role', async () => {
    renderDetail(scopedGroup);
    // Scoped to the scope Selector's own combobox: a page-wide text query would
    // also match the Selector's selected-item overlay (a second "Org unit" node
    // Astryx renders over the trigger — see Selector's `placement` doc).
    const scopeCombobox = await screen.findByRole('combobox', { name: 'people.manager scope' });
    expect(scopeCombobox).toHaveTextContent('Org unit');
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
  });

  it('posts a scoped role entry when checking a role (defaults to tenant-wide)', async () => {
    const user = userEvent.setup();
    renderDetail(scopedGroup);
    await screen.findByRole('combobox', { name: 'people.manager scope' });

    const checkbox = await screen.findByRole('checkbox', { name: /people · viewer/i });
    await user.click(checkbox);

    await waitFor(() => expect(setGroupRolesMock).toHaveBeenCalled());
    const [, roles] = setGroupRolesMock.mock.calls.at(-1) as [string, Group['roles']];
    expect(roles).toEqual(
      expect.arrayContaining([
        { role_slug: 'people.manager', scope_kind: 'org_unit', scope_id: 'ou-1' },
        { role_slug: 'people.viewer', scope_kind: 'tenant', scope_id: null },
      ]),
    );
  });
});
