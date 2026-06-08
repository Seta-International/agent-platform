import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatAttachmentsApi, toComposerStatus } from '@/modules/agent/api/chat-attachments';

afterEach(() => vi.restoreAllMocks());

describe('toComposerStatus', () => {
  it('maps server statuses to composer statuses', () => {
    expect(toComposerStatus('uploading')).toBe('uploading');
    expect(toComposerStatus('parsing')).toBe('processing');
    expect(toComposerStatus('embedding')).toBe('processing');
    expect(toComposerStatus('ready')).toBe('ready');
    expect(toComposerStatus('failed')).toBe('failed');
  });
});

describe('chatAttachmentsApi', () => {
  it('requestUploadUrl posts thread_id + file meta to the attachments endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ file_id: '5', upload_url: 'https://s3/u', s3_key: 'k' }), {
        status: 200,
      }),
    );
    const out = await chatAttachmentsApi.requestUploadUrl({
      thread_id: 'th1',
      filename: 'a.pdf',
      mime_type: 'application/pdf',
      size_bytes: 3,
    });
    expect(out.file_id).toBe('5');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/agent/v1/knowledge/attachments/upload-url');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      thread_id: 'th1',
      filename: 'a.pdf',
    });
  });

  it('list returns the attachments array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ attachments: [{ file_id: '1', filename: 'a.pdf', status: 'ready' }] }),
        { status: 200 },
      ),
    );
    const out = await chatAttachmentsApi.list('th1');
    expect(out).toHaveLength(1);
    expect(out[0]!.filename).toBe('a.pdf');
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }));
    await expect(chatAttachmentsApi.markProcessed('5')).rejects.toThrow(/403/);
  });
});
