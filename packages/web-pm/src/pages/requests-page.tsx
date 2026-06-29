import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
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
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Gavel,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  type CharterListQuery,
  type CharterListRow,
  type CharterStatus,
  fetchAccounts,
  fetchCharterSummary,
  fetchCharters,
} from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';
import { CharterStepper } from './charter-stepper.tsx';
import { SubmitCharterDialog } from './submit-charter-dialog.tsx';

export interface RequestsSearch {
  view?: 'cards' | 'table';
  status?: CharterStatus;
  account?: string;
  q?: string;
  sort?: NonNullable<CharterListQuery['sort']>;
  dir?: NonNullable<CharterListQuery['dir']>;
  page?: number;
}

const PAGE_SIZE = 25;

const STATUS_META: Record<
  CharterListRow['status'],
  { label: string; variant: 'secondary' | 'success' | 'destructive' | 'outline' }
> = {
  submitted: { label: 'Awaiting PMO review', variant: 'secondary' },
  pmo_approved: { label: 'Awaiting BoD review', variant: 'secondary' },
  approved: { label: 'Approved · created', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  withdrawn: { label: 'Withdrawn', variant: 'outline' },
};

const STATUS_OPTIONS: ReadonlyArray<{ value: CharterStatus; label: string }> = [
  { value: 'submitted', label: 'Awaiting PMO' },
  { value: 'pmo_approved', label: 'Awaiting BoD' },
  { value: 'approved', label: 'Approved · created' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const SORT_OPTIONS: ReadonlyArray<{ value: NonNullable<RequestsSearch['sort']>; label: string }> = [
  { value: 'submitted', label: 'Submitted date' },
  { value: 'name', label: 'Project name' },
  { value: 'budget', label: 'Budget (BMM)' },
  { value: 'team', label: 'Team size' },
];

const METHODOLOGY_LABEL: Record<string, string> = { scrum: 'Scrum', kanban: 'Kanban' };
const PRICING_LABEL: Record<string, string> = { fixed_price: 'Fixed-price', time_materials: 'T&M' };

function Kpi({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warning' | 'positive';
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}) {
  const color =
    tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'positive'
        ? 'var(--color-success)'
        : 'var(--color-ink-muted)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="text-left transition-transform enabled:hover:-translate-y-px"
    >
      <Card
        className={[
          'h-full transition-shadow',
          active ? 'border-blue ring-1 ring-blue/30' : '',
          onClick ? 'enabled:hover:shadow-sm hover:border-blue/40' : '',
        ].join(' ')}
      >
        <CardContent className="flex items-center justify-between gap-3 p-3.5">
          <div className="min-w-0">
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-ink-muted">
              {label}
            </div>
            <div
              className="mt-1 text-[26px] font-semibold leading-none tabular-nums"
              style={{ color }}
            >
              {value}
            </div>
            {sub && <div className="mt-1.5 text-[11px] text-ink-muted">{sub}</div>}
          </div>
          <span
            className="grid size-9 flex-shrink-0 place-items-center rounded-[10px]"
            style={{
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              color,
            }}
          >
            <Icon className="size-[18px]" />
          </span>
        </CardContent>
      </Card>
    </button>
  );
}

const STATUS_ACCENT: Record<CharterListRow['status'], string> = {
  submitted: 'var(--color-warning)',
  pmo_approved: 'var(--color-warning)',
  approved: 'var(--color-success)',
  rejected: 'var(--color-danger)',
  withdrawn: 'var(--color-hairline)',
};

function RequestCard({
  row,
  accountName,
  pmName,
  onOpen,
}: {
  row: CharterListRow;
  accountName: string;
  pmName: string;
  onOpen: () => void;
}) {
  const meta = [
    `PM ${pmName}`,
    row.budget_bmm != null && Number(row.budget_bmm) > 0 ? `${Number(row.budget_bmm)} BMM` : null,
    row.team_size != null ? `Team ${row.team_size}` : null,
    row.methodology ? METHODOLOGY_LABEL[row.methodology] : null,
    row.pricing_model ? PRICING_LABEL[row.pricing_model] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const status = STATUS_META[row.status];
  return (
    <button type="button" onClick={onOpen} className="group block w-full text-left">
      <Card
        className="overflow-hidden border-l-[3px] transition-shadow hover:border-blue/40 hover:shadow-sm"
        style={{ borderLeftColor: STATUS_ACCENT[row.status] }}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] text-ink-muted">
                  #{row.charter_id.slice(0, 8)}
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                  {accountName}
                </span>
              </div>
              <div className="mt-1.5 truncate text-[15px] font-semibold text-ink">{row.name}</div>
              <div className="mt-0.5 truncate text-body-sm text-ink-muted">{meta}</div>
            </div>
            <div className="flex flex-shrink-0 items-start gap-2">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-ink-muted">Submitted</div>
                <div className="font-mono text-[13px] font-semibold text-ink">
                  {row.created_at.slice(0, 10)}
                </div>
              </div>
              <ChevronRight className="mt-0.5 size-4 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </div>
          <div className="border-t border-hairline pt-3">
            <CharterStepper
              status={row.status}
              rejectedStage={row.rejected_stage}
              variant="compact"
            />
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export function RequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canSubmit = usePermission('pm.charter.submit');
  const search = useSearch({ strict: false }) as Partial<RequestsSearch>;
  const view = search.view ?? 'cards';
  const status = search.status;
  const account = search.account;
  const q = search.q;
  const sort = search.sort ?? 'submitted';
  const dir = search.dir ?? 'desc';
  const page = search.page ?? 1;

  const update = (patch: Partial<RequestsSearch>, resetPage = true) => {
    const next: Partial<RequestsSearch> = { ...search, ...patch };
    if (resetPage && !('page' in patch)) next.page = 1;
    void navigate({ to: '/pm/requests', search: next, replace: true });
  };

  // Debounced free-text search synced to the URL.
  const [searchInput, setSearchInput] = useState(q ?? '');
  useEffect(() => {
    setSearchInput(q ?? '');
  }, [q]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce fires on searchInput only; q/update are read fresh each tick by design
  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = searchInput.trim();
      if ((q ?? '') !== trimmed) update({ q: trimmed || undefined });
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params: CharterListQuery = {
    status,
    account_id: account,
    q,
    sort,
    dir,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.chartersList(params as Record<string, unknown>),
    queryFn: () => fetchCharters(params),
  });
  const { data: summary } = useQuery({
    queryKey: pmKeys.charterSummary(),
    queryFn: fetchCharterSummary,
  });
  const { data: accounts } = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });

  const rows = useMemo(() => data?.charters ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const accountName = useMemo(() => {
    const m = new Map((accounts ?? []).map((a) => [a.account_id, a.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [accounts]);

  const workerPicker = useWorkerSearch();
  const pmIds = useMemo(
    () => [...new Set(rows.map((r) => r.pm_worker_id).filter((id): id is string => !!id))],
    [rows],
  );
  const { data: resolvedPms } = useQuery({
    queryKey: ['people', 'worker-resolve-requests', pmIds.slice().sort()],
    queryFn: () => workerPicker.resolveByIds(pmIds),
    enabled: pmIds.length > 0,
  });
  const pmName = useMemo(() => {
    const m = new Map((resolvedPms ?? []).map((o) => [o.value, o.label]));
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : '—');
  }, [resolvedPms]);

  const open = (charterId: string) =>
    void navigate({ to: '/pm/requests/$charterId', params: { charterId } });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: CharterListRow } };
    return [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Project',
        cell: ({ row }: CellCtx) => (
          <span className="font-medium text-ink">{row.original.name}</span>
        ),
      },
      {
        id: 'account',
        header: 'Account',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{accountName(row.original.account_id)}</span>
        ),
      },
      {
        id: 'pm',
        header: 'PM',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{pmName(row.original.pm_worker_id)}</span>
        ),
      },
      {
        id: 'budget',
        header: 'Budget',
        cell: ({ row }: CellCtx) => (
          <span className="font-mono text-caption text-ink-muted">
            {row.original.budget_bmm != null ? `${Number(row.original.budget_bmm)} BMM` : '—'}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: CellCtx) => {
          const meta = STATUS_META[row.original.status];
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
      },
      {
        id: 'submitted',
        header: 'Submitted',
        cell: ({ row }: CellCtx) => (
          <span className="font-mono text-caption text-ink-muted">
            {row.original.created_at.slice(0, 10)}
          </span>
        ),
      },
    ];
  }, [accountName, pmName]);

  const actions = canSubmit ? (
    <SubmitCharterDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: pmKeys.charters() })}
    />
  ) : undefined;

  const filtered = status != null || account != null || (q ?? '') !== '';

  return (
    <PageChrome
      title="Project Requests"
      subtitle="Project Monitoring · Governance — a PM submits a charter → PMO sign-off → BoD approval → the project is created in the portfolio → staffing & access (R&R) is granted per person."
      actions={actions}
    >
      <div className="page-container space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Total requests" value={String(summary?.total ?? 0)} icon={FileText} />
          <Kpi
            label="Awaiting PMO"
            value={String(summary?.submitted ?? 0)}
            sub="PMO sign-off required"
            tone="warning"
            icon={Clock}
            active={status === 'submitted'}
            onClick={() => update({ status: status === 'submitted' ? undefined : 'submitted' })}
          />
          <Kpi
            label="Awaiting BoD"
            value={String(summary?.pmo_approved ?? 0)}
            sub="Board approval required"
            tone="warning"
            icon={Gavel}
            active={status === 'pmo_approved'}
            onClick={() =>
              update({ status: status === 'pmo_approved' ? undefined : 'pmo_approved' })
            }
          />
          <Kpi
            label="Approved · created"
            value={String(summary?.approved ?? 0)}
            sub={`${summary?.rejected ?? 0} rejected`}
            tone="positive"
            icon={CheckCircle2}
            active={status === 'approved'}
            onClick={() => update({ status: status === 'approved' ? undefined : 'approved' })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status ?? 'all'}
            onValueChange={(v) =>
              update({ status: v === 'all' ? undefined : (v as CharterStatus) })
            }
          >
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={account ?? 'all'}
            onValueChange={(v) => update({ account: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {(accounts ?? []).map((a) => (
                <SelectItem key={a.account_id} value={a.account_id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search project name…"
            className="w-[220px]"
          />

          <div className="ml-auto flex items-center gap-2">
            <Select
              value={sort}
              onValueChange={(v) => update({ sort: v as RequestsSearch['sort'] })}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              size="icon"
              aria-label={dir === 'asc' ? 'Ascending' : 'Descending'}
              onClick={() => update({ dir: dir === 'asc' ? 'desc' : 'asc' })}
            >
              {dir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
            </Button>
            <SegmentedControl
              value={view}
              onValueChange={(v) => update({ view: v as 'cards' | 'table' }, false)}
              options={[
                { value: 'cards', label: 'Cards' },
                { value: 'table', label: 'Table' },
              ]}
            />
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title={filtered ? 'No requests match these filters' : 'No requests yet'}
            description={
              filtered
                ? 'Try clearing the status, account, or search filters.'
                : 'Submit a project charter to get started.'
            }
            action={
              filtered
                ? {
                    label: 'Clear filters',
                    onClick: () => update({ status: undefined, account: undefined, q: undefined }),
                  }
                : undefined
            }
          />
        ) : view === 'table' ? (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            getRowId={(r: CharterListRow) => r.charter_id}
            onRowClick={(row) => open(row.original.charter_id)}
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <RequestCard
                key={r.charter_id}
                row={r}
                accountName={accountName(r.account_id)}
                pmName={pmName(r.pm_worker_id)}
                onOpen={() => open(r.charter_id)}
              />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-end gap-3">
            <span className="text-caption text-ink-muted">
              Page {page} of {pageCount} · {total} total
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => update({ page: page - 1 }, false)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => update({ page: page + 1 }, false)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </PageChrome>
  );
}
