import { Badge, Button, Card, formatRelative } from '@seta/shared-ui';
import { X } from 'lucide-react';
import type { AdminUserDetail, AdminUserGrant } from '../../api/client.ts';
import { revokeGrant } from '../../api/client.ts';
import { GrantRoleCombobox } from '../GrantRoleCombobox.tsx';

function RoleRow({ g, onChange }: { g: AdminUserGrant; onChange: () => void }) {
  const isIdp = g.granted_via === 'idp';
  return (
    <div className="flex items-center justify-between rounded-md border border-hairline bg-canvas px-3 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        <code className="font-mono text-[12.5px] font-medium">{g.role_slug}</code>
        <Badge variant={isIdp ? 'default' : 'secondary'} className="h-4 px-1.5 text-[10px]">
          {isIdp ? 'IdP' : 'Manual'}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-muted">
          {g.granted_by_name ? `by ${g.granted_by_name} · ` : ''}
          {formatRelative(g.granted_at)}
        </span>
        {!isIdp && (
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            aria-label="Revoke"
            onClick={async () => {
              await revokeGrant(g.id);
              onChange();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function RolesTab({
  detail,
  userId,
  onChange,
}: {
  detail: AdminUserDetail;
  userId: string;
  onChange: () => void;
}) {
  const tenant = detail.grants.filter((g) => g.scope_type === 'tenant');
  const groupBuckets = new Map<string, AdminUserGrant[]>();
  for (const g of detail.grants) {
    if (g.scope_type !== 'group') continue;
    const key = g.scope_label ?? g.scope_id ?? 'unknown';
    if (!groupBuckets.has(key)) groupBuckets.set(key, []);
    groupBuckets.get(key)?.push(g);
  }

  return (
    <Card className="p-5 space-y-5">
      <section>
        <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">
          Tenant-scoped
        </div>
        <div className="flex flex-col gap-2">
          {tenant.length === 0 && (
            <span className="text-sm text-ink-muted">No tenant-scoped roles</span>
          )}
          {tenant.map((g) => (
            <RoleRow key={g.id} g={g} onChange={onChange} />
          ))}
        </div>
      </section>
      {groupBuckets.size > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">
            Group-scoped
          </div>
          {[...groupBuckets].map(([groupLabel, rows]) => (
            <div key={groupLabel} className="mb-3">
              <div className="text-xs font-medium mb-1">{groupLabel}</div>
              <div className="ml-4 flex flex-col gap-2">
                {rows.map((g) => (
                  <RoleRow key={g.id} g={g} onChange={onChange} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <div>
        <GrantRoleCombobox
          userId={userId}
          existing={detail.grants.map((g) => g.role_slug)}
          onChange={onChange}
        />
      </div>
    </Card>
  );
}
