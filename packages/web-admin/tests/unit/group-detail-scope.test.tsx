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
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/identity/v1/org-units')) {
        return new Response(
          JSON.stringify({
            org_units: [{ org_unit_id: 'ou-1', name: 'Engineering', parent_id: null }],
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
  });

  it('shows the org-unit scope and unit label for a scoped role', async () => {
    renderDetail(scopedGroup);
    expect(await screen.findByText('Org unit')).toBeInTheDocument();
    expect(await screen.findByText('Engineering')).toBeInTheDocument();
  });

  it('posts a scoped role entry when checking a role (defaults to tenant-wide)', async () => {
    const user = userEvent.setup();
    renderDetail(scopedGroup);
    await screen.findByText('Org unit');

    const checkbox = screen.getByRole('checkbox', { name: /people · viewer/i });
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
