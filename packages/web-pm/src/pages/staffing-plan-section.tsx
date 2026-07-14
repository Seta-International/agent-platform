import { Button, DataTable, EmptyState, Input, NumberInput, toast } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  deleteStaffingPlanLine,
  fetchStaffingPlan,
  type StaffingPlanLine,
  upsertStaffingPlanLine,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

export function StaffingPlanSection({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: pmKeys.staffingPlan(projectId),
    queryFn: () => fetchStaffingPlan(projectId),
  });
  const [role, setRole] = useState('');
  const [effort, setEffort] = useState('');

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.staffingPlan(projectId) });
  }

  const add = useMutation({
    mutationFn: () =>
      upsertStaffingPlanLine(projectId, {
        role,
        effort_mm: effort ? Number(effort) : undefined,
      }),
    onSuccess: () => {
      toast.success('Line added');
      setRole('');
      setEffort('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: ({ lineId, version }: { lineId: string; version: number }) =>
      deleteStaffingPlanLine(projectId, lineId, version),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error & { status?: number }) => {
      if (e.status === 409) {
        toast.error('Line was modified concurrently — refreshing');
        invalidate();
      } else {
        toast.error(e.message);
      }
    },
  });

  const columns = useMemo(() => {
    type CellCtx = { row: { original: StaffingPlanLine } };
    return [
      {
        id: 'role',
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }: CellCtx) => <span className="text-ink">{row.original.role}</span>,
      },
      {
        id: 'effort_mm',
        accessorKey: 'effort_mm',
        header: 'Effort (MM)',
        cell: ({ row }: CellCtx) => (
          <span className="text-ink-muted">{row.original.effort_mm ?? '—'}</span>
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
                remove.mutate({ lineId: row.original.line_id, version: row.original.version })
              }
            />
          ) : null,
      },
    ];
  }, [canManage, remove]);

  return (
    <section className="space-y-3">
      <h3 className="text-ink font-medium">Staffing plan</h3>
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        getRowId={(r: StaffingPlanLine) => r.line_id}
        emptyState={
          <EmptyState
            icon={<Users className="size-6" />}
            title="No plan lines"
            description="Add the roles this project needs."
          />
        }
      />
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Input label="Role" value={role} onChange={(value) => setRole(value)} />
          </div>
          <NumberInput
            label="Effort (MM)"
            min={0}
            step={0.25}
            width={128}
            value={effort === '' ? null : Number(effort)}
            onChange={(v) => setEffort(String(v))}
          />
          <Button
            label="Add"
            onClick={() => add.mutate()}
            isDisabled={add.isPending || !role.trim()}
          />
        </div>
      )}
    </section>
  );
}
