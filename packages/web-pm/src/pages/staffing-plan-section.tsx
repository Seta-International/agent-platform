import {
  Button,
  Checkbox,
  type ColumnSettingsOption,
  EmptyState,
  Input,
  NumberInput,
  Popover,
  paginateData,
  pixel,
  proportional,
  Skeleton,
  Table,
  type TableColumn,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  useToast,
} from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  deleteStaffingPlanLine,
  fetchStaffingPlan,
  type StaffingPlanLine,
  upsertStaffingPlanLine,
} from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type PlanLineRow = StaffingPlanLine & Record<string, unknown>;

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Universe of columns for the column-settings picker — the deleted DataTable
// never disabled `enableColumnVisibility`/`enableHiding` here, so all 3
// columns (including Actions) were genuinely hideable; preserved as-is.
// "Actions" carries a real label here (old toolbar used the empty `header`
// string verbatim, rendering an unlabeled checkbox — not reproduced, since an
// unlabeled control is an accessibility bug, not a feature).
const COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'role', label: 'Role' },
  { key: 'effort_mm', label: 'Effort (MM)' },
  { key: 'actions', label: 'Actions' },
];
const DEFAULT_COLUMN_KEYS = COLUMN_OPTIONS.map((c) => c.key);

export function StaffingPlanSection({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: pmKeys.staffingPlan(projectId),
    queryFn: () => fetchStaffingPlan(projectId),
  });
  const [role, setRole] = useState('');
  const [effort, setEffort] = useState('');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);

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
      toast({ body: 'Line added' });
      setRole('');
      setEffort('');
      invalidate();
    },
    onError: (e: Error) => toast({ body: e.message, type: 'error' }),
  });

  const remove = useMutation({
    mutationFn: ({ lineId, version }: { lineId: string; version: number }) =>
      deleteStaffingPlanLine(projectId, lineId, version),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error & { status?: number }) => {
      if (e.status === 409) {
        toast({ body: 'Line was modified concurrently — refreshing', type: 'error' });
        invalidate();
      } else {
        toast({ body: e.message, type: 'error' });
      }
    },
  });

  const rows = (data ?? []) as PlanLineRow[];

  // The deleted DataTable defaulted `enableGlobalFilter` to `true` (this file
  // never disabled it) — filter over role and effort.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.role, r.effort_mm ?? ''].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const { sortedData, sortConfig } = useTableSortableState<PlanLineRow>({
    data: filtered,
    comparators: {
      effort_mm: (a, b) => (Number(a.effort_mm) || 0) - (Number(b.effort_mm) || 0),
    },
  });
  const sortable = useTableSortable<PlanLineRow>(sortConfig);

  const pageRows = useMemo(
    () => paginateData(sortedData, page, pageSize),
    [sortedData, page, pageSize],
  );
  const pagination = useTablePagination<PlanLineRow>({
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
  const columnSettings = useTableColumnSettings<PlanLineRow>(
    columnSettingsState.columnSettingsConfig,
  );

  const columns = useMemo<TableColumn<PlanLineRow>[]>(
    () => [
      {
        key: 'role',
        header: 'Role',
        width: proportional(2),
        sortable: true,
        renderCell: (r) => <span className="text-ink">{r.role}</span>,
      },
      {
        key: 'effort_mm',
        header: 'Effort (MM)',
        width: proportional(1),
        sortable: true,
        renderCell: (r) => <span className="text-ink-muted">{r.effort_mm ?? '—'}</span>,
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
              onClick={() => remove.mutate({ lineId: r.line_id, version: r.version })}
            />
          ) : null,
      },
    ],
    [canManage, remove],
  );

  return (
    <section className="space-y-3">
      <h3 className="text-ink font-medium">Staffing plan</h3>
      <div className="flex items-center justify-between gap-2">
        <Input
          label="Search staffing plan"
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
          idKey="line_id"
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
                icon={<Users className="size-6" />}
                title="No plan lines"
                description="Add the roles this project needs."
              />
            )
          }
        />
      )}
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
