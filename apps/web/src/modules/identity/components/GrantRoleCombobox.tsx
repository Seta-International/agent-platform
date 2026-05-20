import type { GroupRow } from '@seta/planner';
import { Button } from '@seta/shared-ui';
import { useEffect, useState } from 'react';
import { plannerClient } from '../../planner/api/planner-client.ts';
import { grantRoleScoped } from '../api/client.ts';
import { TENANT_ROLE_SLUGS } from '../constants.ts';

export function GrantRoleCombobox({
  userId,
  existing,
  onChange,
}: {
  userId: string;
  existing: string[];
  onChange: () => void;
}) {
  const [role, setRole] = useState('');
  const [groupId, setGroupId] = useState('');
  const [tenantWide, setTenantWide] = useState(false);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const isPlanner = role.startsWith('planner.');
  const available = TENANT_ROLE_SLUGS.filter((r) => !existing.includes(r));

  // Lazy-load groups the first time a planner role is picked.
  useEffect(() => {
    if (!isPlanner || groups !== null) return;
    let cancel = false;
    plannerClient
      .listGroups()
      .then((g) => {
        if (!cancel) setGroups(g);
      })
      .catch((e) => {
        if (!cancel) setGroupsError(e instanceof Error ? e.message : 'unknown');
      });
    return () => {
      cancel = true;
    };
  }, [isPlanner, groups]);

  const canGrant = role && (!isPlanner || tenantWide || (groups && groups.length > 0 && groupId));

  async function grant() {
    if (!canGrant) return;
    if (isPlanner && !tenantWide) {
      await grantRoleScoped(userId, role, 'group', groupId);
    } else {
      await grantRoleScoped(userId, role, 'tenant', null);
    }
    setRole('');
    setGroupId('');
    setTenantWide(false);
    onChange();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Add role"
        >
          <option value="">Add role…</option>
          {available.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button onClick={grant} disabled={!canGrant}>
          Grant
        </Button>
      </div>

      {isPlanner && (
        <div className="flex flex-col gap-2 rounded-md border border-input p-3 text-sm">
          {tenantWide ? (
            <p className="text-muted-foreground">Granting tenant-wide.</p>
          ) : groupsError ? (
            <p className="text-destructive">Failed to load groups: {groupsError}</p>
          ) : groups === null ? (
            <p className="text-muted-foreground">Loading groups…</p>
          ) : groups.length === 0 ? (
            <p className="text-muted-foreground">
              No groups exist yet — create one via the <code>seta planner group-create</code> CLI or
              contact your admin.
            </p>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">Group</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="">Pick a group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={tenantWide}
              onChange={(e) => setTenantWide(e.target.checked)}
            />
            <span className="text-muted-foreground">Tenant-wide grant (rare — bootstrap only)</span>
          </label>
        </div>
      )}
    </div>
  );
}
