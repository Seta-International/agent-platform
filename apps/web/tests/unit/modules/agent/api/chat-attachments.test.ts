import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatAttachmentsApi } from '@/modules/agent/api/chat-attachments';

interface ProgressEventLike {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

afterEach(() => vi.restoreAllMocks());

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

  it('requestUploadUrl surfaces a soft size warning', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          file_id: '5',
          upload_url: 'https://s3/u',
          s3_key: 'k',
          warning: 'too big',
        }),
        { status: 200 },
      ),
    );
    const out = await chatAttachmentsApi.requestUploadUrl({
      thread_id: 'th1',
      filename: 'a.pdf',
      mime_type: 'application/pdf',
      size_bytes: 3,
    });
    expect(out.warning).toBe('too big');
  });

  it('putToS3 reports progress and resolves on 2xx', async () => {
    const events: number[] = [];
    // `new XMLHttpRequest()` needs a constructable stub — a class, not an arrow
    // fn (biome would rewrite a plain `function` expression back into an arrow).
    class FakeXHR {
      upload: { onprogress?: (e: ProgressEventLike) => void } = {};
      status = 0;
      onload: (() => void) | undefined = undefined;
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        this.status = 200;
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);
    await chatAttachmentsApi.putToS3('https://s3/u', new File(['hello'], 'a.txt'), (p) =>
      events.push(p),
    );
    expect(events).toContain(0.5);
  });

  it('markProcessed throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }));
    await expect(chatAttachmentsApi.markProcessed('5')).rejects.toThrow(/403/);
  });
});
