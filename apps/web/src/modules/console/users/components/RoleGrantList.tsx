import { Button } from '@seta/shared-ui';
import type { AdminUserGrant } from '../api/users-client.ts';
import { revokeGrant } from '../api/users-client.ts';

export function RoleGrantList({
  grants,
  onChange,
}: {
  grants: AdminUserGrant[];
  onChange: () => void;
}) {
  return (
    <div className="space-y-2">
      {grants.length === 0 && <p className="text-sm text-muted-foreground">No roles granted.</p>}
      {grants.map((g) => (
        <div key={g.id} className="flex items-center justify-between rounded border p-2">
          <div className="space-y-1">
            <div className="font-mono text-sm">{g.role_slug}</div>
            <div className="text-xs text-muted-foreground">
              {g.scope_type === 'group' ? `group: ${g.scope_id}` : 'tenant-scoped'} · granted via{' '}
              {g.granted_via}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await revokeGrant(g.id);
              onChange();
            }}
          >
            Revoke
          </Button>
        </div>
      ))}
    </div>
  );
}
