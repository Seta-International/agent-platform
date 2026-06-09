export interface ChatAttachmentUploadInfo {
  file_id: string;
  upload_url: string;
  s3_key: string;
  warning?: string;
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

  putToS3(uploadUrl: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`attachment S3 PUT failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error('attachment S3 PUT failed'));
      xhr.send(file);
    });
  },

  async markProcessed(fileId: string): Promise<void> {
    const res = await fetch(`/api/agent/v1/knowledge/attachments/${fileId}/processed`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      // Surface the server's reason (e.g. "could not read X.pdf: Invalid PDF structure.")
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? `attachment mark-processed failed: ${res.status}`);
    }
  },

  async remove(fileId: string): Promise<void> {
    const res = await fetch(`/api/agent/v1/knowledge/attachments/${fileId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`attachment delete failed: ${res.status}`);
  },
};
