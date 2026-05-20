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
import { useMyGroups } from '../hooks/queries/use-my-groups';

export function GroupsPage() {
  const q = useMyGroups();

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
    return (
      <EmptyState
        title="You're not in any groups yet."
        description="Ask your tenant admin to add you to a group, or create one if you have admin access."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
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
  );
}
