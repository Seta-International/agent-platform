import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AsyncCombobox,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  Combobox,
  type ComboboxOption,
  DataTable,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Input,
  Label,
  PageChrome,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
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
type Bucket = (typeof BUCKETS)[number];

const mmLabel = (pct: number | null | undefined) => ((pct ?? 0) / 100).toFixed(1);

function bucketBadge(bucket: Bucket) {
  const variant = bucket === 'billable' ? 'success' : bucket === 'bench' ? 'warning' : 'secondary';
  const label = bucket === 'billable' ? 'Billable' : bucket === 'bench' ? 'Bench' : 'Internal';
  return (
    <Badge variant={variant} className="font-normal capitalize">
      {label}
    </Badge>
  );
}

type AllocationDraft = {
  planned_pct?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  bucket?: Bucket;
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
  tone?: 'positive' | 'warning' | 'accent';
}) {
  const color =
    tone === 'positive'
      ? 'var(--color-success)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'accent'
          ? 'var(--color-danger)'
          : undefined;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
        <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
          {value}
        </div>
        {sub ? <div className="text-[11px] text-ink-muted">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function AddAllocationDialog({
  projectOptions,
  defaultProjectId,
  defaultFrom,
  defaultTo,
  onCreated,
}: {
  projectOptions: ComboboxOption[];
  defaultProjectId: string;
  defaultFrom: string;
  defaultTo: string;
  onCreated: () => void;
}) {
  const workerPicker = useWorkerSearch();
  const [open, setOpen] = useState(false);
  const [worker, setWorker] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [planned, setPlanned] = useState(100);
  const [bucket, setBucket] = useState<Bucket>('billable');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [note, setNote] = useState('');

  function reset() {
    setWorker(null);
    setProjectId(defaultProjectId);
    setPlanned(100);
    setBucket('billable');
    setFrom(defaultFrom);
    setTo(defaultTo);
    setNote('');
  }

  const mutation = useMutation({
    mutationFn: () =>
      createAllocation({
        project_id: projectId,
        worker_id: worker as string,
        planned_pct: planned,
        date_from: from,
        date_to: to,
        bucket,
        status: 'committed',
        note: note.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Allocation added');
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" />
          Add allocation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add allocation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Person</Label>
            <AsyncCombobox
              value={worker}
              onChange={setWorker}
              search={workerPicker.search}
              resolveByIds={workerPicker.resolveByIds}
              placeholder="Search people…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <Combobox
              options={projectOptions}
              value={projectId || null}
              onChange={(v) => setProjectId(v ?? '')}
              placeholder="Select project…"
              searchPlaceholder="Search projects…"
              className="w-full"
              aria-label="Project"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Planned effort (MM/mo)</Label>
              <Select value={String(planned)} onValueChange={(v) => setPlanned(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANNED_OPTIONS.map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {(v / 100).toFixed(1)} MM
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={bucket} onValueChange={(v) => setBucket(v as Bucket)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billable">Billable</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="bench">Bench</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. rolls off in August"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!worker || !projectId || !from || !to || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RaMonitoringPage() {
  const qc = useQueryClient();
  const canManage = usePermission('pm.project.manage');

  const thisYear = new Date().getFullYear();
  const yearFrom = `${thisYear}-01-01`;
  const yearTo = `${thisYear}-12-31`;
  const [accountId, setAccountId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [activeFrom, setActiveFrom] = useState<string>(yearFrom);
  const [activeTo, setActiveTo] = useState<string>(yearTo);

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
  const accountOptions = useMemo<ComboboxOption[]>(
    () => (accounts ?? []).map((a) => ({ value: a.account_id, label: a.name })),
    [accounts],
  );
  const projectOptions = useMemo<ComboboxOption[]>(
    () => visibleProjects.map((p) => ({ value: p.project_id, label: p.name })),
    [visibleProjects],
  );
  const kpis = useMemo(() => rollupKpis(allocations, win), [allocations, win]);
  const hasFilters =
    accountId !== '' || projectId !== '' || activeFrom !== yearFrom || activeTo !== yearTo;

  const invalidate = () => void qc.invalidateQueries({ queryKey: [...pmKeys.all, 'allocations'] });

  const [confirmTarget, setConfirmTarget] = useState<RaMonitoringAllocation | null>(null);

  const removeMut = useMutation({
    mutationFn: (id: string) => removeAllocation(id),
    onSuccess: () => {
      toast.success('Allocation removed');
      setConfirmTarget(null);
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
      setDraft({});
      invalidate();
    },
    onError: (e: Error & { status?: number }) =>
      toast.error(e.status === 409 ? 'Changed by someone else — refresh and retry.' : e.message),
  });

  const columns = useMemo(() => {
    type Ctx = { row: { original: RaMonitoringAllocation } };
    const nameOf = (id: string | null) => (id ? (workers?.get(id)?.full_name ?? id) : null);
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
        cell: ({ row }: Ctx) => <span className="text-ink">{row.original.project_name}</span>,
      },
      {
        id: 'name',
        header: 'Person',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          const name = nameOf(r.worker_id);
          return (
            <div className="flex items-center gap-2">
              {name ? (
                <span className="font-medium text-ink">{name}</span>
              ) : (
                <span className="italic text-ink-subtle">Unfilled (TBD)</span>
              )}
              {r.status !== 'committed' ? (
                <Badge variant="outline" className="font-normal capitalize text-ink-subtle">
                  {r.status}
                </Badge>
              ) : null}
            </div>
          );
        },
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
        header: 'Planned (MM/mo)',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          if (editing === r.allocation_id) {
            return (
              <Select
                value={String(draft.planned_pct ?? r.planned_pct ?? 100)}
                onValueChange={(v) => setDraft((d) => ({ ...d, planned_pct: Number(v) }))}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANNED_OPTIONS.map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {(v / 100).toFixed(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          return <span className="font-mono tabular-nums text-ink">{mmLabel(r.planned_pct)}</span>;
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
              className="h-8 w-36"
              value={draft.date_from ?? r.date_from ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, date_from: e.target.value }))}
            />
          ) : (
            <span className="font-mono text-caption text-ink-muted">{r.date_from ?? '—'}</span>
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
              className="h-8 w-36"
              value={draft.date_to ?? r.date_to ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, date_to: e.target.value }))}
            />
          ) : (
            <span className="font-mono text-caption text-ink-muted">{r.date_to ?? '—'}</span>
          );
        },
      },
      {
        id: 'effort',
        header: 'Calendar effort',
        cell: ({ row }: Ctx) => (
          <span className="font-mono font-semibold tabular-nums text-ink">
            {clippedCalendarEffort(row.original, win).toFixed(1)}
          </span>
        ),
      },
      {
        id: 'bucket',
        header: 'Type',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          if (editing === r.allocation_id) {
            return (
              <Select
                value={draft.bucket ?? r.bucket}
                onValueChange={(v) => setDraft((d) => ({ ...d, bucket: v as Bucket }))}
              >
                <SelectTrigger className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billable">Billable</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="bench">Bench</SelectItem>
                </SelectContent>
              </Select>
            );
          }
          return bucketBadge(r.bucket);
        },
      },
      {
        id: 'note',
        header: 'Note',
        cell: ({ row }: Ctx) => {
          const r = row.original;
          return editing === r.allocation_id ? (
            <Input
              className="h-8 w-44"
              value={draft.note ?? r.note ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          ) : (
            <span className="text-caption text-ink-muted">{r.note ?? '—'}</span>
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
              <div className="flex justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Save"
                  disabled={saveMut.isPending}
                  onClick={() =>
                    saveMut.mutate({
                      id: r.allocation_id,
                      patch: { ...draft, expected_version: r.version },
                    })
                  }
                >
                  <Check className="size-4 text-[var(--color-success)]" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel"
                  onClick={() => {
                    setEditing(null);
                    setDraft({});
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          }
          return (
            <div className="flex justify-end gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Edit"
                onClick={() => {
                  setEditing(r.allocation_id);
                  setDraft({});
                }}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete"
                onClick={() => setConfirmTarget(r)}
              >
                <Trash2 className="size-4 text-ink-subtle" />
              </Button>
            </div>
          );
        },
      },
    ];
  }, [editing, draft, win, workers, canManage, saveMut]);

  const scopeLabel = projectId
    ? (visibleProjects.find((p) => p.project_id === projectId)?.name ?? '1 project')
    : 'All projects';

  return (
    <PageChrome
      title="RA Monitoring"
      actions={
        canManage ? (
          <AddAllocationDialog
            projectOptions={projectOptions}
            defaultProjectId={projectId}
            defaultFrom={activeFrom}
            defaultTo={activeTo}
            onCreated={invalidate}
          />
        ) : undefined
      }
    >
      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Calendar effort"
            value={`${kpis.total_mm.toFixed(1)} MM`}
            sub="in active window"
          />
          <Kpi
            label="Billable"
            value={`${kpis.billable_mm.toFixed(1)} MM`}
            sub={`${kpis.billable_pct}% of effort`}
            tone="positive"
          />
          <Kpi label="People allocated" value={String(kpis.people)} sub="distinct" />
          <Kpi label="Scope" value={scopeLabel} sub={`${visibleProjects.length} projects`} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            className="h-8 w-52"
            aria-label="Account"
            placeholder="All accounts"
            searchPlaceholder="Search accounts…"
            options={accountOptions}
            value={accountId || null}
            onChange={(v) => {
              setAccountId(v ?? '');
              setProjectId('');
            }}
          />
          <Combobox
            className="h-8 w-52"
            aria-label="Project"
            placeholder="All projects"
            searchPlaceholder="Search projects…"
            options={projectOptions}
            value={projectId || null}
            onChange={(v) => setProjectId(v ?? '')}
          />
          <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 text-ink-muted">
            <CalendarRange className="size-3.5 text-ink-subtle" />
            <Input
              type="date"
              aria-label="Active from"
              className="h-8 w-[7.5rem] border-0 bg-transparent px-1 focus-visible:ring-0"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
            />
            <span className="text-ink-subtle">→</span>
            <Input
              type="date"
              aria-label="Active to"
              className="h-8 w-[7.5rem] border-0 bg-transparent px-1 focus-visible:ring-0"
              value={activeTo}
              onChange={(e) => setActiveTo(e.target.value)}
            />
          </div>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-ink-muted"
              onClick={() => {
                setAccountId('');
                setProjectId('');
                setActiveFrom(yearFrom);
                setActiveTo(yearTo);
              }}
            >
              <X className="size-3.5" />
              Clear
            </Button>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          data={allocations}
          isLoading={isLoading}
          density="compact"
          getRowId={(r: RaMonitoringAllocation) => r.allocation_id}
          emptyState={
            <EmptyState
              icon={<Users className="size-6" />}
              title="No allocations in view"
              description={
                canManage
                  ? 'Adjust the filters, or add an allocation to staff someone onto a project.'
                  : 'Adjust the account, project, or active-period filters.'
              }
            />
          }
        />
      </div>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove allocation?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? `This removes ${
                    confirmTarget.worker_id
                      ? (workers?.get(confirmTarget.worker_id)?.full_name ?? 'this person')
                      : 'this unfilled seat'
                  } from ${confirmTarget.project_name}. The allocation is ended for People's view; this can't be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={removeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmTarget) removeMut.mutate(confirmTarget.allocation_id);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageChrome>
  );
}
