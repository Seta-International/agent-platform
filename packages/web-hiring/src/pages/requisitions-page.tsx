import {
  Alert,
  AlertDescription,
  DataTable,
  EmptyState,
  PageChrome,
  SegmentedControl,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Briefcase } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  fetchOpenRequisitions,
  type OpenRequisitionsBoard,
  type RequisitionListRow,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { NewRequisitionDialog } from './new-requisition-dialog.tsx';
import { RequisitionCard, STAGE_LABEL } from './requisition-card.tsx';
import { buildScopeNote } from './utils.ts';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Filled',
  cancelled: 'Cancelled',
};

export function RequisitionsPage() {
  const navigate = useNavigate();
  const canManage = usePermission('hiring.requisition.manage');
  // The "New requisition" button calls openRequisition, which the backend gates on
  // `.open` (see backend/domain/open-requisition.ts) — a distinct permission from `.manage`
  // (edit/hold/close an existing requisition), even though every seed role grants both today.
  const canCreate = usePermission('hiring.requisition.open');
  const [view, setView] = useState<'board' | 'list'>('board');

  const { data, isLoading, error } = useQuery<OpenRequisitionsBoard>({
    queryKey: hiringKeys.requisitions(),
    queryFn: fetchOpenRequisitions,
  });
  const rows = data?.requisitions ?? [];
  const scopeNote = buildScopeNote(data);

  const stat = (label: string, value: number, valueClass = 'text-ink') => (
    <div className="rounded-lg border border-hairline bg-surface-1 px-5 py-4">
      <div className={`text-display-md font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-1 text-caption text-ink-muted">{label}</div>
    </div>
  );

  const columns = useMemo(() => {
    type Ctx = { row: { original: RequisitionListRow } };
    return [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Position',
        cell: ({ row }: Ctx) => (
          <div>
            <div className="font-medium text-ink">{row.original.title}</div>
            <div className="font-mono text-caption text-ink-muted">
              {row.original.id.slice(0, 8)}
            </div>
          </div>
        ),
      },
      {
        id: 'account_name',
        accessorKey: 'account_name',
        header: 'Account',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.account_name ?? '—'}</span>
        ),
      },
      {
        id: 'project_name',
        accessorKey: 'project_name',
        header: 'Project',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.project_name ?? '—'}</span>
        ),
      },
      {
        id: 'grade',
        accessorKey: 'grade',
        header: 'Grade',
        cell: ({ row }: Ctx) => <span className="text-ink-muted">{row.original.grade ?? '—'}</span>,
      },
      {
        id: 'kind',
        accessorKey: 'kind',
        header: 'Type',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted capitalize">{row.original.kind}</span>
        ),
      },
      {
        id: 'stage',
        accessorKey: 'stage',
        header: 'Stage',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{STAGE_LABEL[row.original.stage]}</span>
        ),
      },
      {
        id: 'applicants',
        accessorKey: 'applicants_count',
        header: 'Applicants',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.applicants_count}</span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{STATUS_LABEL[row.original.status]}</span>
        ),
      },
      {
        id: 'due_date',
        accessorKey: 'due_date',
        header: 'Due',
        cell: ({ row }: Ctx) => (
          <span className="font-mono text-caption text-ink-muted">
            {row.original.due_date ?? '—'}
          </span>
        ),
      },
    ];
  }, []);

  // The board only carries non-filled requisitions (status open | on_hold).
  const openCount = rows.filter((r) => r.status === 'open').length;
  const onHold = rows.filter((r) => r.status === 'on_hold').length;
  const totalApplicants = rows.reduce((n, r) => n + r.applicants_count, 0);

  return (
    <PageChrome
      breadcrumb={['Hiring management', 'Open positions']}
      title="Requisitions"
      subtitle="Live open positions across every account — track hiring status and let internal staff browse and apply."
      actions={<NewRequisitionDialog disabled={!canCreate} />}
    >
      <div className="page-container space-y-4 p-6">
        {scopeNote && (
          <Alert variant="info">
            <AlertDescription>{scopeNote}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stat('Open positions', openCount)}
          {stat('Applicants', totalApplicants)}
          {stat('On hold', onHold, 'text-warning')}
          {stat('Total open', rows.length)}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-caption font-medium uppercase tracking-wide text-ink-muted">
            Browse & manage open positions
          </div>
          <SegmentedControl
            value={view}
            onValueChange={(v) => setView(v as 'board' | 'list')}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'list', label: 'List' },
            ]}
          />
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : view === 'list' ? (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            getRowId={(r: RequisitionListRow) => r.id}
            globalFilterPlaceholder="Search requisitions…"
            pagination={{ defaultPageSize: 25, pageSizeOptions: [25, 50, 100] }}
            emptyState={
              <EmptyState
                icon={<Briefcase className="size-6" />}
                title="No requisitions yet"
                description="Open a requisition to get started."
              />
            }
            onRowClick={(row) =>
              void navigate({
                to: '/hiring/requisitions/$requisitionId',
                params: { requisitionId: row.original.id },
              })
            }
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-lg border border-hairline bg-surface-2"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title="No requisitions yet"
            description="Open a requisition to get started."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rows.map((r) => (
              <RequisitionCard key={r.id} r={r} canManage={canManage} />
            ))}
          </div>
        )}
      </div>
    </PageChrome>
  );
}
