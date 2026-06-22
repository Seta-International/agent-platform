import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  PageChrome,
  SegmentedControl,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type CharterListRow, fetchAccounts, fetchCharters } from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';
import { CharterStepper } from './charter-stepper.tsx';
import { SubmitCharterDialog } from './submit-charter-dialog.tsx';

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

const METHODOLOGY_LABEL: Record<string, string> = { scrum: 'Scrum', kanban: 'Kanban' };
const PRICING_LABEL: Record<string, string> = {
  fixed_price: 'Fixed-price',
  time_materials: 'T&M',
};

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warning' | 'positive';
}) {
  const color =
    tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'positive'
        ? 'var(--color-success)'
        : undefined;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
        <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
          {value}
        </div>
        {sub && <div className="text-[11px] text-ink-muted">{sub}</div>}
      </CardContent>
    </Card>
  );
}

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
    accountName,
    `PM ${pmName}`,
    row.budget_bmm != null ? `${Number(row.budget_bmm)} BMM` : null,
    row.team_size != null ? `Team ${row.team_size}` : null,
    row.methodology ? METHODOLOGY_LABEL[row.methodology] : null,
    row.pricing_model ? PRICING_LABEL[row.pricing_model] : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const status = STATUS_META[row.status];
  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <Card className="transition-colors hover:border-blue/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-4">
            <div className="min-w-[150px]">
              <div className="font-mono text-[13px] font-bold text-ink">
                {row.charter_id.slice(0, 8)}
              </div>
              <div className="mt-1.5">
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold text-ink">{row.name}</div>
              <div className="mt-0.5 text-body-sm text-ink-muted">{meta}</div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-[10px] uppercase tracking-wide text-ink-muted">Submitted</div>
              <div className="font-mono text-[13px] font-bold text-ink">
                {row.created_at.slice(0, 10)}
              </div>
            </div>
          </div>
          <CharterStepper status={row.status} rejectedStage={row.rejected_stage} />
        </CardContent>
      </Card>
    </button>
  );
}

export function RequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canSubmit = usePermission('pm.charter.submit');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const workerPicker = useWorkerSearch();

  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.charters(),
    queryFn: fetchCharters,
  });
  const { data: accounts } = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });

  const rows = useMemo(() => data ?? [], [data]);
  const accountName = useMemo(() => {
    const m = new Map((accounts ?? []).map((a) => [a.account_id, a.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [accounts]);

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

  const counts = useMemo(
    () => ({
      total: rows.length,
      pmo: rows.filter((r) => r.status === 'submitted').length,
      bod: rows.filter((r) => r.status === 'pmo_approved').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    }),
    [rows],
  );

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
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: CellCtx) => {
          const meta = STATUS_META[row.original.status];
          return <Badge variant={meta.variant}>{meta.label}</Badge>;
        },
      },
      {
        id: 'pm_worker_id',
        accessorKey: 'pm_worker_id',
        header: 'PM',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{pmName(row.original.pm_worker_id)}</span>
        ),
      },
    ];
  }, [accountName, pmName]);

  const actions = canSubmit ? (
    <SubmitCharterDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: pmKeys.charters() })}
    />
  ) : undefined;

  return (
    <PageChrome
      title="Project Requests"
      subtitle="Project Monitoring · Governance — a PM submits a charter → PMO sign-off → BoD approval → the project is created in the portfolio → staffing & access (R&R) is granted per person."
      actions={actions}
    >
      <div className="page-container space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Total requests" value={String(counts.total)} />
          <Kpi
            label="Awaiting PMO"
            value={String(counts.pmo)}
            sub="PMO sign-off required"
            tone="warning"
          />
          <Kpi
            label="Awaiting BoD"
            value={String(counts.bod)}
            sub="Board approval required"
            tone="warning"
          />
          <Kpi
            label="Approved · created"
            value={String(counts.approved)}
            sub={`${counts.rejected} rejected`}
            tone="positive"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-caption font-medium uppercase tracking-wide text-ink-muted">
            Project charters
          </div>
          <SegmentedControl
            value={view}
            onValueChange={(v) => setView(v as 'cards' | 'table')}
            options={[
              { value: 'cards', label: 'Cards' },
              { value: 'table', label: 'Table' },
            ]}
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : view === 'table' ? (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            getRowId={(r: CharterListRow) => r.charter_id}
            globalFilterPlaceholder="Search requests…"
            emptyState={
              <EmptyState
                icon={<ClipboardList className="size-6" />}
                title="No requests yet"
                description="Submit a project charter to get started."
              />
            }
            onRowClick={(row) => open(row.original.charter_id)}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title="No requests yet"
            description="Submit a project charter to get started."
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
      </div>
    </PageChrome>
  );
}
