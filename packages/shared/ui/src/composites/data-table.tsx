import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { Button } from '../primitives/button';
import { Checkbox } from '../primitives/checkbox';
import { Input } from '../primitives/input';
import { Skeleton } from '../primitives/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/table';
import { DataTableColumnHeader } from './data-table-column-header';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import { EmptyState } from './empty-state';

interface ClientPagination {
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

interface DataTableBaseProps<TData, TValue> {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  enableGlobalFilter?: boolean;
  globalFilterPlaceholder?: string;
  enableColumnVisibility?: boolean;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  enableExpansion?: boolean;
  renderSubComponent?: (props: { row: Row<TData> }) => React.ReactNode;
  getRowCanExpand?: (row: Row<TData>) => boolean;
}

export interface DataTableClientProps<TData, TValue = unknown>
  extends DataTableBaseProps<TData, TValue> {
  mode?: 'client';
  pagination?: ClientPagination | false;
}

export interface DataTableServerProps<TData, TValue = unknown>
  extends DataTableBaseProps<TData, TValue> {
  mode: 'server';
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  globalFilter: string;
  onGlobalFilterChange: OnChangeFn<string>;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  pageCount: number;
  rowCount: number;
}

export type DataTableProps<TData, TValue = unknown> =
  | DataTableClientProps<TData, TValue>
  | DataTableServerProps<TData, TValue>;

export function DataTable<TData, TValue>(props: DataTableProps<TData, TValue>) {
  const { data, columns } = props;
  const isServer = props.mode === 'server';

  const [sortingInternal, setSortingInternal] = React.useState<SortingState>([]);
  const [globalFilterInternal, setGlobalFilterInternal] = React.useState('');
  const [columnFiltersInternal, setColumnFiltersInternal] = React.useState<ColumnFiltersState>([]);
  const [paginationInternal, setPaginationInternal] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize:
      (props.mode !== 'server' && props.pagination !== false
        ? props.pagination?.defaultPageSize
        : undefined) ?? 25,
  });
  const [rowSelectionInternal, setRowSelectionInternal] = React.useState<RowSelectionState>({});
  const [columnVisibilityInternal, setColumnVisibilityInternal] = React.useState<VisibilityState>(
    {},
  );

  const sorting = isServer ? props.sorting : sortingInternal;
  const onSortingChange = isServer ? props.onSortingChange : setSortingInternal;
  const globalFilter = isServer ? props.globalFilter : globalFilterInternal;
  const onGlobalFilterChange = isServer ? props.onGlobalFilterChange : setGlobalFilterInternal;
  const columnFilters = isServer ? props.columnFilters : columnFiltersInternal;
  const onColumnFiltersChange = isServer ? props.onColumnFiltersChange : setColumnFiltersInternal;
  const pagination = isServer ? props.pagination : paginationInternal;
  const onPaginationChange = isServer ? props.onPaginationChange : setPaginationInternal;
  const rowSelection = props.rowSelection ?? rowSelectionInternal;
  const onRowSelectionChange = props.onRowSelectionChange ?? setRowSelectionInternal;
  const columnVisibility = props.columnVisibility ?? columnVisibilityInternal;
  const onColumnVisibilityChange = props.onColumnVisibilityChange ?? setColumnVisibilityInternal;

  const effectiveColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
    const cols: ColumnDef<TData, TValue>[] = [];
    if (props.enableExpansion) {
      cols.push({
        id: '__expand',
        header: () => null,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand row"
              onClick={row.getToggleExpandedHandler()}
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </Button>
          ) : null,
        enableSorting: false,
        enableHiding: false,
      });
    }
    if (props.enableRowSelection) {
      cols.push({
        id: '__select',
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      });
    }
    return [...cols, ...columns];
  }, [columns, props.enableExpansion, props.enableRowSelection]);

  const showPagination = !(props.mode !== 'server' && props.pagination === false);

  const table = useReactTable({
    data,
    columns: effectiveColumns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      pagination,
      rowSelection,
      columnVisibility,
    },
    onSortingChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onPaginationChange,
    onRowSelectionChange,
    onColumnVisibilityChange,
    enableRowSelection: props.enableRowSelection,
    getRowCanExpand: props.getRowCanExpand ?? (() => Boolean(props.enableExpansion)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    manualSorting: isServer,
    manualFiltering: isServer,
    manualPagination: isServer,
    pageCount: isServer ? props.pageCount : undefined,
  });

  const rowCount = isServer ? props.rowCount : table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;

  const enableGlobalFilter = props.enableGlobalFilter ?? true;
  const enableColumnVisibility = props.enableColumnVisibility ?? true;

  return (
    <div className="space-y-md">
      <DataTableToolbar
        table={table}
        enableColumnVisibility={enableColumnVisibility}
        searchSlot={
          enableGlobalFilter ? (
            <Input
              placeholder={props.globalFilterPlaceholder ?? 'Search…'}
              value={globalFilter ?? ''}
              onChange={(e) => onGlobalFilterChange(e.target.value)}
              className="max-w-sm"
            />
          ) : null
        }
      />
      <div className="rounded-md border border-hairline">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <DataTableColumnHeader
                        column={h.column}
                        title={flexRender(h.column.columnDef.header, h.getContext())}
                      />
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {props.isLoading ? (
              ['s0', 's1', 's2', 's3', 's4'].map((skId) => (
                <TableRow key={skId}>
                  {effectiveColumns.map((col, j) => (
                    <TableCell key={`${skId}-${col.id ?? String(j)}`}>
                      <Skeleton className="h-4 w-full" data-skeleton="true" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={effectiveColumns.length}>
                  {props.emptyState ?? <EmptyState title="No results" />}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <React.Fragment key={row.id}>
                  <TableRow data-state={row.getIsSelected() ? 'selected' : undefined}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext()) ??
                          String(cell.getValue() ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && props.renderSubComponent && (
                    <TableRow>
                      <TableCell colSpan={row.getVisibleCells().length}>
                        {props.renderSubComponent({ row })}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
        {showPagination && (
          <DataTablePagination
            table={table}
            rowCount={rowCount}
            pageSizeOptions={
              props.mode !== 'server' && props.pagination !== false
                ? props.pagination?.pageSizeOptions
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
