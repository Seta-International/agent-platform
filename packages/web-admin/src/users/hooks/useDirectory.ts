import { toast } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BulkRoleBody,
  type BulkRoleResult,
  bulkRole,
  listDirectory,
  provisionAccount,
  reactivateAccount,
  suspendAccount,
} from '../api/directory-client.ts';
import { directoryKeys } from '../state/query-keys.ts';

export function useDirectory(params: { search?: string; status?: string; page?: number } = {}) {
  return useQuery({
    queryKey: directoryKeys.list(params),
    queryFn: () => listDirectory(params),
  });
}

export function useProvision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) => provisionAccount(personId),
    onSuccess: () => toast.success('Account provisioned'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useSuspend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => suspendAccount(userId),
    onSuccess: () => toast.success('Account suspended'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useReactivate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => reactivateAccount(userId),
    onSuccess: () => toast.success('Account reactivated'),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useBulkRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BulkRoleBody) => bulkRole(body),
    onSuccess: (result: BulkRoleResult) => {
      const changed = result.granted + result.revoked;
      const parts: string[] = [`${changed} updated`];
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
      toast.success(parts.join(', '));
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}
