import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { plannerKeys } from '../../state/query-keys';
import { usePlanCategories } from './use-plan-categories';

const RESPONSE = {
  descriptions: { category1: 'Backend', category2: 'Frontend' },
  labels: [
    {
      id: 'l1',
      tenant_id: 't',
      plan_id: 'p1',
      name: 'Backend',
      color: 'blue',
      category_slot: 1,
      created_at: '',
      deleted_at: null,
    },
  ],
  task_counts: { '1': 4, '2': 2 },
  counts: { categories: 2 },
};

const server = setupServer(
  http.get('*/api/planner/v1/plans/p1/categories', () => HttpResponse.json(RESPONSE)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('usePlanCategories', () => {
  it('resolves descriptions, labels, task_counts, counts', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePlanCategories('p1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.descriptions.category1).toBe('Backend');
    expect(result.current.data?.labels[0]?.name).toBe('Backend');
    expect(result.current.data?.task_counts).toEqual({ '1': 4, '2': 2 });
    expect(result.current.data?.counts.categories).toBe(2);
  });

  it('caches under plannerKeys.planCategories(plan_id)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePlanCategories('p1'), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(qc.getQueryData(plannerKeys.planCategories('p1'))).toEqual(RESPONSE);
  });
});
