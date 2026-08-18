import type { PaginationProps } from '@astryxdesign/core/Pagination';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Selector } from './selector';

export type {
  PaginationProps,
  PaginationSize,
  PaginationVariant,
  PaginationVariantMap,
} from '@astryxdesign/core/Pagination';
export { generatePageRange, Pagination } from '@astryxdesign/core/Pagination';

export interface PaginationFooterProps extends PaginationProps {
  pageSizeLabel?: string;
}

const PAGE_SIZE_SELECTOR_WIDTH = 80;

export function PaginationFooter({
  pageSizeOptions,
  onPageSizeChange,
  pageSize,
  pageSizeLabel = 'Items per page',
  size = 'md',
  isDisabled,
  ...paginationProps
}: PaginationFooterProps) {
  const { totalItems, totalPages } = paginationProps;
  if ((totalItems != null && totalItems <= 0) || (totalPages != null && totalPages <= 0)) {
    return null;
  }

  const hasPageSizes =
    pageSizeOptions != null && pageSizeOptions.length > 0 && onPageSizeChange != null;

  return (
    <div className="flex items-center gap-4">
      {hasPageSizes ? (
        <Selector
          label={pageSizeLabel}
          isLabelHidden
          placement="above"
          width={PAGE_SIZE_SELECTOR_WIDTH}
          size={size}
          isDisabled={isDisabled}
          options={pageSizeOptions.map(String)}
          value={String(pageSize ?? pageSizeOptions[0])}
          onChange={(next) => onPageSizeChange(Number(next))}
        />
      ) : null}
      <Pagination {...paginationProps} pageSize={pageSize} size={size} isDisabled={isDisabled} />
    </div>
  );
}
PaginationFooter.displayName = 'PaginationFooter';

export interface ShouldShowPaginationConfig {
  totalItems?: number | null;
  totalPages?: number | null;
  hasMore?: boolean | null;
  pageSize?: number | null;
  pageSizeOptions?: number[] | null;
}

/**
 * Centralized, stateless utility to determine whether pagination controls should be rendered.
 *
 * Invariant:
 * - If the dataset fits entirely within the smallest available page size (e.g. totalItems <= 25),
 *   pagination is hidden in both List and Card views.
 * - If the dataset exceeds the smallest available page size (e.g. totalItems > 25), pagination
 *   controls remain visible even when current pageSize displays all items on page 1 (e.g. pageSize = 100),
 *   retaining access to the page-size selector.
 */
export function shouldShowPagination(config: ShouldShowPaginationConfig): boolean {
  if (config.hasMore === true) {
    return true;
  }

  const options = config.pageSizeOptions;
  const minPageSize =
    options && options.length > 0 ? Math.min(...options) : (config.pageSize ?? 10);

  if (config.totalItems != null) {
    if (config.totalItems <= 0) {
      return false;
    }
    const effectivePageSize = config.pageSize ?? minPageSize;
    const computedPages = Math.ceil(
      config.totalItems / (effectivePageSize > 0 ? effectivePageSize : 1),
    );
    return config.totalItems > minPageSize || computedPages > 1;
  }

  if (config.totalPages != null) {
    return config.totalPages > 1;
  }

  return false;
}
