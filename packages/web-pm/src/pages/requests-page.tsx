import { Alert, AlertDescription, Badge, DataTable, EmptyState, PageChrome } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';
import { useMemo } from 'react';
import { type CharterListRow, fetchCharters } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

const STATUS_VARIANT: Record<
  CharterListRow['status'],
  'secondary' | 'success' | 'destructive' | 'outline'
> = {
  submitted: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  withdrawn: 'outline',
};

export function RequestsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.charters(),
    queryFn: fetchCharters,
  });

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
        cell: ({ row }: CellCtx) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
        ),
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

  return (
    <PageChrome title="Requests">
      <div className="page-container space-y-4 p-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
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
