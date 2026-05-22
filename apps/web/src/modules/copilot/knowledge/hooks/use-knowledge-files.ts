import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { knowledgeApi } from '../api/client';

export const knowledgeQueryKeys = {
  list: () => ['copilot', 'knowledge', 'list'] as const,
};

export function useKnowledgeFiles() {
  return useQuery({ queryKey: knowledgeQueryKeys.list(), queryFn: knowledgeApi.list });
}

export function useDeleteKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => knowledgeApi.delete(fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeQueryKeys.list() }),
  });
}

export function useUploadKnowledgeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { file_id, upload_url } = await knowledgeApi.requestUploadUrl({
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      await knowledgeApi.putToS3(upload_url, file);
      await knowledgeApi.markProcessed(file_id);
      return file_id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: knowledgeQueryKeys.list() }),
  });
}
