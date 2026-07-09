import {
  Alert,
  AlertDescription,
  AsyncCombobox,
  Badge,
  Button,
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
  type OnChangeFn,
  PageChrome,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SortingState,
  toast,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertCircle, ArrowRightLeft, CalendarRange, Plus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAccounts,
  fetchAllocations,
  fetchProjects,
  type RaMonitoringAllocation,
  splitAllocation,
} from '../api/pm-client.ts';
import { useWorkerSearch } from '../api/worker-search.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  clippedCalendarEffort,
  type EffortWindow,
  overAllocatedWorkers,
  rollupKpis,
} from './ra-effort.ts';
import { firstInGroupIds, groupByPerson, SECONDARY_SORT_FIELDS } from './ra-grouping.ts';
import { type Bucket, bucketBadge, formatDisplayDate } from './ra-shared.tsx';
import { ReassignWizardDialog, type ReassignWizardTarget } from './reassign-wizard.tsx';

/**
 * Sortable column ids, mirrored to the URL `sort` param. Rows are always
 * grouped by person first (see `personSortKey`/`personGroupKey` below) — these
 * only control the *secondary* order of a person's own rows within their
 * group, which is why `name`/`seniority` (the grouping key itself) aren't here.
 */
export const RA_SORTS = SECONDARY_SORT_FIELDS;

/** Filter + sort state mirrored in the URL query string. */
export interface RaSearch {
  q?: string;
  account?: string;
  project?: string;
  from?: string;
  to?: string;
  sort?: (typeof RA_SORTS)[number];
  dir?: 'asc' | 'desc';
}

/** Volatile per-row edit state passed via the table `meta` so column defs stay
 *  stable across keystrokes — otherwise editable inputs remount and lose focus. */
interface RaTableMeta {
  canManage: boolean;
  overWorkers: Set<string>;
  /** Allocation ids that are the first row of their person's group — only
   *  these show the Person/Seniority cell content; the rest render blank. */
  firstInGroup: Set<string>;
  onSplit: (r: RaMonitoringAllocation) => void;
  /** Opens the group-level Reassign wizard for this row's whole person — only
   *  rendered on a group's first row (see `firstInGroup`). */
  onReassignGroup: (r: RaMonitoringAllocation) => void;
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

/**
 * Entry point for staffing someone onto a project: pick the employee here,
 * then hand off to the Reassign wizard (via `onSelect`) — that wizard's own
 * "Add project" flow already covers project/%/dates/type and previews the
 * resulting peak utilization, so it isn't duplicated here.
 */
function SelectEmployeeDialog({
  onSelect,
}: {
  onSelect: (worker: { id: string; name: string | null }) => void;
}) {
  const workerPicker = useWorkerSearch();
  const [open, setOpen] = useState(false);
  const [worker, setWorker] = useState<string | null>(null);

  async function handleNext() {
    if (!worker) return;
    const [resolved] = await workerPicker.resolveByIds([worker]);
    setOpen(false);
    setWorker(null);
    onSelect({ id: worker, name: resolved?.label ?? null });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setWorker(null);
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
          <DialogTitle>Select employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <AsyncCombobox
              value={worker}
              onChange={setWorker}
              search={workerPicker.search}
              resolveByIds={workerPicker.resolveByIds}
              placeholder="Search people…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!worker} onClick={handleNext}>
              Next
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SplitAllocationDialog({
  target,
  onClose,
  onSplit,
}: {
  target: RaMonitoringAllocation | null;
  onClose: () => void;
  onSplit: () => void;
}) {
  const [newEndDate, setNewEndDate] = useState('');
  const [continuationPct, setContinuationPct] = useState('100');
  const [continuationBucket, setContinuationBucket] = useState<Bucket>('billable');
  const [continuationTo, setContinuationTo] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!target) return;
    setNewEndDate(target.date_to ?? '');
    setContinuationPct(String(target.planned_pct ?? 100));
    setContinuationBucket(target.bucket);
    setContinuationTo(target.date_to ?? '');
    setNote('');
  }, [target]);

