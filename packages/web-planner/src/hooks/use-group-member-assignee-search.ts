import type { GroupMemberRow } from '@seta/planner';
import { useEffect, useMemo, useState } from 'react';
import { useGroupMembers } from './queries/use-group-members';

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useGroupMemberAssigneeSearch(
  groupId: string,
  search: string,
  enabled: boolean,
): { members: GroupMemberRow[]; isPending: boolean } {
  const debouncedSearch = useDebouncedValue(search, 200);
  const membersQ = useGroupMembers(groupId);

  const members = useMemo(() => {
    if (!enabled || groupId.length === 0) return [];
    const all = membersQ.data?.members ?? [];
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return [...all];
    return all.filter(
      (m) => m.display_name.toLowerCase().includes(term) || m.email.toLowerCase().includes(term),
    );
  }, [enabled, groupId, membersQ.data?.members, debouncedSearch]);

  return {
    members,
    isPending: enabled && groupId.length > 0 && membersQ.isPending,
  };
}
