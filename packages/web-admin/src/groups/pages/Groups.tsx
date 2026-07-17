import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  EmptyState,
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Skeleton,
  Text,
  VStack,
} from '@seta/shared-ui';
import { UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RailHeader, RailItem } from '../../components/access-console.tsx';
import type { Group } from '../api/groups-client.ts';
import { CreateGroupDialog } from '../components/CreateGroupDialog.tsx';
import { GroupDetail } from '../components/GroupDetail.tsx';
import { useGroupsQuery } from '../hooks/useGroups.ts';
import { derivedProducts } from '../lib/role-meta.ts';

function roleProductSummary(group: Group): string {
  const roleSlugs = group.roles.map((r) => r.role_slug);
  const roles = roleSlugs.length;
  if (roles === 0) return 'No roles';
  const products = derivedProducts(roleSlugs).length;
  const rolePart = `${roles} ${roles === 1 ? 'role' : 'roles'}`;
  return products > 0
    ? `${rolePart} · ${products} ${products === 1 ? 'product' : 'products'}`
    : rolePart;
}

function GroupListItem({
  group,
  active,
  onClick,
}: {
  group: Group;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <RailItem
      title={group.name}
      active={active}
      onClick={onClick}
      count={group.member_count}
      subtitle={
        <>
          {group.is_base ? (
            <Badge variant="neutral" label="Base" />
          ) : group.kind === 'default' ? (
            <Badge variant="neutral" label="Default" />
          ) : null}
          <span className="truncate">{roleProductSummary(group)}</span>
        </>
      }
    />
  );
}

export function GroupsPage() {
  const { data, isLoading, error } = useGroupsQuery();
  const groups = data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep a valid selection: default to the first group, drop a deleted one.
  useEffect(() => {
    if (groups.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !groups.some((g) => g.group_id === selectedId)) {
      setSelectedId(groups[0]?.group_id ?? null);
    }
  }, [groups, selectedId]);

  const selected = groups.find((g) => g.group_id === selectedId) ?? null;

  const subtitle = isLoading
    ? 'Loading…'
    : `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/admin">Admin</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Groups</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Groups
                </Text>
                {subtitle && <Text color="secondary">{subtitle}</Text>}
              </HStack>
              <CreateGroupDialog onCreated={setSelectedId} />
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          {error ? (
            <PageContainer>
              <Banner status="error" title={(error as Error).message} />
            </PageContainer>
          ) : (
            <div className="flex h-full min-h-0">
              <aside className="flex w-72 flex-none flex-col border-r border-hairline bg-surface-1">
                <RailHeader>All groups</RailHeader>
                <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
                  {isLoading ? (
                    <>
                      <Skeleton height={48} radius={2} />
                      <Skeleton height={48} radius={2} />
                      <Skeleton height={48} radius={2} />
                    </>
                  ) : groups.length === 0 ? (
                    <p className="px-3 py-6 text-center text-body-sm text-ink-tertiary">
                      No groups yet.
                    </p>
                  ) : (
                    groups.map((g) => (
                      <GroupListItem
                        key={g.group_id}
                        group={g}
                        active={g.group_id === selectedId}
                        onClick={() => setSelectedId(g.group_id)}
                      />
                    ))
                  )}
                </div>
              </aside>

              <div className="min-w-0 flex-1 overflow-y-auto">
                {selected ? (
                  <GroupDetail
                    key={selected.group_id}
                    group={selected}
                    onDeleted={() => setSelectedId(null)}
                  />
                ) : (
                  !isLoading && (
                    <EmptyState
                      className="h-full"
                      icon={<UsersRound className="size-8" />}
                      title="No group selected"
                      description="Create a group to bundle roles and assign people in one place."
                    />
                  )
                )}
              </div>
            </div>
          )}
        </LayoutContent>
      }
    />
  );
}
