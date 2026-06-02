import { Button, Input, PageChrome, Skeleton } from '@seta/shared-ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { createJoinRequest, discoverGroups } from '../api/planner-client';

export function GroupDiscoverPage() {
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const searchQuery = useQuery({
    queryKey: ['planner', 'groups', 'discover', submittedQ],
    queryFn: () => discoverGroups(submittedQ),
    enabled: submittedQ.length > 0,
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => createJoinRequest(groupId),
    onSuccess: (_data, groupId) => {
      setRequestedIds((prev) => new Set(prev).add(groupId));
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQ(q.trim());
  }

  return (
    <PageChrome
      breadcrumb={[
        'Planner',
        <Link key="groups" to="/planner/groups">
          Groups
        </Link>,
      ]}
      title="Find a Workspace Group"
    >
      <div className="page-container max-w-2xl py-8">
        <h1 className="text-2xl font-semibold mb-6">Find a Workspace group</h1>

        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <Input
            placeholder="Search by group name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={q.trim().length === 0}>
            <Search className="size-4 mr-2" />
            Search
          </Button>
        </form>

        {searchQuery.isPending && submittedQ && (
          <div className="flex flex-col gap-3">
            {(['sk-0', 'sk-1', 'sk-2'] as const).map((k) => (
              <Skeleton key={k} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {searchQuery.data && searchQuery.data.length === 0 && (
          <p className="text-sm text-ink-muted">
            No public groups match &ldquo;{submittedQ}&rdquo;.
          </p>
        )}

        {searchQuery.data && searchQuery.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {searchQuery.data.map((group) => {
              const isRequested = requestedIds.has(group.id);
              return (
                <li
                  key={group.id}
                  className="flex items-start justify-between gap-4 rounded-lg border bg-surface-1 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{group.name}</p>
                    {group.description && (
                      <p className="text-sm text-ink-muted mt-1 truncate">{group.description}</p>
                    )}
                    <p className="text-xs text-ink-subtle mt-1">
                      {group.member_count} member{group.member_count !== 1 ? 's' : ''}
                      {group.owner_display_name ? ` · Owner: ${group.owner_display_name}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isRequested ? 'secondary' : 'default'}
                    disabled={isRequested || joinMutation.isPending}
                    onClick={() => joinMutation.mutate(group.id)}
                  >
                    {isRequested ? 'Requested' : 'Request to Join'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageChrome>
  );
}
