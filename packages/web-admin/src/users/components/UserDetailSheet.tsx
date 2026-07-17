import { PRODUCTS } from '@seta/shared-rbac';
import {
  Badge,
  cn,
  createStaticSource,
  Dialog,
  DialogHeader,
  Layout,
  LayoutContent,
  type SearchableItem,
  Selector,
  Tokenizer,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, ShieldCheck, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
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
import { Field, SectionTitle } from './sheet-primitives.tsx';
import { WorkSection } from './WorkSection.tsx';

const ACCOUNT_STATUS_BADGE: Record<
  DirectoryRow['account_status'],
  'neutral' | 'success' | 'error'
> = {
  none: 'neutral',
  active: 'success',
  suspended: 'error',
};

const ACCOUNT_STATUS_LABEL: Record<DirectoryRow['account_status'], string> = {
  none: 'No account',
  active: 'Active',
  suspended: 'Suspended',
};

const EMPLOYMENT_BADGE: Record<DirectoryRow['employment_status'], 'success' | 'neutral'> = {
  active: 'success',
  terminated: 'neutral',
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

type GroupItem = SearchableItem<{ keywords: string[] }>;

function GroupsSection({ userId }: { userId: string }) {
  const { data: userGroups = [] } = useUserGroups(userId);
  const { data: allGroups = [] } = useGroupsQuery();
  const { add, remove } = useGroupMembersMutations();

  const groupItems = useMemo<GroupItem[]>(
    () =>
      allGroups.map((g) => ({
        id: g.group_id,
        label: g.name,
        auxiliaryData: { keywords: [g.slug] },
      })),
    [allGroups],
  );
  const source = useMemo(
    () =>
      createStaticSource(groupItems, { keywords: (item) => item.auxiliaryData?.keywords ?? [] }),
    [groupItems],
  );
  const selectedGroups = useMemo(
    () => groupItems.filter((item) => userGroups.some((g) => g.group_id === item.id)),
    [groupItems, userGroups],
  );

  return (
    <Field label="Groups">
      <Tokenizer
        label="Groups"
        isLabelHidden
        searchSource={source}
        debounceMs={0}
        hasEntriesOnFocus
        value={selectedGroups}
        onChange={(_items, change) => {
          if (change.type === 'add') add.mutate({ id: change.item.id, user_ids: [userId] });
          else if (change.type === 'remove') remove.mutate({ id: change.item.id, userId });
        }}
        placeholder="Add to group…"
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
    ...new Set(
      allGroups
        .filter((g) => joined.has(g.group_id))
        .flatMap((g) => g.roles.map((r) => r.role_slug)),
    ),
  ].sort();

  return (
    <Field label="Roles · inherited from groups">
      {roles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 font-mono text-caption text-secondary"
            >
              <ShieldCheck className="size-3" aria-hidden />
              {r}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-disabled">No roles</span>
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
              isOverride ? 'border-accent-bg/40 bg-accent-bg/[0.04]' : 'border-border bg-card',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'size-1.5 flex-none rounded-full',
                  granted ? 'bg-success' : 'bg-disabled/50',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-primary">
                  {p.label}
                </span>
                <span className="block truncate text-caption text-secondary">{source}</span>
              </div>
            </div>
            <Selector
              label={`${p.label} access`}
              isLabelHidden
              size="sm"
              value={overrideValue}
              onChange={(v) => {
                if (busy) return;
                if (v === 'inherit') clearOverride.mutate({ productId: p.id });
                else setOverride.mutate({ productId: p.id, effect: v as 'grant' | 'revoke' });
              }}
              options={[
                { value: 'inherit', label: 'Auto' },
                { value: 'grant', label: 'Grant' },
                { value: 'revoke', label: 'Revoke' },
              ]}
            />
          </div>
        );
      })}
    </div>
  );
}

export function UserDetailSheet({ row, open, onOpenChange }: Props) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="info"
      position={{ top: 0, right: 0, bottom: 0 }}
      width={432}
      maxHeight="100dvh"
      // Astryx's Dialog does not label itself from DialogHeader (only AlertDialog does),
      // so name it explicitly to keep the accessible name the drawer has always had.
      aria-label={row?.full_name ?? 'User details'}
    >
      <Layout
        header={
          <DialogHeader
            title={row?.full_name ?? '—'}
            subtitle={row?.work_email ?? undefined}
            startContent={
              <PersonAvatar
                name={row?.full_name ?? '?'}
                className="size-10 text-body-sm font-semibold"
              />
            }
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            {row && (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Employment">
                    <Badge
                      variant={EMPLOYMENT_BADGE[row.employment_status]}
                      label={EMPLOYMENT_LABEL[row.employment_status]}
                    />
                  </Field>
                  <Field label="Account">
                    <Badge
                      variant={ACCOUNT_STATUS_BADGE[row.account_status]}
                      label={ACCOUNT_STATUS_LABEL[row.account_status]}
                    />
                  </Field>
                </div>

                <WorkSection workerId={row.person_id} employmentStatus={row.employment_status} />

                {row.user_id && (
                  <div className="mt-1 flex flex-col gap-4">
                    <SectionTitle icon={<UsersRound className="size-4" />}>Access</SectionTitle>

                    <GroupsSection userId={row.user_id} />

                    <RolesSection userId={row.user_id} />

                    <div className="flex flex-col gap-3">
                      <SectionTitle icon={<Boxes className="size-4" />}>
                        Product overrides
                      </SectionTitle>
                      <ProductsSection userId={row.user_id} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
