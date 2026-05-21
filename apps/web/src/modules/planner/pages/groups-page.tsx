import { Alert, AlertDescription, Button, EmptyState, Skeleton } from '@seta/shared-ui';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { GroupsGrid } from '../components/GroupsGrid';
import { GroupsTable } from '../components/GroupsTable';
import { GroupsToolbar } from '../components/GroupsToolbar';
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
  // Show Source filter only when at least one group is from m365 (PR2 native-only by default)
  const showSourceFilter = groups.some((g) => g.external_source !== 'native');

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
      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
