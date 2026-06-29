import {
  Alert,
  AlertDescription,
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
import { AlertCircle, CalendarRange, Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import {
  createAllocation,
  fetchAccounts,
  fetchAllocations,
  fetchProjects,
  type RaMonitoringAllocation,
  removeAllocation,
  updateAllocation,
} from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  clippedCalendarEffort,
  type EffortWindow,
  overAllocatedWorkers,
  rollupKpis,
} from './ra-effort.ts';

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

/** Volatile per-row edit state passed via the table `meta` so column defs stay
 *  stable across keystrokes — otherwise editable inputs remount and lose focus. */
interface RaTableMeta {
  editing: string | null;
  draft: AllocationDraft;
  setDraft: Dispatch<SetStateAction<AllocationDraft>>;
  canManage: boolean;
  savePending: boolean;
  overWorkers: Set<string>;
  onEdit: (r: RaMonitoringAllocation) => void;
  onCancel: () => void;
  onSave: (r: RaMonitoringAllocation) => void;
  onDelete: (r: RaMonitoringAllocation) => void;
}

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
    mutation.reset();
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
          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          ) : null}
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
  const [search, setSearch] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [activeFrom, setActiveFrom] = useState<string>(yearFrom);
  const [activeTo, setActiveTo] = useState<string>(yearTo);

  const win = useMemo<EffortWindow>(
    () => ({ from: activeFrom || undefined, to: activeTo || undefined }),
    [activeFrom, activeTo],
  );

  // Debounce the free-text search before it drives the server query.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(
    () => ({
      account_id: accountId || undefined,
      project_id: projectId || undefined,
      active_from: activeFrom || undefined,
      active_to: activeTo || undefined,
      q: debouncedQ || undefined,
    }),
    [accountId, projectId, activeFrom, activeTo, debouncedQ],
  );

  const { data: accounts } = useQuery({ queryKey: pmKeys.accounts(), queryFn: fetchAccounts });
  const { data: projects } = useQuery({ queryKey: pmKeys.projects(), queryFn: fetchProjects });
  const { data: rows, isLoading } = useQuery({
    queryKey: pmKeys.allocations(params),
    queryFn: () => fetchAllocations(params),
  });

  const allocations = useMemo(() => rows ?? [], [rows]);

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
  const overWorkers = useMemo(() => overAllocatedWorkers(allocations, win), [allocations, win]);
  const hasFilters =
    search !== '' ||
    accountId !== '' ||
    projectId !== '' ||
    activeFrom !== yearFrom ||
    activeTo !== yearTo;

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

  const tableMeta = useMemo<RaTableMeta>(
    () => ({
      editing,
      draft,
      setDraft,
      canManage,
      savePending: saveMut.isPending,
      overWorkers,
      onEdit: (r) => {
        setEditing(r.allocation_id);
        setDraft({});
      },
      onCancel: () => {
        setEditing(null);
        setDraft({});
      },
      onSave: (r) =>
        saveMut.mutate({ id: r.allocation_id, patch: { ...draft, expected_version: r.version } }),
      onDelete: (r) => setConfirmTarget(r),
    }),
    [editing, draft, canManage, saveMut, overWorkers],
  );

  // Columns depend only on `win` (the effort accessor). All volatile edit state
  // is read from `table.options.meta`, so typing in a cell never rebuilds the
  // column defs — which would remount the inputs and drop focus.
  const columns = useMemo(() => {
    type Ctx = {
      row: { original: RaMonitoringAllocation };
      table: { options: { meta?: unknown } };
    };

    return [
      {
        id: 'account',
        header: 'Account',
        accessorFn: (r: RaMonitoringAllocation) => r.account_name,
        enableSorting: true,
        cell: ({ row }: Ctx) => <span className="text-ink-muted">{row.original.account_name}</span>,
      },
      {
        id: 'project',
        header: 'Project',
        accessorFn: (r: RaMonitoringAllocation) => r.project_name,
        enableSorting: true,
        cell: ({ row }: Ctx) => <span className="text-ink">{row.original.project_name}</span>,
      },
      {
        id: 'name',
        header: 'Person',
        accessorFn: (r: RaMonitoringAllocation) => r.worker_name ?? '',
        enableSorting: true,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          return (
            <div className="flex items-center gap-2">
              {r.worker_name ? (
                <span className="font-medium text-ink">{r.worker_name}</span>
              ) : r.worker_id ? (
                <span className="text-ink-subtle">Unknown</span>
              ) : (
                <span className="italic text-ink-subtle">Unfilled (TBD)</span>
              )}
              {r.status !== 'committed' ? (
                <Badge variant="outline" className="font-normal capitalize text-ink-subtle">
                  {r.status}
                </Badge>
              ) : null}
              {r.worker_id && m.overWorkers.has(r.worker_id) ? (
                <Badge variant="warning" className="font-normal">
                  Over-allocated
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'seniority',
        header: 'Seniority',
        accessorFn: (r: RaMonitoringAllocation) => r.worker_title ?? '',
        enableSorting: true,
        cell: ({ row }: Ctx) => (
          <span className="text-ink-muted">{row.original.worker_title ?? '—'}</span>
        ),
      },
      {
        id: 'planned',
        header: 'Planned (MM/mo)',
        accessorFn: (r: RaMonitoringAllocation) => r.planned_pct ?? 0,
        enableSorting: true,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          if (m.editing === r.allocation_id) {
            return (
              <Select
                value={String(m.draft.planned_pct ?? r.planned_pct ?? 100)}
                onValueChange={(v) => m.setDraft((d) => ({ ...d, planned_pct: Number(v) }))}
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
        accessorFn: (r: RaMonitoringAllocation) => r.date_from ?? '',
        enableSorting: true,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          return m.editing === r.allocation_id ? (
            <Input
              type="date"
              className="h-8 w-36"
              value={m.draft.date_from ?? r.date_from ?? ''}
              onChange={(e) => m.setDraft((d) => ({ ...d, date_from: e.target.value }))}
            />
          ) : (
            <span className="font-mono text-caption text-ink-muted">{r.date_from ?? '—'}</span>
          );
        },
      },
      {
        id: 'end',
        header: 'End',
        accessorFn: (r: RaMonitoringAllocation) => r.date_to ?? '',
        enableSorting: true,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          return m.editing === r.allocation_id ? (
            <Input
              type="date"
              className="h-8 w-36"
              value={m.draft.date_to ?? r.date_to ?? ''}
              onChange={(e) => m.setDraft((d) => ({ ...d, date_to: e.target.value }))}
            />
          ) : (
            <span className="font-mono text-caption text-ink-muted">{r.date_to ?? '—'}</span>
          );
        },
      },
      {
        id: 'effort',
        header: 'Calendar effort',
        accessorFn: (r: RaMonitoringAllocation) => clippedCalendarEffort(r, win),
        enableSorting: true,
        cell: ({ row }: Ctx) => (
          <span className="font-mono font-semibold tabular-nums text-ink">
            {clippedCalendarEffort(row.original, win).toFixed(1)}
          </span>
        ),
      },
      {
        id: 'bucket',
        header: 'Type',
        accessorFn: (r: RaMonitoringAllocation) => r.bucket,
        enableSorting: true,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          if (m.editing === r.allocation_id) {
            return (
              <Select
                value={m.draft.bucket ?? r.bucket}
                onValueChange={(v) => m.setDraft((d) => ({ ...d, bucket: v as Bucket }))}
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
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          return m.editing === r.allocation_id ? (
            <Input
              className="h-8 w-44"
              value={m.draft.note ?? r.note ?? ''}
              onChange={(e) => m.setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          ) : (
            <span className="text-caption text-ink-muted">{r.note ?? '—'}</span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          if (!m.canManage) return null;
          if (m.editing === r.allocation_id) {
            return (
              <div className="flex justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Save"
                  disabled={m.savePending}
                  onClick={() => m.onSave(r)}
                >
                  <Check className="size-4 text-[var(--color-success)]" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel"
                  onClick={() => m.onCancel()}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          }
          return (
            <div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => m.onEdit(r)}>
                <Pencil className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => m.onDelete(r)}>
                <Trash2 className="size-4 text-ink-subtle" />
              </Button>
            </div>
          );
        },
      },
    ];
  }, [win]);

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          <Kpi
            label="Over-allocated"
            value={String(overWorkers.size)}
            sub=">100% in window"
            tone={overWorkers.size > 0 ? 'accent' : undefined}
          />
          <Kpi label="Scope" value={scopeLabel} sub={`${visibleProjects.length} projects`} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-56"
            placeholder="Search person, project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Combobox
            className="h-8 w-44"
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
            className="h-8 w-44"
            aria-label="Project"
            placeholder="All projects"
            searchPlaceholder="Search projects…"
            options={projectOptions}
            value={projectId || null}
            onChange={(v) => setProjectId(v ?? '')}
          />
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 text-ink-muted">
            <CalendarRange className="size-3.5 text-ink-subtle" />
            <Input
              type="date"
              aria-label="Active from"
              className="h-7 w-[7.5rem] border-0 bg-transparent px-1 focus-visible:ring-0"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
            />
            <span className="text-ink-subtle">→</span>
            <Input
              type="date"
              aria-label="Active to"
              className="h-7 w-[7.5rem] border-0 bg-transparent px-1 focus-visible:ring-0"
              value={activeTo}
              onChange={(e) => setActiveTo(e.target.value)}
            />
          </div>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 gap-1 text-ink-muted"
              onClick={() => {
                setSearch('');
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
          meta={tableMeta}
          isLoading={isLoading}
          enableGlobalFilter={false}
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
                    confirmTarget.worker_name ?? 'this unfilled seat'
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
