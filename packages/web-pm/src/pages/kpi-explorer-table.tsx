import { cn, Skeleton } from '@seta/shared-ui';
import type { ReactNode } from 'react';

// Bespoke Explorer table. The shared DataTable was removed when the app migrated to Astryx
// Table, but Astryx Table has no multi-level column-group headers — which this view needs
// for its Q/C/D/P category bands over per-metric sub-columns, plus sticky identity columns.
// So this renders a plain grouped/sticky <table>, reusing the exact classes the old
// DataTable produced. Read-only: no sort/filter/pagination (the toolbar was always off here).

interface CellCtx<T> {
  row: { original: T };
}

interface ColumnMeta {
  headerClassName?: string;
  cellClassName?: string;
}

export interface ExplorerLeafColumn<T> {
  id?: string;
  accessorKey?: keyof T & string;
  header: ReactNode | (() => ReactNode);
  meta?: ColumnMeta;
  cell?: (ctx: CellCtx<T>) => ReactNode;
}

export interface ExplorerGroupColumn<T> {
  id: string;
  header: string;
  meta?: ColumnMeta;
  columns: ExplorerLeafColumn<T>[];
}

export type ExplorerColumn<T> = ExplorerLeafColumn<T> | ExplorerGroupColumn<T>;

const headCellClass =
  'h-10 px-md text-left align-middle text-xs uppercase tracking-[0.04em] font-medium text-secondary';
const cellClass = 'px-md py-2.5 align-middle text-sm text-primary';

function isGroup<T>(c: ExplorerColumn<T>): c is ExplorerGroupColumn<T> {
  return 'columns' in c;
}

function renderHeader(header: ReactNode | (() => ReactNode)): ReactNode {
  return typeof header === 'function' ? (header as () => ReactNode)() : header;
}

function leafValue<T>(col: ExplorerLeafColumn<T>, row: T): ReactNode {
  if (col.cell) return col.cell({ row: { original: row } });
  if (col.accessorKey) return (row[col.accessorKey] ?? '') as ReactNode;
  return '';
}

export function KpiExplorerTable<T>({
  data,
  columns,
  isLoading,
  emptyState,
  getRowKey,
}: {
  data: T[];
  columns: ExplorerColumn<T>[];
  isLoading?: boolean;
  emptyState?: ReactNode;
  getRowKey: (row: T, index: number) => string;
}) {
  const leaves = columns.flatMap((c) => (isGroup(c) ? c.columns : [c]));
  const hasGroups = columns.some(isGroup);
  const colKey = (c: ExplorerLeafColumn<T>, i: number) => c.id ?? c.accessorKey ?? String(i);

  return (
    <div className="rounded-lg border border-hairline bg-canvas">
      <table className="w-full caption-bottom border-collapse">
        <thead className="bg-surface-1">
          <tr className="border-b border-hairline">
            {columns.map((c) =>
              isGroup(c) ? (
                <th
                  key={c.id}
                  colSpan={c.columns.length}
                  className={cn(
                    headCellClass,
                    'sticky top-0 z-10 bg-surface-1 text-center shadow-[0_1px_0_var(--color-hairline)]',
                    c.meta?.headerClassName,
                  )}
                >
                  {renderHeader(c.header)}
                </th>
              ) : (
                <th
                  key={colKey(c, 0)}
                  rowSpan={hasGroups ? 2 : 1}
                  className={cn(
                    headCellClass,
                    'sticky top-0 z-10 bg-surface-1 shadow-[0_1px_0_var(--color-hairline)]',
                    c.meta?.headerClassName,
                  )}
                >
                  {renderHeader(c.header)}
                </th>
              ),
            )}
          </tr>
          {hasGroups && (
            <tr className="border-b border-hairline">
              {columns.flatMap((c) =>
                isGroup(c)
                  ? c.columns.map((leaf, i) => (
                      <th
                        key={leaf.id ?? `${c.id}-${i}`}
                        className={cn(
                          headCellClass,
                          'sticky top-10 z-10 bg-surface-1 shadow-[0_1px_0_var(--color-hairline)]',
                          leaf.meta?.headerClassName,
                        )}
                      >
                        {renderHeader(leaf.header)}
                      </th>
                    ))
                  : [],
              )}
            </tr>
          )}
        </thead>
        <tbody>
          {isLoading ? (
            ['s0', 's1', 's2', 's3', 's4'].map((skId) => (
              <tr key={skId} className="border-b border-hairline-tertiary">
                {leaves.map((c, j) => (
                  <td key={`${skId}-${colKey(c, j)}`} className={cellClass}>
                    <Skeleton height={16} />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={leaves.length} className="p-0">
                {emptyState}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={getRowKey(row, rowIdx)}
                className="group border-b border-hairline-tertiary transition-colors hover:bg-surface-2"
              >
                {leaves.map((c, j) => (
                  <td key={colKey(c, j)} className={cn(cellClass, c.meta?.cellClassName)}>
                    {leafValue(c, row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
