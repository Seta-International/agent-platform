import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useM365GroupSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query, 250);
  return useQuery({
    queryKey: plannerKeys.m365GroupSearch(debouncedQuery),
    queryFn: () => plannerClient.searchM365Groups(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });
}
