import { AsyncCombobox, Button, DataTable, Input, PageChrome, toast } from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  createAllocation,
  fetchAccounts,
  fetchAllocations,
  fetchProjects,
  fetchWorkersByIds,
  type RaMonitoringAllocation,
  removeAllocation,
  updateAllocation,
} from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search.ts';
import { pmKeys } from '../state/query-keys.ts';
import { clippedCalendarEffort, type EffortWindow, rollupKpis } from './ra-effort.ts';

const PLANNED_OPTIONS = [20, 50, 80, 100];
const BUCKETS = ['billable', 'internal', 'bench'] as const;

type AllocationDraft = {
  planned_pct?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  bucket?: 'billable' | 'internal' | 'bench';
  note?: string | null;
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
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-caption text-ink-muted">{label}</div>
      <div className={`text-title font-semibold ${tone ?? 'text-ink'}`}>{value}</div>
      {sub ? <div className="text-caption text-ink-muted">{sub}</div> : null}
    </div>
  );
}

export function RaMonitoringPage() {
  const qc = useQueryClient();
  const canManage = usePermission('pm.project.manage');
  const workerPicker = useWorkerSearch();

  const thisYear = new Date().getFullYear();
  const [accountId, setAccountId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [activeFrom, setActiveFrom] = useState<string>(`${thisYear}-01-01`);
  const [activeTo, setActiveTo] = useState<string>(`${thisYear}-12-31`);

  const win = useMemo<EffortWindow>(
    () => ({ from: activeFrom || undefined, to: activeTo || undefined }),
    [activeFrom, activeTo],
  );

  const params = useMemo(
    () => ({
      account_id: accountId || undefined,
      project_id: projectId || undefined,
      active_from: activeFrom || undefined,
      active_to: activeTo || undefined,
    }),
    [accountId, projectId, activeFrom, activeTo],
  );

  const { data: accounts } = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const { data: projects } = useQuery({ queryKey: pmKeys.projects(), queryFn: fetchProjects });
  const { data: rows, isLoading } = useQuery({
    queryKey: pmKeys.allocations(params),
    queryFn: () => fetchAllocations(params),
  });

  const allocations = useMemo(() => rows ?? [], [rows]);
  const workerIds = useMemo(
    () => allocations.map((r) => r.worker_id).filter((w): w is string => Boolean(w)),
    [allocations],
  );
  const { data: workers } = useQuery({
    queryKey: pmKeys.workersByIds(workerIds),
    queryFn: () => fetchWorkersByIds(workerIds),
    enabled: workerIds.length > 0,
  });

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p) => !accountId || p.account_id === accountId),
    [projects, accountId],
  );
  const kpis = useMemo(() => rollupKpis(allocations, win), [allocations, win]);

  const invalidate = () => void qc.invalidateQueries({ queryKey: [...pmKeys.all, 'allocations'] });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeAllocation(id),
    onSuccess: () => {
      toast.success('Allocation removed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AllocationDraft>({});

  const saveMut = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof updateAllocation>[1] }) =>
      updateAllocation(vars.id, vars.patch),
    onSuccess: () => {
      toast.success('Saved');
      setEditing(null);
      invalidate();
    },
    onError: (e: Error & { status?: number }) =>
      toast.error(e.status === 409 ? 'Changed by someone else — refresh and retry.' : e.message),
  });

  // add-row state
  const [newWorker, setNewWorker] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<string>('');
  const [newPlanned, setNewPlanned] = useState(100);
  const [newBucket, setNewBucket] = useState<(typeof BUCKETS)[number]>('billable');
  const [newFrom, setNewFrom] = useState(activeFrom);
  const [newTo, setNewTo] = useState(activeTo);
  const [newNote, setNewNote] = useState('');

  const addMut = useMutation({
    mutationFn: () =>
      createAllocation({
        project_id: newProject || projectId,
        worker_id: newWorker as string,
        planned_pct: newPlanned,
        date_from: newFrom,
        date_to: newTo,
        bucket: newBucket,
        status: 'committed',
        note: newNote || null,
      }),
    onSuccess: () => {
      toast.success('Allocation added');
      setNewWorker(null);
      setNewNote('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns = useMemo(() => {
    type Ctx = { row: { original: RaMonitoringAllocation } };
    const nameOf = (id: string | null) => (id ? (workers?.get(id)?.full_name ?? id) : 'TBD');
    const titleOf = (id: string | null) => (id ? (workers?.get(id)?.job_title ?? '—') : '—');

    return [
      {
        id: 'account',
        header: 'Account',
        cell: ({ row }: Ctx) => <span className="text-ink-muted">{row.original.account_name}</span>,
      },
      {
        id: 'project',
        header: 'Project',
        cell: ({ row }: Ctx) => <span className="text-ink-muted">{row.original.project_name}</span>,
      },
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }: Ctx) => (
          <span className="font-medium text-ink">{nameOf(row.original.worker_id)}</span>
        ),
      },
      {
        id: 'seniority',
        header: 'Seniority',
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{titleOf(row.original.worker_id)}</span>
        ),
      },
      {
        id: 'planned',
        header: 'Planned',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          if (editing === r.allocation_id) {
            return (
              <select
                className="rounded border border-line px-1 py-0.5"
                value={draft.planned_pct ?? r.planned_pct ?? 100}
                onChange={(e) => setDraft((d) => ({ ...d, planned_pct: Number(e.target.value) }))}
              >
                {PLANNED_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v / 100}
                  </option>
                ))}
              </select>
            );
          }
          return <span className="font-mono text-caption">{(r.planned_pct ?? 0) / 100}</span>;
        },
      },
      {
        id: 'start',
        header: 'Start',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          return editing === r.allocation_id ? (
            <Input
              type="date"
              value={draft.date_from ?? r.date_from ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, date_from: e.target.value }))}
            />
          ) : (
            <span className="font-mono text-caption">{r.date_from ?? '—'}</span>
          );
        },
      },
      {
        id: 'end',
        header: 'End',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          return editing === r.allocation_id ? (
            <Input
              type="date"
              value={draft.date_to ?? r.date_to ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, date_to: e.target.value }))}
            />
          ) : (
            <span className="font-mono text-caption">{r.date_to ?? '—'}</span>
          );
        },
      },
      {
        id: 'effort',
        header: 'Calendar effort',
        cell: ({ row }: Ctx) => (
          <span className="font-mono text-caption font-semibold">
            {clippedCalendarEffort(row.original, win).toFixed(1)}
          </span>
        ),
      },
      {
        id: 'bucket',
        header: 'Billable',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          if (editing === r.allocation_id) {
            return (
              <select
                className="rounded border border-line px-1 py-0.5"
                value={draft.bucket ?? r.bucket}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, bucket: e.target.value as (typeof BUCKETS)[number] }))
                }
              >
                {BUCKETS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            );
          }
          return <span className="text-ink-muted">{r.bucket}</span>;
        },
      },
      {
        id: 'note',
        header: 'Note',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          return editing === r.allocation_id ? (
            <Input
              value={draft.note ?? r.note ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          ) : (
            <span className="text-ink-muted">{r.note ?? '—'}</span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          if (!canManage) return null;
          if (editing === r.allocation_id) {
            return (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() =>
                    saveMut.mutate({
                      id: r.allocation_id,
                      patch: { ...draft, expected_version: r.version },
                    })
                  }
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setDraft({});
                  }}
                >
                  Cancel
                </Button>
              </div>
            );
          }
          return (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(r.allocation_id);
                  setDraft({});
                }}
              >
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeMut.mutate(r.allocation_id)}>
                Delete
              </Button>
            </div>
          );
        },
      },
    ];
  }, [editing, draft, win, workers, canManage, saveMut, removeMut]);

  return (
    <PageChrome title="RA Monitoring">
      <div className="page-container space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            label="Calendar effort"
            value={`${kpis.total_mm.toFixed(1)} MM`}
            sub="total in window"
          />
          <Kpi
            label="Billable"
            value={`${kpis.billable_mm.toFixed(1)} MM`}
            sub={`${kpis.billable_pct}% of effort`}
            tone="text-positive"
          />
          <Kpi label="People allocated" value={String(kpis.people)} />
          <Kpi
            label="Scope"
            value={
              projectId
                ? (visibleProjects.find((p) => p.project_id === projectId)?.name ?? '1 project')
                : 'All projects'
            }
            sub={`${visibleProjects.length} projects`}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-caption">
            Account
            <select
              className="ml-2 rounded border border-line px-2 py-1"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setProjectId('');
              }}
            >
              <option value="">All</option>
              {(accounts ?? []).map((a) => (
                <option key={a.account_id} value={a.account_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-caption">
            Project
            <select
              className="ml-2 rounded border border-line px-2 py-1"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All</option>
              {visibleProjects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2 text-caption">
            <span>From</span>
            <Input
              className="w-auto"
              type="date"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 text-caption">
            <span>To</span>
            <Input
              className="w-auto"
              type="date"
              value={activeTo}
              onChange={(e) => setActiveTo(e.target.value)}
            />
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-subtle p-3">
            <div className="min-w-56">
              <AsyncCombobox
                value={newWorker}
                onChange={setNewWorker}
                search={workerPicker.search}
                resolveByIds={workerPicker.resolveByIds}
                placeholder="Add person…"
              />
            </div>
            <select
              className="rounded border border-line px-2 py-1"
              value={newProject || projectId}
              onChange={(e) => setNewProject(e.target.value)}
            >
              <option value="">{projectId ? 'Filtered project' : 'Select project…'}</option>
              {visibleProjects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              className="rounded border border-line px-2 py-1"
              value={newPlanned}
              onChange={(e) => setNewPlanned(Number(e.target.value))}
            >
              {PLANNED_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v / 100}
                </option>
              ))}
            </select>
            <Input
              type="date"
              className="w-auto"
              value={newFrom}
              onChange={(e) => setNewFrom(e.target.value)}
            />
            <Input
              type="date"
              className="w-auto"
              value={newTo}
              onChange={(e) => setNewTo(e.target.value)}
            />
            <select
              className="rounded border border-line px-2 py-1"
              value={newBucket}
              onChange={(e) => setNewBucket(e.target.value as (typeof BUCKETS)[number])}
            >
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <Input
              className="w-44"
              placeholder="Note…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!newWorker || (!newProject && !projectId) || addMut.isPending}
              onClick={() => addMut.mutate()}
            >
              Add
            </Button>
          </div>
        ) : null}

        <DataTable
          columns={columns}
          data={allocations}
          isLoading={isLoading}
          getRowId={(r: RaMonitoringAllocation) => r.allocation_id}
        />
      </div>
    </PageChrome>
  );
}
