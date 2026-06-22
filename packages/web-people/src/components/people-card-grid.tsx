import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
} from '@seta/shared-ui';
import { Users } from 'lucide-react';
import type { WorkerListRow, WorkersQuery } from '../api/people-client.ts';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function LifecycleBadge({ stage }: { stage: string | null }) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    onboarding: 'secondary',
    offboarding: 'outline',
    terminated: 'destructive',
    leave: 'outline',
  };
  const variant = (stage ? variantMap[stage] : undefined) ?? 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {stage}
    </Badge>
  );
}

/** Clamp page to [1, pageCount]. Exported for unit-testing. */
export function clampPage(page: number, pageCount: number): number {
  return Math.max(1, Math.min(page, pageCount));
}

interface PeopleCardGridProps {
  rows: WorkerListRow[];
  total: number;
  isLoading: boolean;
  query: WorkersQuery;
  setQuery: React.Dispatch<React.SetStateAction<WorkersQuery>>;
  onRowClick: (row: WorkerListRow) => void;
}

export function PeopleCardGrid({
  rows,
  total,
  isLoading,
  query,
  setQuery,
  onRowClick,
}: PeopleCardGridProps) {
  const pageSize = query.pageSize ?? 25;
  const page = query.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function goToPage(next: number) {
    setQuery((q) => ({ ...q, page: clampPage(next, pageCount) }));
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((k) => (
          <Card key={k}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title="No workers yet"
        description="Add a worker to get started."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Card
            key={row.worker_id}
            className="cursor-pointer hover:border-brand/50 transition-colors"
            onClick={() => onRowClick(row)}
          >
            <CardContent className="p-4 space-y-3">
              {/* Header: avatar + name + title */}
              <div className="flex items-start gap-3 min-w-0">
                <Avatar className="size-9 shrink-0 mt-0.5">
                  <AvatarFallback>{initials(row.full_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{row.full_name}</div>
                  {row.job_title && (
                    <div className="text-[11px] text-ink-muted truncate leading-tight">
                      {row.job_title}
                    </div>
                  )}
                </div>
                <LifecycleBadge stage={row.lifecycle_stage} />
              </div>

              {/* Work email */}
              {row.work_email && (
                <div className="font-mono text-[11.5px] text-ink-muted truncate">
                  {row.work_email}
                </div>
              )}

              {/* Accounts */}
              {row.accounts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {row.accounts.map((a) => (
                    <Badge key={a.id} variant="secondary" className="text-[11px] px-1.5 py-0">
                      {a.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Skills / Techstack */}
              {row.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {row.skills.map((s) => (
                    <Badge key={s.id} variant="secondary" className="text-[11px] px-1.5 py-0">
                      {s.name}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between text-body-sm text-ink-muted">
        <span>
          Page {page} of {pageCount}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
