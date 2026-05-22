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
  Skeleton,
} from '@seta/shared-ui';
import { Cloud, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { GroupsGrid } from '../components/GroupsGrid';
import { GroupsTable } from '../components/GroupsTable';
import { GroupsToolbar } from '../components/GroupsToolbar';
import { LinkToM365Dialog } from '../components/LinkToM365Dialog';
import { useGroupsWithCounts } from '../hooks/queries/use-groups-with-counts';

interface Props {
  canCreateGroup?: boolean;
}

export function GroupsPage({ canCreateGroup = false }: Props) {
  const q = useGroupsWithCounts();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public' | null>(null);
  const [source, setSource] = useState<'native' | 'm365' | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
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

  // Derive owner options from the data
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

  // Loading skeleton — match the layout shape (header bar + toolbar + body)
  if (q.isPending) {
    return (
      <div className="flex h-full flex-col">
        <Skeleton className="h-20 w-full" data-testid="groups-page-skeleton" />
        <Skeleton className="h-12 w-full mt-px" />
        <div className="flex-1 p-6 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-7">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>Couldn't load groups.</span>
            <Button size="sm" variant="secondary" onClick={() => q.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const groups = q.data;

  if (groups.length === 0) {
    return (
      <div className="p-7">
        <EmptyState
          title="No groups yet"
          description={
            canCreateGroup
              ? 'Create a group to organize plans and people.'
              : 'Ask an admin to create a group and invite you to it.'
          }
          action={
            canCreateGroup ? { label: 'New group', onClick: () => setCreateOpen(true) } : undefined
          }
        />
        <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    );
  }

  // Apply filters
  const showSourceFilter = groups.some((g) => g.external_source !== 'native');

  // state-during-render: reset stale source filter when no M365 groups exist
  if (!showSourceFilter && source !== null) setSource(null);

  const filtered = groups.filter((g) => {
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
    <div className="flex h-full flex-col">
      <header className="relative border-b border-hairline px-7 py-5">
        <h1 className="text-display-md">Groups</h1>
        <p className="mt-1 text-body-sm text-ink-subtle">
          {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {totalPlans} plans ·{' '}
          {totalMembers} members
        </p>
        {canCreateGroup ? (
          <div className="absolute right-7 top-5 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSyncFromIdPOpen(true)}>
              <Cloud className="size-3" /> Sync from IdP
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3" /> New group
            </Button>
          </div>
        ) : null}
      </header>
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
      />
      <div className="flex-1 overflow-auto">
        {view === 'list' ? <GroupsTable groups={filtered} /> : <GroupsGrid groups={filtered} />}
      </div>
      <footer className="flex h-11 flex-none items-center justify-between border-t border-hairline bg-canvas px-7 text-xs text-ink-muted">
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
              aria-label="Select a Seta group"
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
    </div>
  );
}
