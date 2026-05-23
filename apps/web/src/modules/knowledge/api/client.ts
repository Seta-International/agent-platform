export interface KnowledgeFile {
  file_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: 'uploading' | 'parsing' | 'embedding' | 'ready' | 'failed';
  error_reason: string | null;
  created_at: string;
  processed_at: string | null;
}

export const knowledgeApi = {
  async list(): Promise<KnowledgeFile[]> {
    const res = await fetch('/api/copilot/v1/knowledge?limit=100', { credentials: 'include' });
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    const { files } = (await res.json()) as { files: KnowledgeFile[] };
    return files;
  },

  async requestUploadUrl(input: {
    filename: string;
    mime_type: string;
    size_bytes: number;
  }): Promise<{ file_id: string; upload_url: string; s3_key: string }> {
    const res = await fetch('/api/copilot/v1/knowledge/upload-url', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`upload-url failed: ${res.status}`);
    return res.json() as Promise<{ file_id: string; upload_url: string; s3_key: string }>;
  },

  async putToS3(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, { method: 'PUT', body: file });
    if (!res.ok) throw new Error(`S3 PUT failed: ${res.status}`);
  },

  async markProcessed(fileId: string): Promise<void> {
    const res = await fetch(`/api/copilot/v1/knowledge/${fileId}/processed`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`mark-processed failed: ${res.status}`);
  },

  async delete(fileId: string): Promise<void> {
    const res = await fetch(`/api/copilot/v1/knowledge/${fileId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  },
};
