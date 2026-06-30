import { PRODUCTS } from '@seta/shared-rbac';
import {
  Badge,
  Combobox,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ShieldCheck, UsersRound } from 'lucide-react';
import { PersonAvatar } from '../../components/person-avatar.tsx';
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

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline pb-2">
      <span className="text-ink-subtle">{icon}</span>
      <h3 className="text-body-sm font-semibold text-ink">{children}</h3>
    </div>
  );
}

function GroupsSection({ userId }: { userId: string }) {
  const { data: userGroups = [] } = useUserGroups(userId);
  const { data: allGroups = [] } = useGroupsQuery();
  const { add, remove } = useGroupMembersMutations();

  const value = userGroups.map((g) => g.group_id);
  const options = allGroups.map((g) => ({ value: g.group_id, label: g.name, keywords: [g.slug] }));

  const handleChange = (next: string[]) => {
    const before = new Set(value);
    const after = new Set(next);
    for (const id of next) if (!before.has(id)) add.mutate({ id, user_ids: [userId] });
    for (const id of value) if (!after.has(id)) remove.mutate({ id, userId });
  };

  return (
    <Field label="Groups">
      <Combobox
        multiple
        value={value}
        onChange={handleChange}
        options={options}
        placeholder="Add to group…"
        searchPlaceholder="Search groups…"
        aria-label="Groups"
      />
    </Field>
  );
}

/** Roles the user inherits, derived live from current group memberships so it tracks add/remove. */
function RolesSection({ userId }: { userId: string }) {
  const { data: userGroups = [] } = useUserGroups(userId);
  const { data: allGroups = [] } = useGroupsQuery();

  const joined = new Set(userGroups.map((g) => g.group_id));
  const roles = [
    ...new Set(allGroups.filter((g) => joined.has(g.group_id)).flatMap((g) => g.role_slugs)),
  ].sort();

  return (
    <Field label="Roles · inherited from groups">
      {roles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-caption text-ink-subtle"
            >
              <ShieldCheck className="size-3" aria-hidden />
              {r}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-ink-tertiary">No roles</span>
      )}
    </Field>
  );
}

const productKeys = {
  user: (userId: string) => ['identity', 'products', 'user', userId] as const,
};

const VIA_LABEL: Record<string, string> = {
  role: 'via role',
  group: 'via group',
  tenant: 'via tenant',
};

/** Effective entitlement for a product: whether it's granted, how, and if an admin override is set. */
function productState(
  rows: UserProductAccess[],
  productId: string,
): { granted: boolean; source: string; isOverride: boolean } {
  const userOverride = rows.find((r) => r.product_id === productId && r.source === 'user');
  if (userOverride) {
    const granted = userOverride.effect === 'grant';
    return {
      granted,
      source: granted ? 'Granted · override' : 'Revoked · override',
      isOverride: true,
    };
  }
  const last = [...rows].reverse().find((r) => r.product_id === productId);
  if (last?.effect !== 'grant') return { granted: false, source: 'Not granted', isOverride: false };
  return { granted: true, source: VIA_LABEL[last.source] ?? last.source, isOverride: false };
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

  const busy = setOverride.isPending || clearOverride.isPending;

  return (
    <div className="flex flex-col gap-1.5">
      {PRODUCTS.map((p) => {
        const userOverride = rows.find((r) => r.product_id === p.id && r.source === 'user');
        const overrideValue = userOverride
          ? userOverride.effect
          : ('inherit' as 'grant' | 'revoke' | 'inherit');
        const { granted, source, isOverride } = productState(rows, p.id);
        return (
          <div
            key={p.id}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
              isOverride ? 'border-primary/40 bg-primary/[0.04]' : 'border-hairline bg-surface-1',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'size-1.5 flex-none rounded-full',
                  granted ? 'bg-success' : 'bg-ink-tertiary/50',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-ink">{p.label}</span>
                <span className="block truncate text-caption text-ink-subtle">{source}</span>
              </div>
            </div>
            <Select
              value={overrideValue}
              onValueChange={(v) => {
                if (busy) return;
                if (v === 'inherit') clearOverride.mutate({ productId: p.id });
                else setOverride.mutate({ productId: p.id, effect: v as 'grant' | 'revoke' });
              }}
            >
              <SelectTrigger
                aria-label={`${p.label} access`}
                className="h-8 w-28 flex-none text-body-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">Auto</SelectItem>
                <SelectItem value="grant">Grant</SelectItem>
                <SelectItem value="revoke">Revoke</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

export function UserDetailSheet({ row, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[27rem] overflow-y-auto sm:max-w-[27rem]">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3">
            <PersonAvatar
              name={row?.full_name ?? '?'}
              className="size-10 text-body-sm font-semibold"
            />
            <div className="min-w-0">
              <SheetTitle className="truncate">{row?.full_name ?? '—'}</SheetTitle>
              {row?.work_email && (
                <p className="truncate text-caption text-ink-subtle">{row.work_email}</p>
              )}
            </div>
          </div>
        </SheetHeader>

        {row && (
          <div className="flex flex-col gap-5">
            <Field label="Job title">
              {row.job_title ?? <span className="text-ink-tertiary">—</span>}
            </Field>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            {row.user_id && (
              <div className="mt-1 flex flex-col gap-4">
                <SectionTitle icon={<UsersRound className="size-4" />}>Access</SectionTitle>

                <GroupsSection userId={row.user_id} />

                <RolesSection userId={row.user_id} />

                <div className="flex flex-col gap-3">
                  <SectionTitle icon={<Boxes className="size-4" />}>Product overrides</SectionTitle>
                  <ProductsSection userId={row.user_id} />
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
