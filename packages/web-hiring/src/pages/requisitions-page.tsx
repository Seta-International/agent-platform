import {
  Alert,
  AlertDescription,
  DataTable,
  EmptyState,
  Input,
  PageChrome,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Briefcase, Layers, Pause, Search, Users } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  fetchOpenRequisitions,
  type OpenRequisitionsBoard,
  type RequisitionListRow,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { NewRequisitionDialog } from './new-requisition-dialog.tsx';
import { RequisitionCard } from './requisition-card.tsx';
import { STAGE_LABEL } from './requisition-format.ts';
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
  // (edit/hold requisition), even though every seed role grants both today.
  const canCreate = usePermission('hiring.requisition.open');
  // Mark Filled / Cancel call closeRequisition, gated on `.close` — distinct from `.manage`
  // (stage/pause/resume), even though every seed role grants both today.
  const canClose = usePermission('hiring.requisition.close');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');

  const { data, isLoading, error } = useQuery<OpenRequisitionsBoard>({
    queryKey: hiringKeys.requisitions(),
    queryFn: fetchOpenRequisitions,
  });
  const rows = data?.requisitions ?? [];
  const scopeNote = buildScopeNote(data);

  const accountOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.account_name).filter((n): n is string => n != null)),
      ).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.title, r.account_name, r.project_name].some((v) => v?.toLowerCase().includes(q)))
        return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (accountFilter !== 'all' && r.account_name !== accountFilter) return false;
      if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
      return true;
    });
  }, [rows, query, statusFilter, accountFilter, kindFilter]);

  const stat = (
    label: string,
    value: number,
    icon: ReactNode,
    iconClass: string,
    valueClass = 'text-ink',
  ) => (
    <div className="flex items-center gap-4 rounded-lg border border-hairline bg-surface-1 px-5 py-4">
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ${iconClass}`}
      >
        {icon}
      </div>
      <div>
        <div className={`text-display-md font-semibold tabular-nums ${valueClass}`}>{value}</div>
        <div className="mt-1 text-caption text-ink-muted">{label}</div>
      </div>
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
          <div className="min-w-[240px] max-w-[420px]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="line-clamp-2 break-words font-medium text-ink">
                    {row.original.title}
                  </div>
                </TooltipTrigger>
                <TooltipContent>{row.original.title}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        cell: ({ row }: Ctx) =>
          row.original.grade ? (
            <div className="max-w-[160px]">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate text-ink-muted">{row.original.grade}</div>
                  </TooltipTrigger>
                  <TooltipContent>{row.original.grade}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : (
            <span className="text-ink-muted">—</span>
          ),
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stat(
            'Open positions',
            openCount,
            <Briefcase className="size-5" aria-hidden />,
            'bg-primary/12 text-primary',
          )}
          {stat(
            'Applicants',
            totalApplicants,
            <Users className="size-5" aria-hidden />,
            'bg-success-tint text-success-ink',
          )}
          {stat(
            'On hold',
            onHold,
            <Pause className="size-5" aria-hidden />,
            'bg-warning-tint text-warning-ink',
            'text-warning',
          )}
          {stat(
            'Total open',
            rows.length,
            <Layers className="size-5" aria-hidden />,
            'bg-primary/12 text-primary',
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              placeholder="Search requisitions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          {/* Filters cluster — grouped tighter (gap-2) than the gap-3 that separates this
              cluster from the search box and the view toggle, so proximity signals the
              relationship: search finds, filters narrow, toggle changes layout. */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
              </SelectContent>
            </Select>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Account</SelectItem>
                {accountOptions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">More filters</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="replacement">Replacement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <SegmentedControl
              value={view}
              onValueChange={(v) => setView(v as 'board' | 'list')}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'list', label: 'List' },
              ]}
            />
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : view === 'list' ? (
          <DataTable
            columns={columns}
            data={filteredRows}
            isLoading={isLoading}
            getRowId={(r: RequisitionListRow) => r.id}
            enableGlobalFilter={false}
            pagination={{ defaultPageSize: 25, pageSizeOptions: [25, 50, 100] }}
            emptyState={
              <EmptyState
                icon={<Briefcase className="size-6" />}
                title={rows.length === 0 ? 'No requisitions yet' : 'No matching requisitions'}
                description={
                  rows.length === 0
                    ? 'Open a requisition to get started.'
                    : 'Try different filters.'
                }
              />
            }
            onRowClick={(row) =>
              void navigate({
                to: '/hiring/requisitions',
                search: (prev: Record<string, unknown>) => ({
                  ...prev,
                  selectedRequisitionId: row.original.id,
                }),
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
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="size-6" />}
            title={rows.length === 0 ? 'No requisitions yet' : 'No matching requisitions'}
            description={
              rows.length === 0 ? 'Open a requisition to get started.' : 'Try different filters.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredRows.map((r) => (
              <RequisitionCard key={r.id} r={r} canManage={canManage} canClose={canClose} />
            ))}
          </div>
        )}
      </div>
    </PageChrome>
  );
}
