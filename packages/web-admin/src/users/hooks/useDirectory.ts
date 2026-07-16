import { useToast } from '@seta/shared-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BulkRoleBody,
  type BulkRoleResult,
  bulkRole,
  type DirectoryFilters,
  listDirectory,
  provisionAccount,
  reactivateAccount,
  suspendAccount,
} from '../api/directory-client.ts';
import { directoryKeys } from '../state/query-keys.ts';

export function useDirectory(params: DirectoryFilters = {}) {
  return useQuery({
    queryKey: directoryKeys.list(params),
    queryFn: () => listDirectory(params),
  });
}

export function useProvision() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (personId: string) => provisionAccount(personId),
    onSuccess: () => toast({ body: 'Account provisioned' }),
    onError: (e) => toast({ body: (e as Error).message, type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useSuspend() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (userId: string) => suspendAccount(userId),
    onSuccess: () => toast({ body: 'Account suspended' }),
    onError: (e) => toast({ body: (e as Error).message, type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useReactivate() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (userId: string) => reactivateAccount(userId),
    onSuccess: () => toast({ body: 'Account reactivated' }),
    onError: (e) => toast({ body: (e as Error).message, type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}

export function useBulkRole() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: BulkRoleBody) => bulkRole(body),
    onSuccess: (result: BulkRoleResult) => {
      const changed = result.granted + result.revoked;
      const parts: string[] = [`${changed} updated`];
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
      toast({ body: parts.join(', ') });
    },
    onError: (e) => toast({ body: (e as Error).message, type: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: directoryKeys.all }),
  });
}
