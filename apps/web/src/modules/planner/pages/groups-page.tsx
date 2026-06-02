import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  KbdHint,
  PageChrome,
  Skeleton,
  toast,
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
import { useGroupsWithCounts } from '../hooks/queries/use-groups-with-counts';

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
  const q = useGroupsWithCounts({ includeDeleted: status === 'archived' });
  const restoreGroup = useRestoreGroup();

  function handleRestore(groupId: string) {
    restoreGroup.mutate(
      { group_id: groupId },
      {
        onSuccess: () => {
          toast('Group restored');
          void q.refetch();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't restore the group."),
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
      if (g.owner_display_name && !seen.has(g.created_by)) {
        seen.set(g.created_by, g.owner_display_name);
      }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [q.data]);

  if (q.isPending) {
    return (
      <PageChrome breadcrumb={['Planner']} title="Groups">
        <div data-testid="groups-page-skeleton" className="space-y-3 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </PageChrome>
    );
  }

  if (q.isError) {
    return (
      <PageChrome breadcrumb={['Planner']} title="Groups">
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Couldn't load groups.</span>
              <Button size="sm" variant="secondary" onClick={() => q.refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </PageChrome>
    );
  }

  const groups = q.data;

  if (groups.length === 0) {
    return (
      <PageChrome breadcrumb={['Planner']} title="Groups">
        <div className="p-6">
          <EmptyState
            title="No groups yet"
            description={
              canCreateGroup
                ? 'Create a group to organize plans and people.'
                : 'Ask an admin to create a group and invite you to it.'
            }
            action={
              canCreateGroup
                ? { label: 'New group', onClick: () => setCreateOpen(true) }
                : undefined
            }
          />
          <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
        </div>
      </PageChrome>
    );
  }

  const showSourceFilter = groups.some((g) => g.external_source !== 'native');
  if (!showSourceFilter && source !== null) setSource(null);

  const filtered = groups.filter((g) => {
    // Status: archived view shows only deleted rows; active/null shows only live rows
    if (status === 'archived') {
      if (!g.deleted_at) return false;
    } else {
      if (g.deleted_at) return false;
    }
    if (visibility && g.visibility !== visibility) return false;
    if (source && g.external_source !== source) return false;
    if (owner && g.created_by !== owner) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!g.name.toLowerCase().includes(s) && !(g.description ?? '').toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });

  const totalPlans = groups.reduce((s, g) => s + g.plan_count, 0);
  const totalMembers = groups.reduce((s, g) => s + g.member_count, 0);
  const syncedCount = groups.filter((g) => g.external_source !== 'native').length;

  return (
    <PageChrome
      breadcrumb={['Planner']}
      title="Groups"
      subtitle={`${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · ${totalPlans} plans · ${totalMembers} members`}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void navigate({ to: '/planner/groups/discover' })}
          >
            <Search className="size-4 mr-2" />
            Find a Workspace group
          </Button>
          {canCreateGroup ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setSyncFromIdPOpen(true)}>
                <Cloud className="size-3" /> Sync from IdP
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3" /> New group
              </Button>
            </>
          ) : null}
        </>
      }
      toolbar={
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
      }
    >
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
          {canCreateGroup ? (
            <span className="inline-flex items-center gap-1 text-ink-subtle">
              Press <KbdHint keys={['N']} /> to create a new group
            </span>
          ) : null}
        </footer>
      </div>
      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      <Dialog open={syncFromIdPOpen} onOpenChange={setSyncFromIdPOpen}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Select group to link to M365</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <select
              className="block h-9 w-full rounded-md border border-hairline bg-canvas px-3 text-sm"
              value={groupToLink ?? ''}
              onChange={(e) => setGroupToLink(e.target.value || null)}
              aria-label="Select a group"
            >
              <option value="">— choose a group —</option>
              {groups
                .filter((g) => g.external_source === 'native')
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSyncFromIdPOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!groupToLink}
                onClick={() => {
                  setSyncFromIdPOpen(false);
                  setLinkDialogOpen(true);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
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
    </PageChrome>
  );
}
