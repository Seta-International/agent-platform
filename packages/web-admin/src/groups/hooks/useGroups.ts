import { toast } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addMembers,
  createGroup,
  deleteGroup,
  type GroupRole,
  listGroups,
  listUserGroups,
  removeMember,
  setGroupRoles,
  updateGroup,
} from '../api/groups-client.ts';
import { groupKeys } from '../state/query-keys.ts';

export function useUserGroups(userId: string | null) {
  return useQuery({
    queryKey: groupKeys.userGroups(userId ?? ''),
    queryFn: () => listUserGroups(userId as string),
    enabled: !!userId,
  });
}

export function useGroupsQuery() {
  return useQuery({
    queryKey: groupKeys.list(),
    queryFn: listGroups,
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, description }: { id: string; name?: string; description?: string }) =>
      updateGroup(id, { name, description }),
    onSuccess: () => toast.success('Group updated'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => toast.success('Group deleted'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      slug: string;
      name: string;
      description?: string;
      kind?: 'default' | 'custom';
      is_base?: boolean;
    }) => createGroup(body),
    onSuccess: () => toast.success('Group created'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useSetGroupRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: GroupRole[] }) => setGroupRoles(id, roles),
    onSuccess: () => toast.success('Roles updated'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });
}

export function useGroupMembersMutations() {
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: ({ id, user_ids }: { id: string; user_ids: string[] }) => addMembers(id, user_ids),
    onSuccess: () => toast.success('Members added'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: groupKeys.all }),
  });

  const remove = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => removeMember(id, userId),
    onSuccess: () => toast.success('Member removed'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: groupKeys.all });
      void qc.invalidateQueries({ queryKey: groupKeys.userGroups(vars.userId) });
    },
  });

  return { add, remove };
}
