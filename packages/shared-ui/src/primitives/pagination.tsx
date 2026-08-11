export type {
  PaginationProps,
  PaginationSize,
  PaginationVariant,
  PaginationVariantMap,
} from '@astryxdesign/core/Pagination';
export { generatePageRange, Pagination } from '@astryxdesign/core/Pagination';

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
