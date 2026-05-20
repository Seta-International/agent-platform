import { useMutation, useQueryClient } from '@tanstack/react-query';
import { copilotApi } from '../api/client';

export function useRenameThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      copilotApi.renameThread(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['copilot', 'threads'] }),
  });
}

export function useDeleteThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => copilotApi.deleteThread(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['copilot', 'threads'] }),
  });
}
