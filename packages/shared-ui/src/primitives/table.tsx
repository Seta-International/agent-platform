import {
  type TablePlugin,
  type UseTablePaginationConfig,
  useTablePagination as useAstryxTablePagination,
} from '@astryxdesign/core/Table';
import { shouldShowPagination } from './pagination.tsx';

export type {
  BodyRowRenderProps,
  ColumnSettingsOption,
  TableColumn,
  TableDensity,
  TablePlugin,
  TableSortState,
  UseTableColumnResizeConfig,
  UseTableGroupedRowsConfig,
  UseTableGroupedRowsResult,
  UseTablePaginationConfig,
  UseTableRowExpansionConfig,
  UseTableSelectionConfig,
  UseTableSortableConfig,
  UseTableSortableStateConfig,
} from '@astryxdesign/core/Table';
export {
  paginateData,
  pixel,
  proportional,
  resolveColumnWidths,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHeader,
  TableHeaderCell,
  TableRow,
  useTableColumnResize,
  useTableColumnSettings,
  useTableColumnSettingsState,
  useTableGroupedRows,
  useTableRowExpansion,
  useTableRowExpansionState,
  useTableSelection,
  useTableSelectionState,
  useTableSortable,
  useTableSortableState,
} from '@astryxdesign/core/Table';

export { shouldShowPagination } from './pagination.tsx';

export function useTablePagination<TData extends Record<string, unknown> = Record<string, unknown>>(
  config: UseTablePaginationConfig,
): TablePlugin<TData> {
  const show = shouldShowPagination(config);
  return useAstryxTablePagination<TData>({
    ...config,
    hasMore: config.hasMore || show,
  });
}
