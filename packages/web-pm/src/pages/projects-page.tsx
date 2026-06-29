import { Alert, AlertDescription, Badge, DataTable, EmptyState, PageChrome } from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FolderKanban } from 'lucide-react';
import { useMemo } from 'react';
import { fetchProjects, type ProjectListRow } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

const STATUS_VARIANT: Record<
  ProjectListRow['status'],
  'default' | 'secondary' | 'success' | 'outline'
> = {
  active: 'success',
  on_hold: 'secondary',
  closed: 'outline',
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.projects(),
    queryFn: fetchProjects,
  });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: ProjectListRow } };
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
        id: 'phase',
        accessorKey: 'phase',
        header: 'Phase',
        cell: ({ row }: CellCtx) => <Badge variant="secondary">{row.original.phase}</Badge>,
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
    <PageChrome title="Projects">
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
            getRowId={(r: ProjectListRow) => r.project_id}
            globalFilterPlaceholder="Search projects…"
            emptyState={
              <EmptyState
                icon={<FolderKanban className="size-6" />}
                title="No projects yet"
                description="Approved charters become projects here."
              />
            }
            onRowClick={(row) =>
              void navigate({
                to: '/pm/projects/$projectId',
                params: { projectId: row.original.project_id },
              })
            }
          />
        )}
      </div>
    </PageChrome>
  );
}
