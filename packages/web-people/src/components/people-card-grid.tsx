import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  Pagination,
  Skeleton,
  shouldShowPagination,
} from '@seta/shared-ui';
import { Users } from 'lucide-react';
import type { WorkerListRow, WorkersQuery } from '../api/people-client.ts';

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

  const showPagination = shouldShowPagination({
    totalItems: total,
    pageSize,
    pageSizeOptions: [25, 50, 100],
  });

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
        title={hasFilters ? 'No matching people' : 'No employees yet'}
        description={
          hasFilters ? 'Try adjusting your search or filters.' : 'Add an employee to get started.'
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
              {/* Name is spelled out beside the avatar, so Astryx's name-on-hover
                  tooltip would only duplicate it in the a11y tree. */}
              <Avatar
                name={row.full_name}
                src={row.photo_url ?? undefined}
                size={36}
                tooltip={false}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{row.full_name}</div>
                {row.job_title && (
                  <div className="text-xs text-secondary truncate leading-tight">
                    {row.job_title}
                  </div>
                )}
              </div>
              <LifecycleBadge stage={row.lifecycle_stage} />
            </div>

            {/* Work email */}
            {row.work_email && (
              <div className="font-mono text-sm text-secondary truncate">{row.work_email}</div>
            )}

            {/* Accounts */}
            {row.accounts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {row.accounts.map((a) => (
                  <Badge
                    key={a.id}
                    variant="neutral"
                    className="text-xs px-1.5 py-0"
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
                    className="text-xs px-1.5 py-0"
                    label={s.name}
                  />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {showPagination && (
        <div className="flex justify-center w-full mt-4">
          <Pagination
            page={page}
            onChange={goToPage}
            totalItems={total}
            pageSize={pageSize}
            pageSizeOptions={[25, 50, 100]}
            onPageSizeChange={(newSize) => setQuery((q) => ({ ...q, pageSize: newSize, page: 1 }))}
            style={{ justifyContent: 'center', width: 'auto' }}
          />
        </div>
      )}
    </div>
  );
}
