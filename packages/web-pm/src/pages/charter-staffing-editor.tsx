import {
  AsyncCombobox,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  createAllocation,
  fetchProjectAccess,
  fetchProjectAllocations,
  type ProjectAccessRow,
  setProjectAccess,
} from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';

const ROLES = ['Developer', 'Tech Lead', 'PM', 'QA', 'BA', 'PMO'] as const;

export function CharterStaffingEditor({
  projectId,
  dateFrom,
  dateTo,
}: {
  projectId: string;
  dateFrom: string | null;
  dateTo: string | null;
}) {
  const queryClient = useQueryClient();
  const workerPicker = useWorkerSearch();

  const allocations = useQuery({
    queryKey: pmKeys.projectAllocations(projectId),
    queryFn: () => fetchProjectAllocations(projectId),
  });
  const access = useQuery({
    queryKey: pmKeys.projectAccess(projectId),
    queryFn: () => fetchProjectAccess(projectId),
  });

  const workerIds = useMemo(
    () => (allocations.data ?? []).map((a) => a.worker_id).filter((id): id is string => !!id),
    [allocations.data],
  );
  const { data: resolvedWorkers } = useQuery({
    queryKey: ['people', 'worker-resolve-staffing', workerIds.slice().sort()],
    queryFn: () => workerPicker.resolveByIds(workerIds),
    enabled: workerIds.length > 0,
  });

  const [worker, setWorker] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('Developer');
  const [pct, setPct] = useState(100);
  const [level, setLevel] = useState<ProjectAccessRow['level']>('edit');

  const nameOf = (id: string | null) =>
    (id && resolvedWorkers?.find((o) => o.value === id)?.label) || id || '—';
  const levelOf = (id: string | null) => access.data?.find((g) => g.worker_id === id)?.level ?? '—';

  const add = useMutation({
    mutationFn: async () => {
      await createAllocation({
        project_id: projectId,
        worker_id: worker,
        role,
        planned_pct: pct,
        date_from: dateFrom ?? new Date().toISOString().slice(0, 10),
        date_to: dateTo,
      });
      const current = access.data ?? [];
      const next = current
        .filter((g) => g.worker_id !== worker)
        .concat({ worker_id: worker, level });
      await setProjectAccess(projectId, next);
    },
    onSuccess: () => {
      toast.success('Staffed & access granted');
      setWorker('');
      void queryClient.invalidateQueries({ queryKey: pmKeys.projectAllocations(projectId) });
      void queryClient.invalidateQueries({ queryKey: pmKeys.projectAccess(projectId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staffing &amp; Access (R&amp;R)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-1 font-medium">Worker</th>
              <th className="font-medium">Role</th>
              <th className="text-center font-medium">RA %</th>
              <th className="font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {(allocations.data ?? []).map((a) => (
              <tr key={a.allocation_id} className="border-t border-hairline">
                <td className="py-1">{nameOf(a.worker_id)}</td>
                <td>{a.role ?? '—'}</td>
                <td className="text-center font-mono">{a.planned_pct ?? '—'}%</td>
                <td className="capitalize">{levelOf(a.worker_id)}</td>
              </tr>
            ))}
            {(allocations.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-ink-muted">
                  No one staffed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label>Worker</Label>
            <AsyncCombobox
              value={worker || null}
              onChange={(v) => setWorker(v ?? '')}
              search={workerPicker.search}
              resolveByIds={workerPicker.resolveByIds}
              placeholder="Search workers…"
            />
          </div>
          <div className="w-36 space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24 space-y-1">
            <Label>RA %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
            />
          </div>
          <div className="w-28 space-y-1">
            <Label>Access</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as ProjectAccessRow['level'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="view">View</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => add.mutate()} disabled={!worker.trim() || add.isPending}>
            {add.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
