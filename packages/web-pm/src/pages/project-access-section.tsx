import {
  Button,
  Checkbox,
  type ColumnSettingsOption,
  EmptyState,
  Input,
  Popover,
  paginateData,
  pixel,
  proportional,
  type SearchableItem,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
  Typeahead,
  useSeededItems,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  useToast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchProjectAccess, type ProjectAccessRow, setProjectAccess } from '../api/pm-client.ts';
import { useWorkerSource } from '../api/worker-search';
import { pmKeys } from '../state/query-keys.ts';

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type AccessRow = ProjectAccessRow & Record<string, unknown>;

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Universe of columns for the column-settings picker — the deleted DataTable
// never disabled `enableColumnVisibility`/`enableHiding` here, so all 3
// columns (including Actions) were genuinely hideable; preserved as-is.
// "Actions" carries a real label here (old toolbar used the empty `header`
// string verbatim, rendering an unlabeled checkbox — not reproduced, since an
// unlabeled control is an accessibility bug, not a feature).
const COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'worker_id', label: 'Worker' },
  { key: 'level', label: 'Level' },
  { key: 'actions', label: 'Actions' },
];
const DEFAULT_COLUMN_KEYS = COLUMN_OPTIONS.map((c) => c.key);

export function ProjectAccessSection({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: pmKeys.projectAccess(projectId),
    queryFn: () => fetchProjectAccess(projectId),
  });
  const [worker, setWorker] = useState<SearchableItem | null>(null);
  const [level, setLevel] = useState<ProjectAccessRow['level']>('view');
  const workerSource = useWorkerSource();

  const [resolvedWorkers] = useSeededItems(
    (data ?? []).map((g) => g.worker_id),
    workerSource.seed,
  );

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: pmKeys.projectAccess(projectId) });
  }

  const save = useMutation({
    mutationFn: (grants: ProjectAccessRow[]) => setProjectAccess(projectId, grants),
    onSuccess: () => {
      toast({ body: 'Access updated' });
      setWorker(null);
      invalidate();
    },
    onError: (e: Error & { status?: number }) => {
      toast({ body: e.message, type: 'error' });
    },
  });

  const nameOf = useMemo(() => {
    const m = new Map(resolvedWorkers.map((o) => [o.id, o.label]));
    return (id: string) => m.get(id) ?? id;
  }, [resolvedWorkers]);

  const rows = (data ?? []) as AccessRow[];

  // The deleted DataTable defaulted `enableGlobalFilter` to `true` (this file
  // never disabled it) — filter over the resolved worker name and level.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [nameOf(r.worker_id), r.level].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [rows, search, nameOf]);

  const { sortedData, sort, sortConfig } = useTableSortableState<AccessRow>({ data: filtered });
  const sortable = useTableSortable<AccessRow>(sortConfig);

  // Reset to page 1 whenever the sort order changes — matches the deleted DataTable's
  // TanStack `autoResetPageIndex` default, which fired on `sorting` state changes
  // (getSortedRowModel unconditionally calls `table._autoResetPageIndex()`;
  // `manualPagination` was never set here). The search filter already resets page
  // inline in its own onChange handler below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sort is the intentional reset trigger, unread in the body.
  useEffect(() => {
    setPage(1);
  }, [sort]);

  const pageRows = useMemo(
    () => paginateData(sortedData, page, pageSize),
    [sortedData, page, pageSize],
  );
  const pagination = useTablePagination<AccessRow>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize,
    onPageSizeChange: (ps) => {
      setPageSize(ps);
      setPage(1);
    },
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  });

  const columnSettingsState = useTableColumnSettingsState({
    columns: COLUMN_OPTIONS,
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const columnSettings = useTableColumnSettings<AccessRow>(
    columnSettingsState.columnSettingsConfig,
  );

  const columns = useMemo<TableColumn<AccessRow>[]>(
    () => [
      {
        key: 'worker_id',
        header: 'Worker',
        width: proportional(2),
        sortable: true,
        renderCell: (r) => (
          <span className="text-caption text-ink truncate block">{nameOf(r.worker_id)}</span>
        ),
      },
      {
        key: 'level',
        header: 'Level',
        width: proportional(1),
        sortable: true,
        renderCell: (r) => <span className="text-ink capitalize">{r.level}</span>,
      },
      {
        key: 'actions',
        header: '',
        width: pixel(90),
        align: 'end',
        renderCell: (r) =>
          canManage ? (
            <Button
              size="sm"
              variant="ghost"
              label="Remove"
              onClick={() => save.mutate((data ?? []).filter((g) => g.worker_id !== r.worker_id))}
            />
          ) : null,
      },
    ],
    [canManage, data, nameOf, save],
  );

  return (
    <section className="space-y-3">
      <h3 className="text-ink font-medium">Project access</h3>
      <div className="flex items-center justify-between gap-2">
        <Input
          label="Search access"
          isLabelHidden
          className="max-w-sm"
          placeholder="Search…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <Popover
          placement="below"
          alignment="end"
          label="Toggle columns"
          content={
            <div className="flex min-w-[180px] flex-col gap-1 p-2">
              <div className="px-1 pb-1 text-eyebrow uppercase tracking-[0.04em] text-ink-subtle">
                Toggle columns
              </div>
              {COLUMN_OPTIONS.map((col) => (
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
          {['s0', 's1', 's2'].map((id) => (
            <Skeleton key={id} height={36} />
          ))}
        </div>
      ) : (
        <Table
          data={pageRows}
          columns={columns}
          idKey="worker_id"
          plugins={{ pagination, sortable, columnSettings }}
          emptyState={
            search.trim() ? (
              <EmptyState
                title="No results match these filters"
                description="Try removing a filter or clearing your search."
                action={{ label: 'Clear filters', onClick: () => setSearch('') }}
              />
            ) : (
              <EmptyState
                icon={<ShieldCheck className="size-6" />}
                title="No grants"
                description="Grant Owner/Edit/View to team members."
              />
            )
          }
        />
      )}
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1">
            <Typeahead
              label="Worker"
              searchSource={workerSource.source}
              value={worker}
              onChange={setWorker}
              placeholder="Search workers…"
            />
          </div>
          <div className="space-y-1 w-32">
            <Selector
              label="Level"
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
            onClick={() => {
              if (!worker) return;
              save.mutate([
                ...(data ?? []).filter((g) => g.worker_id !== worker.id),
                { worker_id: worker.id, level },
              ]);
            }}
            isDisabled={save.isPending || !worker}
          />
        </div>
      )}
    </section>
  );
}
