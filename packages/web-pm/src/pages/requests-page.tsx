import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  PageChrome,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';
import { useMemo } from 'react';
import { type CharterListRow, fetchCharters } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import { SubmitCharterDialog } from './submit-charter-dialog.tsx';

const STATUS_META: Record<
  CharterListRow['status'],
  { label: string; variant: 'secondary' | 'success' | 'destructive' | 'outline' }
> = {
  submitted: { label: 'Awaiting PMO', variant: 'secondary' },
  pmo_approved: { label: 'Awaiting BoD', variant: 'secondary' },
  approved: { label: 'Approved · created', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  withdrawn: { label: 'Withdrawn', variant: 'outline' },
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

export function RequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canSubmit = usePermission('pm.charter.submit');
  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.charters(),
    queryFn: fetchCharters,
  });

  const rows = data ?? [];
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
          <span className="font-mono text-caption text-ink-muted truncate block">
            {row.original.pm_worker_id ?? '—'}
          </span>
        ),
      },
    ];
  }, []);

  const actions = canSubmit ? (
    <SubmitCharterDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: pmKeys.charters() })}
    />
  ) : undefined;

  return (
    <PageChrome title="Requests" actions={actions}>
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
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : (
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
            onRowClick={(row) =>
              void navigate({
                to: '/pm/requests/$charterId',
                params: { charterId: row.original.charter_id },
              })
            }
          />
        )}
      </div>
    </PageChrome>
  );
}
