import { cn, Skeleton } from '@seta/shared-ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';

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
  header: ReactNode | (() => ReactNode);
  meta?: ColumnMeta;
  columns: ExplorerLeafColumn<T>[];
}

export type ExplorerColumn<T> = ExplorerLeafColumn<T> | ExplorerGroupColumn<T>;

const headCellClass =
  'h-10 px-3 text-left align-middle text-xs uppercase tracking-wide font-medium text-secondary';
const groupHeadCellClass = 'text-sm font-semibold text-primary';
const cellClass = 'px-3 py-2.5 align-middle text-base text-primary';

const HEAD_LINE = 'shadow-[0_1px_0_var(--color-border)]';
const HEAD_LINE_DIVIDER = 'shadow-[inset_1px_0_0_var(--color-border),0_1px_0_var(--color-border)]';
const CELL_DIVIDER = 'shadow-[inset_1px_0_0_var(--color-border)]';

const EDGE_FADE = 'pointer-events-none absolute inset-y-0 z-20 w-6 transition-opacity';
const FADE_END = {
  background: 'linear-gradient(to left, var(--color-border), transparent)',
};
const FADE_START = {
  background: 'linear-gradient(to right, var(--color-border), transparent)',
};

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

function useScrollEdges() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ start: false, end: false, viewport: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const sync = () => {
      const max = viewport.scrollWidth - viewport.clientWidth;
      setState({
        start: viewport.scrollLeft > 1,
        end: viewport.scrollLeft < max - 1,
        viewport: viewport.clientWidth,
      });
    };
    sync();
    viewport.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      viewport.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, []);

  return { viewportRef, contentRef, ...state };
}

export function KpiExplorerTable<T>({
  data,
  columns,
  isLoading,
  emptyState,
  getRowKey,
  onRowClick,
  regionLabel,
  pinnedStartWidth = 0,
  pinnedEndWidth = 0,
}: {
  data: T[];
  columns: ExplorerColumn<T>[];
  isLoading?: boolean;
  emptyState?: ReactNode;
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  regionLabel: string;
  pinnedStartWidth?: number;
  pinnedEndWidth?: number;
}) {
  const { viewportRef, contentRef, start, end, viewport } = useScrollEdges();
  const leaves = columns.flatMap((c) => (isGroup(c) ? c.columns : [c]));
  const hasGroups = columns.some(isGroup);
  const colKey = (c: ExplorerLeafColumn<T>, i: number) => c.id ?? c.accessorKey ?? String(i);

  const firstGroupId = columns.find(isGroup)?.id;
  const isDividerGroup = (c: ExplorerGroupColumn<T>) => c.id !== firstGroupId;
  const leafDivider = columns.flatMap((c) =>
    isGroup(c) ? c.columns.map((_, i) => isDividerGroup(c) && i === 0) : [false],
  );

  return (
    <div className="relative flex min-h-0 flex-col overflow-hidden">
      <section
        ref={viewportRef}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG 2.1.1 — the metric columns past the right edge are only reachable if the scroll region itself takes focus.
        tabIndex={0}
        aria-label={regionLabel}
        className="min-h-0 overflow-auto [scrollbar-gutter:stable] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        <div ref={contentRef} className="w-max min-w-full">
          <table className="w-full caption-bottom border-collapse">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {columns.map((c) =>
                  isGroup(c) ? (
                    <th
                      key={c.id}
                      colSpan={c.columns.length}
                      className={cn(
                        headCellClass,
                        groupHeadCellClass,
                        'sticky top-0 z-10 bg-surface text-center',
                        isDividerGroup(c) ? HEAD_LINE_DIVIDER : HEAD_LINE,
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
                        'sticky top-0 z-10 bg-surface',
                        HEAD_LINE,
                        c.meta?.headerClassName,
                      )}
                    >
                      {renderHeader(c.header)}
                    </th>
                  ),
                )}
              </tr>
              {hasGroups && (
                <tr className="border-b border-border">
                  {columns.flatMap((c) =>
                    isGroup(c)
                      ? c.columns.map((leaf, i) => (
                          <th
                            key={leaf.id ?? `${c.id}-${i}`}
                            className={cn(
                              headCellClass,
                              'sticky top-10 z-10 bg-surface',
                              isDividerGroup(c) && i === 0 ? HEAD_LINE_DIVIDER : HEAD_LINE,
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
                  <tr key={skId} className="border-b border-border">
                    {leaves.map((c, j) => (
                      <td
                        key={`${skId}-${colKey(c, j)}`}
                        className={cn(cellClass, leafDivider[j] && CELL_DIVIDER)}
                      >
                        <Skeleton height={16} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={leaves.length} className="p-0">
                    <div
                      className="sticky left-0"
                      style={viewport > 0 ? { width: viewport } : undefined}
                    >
                      {emptyState}
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, rowIdx) => (
                  <tr
                    key={getRowKey(row, rowIdx)}
                    className={cn(
                      'group border-b border-border transition-colors hover:bg-muted',
                      onRowClick && 'cursor-pointer',
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {leaves.map((c, j) => (
                      <td
                        key={colKey(c, j)}
                        className={cn(
                          cellClass,
                          c.meta?.cellClassName,
                          leafDivider[j] && CELL_DIVIDER,
                        )}
                      >
                        {leafValue(c, row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div
        aria-hidden="true"
        className={cn(EDGE_FADE, start ? 'opacity-100' : 'opacity-0')}
        style={{ ...FADE_START, left: pinnedStartWidth }}
      />
      <div
        aria-hidden="true"
        className={cn(EDGE_FADE, end ? 'opacity-100' : 'opacity-0')}
        style={{ ...FADE_END, right: pinnedEndWidth }}
      />
    </div>
  );
}
