import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@seta/shared-ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useCreateGroup } from '../hooks/mutations/create-group';
import { useMyGroups } from '../hooks/queries/use-my-groups';

interface Props {
  /** When true, the user can create new groups. Gated by org.admin / tenant.admin / planner.admin. */
  canCreateGroup?: boolean;
}

export function GroupsPage({ canCreateGroup = false }: Props) {
  const q = useMyGroups();
  const createGroup = useCreateGroup();
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  function commitCreate() {
    const name = draftName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    createGroup.mutate({ name });
    setDraftName('');
    setCreating(false);
  }

  if (q.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no semantic identity
            key={i}
            data-testid="skeleton-card"
            className="h-32 w-full rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div
        role="alert"
        className="m-6 rounded-md border border-destructive/40 bg-destructive/10 p-4"
      >
        <h2 className="text-card-title text-ink">Couldn't load groups</h2>
        <p className="mt-1 text-body-sm text-ink-subtle">
          {q.error instanceof Error ? q.error.message : 'Unknown error.'}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => q.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (q.data.length === 0) {
    if (canCreateGroup) {
      return (
        <EmptyState
          title="Create your first group"
          description="Groups hold plans and members. Start one for the team or project you're working with."
          action={{
            label: 'Create group',
            onClick: () => setCreating(true),
          }}
        />
      );
    }
    return (
      <EmptyState
        title="You're not in any groups yet"
        description="Ask your tenant admin to add you to a group."
      />
    );
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-display-md text-ink">Groups</h1>
        {canCreateGroup && (
          <Button size="sm" onClick={() => setCreating(true)} aria-label="Create group">
            + Create group
          </Button>
        )}
      </header>
      {creating && (
        <div className="mb-4 flex items-center gap-2">
          <input
            // biome-ignore lint/a11y/noAutofocus: inline form opens explicitly on user action
            autoFocus
            type="text"
            value={draftName}
            placeholder="Group name"
            aria-label="New group name"
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') {
                setDraftName('');
                setCreating(false);
              }
            }}
            className="rounded-md border border-hairline bg-surface-1 px-2 py-1 text-sm"
          />
          <Button size="sm" onClick={commitCreate}>
            Create
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraftName('');
              setCreating(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {q.data.map((g) => (
          <Link key={g.id} to="/planner/groups/$groupId" params={{ groupId: g.id }}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle>{g.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body-sm text-ink-subtle">
                  Last activity {new Date(g.updated_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
