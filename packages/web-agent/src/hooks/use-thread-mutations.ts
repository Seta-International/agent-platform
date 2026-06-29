import { useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../api/client';

export function useRenameThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => agentApi.renameThread(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'threads'] }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentApi.deleteThread(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'threads'] }),
  });
}
