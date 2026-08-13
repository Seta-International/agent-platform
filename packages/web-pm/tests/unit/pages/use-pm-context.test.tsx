import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePmContext } from '../../../src/pages/use-pm-context.ts';

const routerState = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  navigate: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerState.navigate,
  useSearch: () => routerState.search,
}));

vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchCurrentWeek: () => Promise.resolve({ iso_year: 2026, iso_week: 33 }),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  routerState.search = {};
  routerState.navigate.mockClear();
  sessionStorage.clear();
});

describe('usePmContext', () => {
  it('opens on the default context — all accounts, all projects, current week', async () => {
    const { result } = renderHook(() => usePmContext('/pm/weekly'), { wrapper });

    await waitFor(() => expect(result.current.weekReady).toBe(true));
    expect(result.current.search.account).toBeUndefined();
    expect(result.current.search.project).toBeUndefined();
    expect(result.current.iso_year).toBe(2026);
    expect(result.current.iso_week).toBe(33);
  });

  it('ignores a context left behind by an earlier screen', async () => {
    sessionStorage.setItem(
      'pm.context',
      JSON.stringify({ account: 'acc-1', project: 'p-1', iso_year: 2026, iso_week: 20 }),
    );

    const { result } = renderHook(() => usePmContext('/pm/weekly'), { wrapper });

    await waitFor(() => expect(result.current.weekReady).toBe(true));
    expect(routerState.navigate).not.toHaveBeenCalled();
    expect(result.current.search.account).toBeUndefined();
    expect(result.current.search.project).toBeUndefined();
    expect(result.current.iso_week).toBe(33);
  });

  it('keeps an explicit context carried in the URL', async () => {
    routerState.search = { account: 'acc-2', project: 'p-9', iso_year: 2026, iso_week: 30 };

    const { result } = renderHook(() => usePmContext('/pm/metrics'), { wrapper });

    await waitFor(() => expect(result.current.weekReady).toBe(true));
    expect(routerState.navigate).not.toHaveBeenCalled();
    expect(result.current.search.account).toBe('acc-2');
    expect(result.current.iso_week).toBe(30);
  });
});
