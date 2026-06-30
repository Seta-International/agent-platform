import { PRODUCTS } from '@seta/shared-rbac';
import { Badge, Sheet, SheetContent, SheetHeader, SheetTitle } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  clearUserProductOverride,
  listUserProducts,
  setUserProductOverride,
  type UserProductAccess,
} from '../../groups/api/product-access-client.ts';
import {
  useGroupMembersMutations,
  useGroupsQuery,
  useUserGroups,
} from '../../groups/hooks/useGroups.ts';
import type { DirectoryRow } from '../api/directory-client.ts';

const ACCOUNT_STATUS_BADGE: Record<
  DirectoryRow['account_status'],
  'outline' | 'success' | 'destructive'
> = {
  none: 'outline',
  active: 'success',
  suspended: 'destructive',
};

const ACCOUNT_STATUS_LABEL: Record<DirectoryRow['account_status'], string> = {
  none: 'No account',
  active: 'Active',
  suspended: 'Suspended',
};

const EMPLOYMENT_BADGE: Record<DirectoryRow['employment_status'], 'success' | 'secondary'> = {
  active: 'success',
  terminated: 'secondary',
};

const EMPLOYMENT_LABEL: Record<DirectoryRow['employment_status'], string> = {
  active: 'Employed',
  terminated: 'Terminated',
};

interface Props {
  row: DirectoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">{label}</span>
      <div className="text-body-sm text-ink">{children}</div>
    </div>
  );
}

function GroupsSection({ userId }: { userId: string }) {
  const { data: userGroups = [] } = useUserGroups(userId);
  const { data: allGroups = [] } = useGroupsQuery();
  const { add, remove } = useGroupMembersMutations();
  const [selectedGroupId, setSelectedGroupId] = useState('');

  const joinedIds = new Set(userGroups.map((g) => g.group_id));
  const available = allGroups.filter((g) => !joinedIds.has(g.group_id));

  function handleAdd() {
    if (!selectedGroupId) return;
    add.mutate({ id: selectedGroupId, user_ids: [userId] });
    setSelectedGroupId('');
  }

  return (
    <Field label="Groups">
      <div className="flex flex-col gap-2">
        {userGroups.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {userGroups.map((g) => (
              <span key={g.group_id} className="inline-flex items-center gap-1">
                <Badge variant="secondary">{g.name}</Badge>
                <button
                  type="button"
                  aria-label={`Remove from ${g.name}`}
                  className="text-ink-subtle hover:text-ink leading-none"
                  onClick={() => remove.mutate({ id: g.group_id, userId })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-ink-tertiary">No groups</span>
        )}

        {available.length > 0 && (
          <div className="flex gap-1.5">
            <select
              className="text-body-sm border border-border rounded px-1.5 py-0.5 bg-surface flex-1"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">Add to group…</option>
              {available.map((g) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedGroupId || add.isPending}
              className="text-body-sm px-2 py-0.5 rounded bg-brand text-white disabled:opacity-50"
              onClick={handleAdd}
            >
              Add
            </button>
          </div>
        )}
      </div>
    </Field>
  );
}

const productKeys = {
  user: (userId: string) => ['identity', 'products', 'user', userId] as const,
};

function effectLabel(rows: UserProductAccess[], productId: string): string {
  const userOverride = rows.find((r) => r.product_id === productId && r.source === 'user');
  if (userOverride)
    return userOverride.effect === 'grant' ? 'granted (override)' : 'revoked (override)';
  const last = [...rows].reverse().find((r) => r.product_id === productId);
  if (!last) return 'not granted';
  if (last.source === 'role') return `via role`;
  if (last.source === 'group') return `via group`;
  if (last.source === 'tenant') return `via tenant`;
  return last.effect;
}

function sourceVariant(
  rows: UserProductAccess[],
  productId: string,
): 'secondary' | 'success' | 'destructive' | 'outline' {
  const userOverride = rows.find((r) => r.product_id === productId && r.source === 'user');
  if (userOverride) return userOverride.effect === 'grant' ? 'success' : 'destructive';
  const last = [...rows].reverse().find((r) => r.product_id === productId);
  if (!last) return 'outline';
  return 'secondary';
}

function ProductsSection({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: productKeys.user(userId),
    queryFn: () => listUserProducts(userId),
  });

  const setOverride = useMutation({
    mutationFn: ({ productId, effect }: { productId: string; effect: 'grant' | 'revoke' }) =>
      setUserProductOverride(userId, productId, effect),
    onSettled: () => qc.invalidateQueries({ queryKey: productKeys.user(userId) }),
  });

  const clearOverride = useMutation({
    mutationFn: ({ productId }: { productId: string }) =>
      clearUserProductOverride(userId, productId),
    onSettled: () => qc.invalidateQueries({ queryKey: productKeys.user(userId) }),
  });

  return (
    <Field label="Products">
      <div className="flex flex-col gap-2">
        {PRODUCTS.map((p) => {
          const userOverride = rows.find((r) => r.product_id === p.id && r.source === 'user');
          const hasOverride = !!userOverride;
          return (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-body-sm text-ink truncate">{p.label}</span>
                <Badge variant={sourceVariant(rows, p.id)}>{effectLabel(rows, p.id)}</Badge>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  disabled={setOverride.isPending || clearOverride.isPending}
                  className="text-caption px-1.5 py-0.5 rounded border border-border bg-surface hover:bg-surface-2 text-ink-subtle disabled:opacity-50"
                  onClick={() => setOverride.mutate({ productId: p.id, effect: 'grant' })}
                >
                  Grant
                </button>
                <button
                  type="button"
                  disabled={setOverride.isPending || clearOverride.isPending}
                  className="text-caption px-1.5 py-0.5 rounded border border-border bg-surface hover:bg-surface-2 text-ink-subtle disabled:opacity-50"
                  onClick={() => setOverride.mutate({ productId: p.id, effect: 'revoke' })}
                >
                  Revoke
                </button>
                {hasOverride && (
                  <button
                    type="button"
                    disabled={setOverride.isPending || clearOverride.isPending}
                    className="text-caption px-1.5 py-0.5 rounded border border-border bg-surface hover:bg-surface-2 text-ink-subtle disabled:opacity-50"
                    onClick={() => clearOverride.mutate({ productId: p.id })}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Field>
  );
}

export function UserDetailSheet({ row, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-96 sm:max-w-96 overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>{row?.full_name ?? '—'}</SheetTitle>
        </SheetHeader>

        {row && (
          <div className="flex flex-col gap-5">
            <Field label="Email">
              {row.work_email ?? <span className="text-ink-tertiary">—</span>}
            </Field>

            <Field label="Job title">
              {row.job_title ?? <span className="text-ink-tertiary">—</span>}
            </Field>

            <Field label="Employment">
              <Badge variant={EMPLOYMENT_BADGE[row.employment_status]}>
                {EMPLOYMENT_LABEL[row.employment_status]}
              </Badge>
            </Field>

            <Field label="Account">
              <Badge variant={ACCOUNT_STATUS_BADGE[row.account_status]}>
                {ACCOUNT_STATUS_LABEL[row.account_status]}
              </Badge>
            </Field>

            <Field label="Roles">
              {row.roles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {row.roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-ink-tertiary">No roles assigned</span>
              )}
            </Field>

            {row.user_id && <GroupsSection userId={row.user_id} />}
            {row.user_id && <ProductsSection userId={row.user_id} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
