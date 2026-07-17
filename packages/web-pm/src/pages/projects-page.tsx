import {
  Badge,
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Checkbox,
  type ColumnSettingsOption,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutHeader,
  PageContainer,
  Popover,
  paginateData,
  pixel,
  proportional,
  Skeleton,
  Table,
  type TableColumn,
  Text,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTablePagination,
  useTableSortable,
  useTableSortableState,
  VStack,
} from '@seta/shared-ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FolderKanban, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { fetchProjects, type ProjectListRow } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

const STATUS_VARIANT: Record<ProjectListRow['status'], 'neutral' | 'success'> = {
  active: 'success',
  on_hold: 'neutral',
  closed: 'neutral',
};

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type ProjectRow = ProjectListRow & Record<string, unknown>;

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Universe of columns for the column-settings picker. The deleted DataTable
// never disabled `enableColumnVisibility` or `enableHiding` on any column, so
// every column (including "Project") was genuinely hideable — preserved as-is.
const COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'name', label: 'Project' },
  { key: 'phase', label: 'Phase' },
  { key: 'status', label: 'Status' },
  { key: 'pm_worker_id', label: 'PM' },
];
const DEFAULT_COLUMN_KEYS = COLUMN_OPTIONS.map((c) => c.key);

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: pmKeys.projects(),
    queryFn: fetchProjects,
  });

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);

  const rows = (data ?? []) as ProjectRow[];

  // The deleted DataTable defaulted `enableGlobalFilter` to `true` (never
  // disabled here) — its global filter matched every accessor-backed column's
  // raw value, which for this table is exactly what's displayed.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.phase, r.status, r.pm_worker_id].some((v) => (v ?? '').toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const { sortedData, sort, sortConfig } = useTableSortableState<ProjectRow>({ data: filtered });
  const sortable = useTableSortable<ProjectRow>(sortConfig);

  // Reset to page 1 on sort change — old TanStack autoResetPageIndex parity (see candidates-page).
  // The search filter already resets page inline in its own onChange handler below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sort is the intentional reset trigger, unread in the body.
  useEffect(() => {
    setPage(1);
  }, [sort]);

  const pageRows = useMemo(
    () => paginateData(sortedData, page, pageSize),
    [sortedData, page, pageSize],
  );
  const pagination = useTablePagination<ProjectRow>({
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
  const columnSettings = useTableColumnSettings<ProjectRow>(
    columnSettingsState.columnSettingsConfig,
  );

  const columns = useMemo<TableColumn<ProjectRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Project',
        width: proportional(2),
        sortable: true,
        renderCell: (r) => <span className="font-medium text-primary">{r.name}</span>,
      },
      {
        key: 'phase',
        header: 'Phase',
        width: pixel(120),
        sortable: true,
        renderCell: (r) => <Badge variant="neutral" label={r.phase} />,
      },
      {
        key: 'status',
        header: 'Status',
        width: pixel(120),
        sortable: true,
        renderCell: (r) => <Badge variant={STATUS_VARIANT[r.status]} label={r.status} />,
      },
      {
        key: 'pm_worker_id',
        header: 'PM',
        width: proportional(1),
        sortable: true,
        renderCell: (r) => (
          <span className="font-mono text-caption text-secondary truncate block">
            {r.pm_worker_id ?? '—'}
          </span>
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
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Projects</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Projects
                </Text>
              </HStack>
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <PageContainer className="space-y-4">
            {error ? (
              <Banner status="error" title={(error as Error).message} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Input
                    label="Search projects"
                    isLabelHidden
                    className="max-w-sm"
                    placeholder="Search projects…"
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
                        <div className="px-1 pb-1 text-eyebrow uppercase tracking-[0.04em] text-secondary">
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
                    {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                      <Skeleton key={id} height={40} />
                    ))}
                  </div>
                ) : (
                  <Table
                    data={pageRows}
                    columns={columns}
                    idKey="project_id"
                    plugins={{
                      pagination,
                      sortable,
                      columnSettings,
                      rowClick: {
                        transformBodyRow: (props, item) => ({
                          ...props,
                          htmlProps: {
                            ...props.htmlProps,
                            style: { ...props.htmlProps.style, cursor: 'pointer' },
                            onClick: () =>
                              void navigate({
                                to: '/pm/projects/$projectId',
                                params: { projectId: item.project_id },
                              }),
                          },
                        }),
                      },
                    }}
                    emptyState={
                      search.trim() ? (
                        <EmptyState
                          title="No results match these filters"
                          description="Try removing a filter or clearing your search."
                          actions={<Button label="Clear filters" onClick={() => setSearch('')} />}
                        />
                      ) : (
                        <EmptyState
                          icon={<FolderKanban className="size-6" />}
                          title="No projects yet"
                          description="Approved charters become projects here."
                        />
                      )
                    }
                  />
                )}
              </>
            )}
          </PageContainer>
        </LayoutContent>
      }
    />
  );
}
