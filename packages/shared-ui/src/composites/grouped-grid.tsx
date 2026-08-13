import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import type {
  BodyRowRenderProps,
  TableColumn,
  TableDensity,
  TablePlugin,
  TableSortState,
} from '../primitives/table';
import {
  Table,
  useTableColumnResize,
  useTableColumnSettings,
  useTableGroupedRows,
  useTableSortable,
  useTableSortableState,
} from '../primitives/table';

// Synthetic group-footer row injected into the flat data (mirrors the header
// sentinel technique inside Astryx's groupedRows plugin). The Proxy resolves
// arbitrary field access to '' so column renderCell functions never throw.
const GROUP_FOOTER = Symbol('groupedGridFooter');

interface FooterSentinel {
  [GROUP_FOOTER]: true;
  groupKey: string;
}

const FOOTER_PROXY_HANDLER: ProxyHandler<Record<string | symbol, unknown>> = {
  get(target, prop) {
    if (prop === GROUP_FOOTER || prop === 'groupKey') return target[prop];
    return prop in target ? target[prop] : '';
  },
};

function makeFooter<T extends Record<string, unknown>>(groupKey: string): T {
  const target: Record<string | symbol, unknown> = { [GROUP_FOOTER]: true, groupKey };
  return new Proxy(target, FOOTER_PROXY_HANDLER) as T;
}

function isFooter(item: unknown): item is FooterSentinel {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item as Record<symbol, unknown>)[GROUP_FOOTER] === true
  );
}

export interface GroupedGridProps<T extends Record<string, unknown>> {
  rows: ReadonlyArray<T>;
  columns: TableColumn<T>[];
  getRowId: (row: T) => string;
  groupBy: (row: T) => string;
  /**
   * Explicit group ordering. When `renderGroupFooter` is set, groups listed
   * here also render when empty (e.g. an empty bucket keeps its "Add a task"
   * affordance).
   */
  groupOrder?: string[];
  renderGroupHeader: (groupKey: string, count: number, collapsed: boolean) => ReactNode;
  /** Full-width row at the end of each expanded group (e.g. "Add a task"). */
  renderGroupFooter?: (groupKey: string) => ReactNode;
  collapsedGroups: Set<string>;
  onToggleGroup: (groupKey: string) => void;
  /** Accessible name for a data row (sets aria-label on the `<tr>`). */
  getRowLabel?: (row: T) => string;
  /** Fired when a row is clicked outside its interactive elements (peek intent). */
  onRowClick?: (id: string, row: T) => void;
  /** Row highlighted as the current peek target. */
  activeRowId?: string | null;
  /** Rows highlighted as selected (e.g. checkbox multi-select). */
  highlightedRowIds?: ReadonlySet<string>;
  /** Pixel width overrides keyed by column key; enables drag-resize handles. */
  columnWidths?: Record<string, number>;
  onColumnWidthsChange?: (updates: Record<string, number>) => void;
  /** Active column keys in display order; omitted = all columns, natural order. */
  columnOrder?: string[];
  onColumnOrderChange?: (next: string[]) => void;
  sort?: TableSortState;
  onSortChange?: (next: TableSortState) => void;
  density?: TableDensity;
  'data-testid'?: string;
}

