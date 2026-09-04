import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { editProject, type ProjectPatch } from '../api/pm-client.ts';
import { useWorkerSource } from '../api/worker-search.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  Button,
  pixel,
  proportional,
  type SearchableItem,
  Table,
  type TableColumn,
  Typeahead,
  useSeededItems,
  useToast,
} from './_ui-compat.tsx';

type LeadershipRoleKey = 'pm_worker_id' | 'pmo_worker_id';

interface LeadershipRow extends Record<string, unknown> {
  role_key: LeadershipRoleKey;
  role_label: string;
  worker_id: string | null;
}

function patchFor(roleKey: LeadershipRoleKey, workerId: string | null): ProjectPatch {
  return roleKey === 'pm_worker_id' ? { pm_worker_id: workerId } : { pmo_worker_id: workerId };
}

// Each project has at most one EM and one PMO — `project.pm_person_id`/`pmo_person_id` are
// single nullable columns, not a grants table like Project access. Reassigning requires an
// explicit Remove first: the Typeahead for a role only appears once its slot reads empty.
export function ProjectLeadershipSection({
  projectId,
  version,
  pmWorkerId,
  pmoWorkerId,
  canManage,
}: {
  projectId: string;
  version: number;
  pmWorkerId: string | null;
  pmoWorkerId: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const workerSource = useWorkerSource();
  const [picks, setPicks] = useState<Record<LeadershipRoleKey, SearchableItem | null>>({
    pm_worker_id: null,
    pmo_worker_id: null,
  });

  const [resolvedWorkers] = useSeededItems(
    [pmWorkerId, pmoWorkerId].filter((id): id is string => id !== null),
    workerSource.seed,
  );
  const nameOf = useMemo(() => {
    const m = new Map(resolvedWorkers.map((o) => [o.id, o.label]));
    return (id: string) => m.get(id) ?? id;
  }, [resolvedWorkers]);

  const save = useMutation({
    mutationFn: (patch: ProjectPatch) =>
      editProject(projectId, { expected_version: version, patch }),
    onSuccess: (_data, patch) => {
      toast({ body: 'Assignment updated' });
      setPicks((s) => ({
        pm_worker_id: patch.pm_worker_id !== undefined ? null : s.pm_worker_id,
        pmo_worker_id: patch.pmo_worker_id !== undefined ? null : s.pmo_worker_id,
      }));
      void queryClient.invalidateQueries({ queryKey: pmKeys.project(projectId) });
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const rows: LeadershipRow[] = [
    { role_key: 'pm_worker_id', role_label: 'EM', worker_id: pmWorkerId },
    { role_key: 'pmo_worker_id', role_label: 'PMO', worker_id: pmoWorkerId },
  ];

  const columns: TableColumn<LeadershipRow>[] = [
    {
      key: 'role_label',
      header: 'Role',
      width: pixel(80),
      renderCell: (r) => <span className="text-primary font-medium">{r.role_label}</span>,
    },
    {
      key: 'worker_id',
      header: 'Person',
      width: proportional(2),
      renderCell: (r) => {
        if (r.worker_id) {
          return <span className="text-sm text-primary truncate block">{nameOf(r.worker_id)}</span>;
        }
        if (!canManage) return <span className="text-sm text-secondary">Unassigned</span>;
        return (
          <Typeahead
            label={`Search ${r.role_label}`}
            isLabelHidden
            searchSource={workerSource.source}
            value={picks[r.role_key]}
            onChange={(item) => setPicks((s) => ({ ...s, [r.role_key]: item }))}
            placeholder="Search workers…"
          />
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: pixel(110),
      align: 'end',
      renderCell: (r) => {
        if (!canManage) return null;
        if (r.worker_id) {
          return (
            <Button
              size="sm"
              variant="ghost"
              label="Remove"
              onClick={() => save.mutate(patchFor(r.role_key, null))}
              isDisabled={save.isPending}
            />
          );
        }
        const picked = picks[r.role_key];
        return (
          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="size-4" />}
            label="Add"
            onClick={() => picked && save.mutate(patchFor(r.role_key, picked.id))}
            isDisabled={save.isPending || !picked}
          />
        );
      },
    },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-primary font-medium">Project leadership</h3>
      <Table data={rows} columns={columns} idKey="role_key" />
    </section>
  );
}
