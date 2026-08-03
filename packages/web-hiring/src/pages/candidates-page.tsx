import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Checkbox,
  type ColumnSettingsOption,
  EmptyState,
  HStack,
  Input,
  KanbanBoard,
  KanbanColumn,
  Layout,
  LayoutContent,
  LayoutHeader,
  Popover,
  paginateData,
  proportional,
  SegmentedControl,
  SegmentedControlItem,
  Selector,
  Skeleton,
  Table,
  type TableColumn,
  type TablePlugin,
  Text,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  Download,
  Handshake,
  LayoutGrid,
  List,
  ListChecks,
  Search,
  Settings2,
  Users,
} from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CandidateListItem,
  type CandStage,
  fetchCandidates,
  fetchRejectedCandidates,
  moveApplicationStage,
} from '../api/hiring-client.ts';
import { hiringKeys } from '../state/query-keys.ts';
import { CandidateCard } from './candidate-card.tsx';
import { CandidateDetailDrawer } from './candidate-detail-drawer.tsx';
import {
  BOARD_COLUMNS,
  type BoardColumnId,
  boardColumns,
  COLUMN_EMPTY_COPY,
  fitLabel,
  resolveStageDrop,
  STAGE_COLOR,
} from './candidate-utils.ts';
import { NewCandidateDialog } from './new-candidate-dialog.tsx';
import { TalentPoolCard } from './talent-pool-card.tsx';
import { on409 } from './utils.ts';

const NONE = '__none__';

const COLUMN_EMPTY_ICON: Record<string, ReactNode> = {
  new: <Users className="size-5" />,
  screening: <ListChecks className="size-5" />,
  interview: <CalendarClock className="size-5" />,
  offer: <Handshake className="size-5" />,
  hired: <BadgeCheck className="size-5" />,
  rejected: <Ban className="size-5" />,
};

// One stat tile per board column — the numbers track the filtered board buckets exactly. The
// last tile is "Rejected" (candidate reject decisions); it is NOT "Cancelled", which at the
// application level means the requisition was cancelled — a requisition signal, not a candidate one.
const STAGE_COUNT_SEGMENTS: { key: BoardColumnId; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'screening', label: 'Screening' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'hired', label: 'Hired' },
  { key: 'rejected', label: 'Rejected' },
];

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO lacks an index
// signature, so alias locally (do not touch the shared DTO).
type Row = CandidateListItem & Record<string, unknown>;

// Universe of columns for the column-settings picker. The deleted DataTable never disabled
// `enableColumnVisibility` here (and no column set `enableHiding: false`), so every column —
// including "Candidate" — was genuinely hideable; preserved as-is (no `isAlwaysVisible`).
const CANDIDATE_COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'name', label: 'Candidate' },
  { key: 'requisition_title', label: 'Position' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Stage' },
  { key: 'rating', label: 'Rating' },
  { key: 'fit', label: 'Fit' },
];
const DEFAULT_CANDIDATE_COLUMN_KEYS = CANDIDATE_COLUMN_OPTIONS.map((c) => c.key);
const CANDIDATE_PAGE_SIZE_OPTIONS = [25, 50, 100];

// List-view cell: keep every value on one line — `truncate` (nowrap + ellipsis) plus the table's
// horizontal scroll means long text is read by scrolling, never by wrapping.
const LIST_CELL = 'block truncate';
// Uniform min row height of two line-heights (`2lh` = double a single line) so rows stay tall and
// even now that nothing wraps — the same plugin the Requisitions list uses, kept identical here.
const uniformRowHeight: TablePlugin<Row> = {
  transformBodyCell: (props) => ({
    ...props,
    htmlProps: { ...props.htmlProps, style: { ...props.htmlProps.style, height: '2lh' } },
  }),
};

function toCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCandidatesCsv(rows: CandidateListItem[]) {
  const header = [
    'Name',
    'Position',
    'Seniority',
    'Source',
    'Stage',
    'Rating',
    'Fit',
    'Skills',
    'Applied at',
  ];
  const lines = rows.map((r) => [
    r.name,
    r.requisition_title,
    r.seniority ?? '',
    r.source ?? '',
    r.stage,
    r.rating ?? '',
    r.fit.required === 0 ? '' : `${Math.round(r.fit.score * 100)}%`,
    r.skills.map((s) => s.skill_name).join('; '),
    new Date(r.applied_at).toISOString().slice(0, 10),
  ]);
  const csv = [header, ...lines].map((line) => line.map(toCsvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'candidates.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Shared client-side filtering for the board's active pipeline and its Rejected column, so both
// respond to the same search box and filter selectors.
function filterCandidates(
  items: CandidateListItem[],
  f: { q: string; reqFilter: string; seniorityFilter: string; sourceFilter: string },
): CandidateListItem[] {
  let r = items;
  if (f.reqFilter) r = r.filter((c) => c.requisition_id === f.reqFilter);
  if (f.seniorityFilter) r = r.filter((c) => c.seniority === f.seniorityFilter);
  if (f.sourceFilter) r = r.filter((c) => c.source === f.sourceFilter);
  if (f.q.trim()) {
    const needle = f.q.toLowerCase();
    r = r.filter((c) =>
      `${c.name} ${c.requisition_title} ${c.seniority ?? ''} ${c.skills.map((s) => s.skill_name).join(' ')}`
        .toLowerCase()
        .includes(needle),
    );
  }
  return r;
}

export function onBoardDragEnd(
  items: CandidateListItem[],
  mutate: (move: {
    application_id: string;
    to: import('../api/hiring-client.ts').CandStage;
    expected_version: number;
  }) => void,
) {
  return (result: DropResult) => {
    const move = resolveStageDrop({
      draggableId: result.draggableId,
      source: result.source.droppableId,
      destination: result.destination?.droppableId ?? null,
      items,
    });
    if (move) mutate(move);
  };
}

export function CandidatesPage() {
  const toast = useToast();
  const canCreate = usePermission('hiring.candidate.create');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [q, setQ] = useState('');
  const [reqFilter, setReqFilter] = useState('');
  const [seniorityFilter, setSeniorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_CANDIDATE_COLUMN_KEYS);
  const [optimisticStages, setOptimisticStages] = useState<Record<string, CandStage>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: hiringKeys.candidates(),
    queryFn: fetchCandidates,
  });
  // Rejected candidates load separately (fetchCandidates returns active+hired only) and feed the
  // board's read-only Rejected column.
  const { data: rejectedData } = useQuery({
    queryKey: hiringKeys.rejectedCandidates(),
    queryFn: fetchRejectedCandidates,
  });

  const candidatesWithOptimistic = useMemo(() => {
    if (!data) return [];
    if (Object.keys(optimisticStages).length === 0) return data;
    return data.map((c) => {
      const override = optimisticStages[c.application_id];
      return override ? { ...c, stage: override } : c;
    });
  }, [data, optimisticStages]);

  const rows = useMemo(
    () =>
      filterCandidates(candidatesWithOptimistic, { q, reqFilter, seniorityFilter, sourceFilter }),
    [candidatesWithOptimistic, q, reqFilter, seniorityFilter, sourceFilter],
  );
  const rejectedRows = useMemo(
    () => filterCandidates(rejectedData ?? [], { q, reqFilter, seniorityFilter, sourceFilter }),
    [rejectedData, q, reqFilter, seniorityFilter, sourceFilter],
  );

  const { sortedData, sort, sortConfig } = useTableSortableState<Row>({ data: rows as Row[] });
  const sortable = useTableSortable<Row>(sortConfig);

  // Reset to page 1 whenever a filter narrows/widens the result set, or the sort order changes —
  // matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on both
  // `columnFilters`/`globalFilter` AND `sorting` state changes (getSortedRowModel calls
  // `table._autoResetPageIndex()` unconditionally; `manualPagination` was never set here).
  // biome-ignore lint/correctness/useExhaustiveDependencies: the filters and sort are the intentional reset triggers, unread in the body.
  useEffect(() => {
    setPage(1);
  }, [q, reqFilter, seniorityFilter, sourceFilter, sort]);

  const pageRows = useMemo(
    () => paginateData(sortedData, page, pageSize),
    [sortedData, page, pageSize],
  );
  const pagination = useTablePagination<Row>({
    page,
    onPageChange: setPage,
    totalItems: sortedData.length,
    pageSize,
    onPageSizeChange: (ps) => {
      setPageSize(ps);
      setPage(1);
    },
    pageSizeOptions: CANDIDATE_PAGE_SIZE_OPTIONS,
  });

  const columnSettingsState = useTableColumnSettingsState({
    columns: CANDIDATE_COLUMN_OPTIONS,
    activeColumnKeys,
    onChangeActiveColumnKeys: (keys) => setActiveColumnKeys([...keys]),
  });
  const columnSettings = useTableColumnSettings<Row>(columnSettingsState.columnSettingsConfig);

  const reqOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of data ?? []) seen.set(c.requisition_id, c.requisition_title);
    return [...seen.entries()];
  }, [data]);

  const seniorityOptions = useMemo(
    () => [...new Set((data ?? []).map((c) => c.seniority).filter((v): v is string => !!v))].sort(),
    [data],
  );
  const sourceOptions = useMemo(
    () => [...new Set((data ?? []).map((c) => c.source).filter((v): v is string => !!v))].sort(),
    [data],
  );

  const queryClient = useQueryClient();
  const canManage = usePermission('hiring.candidate.manage');
  const stageMove = useMutation({
    mutationFn: (m: {
      application_id: string;
      to: 'new' | 'screening' | 'interview' | 'offer';
      expected_version: number;
    }) =>
      moveApplicationStage(m.application_id, { expected_version: m.expected_version, to: m.to }),
    onMutate: (m) => {
      // Snapshot previous candidates synchronously
      const previousCandidates = queryClient.getQueryData<CandidateListItem[]>(
        hiringKeys.candidates(),
      );

      // Optimistically update query cache SYNCHRONOUSLY before any async calls so React renders the new stage immediately
      if (previousCandidates) {
        queryClient.setQueryData<CandidateListItem[]>(hiringKeys.candidates(), (old) => {
          if (!old) return old;
          return old.map((c) =>
            c.application_id === m.application_id
              ? { ...c, stage: m.to, version: c.version + 1 }
              : c,
          );
        });
      }

      // Fire-and-forget query cancellation in the background without delaying setQueryData
      void queryClient.cancelQueries({ queryKey: hiringKeys.candidates() });
      void queryClient.cancelQueries({ queryKey: hiringKeys.candidateStageCounts() });

      return { previousCandidates };
    },
    onError: (e: Error, _m, context) => {
      if (context?.previousCandidates) {
        queryClient.setQueryData(hiringKeys.candidates(), context.previousCandidates);
      }
      on409(toast, e, queryClient, hiringKeys.candidates());
    },
    onSuccess: () => {
      toast({ body: 'Stage updated' });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidates() });
      void queryClient.invalidateQueries({ queryKey: hiringKeys.candidateStageCounts() });
    },
  });

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const move = resolveStageDrop({
        draggableId: result.draggableId,
        source: result.source.droppableId,
        destination: result.destination?.droppableId ?? null,
        items: rows,
      });
      if (!move) return;

      // 1. Synchronously update local React state so React updates DOM immediately in this frame!
      setOptimisticStages((prev) => ({
        ...prev,
        [move.application_id]: move.to,
      }));

      // 2. Update Query Cache optimistically
      queryClient.setQueryData<CandidateListItem[]>(hiringKeys.candidates(), (old) => {
        if (!old) return old;
        return old.map((c) =>
          c.application_id === move.application_id
            ? { ...c, stage: move.to, version: c.version + 1 }
            : c,
        );
      });

      stageMove.mutate(move, {
        onError: () => {
          setOptimisticStages((prev) => {
            const next = { ...prev };
            delete next[move.application_id];
            return next;
          });
        },
        onSettled: () => {
          setOptimisticStages((prev) => {
            const next = { ...prev };
            delete next[move.application_id];
            return next;
          });
        },
      });
    },
    [rows, queryClient, stageMove],
  );

  // Rejected rows come from a separate query; merge them in only for the board's column buckets.
  // The active-pipeline `rows` still drives drag/list/export/filter options untouched. Every stat
  // tile then reads straight from `groups`, so each number matches the column beneath it.
  const groups = useMemo(() => boardColumns([...rows, ...rejectedRows]), [rows, rejectedRows]);

  const columns = useMemo<TableColumn<Row>[]>(
    () => [
      {
        key: 'name',
        header: 'Candidate',
        sortable: true,
        // Each column gets a minWidth floor so its content sits on one line; the sum drives the
        // table's min-width, and the wrapper below scrolls horizontally when it exceeds the view.
        width: proportional(1, { minWidth: 180 }),
        renderCell: (r) => (
          <span className={`${LIST_CELL} font-medium text-primary`}>{r.name}</span>
        ),
      },
      {
        key: 'requisition_title',
        header: 'Position',
        sortable: true,
        width: proportional(1, { minWidth: 260 }),
        renderCell: (r) => (
          <span className={`${LIST_CELL} text-secondary`}>{r.requisition_title}</span>
        ),
      },
      {
        key: 'seniority',
        header: 'Seniority',
        sortable: true,
        width: proportional(1, { minWidth: 120 }),
        renderCell: (r) => (
          <span className={`${LIST_CELL} text-secondary`}>{r.seniority ?? '—'}</span>
        ),
      },
      {
        key: 'source',
        header: 'Source',
        sortable: true,
        width: proportional(1, { minWidth: 140 }),
        renderCell: (r) => <span className={`${LIST_CELL} text-secondary`}>{r.source ?? '—'}</span>,
      },
      {
        key: 'stage',
        header: 'Stage',
        sortable: true,
        width: proportional(1, { minWidth: 130 }),
        renderCell: (r) => (
          <span className={`${LIST_CELL} text-secondary capitalize`}>{r.stage}</span>
        ),
      },
      {
        key: 'rating',
        header: 'Rating',
        sortable: true,
        width: proportional(1, { minWidth: 100 }),
        renderCell: (r) => <span className={`${LIST_CELL} text-secondary`}>{r.rating ?? 0}/5</span>,
      },
      {
        // The old column had accessorKey 'fit' (an object, not a primitive) and never disabled
        // sorting — reproduced as `sortable: true` for parity, even though the default
        // string/number comparator treats a non-primitive value as empty and never reorders
        // (matches the old, equally non-functional, TanStack default sortingFn behavior here).
        key: 'fit',
        header: 'Fit',
        sortable: true,
        width: proportional(1, { minWidth: 110 }),
        renderCell: (r) => (
          <span className={`${LIST_CELL} text-secondary`}>{fitLabel(r.fit).text}</span>
        ),
      },
    ],
    [],
  );

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/hiring">Hiring Management</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Candidates</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Candidates
                </Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <Button
                  variant="secondary"
                  size="sm"
                  label="Export"
                  icon={<Download className="size-4" />}
                  isDisabled={rows.length === 0}
                  onClick={() => exportCandidatesCsv(rows)}
                />
                {canCreate ? <NewCandidateDialog /> : undefined}
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          {/* The page scrolls as a whole (LayoutContent owns the scroll): the board grows to its
              content and the Talent pool sits below it, so every candidate is reachable by
              scrolling down instead of relying on a fragile per-column inner scroll. */}
          <div className="flex flex-col gap-4 p-6">
            <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-card sm:grid-cols-6">
              {STAGE_COUNT_SEGMENTS.map((seg) => (
                <div key={seg.key} className="px-4 py-3">
                  {/* Number is ink (achromatic, like the detail drawer); the stage colour is a
                      small dot on the label, not the big number. */}
                  <div className="text-3xl font-bold text-primary">{groups[seg.key].length}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-secondary">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STAGE_COLOR[seg.key] }}
                      aria-hidden
                    />
                    {seg.label}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                label="Search candidates"
                isLabelHidden
                startIcon={<Search className="size-3.5" aria-hidden />}
                value={q}
                onChange={(value) => setQ(value)}
                placeholder="Search candidate"
                className="max-w-xs flex-1"
              />
              <Selector
                label="Filter by role"
                isLabelHidden
                options={[
                  { value: NONE, label: 'All roles' },
                  ...reqOptions.map(([id, title]) => ({ value: id, label: title })),
                ]}
                value={reqFilter || NONE}
                onChange={(v) => setReqFilter(v === NONE ? '' : v)}
                placeholder="All roles"
              />
              <Selector
                label="Filter by seniority"
                isLabelHidden
                options={[
                  { value: NONE, label: 'All seniority' },
                  ...seniorityOptions.map((s) => ({ value: s, label: s })),
                ]}
                value={seniorityFilter || NONE}
                onChange={(v) => setSeniorityFilter(v === NONE ? '' : v)}
                placeholder="Seniority"
              />
              <Selector
                label="Filter by source"
                isLabelHidden
                options={[
                  { value: NONE, label: 'All sources' },
                  ...sourceOptions.map((s) => ({ value: s, label: s })),
                ]}
                value={sourceFilter || NONE}
                onChange={(v) => setSourceFilter(v === NONE ? '' : v)}
                placeholder="Source"
              />
              <div className="ml-auto">
                <SegmentedControl
                  label="Candidates view"
                  value={view}
                  onChange={(v) => setView(v as 'board' | 'list')}
                >
                  <SegmentedControlItem
                    value="board"
                    label="Board"
                    icon={<LayoutGrid aria-hidden="true" />}
                  />
                  <SegmentedControlItem
                    value="list"
                    label="List"
                    icon={<List aria-hidden="true" />}
                  />
                </SegmentedControl>
              </div>
            </div>

            {error ? (
              <Banner status="error" title={(error as Error).message} />
            ) : view === 'list' ? (
              <div className="space-y-3">
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
                        {CANDIDATE_COLUMN_OPTIONS.map((col) => (
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
                  // Horizontal scroll: with every cell on one line the table can exceed the view;
                  // its column minWidths set the scroll width, and this wrapper does the scrolling.
                  <div className="overflow-x-auto">
                    <Table
                      data={pageRows}
                      columns={columns}
                      idKey="application_id"
                      textOverflow="truncate"
                      plugins={{
                        pagination,
                        sortable,
                        columnSettings,
                        uniformRowHeight,
                        rowClick: {
                          transformBodyRow: (props, item) => ({
                            ...props,
                            htmlProps: {
                              ...props.htmlProps,
                              style: { ...props.htmlProps.style, cursor: 'pointer' },
                              onClick: () => setSelected(item.candidate_id),
                            },
                          }),
                        },
                      }}
                      emptyState={
                        <EmptyState
                          icon={<Users className="size-6" />}
                          title="No candidates yet"
                          description="Add a candidate to get started."
                        />
                      }
                    />
                  </div>
                )}
              </div>
            ) : isLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-40 animate-pulse rounded-lg border border-border bg-surface"
                  />
                ))}
              </div>
            ) : (data ?? []).length === 0 && (rejectedData ?? []).length === 0 ? (
              <EmptyState
                icon={<Users className="size-6" />}
                title="No candidates yet"
                description="Add a candidate to get started."
              />
            ) : (
              <div className="-mx-6">
                <DragDropContext onDragEnd={handleDragEnd}>
                  <KanbanBoard>
                    {BOARD_COLUMNS.map((col) => (
                      <Droppable
                        key={col.id}
                        droppableId={col.id}
                        isDropDisabled={col.id === 'hired' || col.id === 'rejected' || !canManage}
                      >
                        {(provided, snapshot) => (
                          <KanbanColumn
                            name={col.label}
                            count={groups[col.id].length}
                            color={STAGE_COLOR[col.id]}
                            // `width` is a min-width floor (FUT-725): columns flex to fill the
                            // board row but never shrink below this. A comfortable 300px keeps the
                            // candidate cards readable; once the columns outgrow the board width,
                            // the board (overflow:auto) scrolls horizontally instead of squeezing.
                            width={300}
                            emptyState={
                              <EmptyState
                                className="py-4"
                                icon={COLUMN_EMPTY_ICON[col.id]}
                                title={COLUMN_EMPTY_COPY[col.id].title}
                                description={COLUMN_EMPTY_COPY[col.id].description}
                              />
                            }
                            droppable={{
                              ref: provided.innerRef,
                              // Why: @hello-pangea/dnd uses string-indexed data-rfd-* keys that don't satisfy React's HTMLAttributes shape.
                              rootProps:
                                provided.droppableProps as unknown as HTMLAttributes<HTMLElement>,
                              isDraggingOver: snapshot.isDraggingOver,
                              placeholder: provided.placeholder,
                            }}
                          >
                            {groups[col.id].map((item, idx) => (
                              <Draggable
                                key={item.application_id}
                                draggableId={item.application_id}
                                index={idx}
                                isDragDisabled={!canManage || col.id === 'rejected'}
                              >
                                {(dp, ds) => (
                                  <CandidateCard
                                    item={item}
                                    onSelect={setSelected}
                                    draggable={{
                                      ref: dp.innerRef,
                                      rootProps: dp.draggableProps,
                                      handleProps: dp.dragHandleProps ?? undefined,
                                      isDragging: ds.isDragging,
                                      extraStyle: dp.draggableProps.style,
                                    }}
                                  />
                                )}
                              </Draggable>
                            ))}
                          </KanbanColumn>
                        )}
                      </Droppable>
                    ))}
                  </KanbanBoard>
                </DragDropContext>
              </div>
            )}
            <TalentPoolCard
              onOpenCandidate={setSelected}
              layout={view}
              q={q}
              reqFilter={reqFilter}
              seniorityFilter={seniorityFilter}
            />
          </div>
          <CandidateDetailDrawer candidateId={selected} onClose={() => setSelected(null)} />
        </LayoutContent>
      }
    />
  );
}