export function GroupedGrid<T extends Record<string, unknown>>({
  rows,
  columns,
  getRowId,
  groupBy,
  groupOrder,
  renderGroupHeader,
  renderGroupFooter,
  collapsedGroups,
  onToggleGroup,
  getRowLabel,
  onRowClick,
  activeRowId,
  highlightedRowIds,
  columnWidths,
  onColumnWidthsChange,
  columnOrder,
  onColumnOrderChange,
  sort,
  onSortChange,
  density = 'balanced',
  'data-testid': testId,
}: GroupedGridProps<T>) {
  const sortState = useTableSortableState<T>({
    data: rows as T[],
    sort,
    onSortChange,
  });
  const sortPlugin = useTableSortable<T>(sortState.sortConfig);
  const sortedRows = sortState.sortedData;

  // Real per-group counts (the grouping plugin would count footer sentinels).
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of sortedRows) {
      const key = groupBy(row);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sortedRows, groupBy]);

  const dataWithFooters = useMemo(() => {
    if (!renderGroupFooter) return sortedRows;
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const row of sortedRows) {
      const key = groupBy(row);
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    for (const key of groupOrder ?? []) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return [...sortedRows, ...keys.map((key) => makeFooter<T>(key))];
  }, [sortedRows, renderGroupFooter, groupBy, groupOrder]);

  const groupByWithFooters = useCallback(
    (item: T) => (isFooter(item) ? item.groupKey : groupBy(item)),
    [groupBy],
  );

  const getRowKey = useCallback(
    (item: T) => (isFooter(item) ? `__footer_${item.groupKey}` : getRowId(item)),
    [getRowId],
  );

  const headerRenderer = useCallback(
    (groupKey: string, _count: number, collapsed: boolean) =>
      renderGroupHeader(groupKey, counts.get(groupKey) ?? 0, collapsed),
    [renderGroupHeader, counts],
  );

  const grouped = useTableGroupedRows<T>({
    data: dataWithFooters as T[],
    groupBy: groupByWithFooters,
    collapsedGroups,
    onToggleGroup,
    renderGroupHeader: headerRenderer,
    getRowKey,
    groupOrder,
  });

  // Footer rendering + row-click + active-row highlight. Runs after the
  // grouped plugin (record insertion order), so header rows are already
  // replaced; they're skipped via the `__group_` idKey prefix.
  const gridPlugin = useMemo<TablePlugin<T>>(
    () => ({
      transformBodyRow(props: BodyRowRenderProps, item: T): BodyRowRenderProps {
        if (isFooter(item)) {
          return {
            ...props,
            children: (
              // colSpan is clamped by the browser to the actual column count.
              <td colSpan={999} style={{ padding: 0 }}>
                {renderGroupFooter?.(item.groupKey)}
              </td>
            ),
          };
        }
        const key = grouped.idKey(item);
        if (typeof key === 'string' && key.startsWith('__group_')) {
          // The grouped plugin sets aria-expanded on the <tr>, which axe rejects
          // for role=row in a plain table (treegrid-only). The chevron button
          // inside the header cell carries the accessible expanded state.
          const { 'aria-expanded': _dropped, ...headerHtmlProps } = props.htmlProps as Record<
            string,
            unknown
          >;
          return { ...props, htmlProps: headerHtmlProps as typeof props.htmlProps };
        }
        const id = getRowId(item);
        const htmlProps = { ...props.htmlProps } as typeof props.htmlProps &
          Record<string, unknown>;
        htmlProps['data-row-id'] = id;
        if (getRowLabel) htmlProps['aria-label'] = getRowLabel(item);
        if (onRowClick) {
          htmlProps.onClick = (e: React.MouseEvent<HTMLElement>) => {
            const target = e.target as HTMLElement;
            // Clicks on interactive cell content keep their own meaning.
            if (
              target.closest(
                'button, a, input, select, textarea, [role="menu"], [role="menuitem"], [role="dialog"]',
              )
            ) {
              return;
            }
            onRowClick(id, item);
          };
          htmlProps.style = { ...htmlProps.style, cursor: 'pointer' };
        }
        if (highlightedRowIds?.has(id)) {
          htmlProps['data-selected'] = 'true';
          htmlProps.style = {
            ...htmlProps.style,
            backgroundColor: 'var(--color-background-muted)',
          };
        }
        if (activeRowId != null && id === activeRowId) {
          htmlProps['data-active'] = 'true';
          htmlProps.style = {
            ...htmlProps.style,
            backgroundColor: 'var(--color-background-muted)',
          };
        }
        return { ...props, htmlProps };
      },
    }),
    [
      renderGroupFooter,
      grouped.idKey,
      getRowId,
      getRowLabel,
      onRowClick,
      activeRowId,
      highlightedRowIds,
    ],
  );

  const settingsPlugin = useTableColumnSettings<T>({
    columns: useMemo(
      () =>
        columns.map((c) => ({
          key: c.key,
          label: typeof c.header === 'string' && c.header ? c.header : c.key,
        })),
      [columns],
    ),
    activeColumnKeys: columnOrder ?? columns.map((c) => c.key),
    onChangeActiveColumnKeys: (keys) => onColumnOrderChange?.([...keys]),
  });

  const resizePlugin = useTableColumnResize<T>({
    columnWidths,
    onColumnResizeEnd: onColumnWidthsChange,
    columns: columns as TableColumn<Record<string, unknown>>[],
  });

  const plugins: Record<string, TablePlugin<T>> = {
    sort: sortPlugin,
    columnSettings: settingsPlugin,
    grouped: grouped.plugin,
    grid: gridPlugin,
  };
  if (onColumnWidthsChange) plugins.resize = resizePlugin;

  return (
    <Table<T>
      data={grouped.data}
      columns={columns}
      idKey={grouped.idKey}
      plugins={plugins}
      density={density}
      dividers="rows"
      textOverflow="truncate"
      hasHover
      data-testid={testId}
    />
  );
}
