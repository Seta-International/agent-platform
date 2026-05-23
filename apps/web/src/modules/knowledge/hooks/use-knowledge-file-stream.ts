import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { KnowledgeFile } from '../api/client';
import { knowledgeQueryKeys } from './use-knowledge-files';

interface StatusEvent {
  file_id: string;
  status: KnowledgeFile['status'];
  error_reason: string | null;
}

export function useKnowledgeFileStream(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource('/api/copilot/v1/knowledge/stream', { withCredentials: true });
    es.addEventListener('status', (ev) => {
      const payload = JSON.parse((ev as MessageEvent).data) as StatusEvent;
      qc.setQueryData<KnowledgeFile[]>(knowledgeQueryKeys.list(), (prev) =>
        prev?.map((f) =>
          f.file_id === payload.file_id
            ? { ...f, status: payload.status, error_reason: payload.error_reason }
            : f,
        ),
      );
    });
    return () => es.close();
  }, [qc]);
}
