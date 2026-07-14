import {
  AsyncCombobox,
  Button,
  DataTable,
  EmptyState,
  Label,
  Selector,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fetchProjectAccess, type ProjectAccessRow, setProjectAccess } from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';

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
  const workerPicker = useWorkerSearch();

  const { data: resolvedWorkers } = useQuery({
    queryKey: ['people', 'worker-resolve-access', (data ?? []).map((g) => g.worker_id).sort()],
    queryFn: () => workerPicker.resolveByIds((data ?? []).map((g) => g.worker_id)),
    enabled: (data ?? []).length > 0,
  });

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
      toast.error(e.message);
    },
  });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: ProjectAccessRow } };
    function nameOf(id: string): string {
      return resolvedWorkers?.find((o) => o.value === id)?.label ?? id;
    }
    return [
      {
        id: 'worker_id',
        accessorKey: 'worker_id',
        header: 'Worker',
        cell: ({ row }: CellCtx) => (
          <span className="text-caption text-ink truncate block">
            {nameOf(row.original.worker_id)}
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
              label="Remove"
              onClick={() =>
                save.mutate((data ?? []).filter((g) => g.worker_id !== row.original.worker_id))
              }
            />
          ) : null,
      },
    ];
  }, [canManage, data, resolvedWorkers, save]);

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
            <Label>Worker</Label>
            <AsyncCombobox
              value={worker || null}
              onChange={(v) => setWorker(v ?? '')}
              search={workerPicker.search}
              resolveByIds={workerPicker.resolveByIds}
              placeholder="Search workers…"
            />
          </div>
          <div className="space-y-1 w-32">
            <Label>Level</Label>
            <Selector
              label="Level"
              isLabelHidden
              options={[
                { value: 'owner', label: 'Owner' },
                { value: 'edit', label: 'Edit' },
                { value: 'view', label: 'View' },
              ]}
              value={level}
              onChange={(v) => setLevel(v as ProjectAccessRow['level'])}
            />
          </div>
          <Button
            label="Add"
            onClick={() =>
              save.mutate([
                ...(data ?? []).filter((g) => g.worker_id !== worker),
                { worker_id: worker, level },
              ])
            }
            isDisabled={save.isPending || !worker.trim()}
          />
        </div>
      )}
    </section>
  );
}
