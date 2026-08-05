import { describe, expect, it } from 'vitest';
import { shouldShowPagination } from '../../../src/primitives/pagination';

describe('shouldShowPagination', () => {
  it('returns false when totalItems is 0', () => {
    expect(
      shouldShowPagination({
        totalItems: 0,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(false);
  });

  it('returns false when totalItems < minPageSize', () => {
    expect(
      shouldShowPagination({
        totalItems: 10,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(false);
  });

  it('returns false when totalItems === minPageSize', () => {
    expect(
      shouldShowPagination({
        totalItems: 25,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(false);
  });

  it('returns true when totalItems === minPageSize + 1', () => {
    expect(
      shouldShowPagination({
        totalItems: 26,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(true);
  });

  it('returns true when totalItems > minPageSize with pageSize = 25', () => {
    expect(
      shouldShowPagination({
        totalItems: 50,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(true);
  });

  it('returns true when totalItems > minPageSize even when pageSize > totalItems (e.g. total 50, pageSize 100)', () => {
    expect(
      shouldShowPagination({
        totalItems: 50,
        pageSize: 100,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(true);
  });

  it('returns true when totalPages > 1', () => {
    expect(
      shouldShowPagination({
        totalPages: 2,
      }),
    ).toBe(true);
  });

  it('returns false when totalPages === 1 without totalItems or hasMore', () => {
    expect(
      shouldShowPagination({
        totalPages: 1,
      }),
    ).toBe(false);
  });

  it('returns true when hasMore === true', () => {
    expect(
      shouldShowPagination({
        hasMore: true,
        totalItems: 5,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100],
      }),
    ).toBe(true);
  });

  it('handles missing/empty pageSizeOptions by falling back to pageSize or default 10', () => {
    expect(
      shouldShowPagination({
        totalItems: 5,
        pageSize: 10,
      }),
    ).toBe(false);

    expect(
      shouldShowPagination({
        totalItems: 15,
        pageSize: 10,
      }),
    ).toBe(true);
  });
});