  const mutation = useMutation({
    mutationFn: () =>
      splitAllocation(target?.allocation_id as string, {
        new_end_date: newEndDate,
        continuation: {
          planned_pct: Number(continuationPct),
          bucket: continuationBucket,
          date_to: continuationTo || null,
          note: note.trim() || null,
        },
        expected_version: target?.version,
      }),
    onSuccess: (result) => {
      if (result.warning) {
        toast.warning(
          `Saved — but this now allocates ${target?.worker_name ?? 'this person'} to ${result.warning.peak_pct}% at the busiest point.`,
        );
      } else {
        toast.success('Allocation split');
      }
      onSplit();
      onClose();
    },
  });

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>End early & continue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {mutation.isError ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label>New end date for this allocation</Label>
            <Input
              type="date"
              min={target?.date_from ?? undefined}
              max={target?.date_to ?? undefined}
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Continuation allocation %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={continuationPct}
                onChange={(e) => setContinuationPct(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Continuation type</Label>
              <Select
                value={continuationBucket}
                onValueChange={(v) => setContinuationBucket(v as Bucket)}
              >
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
          <div className="space-y-1.5">
            <Label>Continuation end date</Label>
            <Input
              type="date"
              value={continuationTo}
              onChange={(e) => setContinuationTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. plan revised in March"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!newEndDate || mutation.isPending} onClick={() => mutation.mutate()}>
              Split
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
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Partial<RaSearch>;

  const thisYear = new Date().getFullYear();
  const todayIso = new Date().toISOString().slice(0, 10);
  const yearTo = `${thisYear}-12-31`;
  const accountId = search.account ?? '';
  const projectId = search.project ?? '';
  const activeFrom = search.from ?? todayIso;
  const activeTo = search.to ?? yearTo;
  const q = search.q;

  const update = (patch: Partial<RaSearch>) => {
    void navigate({
      to: '/pm/resourcing',
      search: { ...search, ...patch },
      replace: true,
    });
  };

  const sorting = useMemo<SortingState>(
    () => (search.sort ? [{ id: search.sort, desc: search.dir !== 'asc' }] : []),
    [search.sort, search.dir],
  );
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    const first = next[0];
    update({
      sort: first ? (first.id as RaSearch['sort']) : undefined,
      dir: first ? (first.desc ? 'desc' : 'asc') : undefined,
    });
  };

  const win = useMemo<EffortWindow>(
    () => ({ from: activeFrom || undefined, to: activeTo || undefined }),
    [activeFrom, activeTo],
  );

  // Free-text search: local input, debounced into the URL `q` param.
  const [searchInput, setSearchInput] = useState(q ?? '');
  useEffect(() => {
    setSearchInput(q ?? '');
  }, [q]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce keys on searchInput; q/update are read fresh each tick
  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = searchInput.trim();
      if ((q ?? '') !== trimmed) update({ q: trimmed || undefined });
    }, 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const params = useMemo(
    () => ({
      account_id: accountId || undefined,
      project_id: projectId || undefined,
      active_from: activeFrom || undefined,
      active_to: activeTo || undefined,
      q: q || undefined,
    }),
    [accountId, projectId, activeFrom, activeTo, q],
  );

  const { data: accounts } = useQuery({
    queryKey: pmKeys.accounts(),
    queryFn: fetchAccounts,
  });
  const { data: projects } = useQuery({
    queryKey: pmKeys.projects(),
    queryFn: fetchProjects,
  });
  const { data: rows, isLoading } = useQuery({
    queryKey: pmKeys.allocations(params),
    queryFn: () => fetchAllocations(params),
  });

  const allocations = useMemo(() => rows ?? [], [rows]);

  // Always grouped by person (alphabetical); `sort`/`dir` only pick the
  // secondary order of a person's own rows within their group — clicking a
  // column header re-sorts within every group at once, it never breaks a
  // person's rows apart from each other.
  const secondaryField = search.sort ?? 'start';
  const secondaryDesc = search.dir === 'desc';
  const groupedRows = useMemo(
    () => groupByPerson(allocations, secondaryField, secondaryDesc, win),
    [allocations, secondaryField, secondaryDesc, win],
  );
  const firstInGroup = useMemo(() => firstInGroupIds(groupedRows), [groupedRows]);
  const rowClassName = useCallback(
    (row: { original: RaMonitoringAllocation }) =>
      firstInGroup.has(row.original.allocation_id) &&
      row.original.allocation_id !== groupedRows[0]?.allocation_id
        ? 'border-t-2 border-t-hairline-strong'
        : undefined,
    [firstInGroup, groupedRows],
  );

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
  const hasFilters = Boolean(
    search.q || search.account || search.project || search.from || search.to,
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: [...pmKeys.all, 'allocations'] });

  const [splitTarget, setSplitTarget] = useState<RaMonitoringAllocation | null>(null);
  const [wizardTarget, setWizardTarget] = useState<ReassignWizardTarget | null>(null);

  const tableMeta = useMemo<RaTableMeta>(
    () => ({
      canManage,
      overWorkers,
      firstInGroup,
      onSplit: (r) => setSplitTarget(r),
      onReassignGroup: (r) =>
        setWizardTarget({
          worker_id: r.worker_id as string,
          worker_name: r.worker_name,
          worker_title: r.worker_title,
        }),
    }),
    [canManage, overWorkers, firstInGroup],
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
        // Row order is pre-computed (grouped by person, then by the active
        // sort field) — this just neutralizes the table's own re-sort so it
        // doesn't undo that grouping while still driving the header's arrow.
        sortingFn: () => 0,
        cell: ({ row }: Ctx) => <span className="text-ink-muted">{row.original.account_name}</span>,
      },
      {
        id: 'project',
        header: 'Project',
        accessorFn: (r: RaMonitoringAllocation) => r.project_name,
        enableSorting: true,
        sortingFn: () => 0,
        cell: ({ row }: Ctx) => <span className="text-ink">{row.original.project_name}</span>,
      },
      {
        id: 'name',
        header: 'Person',
        accessorFn: (r: RaMonitoringAllocation) => r.worker_name ?? '',
        enableSorting: false,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          if (!m.firstInGroup.has(r.allocation_id)) return null;
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
        enableSorting: false,
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          if (!m.firstInGroup.has(r.allocation_id)) return null;
          return <span className="text-ink-muted">{r.worker_title ?? '—'}</span>;
        },
      },
      {
        id: 'planned',
        header: 'Allocation %',
        accessorFn: (r: RaMonitoringAllocation) => r.planned_pct ?? 0,
        enableSorting: true,
        sortingFn: () => 0,
        cell: ({ row }: Ctx) => (
          <span className="font-mono tabular-nums text-ink">{row.original.planned_pct ?? 0}%</span>
        ),
      },
      {
        id: 'start',
        header: 'Start',
        accessorFn: (r: RaMonitoringAllocation) => r.date_from ?? '',
        enableSorting: true,
        sortingFn: () => 0,
        cell: ({ row }: Ctx) => (
          <span className="whitespace-nowrap font-mono text-caption text-ink-muted">
            {row.original.date_from ? formatDisplayDate(row.original.date_from) : '—'}
          </span>
        ),
      },
      {
        id: 'end',
        header: 'End',
        accessorFn: (r: RaMonitoringAllocation) => r.date_to ?? '',
        enableSorting: true,
        sortingFn: () => 0,
        cell: ({ row }: Ctx) => (
          <span className="whitespace-nowrap font-mono text-caption text-ink-muted">
            {row.original.date_to ? formatDisplayDate(row.original.date_to) : '—'}
          </span>
        ),
      },
      {
        id: 'effort',
        header: 'Calendar effort',
        accessorFn: (r: RaMonitoringAllocation) => clippedCalendarEffort(r, win),
        enableSorting: true,
        sortingFn: () => 0,
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
        sortingFn: () => 0,
        cell: ({ row }: Ctx) => bucketBadge(row.original.bucket),
      },
      {
        id: 'note',
        header: 'Note',
        cell: ({ row }: Ctx) => (
          <span className="text-caption text-ink-muted">{row.original.note ?? '—'}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row, table }: Ctx) => {
          const r = row.original;
          const m = table.options.meta as RaTableMeta;
          if (!m.canManage || !m.firstInGroup.has(r.allocation_id)) return null;
          return (
            <div className="flex justify-end gap-1">
              <Button
                size="icon"
                variant="secondary"
                aria-label="Reassign"
                onClick={() => m.onReassignGroup(r)}
              >
                <ArrowRightLeft className="size-4" />
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
          <SelectEmployeeDialog
            onSelect={(worker) =>
              setWizardTarget({
                worker_id: worker.id,
                worker_name: worker.name,
                worker_title: null,
              })
            }
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Combobox
            className="h-8 w-44"
            aria-label="Account"
            placeholder="All accounts"
            searchPlaceholder="Search accounts…"
            options={accountOptions}
            value={accountId || null}
            onChange={(v) => update({ account: v ?? undefined, project: undefined })}
          />
          <Combobox
            className="h-8 w-44"
            aria-label="Project"
            placeholder="All projects"
            searchPlaceholder="Search projects…"
            options={projectOptions}
            value={projectId || null}
            onChange={(v) => update({ project: v ?? undefined })}
          />
          <div className="flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-1 px-2 text-ink-muted">
            <CalendarRange className="size-3.5 text-ink-subtle" />
            <Input
              type="date"
              aria-label="Active from"
              className="h-7 w-[7.5rem] border-0 bg-transparent px-1 focus-visible:ring-0"
              value={activeFrom}
              onChange={(e) => update({ from: e.target.value || undefined })}
            />
            <span className="text-ink-subtle">→</span>
            <Input
              type="date"
              aria-label="Active to"
              className="h-7 w-[7.5rem] border-0 bg-transparent px-1 focus-visible:ring-0"
              value={activeTo}
              onChange={(e) => update({ to: e.target.value || undefined })}
            />
          </div>
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 gap-1 text-ink-muted"
              onClick={() => {
                setSearchInput('');
                update({
                  q: undefined,
                  account: undefined,
                  project: undefined,
                  from: undefined,
                  to: undefined,
                });
              }}
            >
              <X className="size-3.5" />
              Clear
            </Button>
          ) : null}
        </div>

        <DataTable
          columns={columns}
          data={groupedRows}
          meta={tableMeta}
          sorting={sorting}
          onSortingChange={onSortingChange}
          getRowClassName={rowClassName}
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

      <SplitAllocationDialog
        target={splitTarget}
        onClose={() => setSplitTarget(null)}
        onSplit={invalidate}
      />

      <ReassignWizardDialog
        target={wizardTarget}
        allocations={allocations.filter((a) => a.worker_id === wizardTarget?.worker_id)}
        accountOptions={accountOptions}
        projects={projects ?? []}
        onClose={() => setWizardTarget(null)}
        onReassigned={invalidate}
      />
    </PageChrome>
  );
}
