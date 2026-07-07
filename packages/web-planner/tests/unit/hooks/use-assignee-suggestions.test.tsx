import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plannerClient } from '../../../src/api/planner-client';
import { useAssigneeSuggestions } from '../../../src/hooks/queries/use-assignee-suggestions';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

afterEach(() => vi.restoreAllMocks());

describe('useAssigneeSuggestions', () => {
  it('does not fetch when disabled', () => {
    const spy = vi.spyOn(plannerClient, 'getAssigneeSuggestions');
    renderHook(() => useAssigneeSuggestions('task-1', false), { wrapper });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches suggestions when enabled', async () => {
    vi.spyOn(plannerClient, 'getAssigneeSuggestions').mockResolvedValue([
      {
        user_id: 'u1',
        display_name: 'An',
        score: 0.9,
        skills: ['React'],
        exact_overlap: 1,
        open_task_count: 2,
        hours_available_this_week: 12,
        timezone: 'GMT+7',
      },
    ]);
    const { result } = renderHook(() => useAssigneeSuggestions('task-1', true), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data![0].user_id).toBe('u1');
  });
});
