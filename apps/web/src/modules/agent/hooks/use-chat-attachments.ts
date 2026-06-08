import type { ComposerAttachment } from '@seta/shared-ui';
import { useCallback, useEffect, useState } from 'react';
import { chatAttachmentsApi, toComposerStatus } from '../api/chat-attachments';

interface AttachmentItem {
  localId: string;
  fileId: string | null;
  filename: string;
  status: ComposerAttachment['status'];
}

const POLL_INTERVAL_MS = 2000;

/** Owns the upload lifecycle for one chat thread: request url → PUT S3 →
 *  mark-processed → poll status until ready/failed. Returns composer-shaped
 *  attachments plus attach/remove/reset actions. */
export function useChatAttachments(threadId: string) {
  const [items, setItems] = useState<AttachmentItem[]>([]);

  const patch = useCallback((localId: string, next: Partial<AttachmentItem>) => {
    setItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...next } : it)));
  }, []);

  const attach = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const localId = crypto.randomUUID();
        setItems((prev) => [
          ...prev,
          { localId, fileId: null, filename: file.name, status: 'uploading' },
        ]);
        void (async () => {
          try {
            const info = await chatAttachmentsApi.requestUploadUrl({
              thread_id: threadId,
              filename: file.name,
              mime_type: file.type || 'application/octet-stream',
              size_bytes: file.size,
            });
            await chatAttachmentsApi.putToS3(info.upload_url, file);
            await chatAttachmentsApi.markProcessed(info.file_id);
            patch(localId, { fileId: info.file_id, status: 'processing' });
          } catch {
            patch(localId, { status: 'failed' });
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

  const reset = useCallback(() => setItems([]), []);

  // Poll every processing item until it resolves to ready/failed.
  useEffect(() => {
    const pending = items.filter((i) => i.status === 'processing' && i.fileId);
    if (pending.length === 0) return;
    const timer = setInterval(() => {
      for (const it of pending) {
        if (!it.fileId) continue;
        void chatAttachmentsApi
          .status(it.fileId)
          .then((s) => {
            const ui = toComposerStatus(s.status);
            if (ui === 'ready' || ui === 'failed') patch(it.localId, { status: ui });
          })
          .catch(() => {
            /* transient — keep polling */
          });
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [items, patch]);

  const attachments: ComposerAttachment[] = items.map((it) => ({
    id: it.localId,
    filename: it.filename,
    status: it.status,
  }));

  return { attachments, attach, remove, reset };
}
