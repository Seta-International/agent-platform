import type { ComposerAttachment } from '@seta/shared-ui';
import { useCallback, useState } from 'react';
import { chatAttachmentsApi } from '../api/chat-attachments';

interface Item {
  localId: string;
  fileId: string | null;
  filename: string;
  status: ComposerAttachment['status'];
  progress: number;
}

/** Owns the upload lifecycle for one chat thread: request url → PUT S3 (with
 *  live progress) → mark-processed → uploaded. No status polling — the no-RAG
 *  flow has no parsing/embedding stage. Exposes the last soft size warning. */
export function useChatAttachments(threadId: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const patch = useCallback((localId: string, next: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...next } : it)));
  }, []);

  const attach = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const localId = crypto.randomUUID();
        setItems((prev) => [
          ...prev,
          { localId, fileId: null, filename: file.name, status: 'uploading', progress: 0 },
        ]);
        void (async () => {
          try {
            const info = await chatAttachmentsApi.requestUploadUrl({
              thread_id: threadId,
              filename: file.name,
              mime_type: file.type || 'application/octet-stream',
              size_bytes: file.size,
            });
            if (info.warning) setWarning(info.warning);
            await chatAttachmentsApi.putToS3(info.upload_url, file, (p) =>
              patch(localId, { progress: p }),
            );
            await chatAttachmentsApi.markProcessed(info.file_id);
            patch(localId, { fileId: info.file_id, status: 'uploaded', progress: 1 });
          } catch (e) {
            patch(localId, { status: 'failed' });
            // Show why (e.g. an unreadable/corrupt file rejected at /processed).
            setWarning(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`);
          }
        })();
      }
    },
    [threadId, patch],
  );

  const remove = useCallback((localId: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.localId === localId);
      if (it?.fileId) void chatAttachmentsApi.remove(it.fileId).catch(() => {});
      return prev.filter((i) => i.localId !== localId);
    });
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setWarning(null);
  }, []);

  const attachments: ComposerAttachment[] = items.map((it) => ({
    id: it.localId,
    filename: it.filename,
    status: it.status,
    progress: it.progress,
  }));

  return { attachments, attach, remove, reset, warning };
}
