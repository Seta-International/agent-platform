import { PRODUCTS } from '@seta/shared-rbac';
import {
  Badge,
  cn,
  createStaticSource,
  Dialog,
  DialogHeader,
  Grid,
  HStack,
  Layout,
  LayoutContent,
  type SearchableItem,
  Selector,
  StatusDot,
  Text,
  Tokenizer,
  VStack,
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
        <HStack gap={1.5} wrap="wrap">
          {roles.map((r) => (
            <Badge
              key={r}
              variant="neutral"
              icon={<ShieldCheck className="size-3" aria-hidden />}
              label={r}
            />
          ))}
        </HStack>
      ) : (
        <Text color="disabled">No roles</Text>
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
    <VStack gap={1.5}>
      {PRODUCTS.map((p) => {
        const userOverride = rows.find((r) => r.product_id === p.id && r.source === 'user');
        const overrideValue = userOverride
          ? userOverride.effect
          : ('inherit' as 'grant' | 'revoke' | 'inherit');
        const { granted, source, isOverride } = productState(rows, p.id);
        return (
          <HStack
            key={p.id}
            hAlign="between"
            vAlign="center"
            gap={3}
            style={{
              borderRadius: 'var(--radius-container)',
              padding: 'var(--spacing-2) var(--spacing-3)',
              ...(isOverride
                ? {}
                : {
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-background-card)',
                  }),
            }}
            // keep: translucent accent-tint override state (border-accent-bg/40, bg-accent-bg/[0.04])
            // has no plain-token equivalent — same exception as GroupDetail.tsx's selected-row tint.
            className={cn(
              isOverride ? 'border border-accent-bg/40 bg-accent-bg/[0.04]' : undefined,
            )}
          >
            <HStack gap={2} vAlign="center" className="min-w-0">
              <StatusDot
                variant={granted ? 'success' : 'neutral'}
                label={`${p.label} ${granted ? 'granted' : 'not granted'}`}
              />
              <VStack gap={0} className="min-w-0">
                <Text weight="medium" className="truncate">
                  {p.label}
                </Text>
                <Text type="supporting" color="secondary" className="truncate">
                  {source}
                </Text>
              </VStack>
            </HStack>
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
          </HStack>
        );
      })}
    </VStack>
  );
}

export function UserDetailSheet({ row, open, onOpenChange }: Props) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="info"
      position={{ top: 0, end: 0, bottom: 0 }}
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
            startContent={<PersonAvatar name={row?.full_name ?? '?'} size="lg" />}
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            {row && (
              <VStack gap={5}>
                <Grid columns={2} gap={4}>
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
                </Grid>

                <WorkSection workerId={row.person_id} employmentStatus={row.employment_status} />

                {row.user_id && (
                  <VStack gap={4} style={{ marginTop: 'var(--spacing-1)' }}>
                    <SectionTitle icon={<UsersRound className="size-4" />}>Access</SectionTitle>

                    <GroupsSection userId={row.user_id} />

                    <RolesSection userId={row.user_id} />

                    <VStack gap={3}>
                      <SectionTitle icon={<Boxes className="size-4" />}>
                        Product overrides
                      </SectionTitle>
                      <ProductsSection userId={row.user_id} />
                    </VStack>
                  </VStack>
                )}
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
