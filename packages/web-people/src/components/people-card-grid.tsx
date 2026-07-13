import { Avatar, AvatarFallback, Badge, Button, Card, EmptyState, Skeleton } from '@seta/shared-ui';
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
  const variantMap: Record<string, 'neutral' | 'error'> = {
    active: 'neutral',
    onboarding: 'neutral',
    offboarding: 'neutral',
    terminated: 'error',
    leave: 'neutral',
  };
  const variant = (stage ? variantMap[stage] : undefined) ?? 'neutral';
  return <Badge variant={variant} className="capitalize" label={stage} />;
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
          <Card key={k} className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="shrink-0" height={36} width={36} radius="rounded" />
              <div className="space-y-1.5 flex-1 min-w-0">
                <Skeleton height={14} width="66.6667%" />
                <Skeleton height={12} width="50%" />
              </div>
            </div>
            <Skeleton height={12} />
            <Skeleton height={12} width="75%" />
          </Card>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    const hasFilters = Boolean(
      query.search ||
        query.status?.length ||
        query.account_id?.length ||
        query.project_id?.length ||
        query.skill_id?.length,
    );
    return (
      <EmptyState
        icon={<Users className="size-6" />}
        title={hasFilters ? 'No matching people' : 'No workers yet'}
        description={
          hasFilters ? 'Try adjusting your search or filters.' : 'Add a worker to get started.'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Card
            key={row.worker_id}
            className="cursor-pointer hover:border-brand/50 transition-colors p-4 space-y-3"
            onClick={() => onRowClick(row)}
          >
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
                  <Badge
                    key={a.id}
                    variant="neutral"
                    className="text-[11px] px-1.5 py-0"
                    label={a.name}
                  />
                ))}
              </div>
            )}

            {/* Skills / Techstack */}
            {row.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {row.skills.map((s) => (
                  <Badge
                    key={s.id}
                    variant="neutral"
                    className="text-[11px] px-1.5 py-0"
                    label={s.name}
                  />
                ))}
              </div>
            )}
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
            isDisabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            label="Prev"
          />
          <Button
            variant="secondary"
            size="sm"
            isDisabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            label="Next"
          />
        </div>
      </div>
    </div>
  );
}
