import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Dialog,
  DialogHeader,
  DisabledActionTooltip,
  EmptyState,
  HStack,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  Selector,
  Skeleton,
  Text,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { Cloud, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { GroupsGrid } from '../components/GroupsGrid';
import { GroupsTable } from '../components/GroupsTable';
import { GroupsToolbar } from '../components/GroupsToolbar';
import { LinkToM365Dialog } from '../components/LinkToM365Dialog';
import { useRestoreGroup } from '../hooks/mutations/restore-group';
import { useGroupMemberSummary } from '../hooks/queries/use-group-member-summary';
import { useGroupsWithCounts } from '../hooks/queries/use-groups-with-counts';
import { PERMISSION_DENIED } from '../lib/permission-messages';

interface Props {
  canCreateGroup?: boolean;
}

export function GroupsPage({ canCreateGroup = false }: Props) {
  const navigate = useNavigate();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public' | null>(null);
  const [source, setSource] = useState<'native' | 'm365' | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [status, setStatus] = useState<'active' | 'archived' | null>(null);
  const q = useGroupsWithCounts({ includeDeleted: status !== 'active' });
  const memberSummary = useGroupMemberSummary();
  const restoreGroup = useRestoreGroup();
  const toast = useToast();

  function handleRestore(groupId: string) {
    restoreGroup.mutate(
      { group_id: groupId },
      {
        onSuccess: () => {
          toast({ body: 'Group restored' });
          void q.refetch();
        },
        onError: (e) =>
          toast({
            body: e instanceof Error ? e.message : "Couldn't restore the group.",
            type: 'error',
          }),
      },
    );
  }
  const [createOpen, setCreateOpen] = useState(false);
  const [syncFromIdPOpen, setSyncFromIdPOpen] = useState(false);
  const [groupToLink, setGroupToLink] = useState<string | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  useEffect(() => {
    if (!canCreateGroup) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.tagName === 'INPUT' ||
        t?.tagName === 'TEXTAREA' ||
        t?.isContentEditable ||
        t?.getAttribute('role') === 'combobox'
      )
        return;
      e.preventDefault();
      setCreateOpen(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canCreateGroup]);

  const ownerOptions = useMemo(() => {
    if (!q.data) return [];
    const seen = new Map<string, string>();
    for (const g of q.data) {
      if (g.owner_display_name && g.owner_user_id && !seen.has(g.owner_user_id)) {
        seen.set(g.owner_user_id, g.owner_display_name);
      }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [q.data]);

  if (q.isPending) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Groups</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Groups
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div data-testid="groups-page-skeleton" className="space-y-3 p-6">
              <Skeleton height={48} />
              <Skeleton height={48} />
              <Skeleton height={48} />
            </div>
          </LayoutContent>
        }
      />
    );
  }

  if (q.isError) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Groups</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Groups
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div className="p-6">
              <Banner
                status="error"
                title="Couldn't load groups."
                endContent={
                  <Button size="sm" variant="secondary" label="Retry" onClick={() => q.refetch()} />
                }
              />
            </div>
          </LayoutContent>
        }
      />
    );
  }

  const groups = q.data;

  if (groups.length === 0) {
    return (
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Groups</BreadcrumbItem>
              </Breadcrumbs>
              <Text as="h1" size="lg" weight="semibold">
                Groups
              </Text>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <div className="p-6">
              <EmptyState
                title="No groups yet"
                description={
                  canCreateGroup
                    ? 'Create a group to organize plans and people.'
                    : 'Ask an admin to create a group and invite you to it.'
                }
                actions={
                  canCreateGroup ? (
                    <Button label="New group" onClick={() => setCreateOpen(true)} />
                  ) : undefined
                }
              />
              <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
            </div>
          </LayoutContent>
        }
      />
    );
  }

  const showSourceFilter = groups.some((g) => g.external_source !== 'native');
  if (!showSourceFilter && source !== null) setSource(null);

  const filtered = groups.filter((g) => {
    // Status: 'archived' → only deleted rows; 'active' → only live rows; null (Any) → both
    if (status === 'archived' && !g.deleted_at) return false;
    if (status === 'active' && g.deleted_at) return false;
    if (visibility && g.visibility !== visibility) return false;
    if (source && g.external_source !== source) return false;
    if (owner && g.owner_user_id !== owner) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!g.name.toLowerCase().includes(s) && !(g.description ?? '').toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  const totalPlans = groups.reduce((s, g) => s + g.plan_count, 0);
  const totalMembers = memberSummary.data?.distinct_member_count ?? 0;
  const syncedCount = groups.filter((g) => g.external_source !== 'native').length;

  return (
    <Layout
      height="fill"
      header={
        <>
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={1}>
              <Breadcrumbs variant="supporting">
                <BreadcrumbItem href="/planner">Planner</BreadcrumbItem>
                <BreadcrumbItem isCurrent>Groups</BreadcrumbItem>
              </Breadcrumbs>
              <HStack hAlign="between" vAlign="center" gap={2}>
                <HStack gap={2} vAlign="center">
                  <Text as="h1" size="lg" weight="semibold">
                    Groups
                  </Text>
                  <Text color="secondary">{`${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · ${totalPlans} plans · ${totalMembers} members`}</Text>
                </HStack>
                <HStack gap={2} vAlign="center">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Search className="size-4" />}
                    label="Find a Workspace group"
                    onClick={() => void navigate({ to: '/planner/groups/discover' })}
                  />
                  <DisabledActionTooltip
                    disabled={!canCreateGroup}
                    reason={PERMISSION_DENIED.group.create}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Cloud className="size-3" />}
                      label="Sync from IdP"
                      onClick={() => setSyncFromIdPOpen(true)}
                      isDisabled={!canCreateGroup}
                    />
                  </DisabledActionTooltip>
                  <DisabledActionTooltip
                    disabled={!canCreateGroup}
                    reason={PERMISSION_DENIED.group.create}
                  >
                    <Button
                      size="sm"
                      icon={<Plus className="size-3" />}
                      label="New group"
                      onClick={() => setCreateOpen(true)}
                      isDisabled={!canCreateGroup}
                    />
                  </DisabledActionTooltip>
                </HStack>
              </HStack>
            </VStack>
          </LayoutHeader>
          {/* Second header row pins the filters outside the scroll container, as the old page
              chrome did. The inner div reproduces that chrome's toolbar wrapper verbatim. */}
          <LayoutHeader padding={0}>
            <div className="flex h-12 flex-none items-center justify-between gap-4 border-b border-hairline bg-canvas px-6">
              <GroupsToolbar
                view={view}
                onViewChange={setView}
                searchQuery={search}
                onSearchChange={setSearch}
                visibility={visibility}
                onVisibilityChange={setVisibility}
                source={source}
                onSourceChange={setSource}
                owner={owner}
                onOwnerChange={setOwner}
                ownerOptions={ownerOptions}
                showSourceFilter={showSourceFilter}
                status={status}
                onStatusChange={setStatus}
              />
            </div>
          </LayoutHeader>
        </>
      }
      content={
        <LayoutContent padding={0}>
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto">
              {view === 'list' ? (
                <GroupsTable
                  groups={filtered}
                  onRestore={status === 'archived' ? handleRestore : undefined}
                />
              ) : (
                <GroupsGrid
                  groups={filtered}
                  onRestore={status === 'archived' ? handleRestore : undefined}
                />
              )}
            </div>
            <footer className="flex h-11 flex-none items-center justify-between border-t border-hairline bg-canvas px-6 text-xs text-ink-muted">
              <span>
                Showing {filtered.length} of {groups.length}
                {syncedCount > 0
                  ? ` · ${syncedCount} ${syncedCount === 1 ? 'group' : 'groups'} synced from IdP`
                  : ''}
              </span>
            </footer>
          </div>
          <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
          <Dialog isOpen={syncFromIdPOpen} onOpenChange={setSyncFromIdPOpen} purpose="form">
            <Layout
              header={
                <DialogHeader
                  title="Select group to link to M365"
                  onOpenChange={setSyncFromIdPOpen}
                />
              }
              content={
                <LayoutContent>
                  {/* Astryx's Dialog always mounts its Layout/LayoutContent children regardless of
                  `isOpen`, and Selector renders its full option list into the DOM (hidden, but
                  still text-matchable) as soon as it mounts. Gating the Selector on
                  `syncFromIdPOpen` keeps group names out of the DOM entirely while this dialog
                  is closed, so they don't collide with the same names rendered elsewhere on the
                  page (e.g. the groups table). */}
                  {syncFromIdPOpen && (
                    <Selector
                      label="Select a group"
                      isLabelHidden
                      placeholder="— choose a group —"
                      options={groups
                        .filter((g) => g.external_source === 'native')
                        .map((g) => ({ value: g.id, label: g.name }))}
                      value={groupToLink ?? undefined}
                      onChange={(v) => setGroupToLink(v)}
                    />
                  )}
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider>
                  <Button
                    variant="secondary"
                    label="Cancel"
                    onClick={() => setSyncFromIdPOpen(false)}
                  />
                  <Button
                    label="Next"
                    isDisabled={!groupToLink}
                    onClick={() => {
                      setSyncFromIdPOpen(false);
                      setLinkDialogOpen(true);
                    }}
                  />
                </LayoutFooter>
              }
            />
          </Dialog>
          {groupToLink && (
            <LinkToM365Dialog
              groupId={groupToLink}
              open={linkDialogOpen}
              onOpenChange={(v) => {
                setLinkDialogOpen(v);
                if (!v) setGroupToLink(null);
              }}
            />
          )}
        </LayoutContent>
      }
    />
  );
}
