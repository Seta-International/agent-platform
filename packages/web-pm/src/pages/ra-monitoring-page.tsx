import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Pencil, Plus, Settings2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAccounts,
  fetchAllocations,
  fetchProjects,
  type RaMonitoringAllocation,
  splitAllocation,
} from '../api/pm-client.ts';
import { useWorkerSource } from '../api/worker-search.ts';
import { pmKeys } from '../state/query-keys.ts';
import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  type ColumnSettingsOption,
  cn,
  createStaticSource,
  DateInput,
  Dialog,
  DialogFooter,
  DialogHeader,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  NumberInput,
  Popover,
  paginateData,
  pixel,
  proportional,
  type SearchableItem,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
  type TableSortState,
  Text,
  Typeahead,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useToast,
  VStack,
} from './_ui-compat.tsx';
import {
  clippedCalendarEffort,
  type EffortWindow,
  overAllocatedWorkers,
  rollupKpis,
} from './ra-effort.ts';
import {
  firstInGroupIds,
  firstInProjectGroupIds,
  groupByPerson,
  SECONDARY_SORT_FIELDS,
} from './ra-grouping.ts';
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

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type RaRow = RaMonitoringAllocation & Record<string, unknown>;

// Universe of columns for the column-settings picker — the deleted DataTable
// never disabled `enableColumnVisibility`/`enableHiding` here, so all 11
// columns (including Person and Actions) were genuinely hideable; preserved
// as-is. "Actions" carries a real label here (old toolbar used the empty
// `header` string verbatim, rendering an unlabeled checkbox — not
// reproduced, since an unlabeled control is an accessibility bug, not a
// feature).
const RA_COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'account', label: 'Account' },
  { key: 'project', label: 'Project' },
  { key: 'name', label: 'Person' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'planned', label: 'Allocation' },
  { key: 'start', label: 'Start' },
  { key: 'end', label: 'End' },
  { key: 'effort', label: 'Calendar effort' },
  { key: 'bucket', label: 'Type' },
  { key: 'note', label: 'Note' },
  { key: 'actions', label: 'Actions' },
];
const DEFAULT_RA_COLUMN_KEYS = RA_COLUMN_OPTIONS.map((c) => c.key);

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card padding={4}>
      <div className="text-xs uppercase tracking-wide text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub ? <div className="text-xs text-secondary">{sub}</div> : null}
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
  const workerSource = useWorkerSource();
  const [open, setOpen] = useState(false);
  const [worker, setWorker] = useState<SearchableItem | null>(null);

  function handleNext() {
    if (!worker) return;
    setOpen(false);
    onSelect({ id: worker.id, name: worker.label });
    setWorker(null);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) setWorker(null);
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        className="gap-1.5"
        label="Add allocation"
        icon={<Plus className="size-4" />}
        onClick={() => setOpen(true)}
      />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} width={560} purpose="form">
        <Layout
          header={<DialogHeader title="Select employee" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-1.5">
                <Typeahead
                  label="Employee"
                  searchSource={workerSource.source}
                  value={worker}
                  onChange={setWorker}
                  placeholder="Search people…"
                />
              </div>
            </LayoutContent>
          }
          footer={
            <DialogFooter>
              <Button variant="ghost" label="Cancel" onClick={() => setOpen(false)} />
              <Button variant="primary" label="Next" isDisabled={!worker} onClick={handleNext} />
            </DialogFooter>
          }
        />
      </Dialog>
    </>
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
  const toast = useToast();
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
        toast({
          body: `Saved — but this now allocates ${target?.worker_name ?? 'this person'} to ${result.warning.peak_pct}% at the busiest point.`,
        });
      } else {
        toast({ body: 'Allocation split' });
      }
      onSplit();
      onClose();
    },
  });

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog isOpen={target !== null} onOpenChange={handleOpenChange} width={560} purpose="form">
      <Layout
        header={<DialogHeader title="End early & continue" onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent>
            <div className="space-y-4">
              {mutation.isError ? <Banner status="error" title={mutation.error.message} /> : null}
              <div className="space-y-1.5">
                <DateInput
                  label="New end date for this allocation"
                  min={target?.date_from ?? undefined}
                  max={target?.date_to ?? undefined}
                  value={newEndDate || undefined}
                  onChange={(v) => setNewEndDate(v ?? '')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label="Continuation allocation %"
                  min={0}
                  max={100}
                  units="%"
                  value={continuationPct === '' ? null : Number(continuationPct)}
                  onChange={(v) => setContinuationPct(String(v))}
                />
                <div className="space-y-1.5">
                  <Selector
                    label="Continuation type"
                    options={[
                      { value: 'billable', label: 'Billable' },
                      { value: 'internal', label: 'Internal' },
                      { value: 'bench', label: 'Bench' },
                    ]}
                    value={continuationBucket}
                    onChange={(v) => setContinuationBucket(v as Bucket)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <DateInput
                  label="Continuation end date"
                  value={continuationTo || undefined}
                  onChange={(v) => setContinuationTo(v ?? '')}
                />
              </div>
              <div className="space-y-1.5">
                <Input
                  label="Note"
                  value={note}
                  onChange={(value) => setNote(value)}
                  placeholder="e.g. plan revised in March"
                />
              </div>
            </div>
          </LayoutContent>
        }
        footer={
          <DialogFooter>
            <Button variant="ghost" label="Cancel" onClick={onClose} />
            <Button
              variant="primary"
              label="Split"
              isDisabled={!newEndDate || mutation.isPending}
              onClick={() => mutation.mutate()}
            />
          </DialogFooter>
        }
      />
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

  // Sort-state mapping: existing {field, dir} query state <-> Astryx's
  // [{ sortKey, direction }] shape. The actual reorder happens externally via
  // `groupByPerson` below — Astryx's sortable plugin (like the old
  // `sortingFn: () => 0` columns) never resorts `data` itself, it only owns
  // the header button UI/interaction.
  const sortState: TableSortState = search.sort
    ? [{ sortKey: search.sort, direction: search.dir === 'asc' ? 'ascending' : 'descending' }]
    : [];
  const sortable = useTableSortable<RaRow>({
    sort: sortState,
    onSortChange: (s) => {
      const first = s[0];
      update({
        sort: first ? (first.sortKey as RaSearch['sort']) : undefined,
        dir: first ? (first.direction === 'descending' ? 'desc' : 'asc') : undefined,
      });
    },
  });

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

  const windowParams = useMemo(
    () => ({
      active_from: activeFrom || undefined,
      active_to: activeTo || undefined,
    }),
    [activeFrom, activeTo],
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
  const { data: windowRows } = useQuery({
    queryKey: pmKeys.allocations(windowParams),
    queryFn: () => fetchAllocations(windowParams),
  });

  const allocations = useMemo(() => rows ?? [], [rows]);
  const allAllocations = useMemo(() => windowRows ?? rows ?? [], [windowRows, rows]);

  // Always grouped by person (alphabetical); `sort`/`dir` only pick the
  // secondary order of a person's own rows within their group — clicking a
  // column header re-sorts within every group at once, it never breaks a
  // person's rows apart from each other.
  const secondaryField = search.sort ?? 'start';
  const secondaryDesc = search.dir === 'desc';
  const groupedRows = useMemo(
    () => groupByPerson(allocations, secondaryField, secondaryDesc),
    [allocations, secondaryField, secondaryDesc],
  );
  const firstInGroup = useMemo(() => firstInGroupIds(groupedRows), [groupedRows]);
  const firstInProject = useMemo(() => firstInProjectGroupIds(groupedRows), [groupedRows]);
  const rowClassName = useCallback(
    (item: RaMonitoringAllocation) =>
      // Thin `dividers="rows"` lines (drawn on the cells) separate every allocation; a
      // 2px rule at each new person wins the collapsed-border contest against those 1px
      // lines, so each person's projects read as one block bracketed by a bolder rule.
      firstInGroup.has(item.allocation_id) && item.allocation_id !== groupedRows[0]?.allocation_id
        ? 'border-t-2 border-t-hairline-strong'
        : undefined,
    [firstInGroup, groupedRows],
  );

  const visibleProjects = useMemo(
    () => (projects ?? []).filter((p) => !accountId || p.account_id === accountId),
    [projects, accountId],
  );
  // `canManage` is only "has pm.project.manage somewhere"; the Add-allocation action needs at
  // least one project the caller actually manages (a self-scoped EM with no owned project must
  // not see it). Per-row edit actions gate on each row's own `can_manage` (FUT-353).
  const canManageAny = useMemo(
    () => canManage && (projects ?? []).some((p) => p.can_manage),
    [canManage, projects],
  );
  const accountOptions = useMemo<SearchableItem[]>(
    () => (accounts ?? []).map((a) => ({ id: a.account_id, label: a.name })),
    [accounts],
  );
  const projectOptions = useMemo<SearchableItem[]>(
    () => visibleProjects.map((p) => ({ id: p.project_id, label: p.name })),
    [visibleProjects],
  );
  const accountSource = useMemo(() => createStaticSource(accountOptions), [accountOptions]);
  const projectSource = useMemo(() => createStaticSource(projectOptions), [projectOptions]);
  const kpis = useMemo(() => rollupKpis(allocations, win), [allocations, win]);
  const overWorkers = useMemo(
    () => overAllocatedWorkers(allAllocations, win),
    [allAllocations, win],
  );
  const visibleOverWorkersCount = useMemo(() => {
    const visibleWorkerIds = new Set(
      allocations.map((a) => a.worker_id).filter((id): id is string => Boolean(id)),
    );
    let count = 0;
    for (const wid of visibleWorkerIds) {
      if (overWorkers.has(wid)) count++;
    }
    return count;
  }, [allocations, overWorkers]);

  const hasFilters = Boolean(
    search.q || search.account || search.project || search.from || search.to,
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: [...pmKeys.all, 'allocations'] });

  const [splitTarget, setSplitTarget] = useState<RaMonitoringAllocation | null>(null);
  const [wizardTarget, setWizardTarget] = useState<ReassignWizardTarget | null>(null);

  // The Add-allocation wizard reviews a person's ENTIRE book for conflict / over-allocation, so
  // it must not inherit ANY of the list's filters — project, account, search, or the active-period
  // window. Each would hide some of the person's allocations, which are exactly what a conflict
  // check has to see: the backend over-allocation math counts the whole book, so a filtered popup
  // (e.g. one narrowed to the page's date window, hiding a project that ends before it) disagreed
  // with it (FUT-750). Fetch this person's full book by worker id alone whenever the wizard is
  // open; the wizard itself narrows to future rows for the reassign UI.
  const wizardAllocParams = useMemo(
    () => ({ worker_id: wizardTarget?.worker_id }),
    [wizardTarget?.worker_id],
  );
  const { data: wizardAllocations } = useQuery({
    queryKey: pmKeys.allocations(wizardAllocParams),
    queryFn: () => fetchAllocations(wizardAllocParams),
    enabled: wizardTarget !== null,
  });

  // The deleted DataTable defaulted `enableColumnVisibility` to `true` (this
  // file never disabled it) and, since no `pagination={false}` was passed
  // either, `getPaginationRowModel` paginated `groupedRows` client-side at the
  // default page size (25) — both were genuinely live, if undiscovered by the
  // plan's matrix. Preserved here; global filter stays dead (explicit
  // `enableGlobalFilter={false}` in the old code — the search Input above is
  // a separate, server-driving control, untouched).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_RA_COLUMN_KEYS);

  // Matches TanStack's `autoResetPageIndex` default: a new fetch or a sort
  // change resets to page 1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: groupedRows is the intentional reset trigger
  useEffect(() => {
    setPage(1);
  }, [groupedRows]);

  const pageRows = useMemo(
    () => paginateData(groupedRows, page, pageSize) as RaRow[],
    [groupedRows, page, pageSize],
  );
  const pagination = useTablePagination<RaRow>({
    page,
    onPageChange: setPage,
    totalItems: groupedRows.length,
    pageSize,
    onPageSizeChange: (ps) => {
      setPageSize(ps);
      setPage(1);
    },
    pageSizeOptions: [10, 25, 50, 100],
  });

  const columnSettingsState = useTableColumnSettingsState({
    columns: RA_COLUMN_OPTIONS,
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) =>
      setActiveColumnKeys(DEFAULT_RA_COLUMN_KEYS.filter((k) => keys.includes(k))),
  });
  const columnSettings = useTableColumnSettings<RaRow>(columnSettingsState.columnSettingsConfig);

  const openReassignGroup = useCallback((r: RaMonitoringAllocation) => {
    setWizardTarget({
      worker_id: r.worker_id as string,
      worker_name: r.worker_name,
      worker_title: r.worker_title,
    });
  }, []);

  // Column defs depend directly on the closures they read (canManage,
  // overWorkers, firstInGroup, firstInProject, openReassignGroup) — no
  // `table.options.meta` indirection needed: none of these cells contain a
  // live-editable input, so there's no keystroke-remount concern the old
  // `meta` plumbing guarded against.
  const columns = useMemo<TableColumn<RaRow>[]>(
    () => [
      {
        key: 'account',
        header: 'Account',
        width: proportional(1.2, { minWidth: 150 }),
        sortable: true,
        renderCell: (r) => {
          if (!firstInProject.has(r.allocation_id)) return null;
          return <span className="text-secondary">{r.account_name}</span>;
        },
      },
      {
        key: 'project',
        header: 'Project',
        // Longest text in the table (full project names) — give it the most room and a
        // generous floor so names wrap to 1–2 lines instead of the previous three.
        width: proportional(1.6, { minWidth: 190 }),
        sortable: true,
        renderCell: (r) => {
          if (!firstInProject.has(r.allocation_id)) return null;
          return <span className="text-primary">{r.project_name}</span>;
        },
      },
      {
        key: 'name',
        header: 'Person',
        width: proportional(1.4, { minWidth: 210 }),
        renderCell: (r) => (
          <div className="flex items-center gap-2">
            {r.worker_name ? (
              <span className="min-w-0 font-medium text-primary">{r.worker_name}</span>
            ) : r.worker_id ? (
              <span className="text-secondary">Unknown</span>
            ) : (
              <span className="italic text-secondary">Unfilled (TBD)</span>
            )}
            {r.status !== 'committed' ? (
              <Badge
                variant="neutral"
                className="shrink-0 whitespace-nowrap font-normal capitalize text-secondary"
                label={r.status}
              />
            ) : null}
            {r.worker_id && overWorkers.has(r.worker_id) ? (
              <Badge
                variant="warning"
                className="shrink-0 whitespace-nowrap border-warning bg-warning-muted font-medium text-warning"
                label="Over"
              />
            ) : null}
          </div>
        ),
      },
      {
        key: 'seniority',
        header: 'Seniority',
        // Short, bounded values ("Engineer", "Senior Engineer") — a fixed width keeps it
        // from stealing proportional space from the text-heavy columns.
        width: pixel(140),
        renderCell: (r) => (
          <span className="capitalize text-secondary">{r.worker_title ?? '—'}</span>
        ),
      },
      {
        key: 'planned',
        header: 'Allocation',
        width: pixel(100),
        sortable: true,
        // Shown as a 0–1 fraction (e.g. 100% → 1.0, 40% → 0.4); stored value stays a percentage.
        renderCell: (r) => (
          <span className="font-mono tabular-nums text-primary">
            {((r.planned_pct ?? 0) / 100).toFixed(1)}
          </span>
        ),
      },
      {
        key: 'start',
        header: 'Start',
        width: pixel(100),
        sortable: true,
        renderCell: (r) => (
          <span className="whitespace-nowrap font-mono text-sm text-secondary">
            {r.date_from ? formatDisplayDate(r.date_from) : '—'}
          </span>
        ),
      },
      {
        key: 'end',
        header: 'End',
        width: pixel(100),
        sortable: true,
        renderCell: (r) => (
          <span className="whitespace-nowrap font-mono text-sm text-secondary">
            {r.date_to ? formatDisplayDate(r.date_to) : '—'}
          </span>
        ),
      },
      {
        key: 'effort',
        header: 'Calendar effort',
        width: pixel(130),
        sortable: true,
        renderCell: (r) => (
          <span className="font-mono font-semibold tabular-nums text-primary">
            {clippedCalendarEffort(r, win).toFixed(2)}
          </span>
        ),
      },
      {
        key: 'bucket',
        header: 'Type',
        width: pixel(100),
        sortable: true,
        renderCell: (r) => bucketBadge(r.bucket),
      },
      {
        key: 'note',
        header: 'Note',
        width: proportional(1, { minWidth: 140 }),
        renderCell: (r) => <span className="text-sm text-secondary">{r.note ?? '—'}</span>,
      },
      {
        key: 'actions',
        header: '',
        width: pixel(90),
        align: 'end',
        renderCell: (r) => {
          // Row-scoped (FUT-353): only projects the caller manages get edit actions; rows
          // visible through wider read scope stay read-only.
          if (!r.can_manage || !r.worker_id) return null;
          return (
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="secondary"
                isIconOnly
                label="Reassign"
                onClick={() => openReassignGroup(r)}
                icon={<Pencil className="size-4" />}
              />
            </div>
          );
        },
      },
    ],
    [firstInProject, overWorkers, openReassignGroup, win],
  );

  // The Scope card must reflect the current filter context (FUT-841): the
  // count is 1 when a single project is selected, otherwise the account (or
  // all) projects visible through the filter. `visibleProjects` is account-
  // scoped, so the selected `projectId` has to narrow the count explicitly.
  const scopeLabel = projectId
    ? (visibleProjects.find((p) => p.project_id === projectId)?.name ?? '1 project')
    : 'All projects';
  const scopeProjectCount = projectId ? 1 : visibleProjects.length;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>RA Monitoring</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  RA Monitoring
                </Text>
              </HStack>
              {canManageAny ? (
                <SelectEmployeeDialog
                  onSelect={(worker) =>
                    setWizardTarget({
                      worker_id: worker.id,
                      worker_name: worker.name,
                      worker_title: null,
                      // Carry the active scope into the wizard so it opens pre-seeded: a project
                      // filter seeds the project (and its account); an account-only filter seeds
                      // just the account, leaving the PM to pick among that account's projects.
                      seed_project_id: projectId || null,
                      seed_account_id: accountId || null,
                    })
                  }
                />
              ) : undefined}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
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
              />
              <Kpi label="People allocated" value={String(kpis.people)} sub="distinct" />
              <Kpi
                label="Over-allocated"
                value={String(visibleOverWorkersCount)}
                sub=">100% in window"
              />
              <Kpi
                label="Scope"
                value={scopeLabel}
                sub={`${scopeProjectCount} project${scopeProjectCount === 1 ? '' : 's'}`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                label="Search person, project"
                isLabelHidden
                className="w-56"
                size="sm"
                placeholder="Search person, project…"
                value={searchInput}
                onChange={(value) => setSearchInput(value)}
              />
              <Typeahead
                label="Account"
                isLabelHidden
                className="h-8 w-44"
                searchSource={accountSource}
                debounceMs={0}
                hasEntriesOnFocus
                hasClear
                placeholder="All accounts"
                value={accountOptions.find((o) => o.id === accountId) ?? null}
                onChange={(item) => update({ account: item?.id ?? undefined, project: undefined })}
              />
              <Typeahead
                label="Project"
                isLabelHidden
                className="h-8 w-44"
                searchSource={projectSource}
                debounceMs={0}
                hasEntriesOnFocus
                hasClear
                placeholder="All projects"
                value={projectOptions.find((o) => o.id === projectId) ?? null}
                onChange={(item) => update({ project: item?.id ?? undefined })}
              />
              <div className="flex items-center gap-1.5">
                <DateInput
                  label="Active from"
                  isLabelHidden
                  size="sm"
                  max={activeTo || undefined}
                  value={activeFrom || undefined}
                  onChange={(v) => update({ from: v })}
                />
                <span className="text-secondary">→</span>
                <DateInput
                  label="Active to"
                  isLabelHidden
                  size="sm"
                  min={activeFrom || undefined}
                  value={activeTo || undefined}
                  onChange={(v) => update({ to: v })}
                />
              </div>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-8 gap-1 text-secondary"
                  label="Clear"
                  icon={<X className="size-3.5" />}
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
                />
              ) : null}
            </div>

            <div className="flex justify-end">
              <Popover
                placement="below"
                alignment="end"
                label="Toggle columns"
                content={
                  <div className="flex max-h-80 min-w-[180px] flex-col gap-1 overflow-y-auto p-2">
                    <div className="px-1 pb-1 text-xs font-medium uppercase tracking-[0.04em] text-secondary">
                      Toggle columns
                    </div>
                    {RA_COLUMN_OPTIONS.map((col) => (
                      <Checkbox
                        key={col.key}
                        label={col.label}
                        value={columnSettingsState.isColumnActive(col.key)}
                        onChange={() => columnSettingsState.toggleColumn(col.key)}
                      />
                    ))}
                  </div>
                }
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Settings2 className="size-3.5" />}
                  label="Columns"
                />
              </Popover>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                  <Skeleton key={id} height={40} />
                ))}
              </div>
            ) : (
              <Table
                data={pageRows}
                columns={columns}
                idKey="allocation_id"
                density="spacious"
                plugins={{
                  pagination,
                  sortable,
                  columnSettings,
                  rowStyling: {
                    transformBodyRow: (props, item) => ({
                      ...props,
                      htmlProps: {
                        ...props.htmlProps,
                        className: cn(props.htmlProps.className, rowClassName(item)),
                      },
                    }),
                  },
                }}
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
            )}
          </div>

          <SplitAllocationDialog
            target={splitTarget}
            onClose={() => setSplitTarget(null)}
            onSplit={invalidate}
          />

          <ReassignWizardDialog
            target={wizardTarget}
            allocations={wizardAllocations ?? []}
            accountOptions={accountOptions}
            projects={projects ?? []}
            onClose={() => setWizardTarget(null)}
            onReassigned={invalidate}
          />
        </LayoutContent>
      }
    />
  );
}
