export type ServerAttachmentStatus = 'uploading' | 'parsing' | 'embedding' | 'ready' | 'failed';
export type ComposerStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface ChatAttachmentUploadInfo {
  file_id: string;
  upload_url: string;
  s3_key: string;
}
export interface ChatAttachmentStatusDto {
  file_id: string;
  filename: string;
  status: ServerAttachmentStatus;
  scan_status: string;
  error_reason: string | null;
}
export interface ThreadAttachmentDto {
  file_id: string;
  filename: string;
  status: ServerAttachmentStatus;
}

/** Collapse the 5 backend statuses to the 4 the composer renders. */
export function toComposerStatus(status: ServerAttachmentStatus): ComposerStatus {
  if (status === 'uploading') return 'uploading';
  if (status === 'ready') return 'ready';
  if (status === 'failed') return 'failed';
  return 'processing'; // parsing | embedding
}

export const chatAttachmentsApi = {
  async requestUploadUrl(input: {
    thread_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
  }): Promise<ChatAttachmentUploadInfo> {
    const res = await fetch('/api/agent/v1/knowledge/attachments/upload-url', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`attachment upload-url failed: ${res.status}`);
    return res.json() as Promise<ChatAttachmentUploadInfo>;
  },

  async putToS3(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, { method: 'PUT', body: file });
    if (!res.ok) throw new Error(`attachment S3 PUT failed: ${res.status}`);
  },

  async markProcessed(fileId: string): Promise<void> {
    const res = await fetch(`/api/agent/v1/knowledge/attachments/${fileId}/processed`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`attachment mark-processed failed: ${res.status}`);
  },

  async status(fileId: string): Promise<ChatAttachmentStatusDto> {
    const res = await fetch(`/api/agent/v1/knowledge/attachments/${fileId}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`attachment status failed: ${res.status}`);
    return res.json() as Promise<ChatAttachmentStatusDto>;
  },

  async list(threadId: string): Promise<ThreadAttachmentDto[]> {
    const res = await fetch(
      `/api/agent/v1/knowledge/attachments?thread_id=${encodeURIComponent(threadId)}`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`attachment list failed: ${res.status}`);
    const { attachments } = (await res.json()) as { attachments: ThreadAttachmentDto[] };
    return attachments;
  },

  async remove(fileId: string): Promise<void> {
    const res = await fetch(`/api/agent/v1/knowledge/attachments/${fileId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`attachment delete failed: ${res.status}`);
  },
};
