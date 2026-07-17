import {
  Banner,
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Checkbox,
  type ColumnSettingsOption,
  Dialog,
  DialogHeader,
  EmptyState,
  HStack,
  Input,
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
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
  useToast,
  VStack,
} from '@seta/shared-ui';
import { usePermission } from '@seta/web-identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FolderKanban, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type AccountListRow, createAccount, fetchAccounts } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';

// Astryx Table columns require `T extends Record<string, unknown>`; the DTO
// lacks an index signature, so alias locally (do not touch the shared DTO).
type AccountRow = AccountListRow & Record<string, unknown>;

const PAGE_SIZE_OPTIONS = [25, 50, 100];

// Universe of columns for the column-settings picker — the deleted DataTable
// never disabled `enableColumnVisibility`/`enableHiding`, so all 5 columns
// were genuinely hideable; preserved as-is.
const COLUMN_OPTIONS: ColumnSettingsOption[] = [
  { key: 'name', label: 'Name' },
  { key: 'industry', label: 'Industry' },
  { key: 'am_worker_id', label: 'Account Manager' },
  { key: 'recruiter_count', label: 'Recruiters' },
  { key: 'project_count', label: 'Projects' },
];
const DEFAULT_COLUMN_KEYS = COLUMN_OPTIONS.map((c) => c.key);

function CreateAccountDialog({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createAccount({
        name,
        industry: industry.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ body: 'Account created' });
      onCreated();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setName('');
    setIndustry('');
    setError(null);
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  return (
    <>
      <Button size="sm" label="New account" onClick={() => setOpen(true)} />
      <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
        <Layout
          header={<DialogHeader title="Create account" onOpenChange={handleOpenChange} />}
          content={
            <LayoutContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Input
                    label="Name"
                    isRequired
                    value={name}
                    onChange={(value) => setName(value)}
                  />
                </div>
                <div className="space-y-1">
                  <Input
                    label="Industry"
                    value={industry}
                    onChange={(value) => setIndustry(value)}
                  />
                </div>
                {error && <Banner status="error" title={error} />}
              </div>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <Button variant="secondary" label="Cancel" onClick={() => setOpen(false)} />
              <Button
                label={mutation.isPending ? 'Creating…' : 'Create'}
                onClick={() => mutation.mutate()}
                isDisabled={mutation.isPending || !name.trim()}
              />
            </LayoutFooter>
          }
        />
      </Dialog>
    </>
  );
}

export function AccountsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = usePermission('pm.account.manage');

  const {
    data: accounts,
    isLoading,
    error,
  } = useQuery({
    queryKey: pmKeys.accounts(),
    queryFn: fetchAccounts,
  });

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeColumnKeys, setActiveColumnKeys] = useState<string[]>(DEFAULT_COLUMN_KEYS);

  const rows = (accounts ?? []) as AccountRow[];

  // The deleted DataTable defaulted `enableGlobalFilter` to `true` (this file
  // never disabled it) — its global filter matched every accessor-backed
  // column's raw value, which for this table is exactly what's displayed.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.industry, r.am_worker_id, String(r.recruiter_count), String(r.project_count)].some(
        (v) => (v ?? '').toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  const { sortedData, sort, sortConfig } = useTableSortableState<AccountRow>({
    data: filtered,
    comparators: {
      recruiter_count: (a, b) => a.recruiter_count - b.recruiter_count,
      project_count: (a, b) => a.project_count - b.project_count,
    },
  });
  const sortable = useTableSortable<AccountRow>(sortConfig);

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
  const pagination = useTablePagination<AccountRow>({
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
  const columnSettings = useTableColumnSettings<AccountRow>(
    columnSettingsState.columnSettingsConfig,
  );

  const columns = useMemo<TableColumn<AccountRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        width: proportional(2),
        sortable: true,
        renderCell: (r) => <span className="font-medium text-ink">{r.name}</span>,
      },
      {
        key: 'industry',
        header: 'Industry',
        width: proportional(1),
        sortable: true,
        renderCell: (r) => <span className="text-ink-muted">{r.industry ?? '—'}</span>,
      },
      {
        key: 'am_worker_id',
        header: 'Account Manager',
        width: proportional(1),
        sortable: true,
        renderCell: (r) => (
          <span className="font-mono text-caption text-ink-muted truncate block">
            {r.am_worker_id ?? '—'}
          </span>
        ),
      },
      {
        key: 'recruiter_count',
        header: 'Recruiters',
        width: pixel(110),
        align: 'end',
        sortable: true,
        renderCell: (r) => <span className="text-ink-muted">{r.recruiter_count}</span>,
      },
      {
        key: 'project_count',
        header: 'Projects',
        width: pixel(100),
        align: 'end',
        sortable: true,
        renderCell: (r) => <span className="text-ink-muted">{r.project_count}</span>,
      },
    ],
    [],
  );

  const actions = canManage ? (
    <CreateAccountDialog
      onCreated={() => void queryClient.invalidateQueries({ queryKey: pmKeys.accounts() })}
    />
  ) : undefined;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Breadcrumbs variant="supporting">
              <BreadcrumbItem href="/pm">Project Monitoring</BreadcrumbItem>
              <BreadcrumbItem isCurrent>Accounts</BreadcrumbItem>
            </Breadcrumbs>
            <HStack hAlign="between" vAlign="center" gap={2}>
              <HStack gap={2} vAlign="center">
                <Text as="h1" size="lg" weight="semibold">
                  Accounts
                </Text>
              </HStack>
              {actions}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <div className="page-container space-y-4 p-6">
            {error ? (
              <Banner status="error" title={(error as Error).message} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Input
                    label="Search accounts"
                    isLabelHidden
                    className="max-w-sm"
                    placeholder="Search accounts…"
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
                    {['s0', 's1', 's2', 's3', 's4'].map((id) => (
                      <Skeleton key={id} height={40} />
                    ))}
                  </div>
                ) : (
                  <Table
                    data={pageRows}
                    columns={columns}
                    idKey="account_id"
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
                                to: '/pm/accounts/$accountId',
                                params: { accountId: item.account_id },
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
                          title="No accounts yet"
                          description="Create an account to get started."
                        />
                      )
                    }
                  />
                )}
              </>
            )}
          </div>
        </LayoutContent>
      }
    />
  );
}
