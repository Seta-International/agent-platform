import { describe, expect, it, vi } from 'vitest';
import { pollUntilDone, submitBatch } from '../openai-batch.ts';

describe('submitBatch', () => {
  it('uploads JSONL and creates a batch', async () => {
    const calls: { url: string; opts: RequestInit }[] = [];
    const fakeFetch = vi.fn(async (url: string, opts: RequestInit) => {
      calls.push({ url, opts });
      if (url.includes('/files'))
        return new Response(JSON.stringify({ id: 'file-abc' }), { status: 200 });
      if (url.includes('/batches'))
        return new Response(JSON.stringify({ id: 'batch-xyz', status: 'validating' }), {
          status: 200,
        });
      throw new Error(`unexpected url: ${url}`);
    });
    const id = await submitBatch(
      { apiKey: 'k', model: 'text-embedding-3-small', fetch: fakeFetch as never },
      [
        { custom_id: 't1', input: 'a' },
        { custom_id: 't2', input: 'b' },
      ],
    );
    expect(id).toBe('batch-xyz');
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    // Verify the second call (batches) has correct JSON body
    const batchCall = calls.find((c) => c.url.includes('/batches'));
    expect(batchCall).toBeDefined();
    const body = JSON.parse(batchCall!.opts.body as string);
    expect(body).toEqual({
      input_file_id: 'file-abc',
      endpoint: '/v1/embeddings',
      completion_window: '24h',
    });
  });

  it('throws when file upload fails', async () => {
    const fakeFetch = vi.fn(async () => new Response('', { status: 500 }));
    await expect(
      submitBatch({ apiKey: 'k', model: 'text-embedding-3-small', fetch: fakeFetch as never }, []),
    ).rejects.toThrow();
  });
});

describe('pollUntilDone', () => {
  it('polls until completed and parses output', async () => {
    let pollCount = 0;
    const fakeFetch = vi.fn(async (url: string) => {
      if (url.includes('/files/file-out/content')) {
        const ndjson = [
          { custom_id: 't1', response: { body: { data: [{ embedding: [0.1, 0.2] }] } } },
          { custom_id: 't2', response: { body: { data: [{ embedding: [0.3, 0.4] }] } } },
        ]
          .map((x) => JSON.stringify(x))
          .join('\n');
        return new Response(ndjson, { status: 200 });
      }
      pollCount += 1;
      return new Response(
        JSON.stringify({
          id: 'batch-xyz',
          status: pollCount < 2 ? 'in_progress' : 'completed',
          output_file_id: 'file-out',
        }),
        { status: 200 },
      );
    });
    const results = await pollUntilDone(
      { apiKey: 'k', fetch: fakeFetch as never, pollIntervalMs: 1 },
      'batch-xyz',
    );
    expect(results).toEqual([
      { custom_id: 't1', vector: [0.1, 0.2] },
      { custom_id: 't2', vector: [0.3, 0.4] },
    ]);
  });

  it('throws when batch ends in failed status', async () => {
    const fakeFetch = vi.fn(
      async () => new Response(JSON.stringify({ id: 'b', status: 'failed' }), { status: 200 }),
    );
    await expect(
      pollUntilDone({ apiKey: 'k', fetch: fakeFetch as never, pollIntervalMs: 1 }, 'b'),
    ).rejects.toThrow(/failed/);
  });
});
