import { Button, DataTable, EmptyState, Input, Label, toast } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fetchProjectAccess, type ProjectAccessRow, setProjectAccess } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

const SELECT_CLS =
  'flex h-9 w-full rounded-md border border-stroke bg-surface px-3 py-1 text-sm text-ink shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export function ProjectAccessSection({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: pmKeys.projectAccess(projectId),
    queryFn: () => fetchProjectAccess(projectId),
  });
  const [worker, setWorker] = useState('');
  const [level, setLevel] = useState<ProjectAccessRow['level']>('view');

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.projectAccess(projectId) });
  }

  const save = useMutation({
    mutationFn: (grants: ProjectAccessRow[]) => setProjectAccess(projectId, grants),
    onSuccess: () => {
      toast.success('Access updated');
      setWorker('');
      invalidate();
    },
    onError: (e: Error & { status?: number }) => {
      if (e.status === 409 || e.status === 400) {
        toast.error(`Owner invariant: ${e.message}`);
      } else {
        toast.error(e.message);
      }
    },
  });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: ProjectAccessRow } };
    return [
      {
        id: 'worker_id',
        accessorKey: 'worker_id',
        header: 'Worker',
        cell: ({ row }: CellCtx) => (
          <span className="font-mono text-caption text-ink-muted truncate block">
            {row.original.worker_id}
          </span>
        ),
      },
      {
        id: 'level',
        accessorKey: 'level',
        header: 'Level',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink capitalize">{row.original.level}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: CellCtx) =>
          canManage ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                save.mutate((data ?? []).filter((g) => g.worker_id !== row.original.worker_id))
              }
            >
              Remove
            </Button>
          ) : null,
      },
    ];
  }, [canManage, data, save]);

  return (
    <section className="space-y-3">
      <h3 className="text-ink font-medium">Project access</h3>
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        getRowId={(r: ProjectAccessRow) => r.worker_id}
        emptyState={
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="No grants"
            description="Grant Owner/Edit/View to team members."
          />
        }
      />
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Label>Worker id</Label>
            <Input value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="uuid" />
          </div>
          <div className="space-y-1 w-32">
            <Label>Level</Label>
            <select
              className={SELECT_CLS}
              value={level}
              onChange={(e) => setLevel(e.target.value as ProjectAccessRow['level'])}
            >
              <option value="owner">Owner</option>
              <option value="edit">Edit</option>
              <option value="view">View</option>
            </select>
          </div>
          <Button
            onClick={() =>
              save.mutate([
                ...(data ?? []).filter((g) => g.worker_id !== worker),
                { worker_id: worker, level },
              ])
            }
            disabled={save.isPending || !worker.trim()}
          >
            Add
          </Button>
        </div>
      )}
    </section>
  );
}
