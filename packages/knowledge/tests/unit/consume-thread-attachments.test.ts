import { describe, expect, it } from 'vitest';
import {
  ContextOverflowError,
  consumeThreadAttachmentsAsText,
} from '../../src/backend/retrieval/consume-thread-attachments.ts';

const textParser = {
  parse: async (b: Buffer) => ({ sections: [{ text: b.toString('utf8'), page_hint: null }] }),
};

const baseDeps = {
  listPending: async () => [
    { file_id: '1', filename: 'a.txt', mime_type: 'text/plain', s3_key: 'k/1' },
    { file_id: '2', filename: 'b.txt', mime_type: 'text/plain', s3_key: 'k/2' },
  ],
  fetchObject: async (key: string) => Buffer.from(key === 'k/1' ? 'alpha content' : 'beta content'),
  sniff: async () => undefined, // text files have no magic bytes → allowed
  parsers: { txt: textParser, md: textParser } as never,
  countTokens: (s: string) => s.length, // 1 token per char (deterministic)
};

const input = {
  tenant_id: 'T',
  thread_id: 'TH',
  query: 'summarize',
  contextWindowTokens: 100_000,
  reservedOutputTokens: 1_000,
  safetyRatio: 0.9,
};

describe('consumeThreadAttachmentsAsText', () => {
  it('builds a labeled Context block per file and returns consumed ids', async () => {
    const out = await consumeThreadAttachmentsAsText(input, baseDeps);
    expect(out.contextBlock).toContain('Context:');
    expect(out.contextBlock).toContain('<<<FILE: a.txt>>>');
    expect(out.contextBlock).toContain('alpha content');
    expect(out.contextBlock).toContain('<<<FILE: b.txt>>>');
    expect(out.consumedFileIds).toEqual(['1', '2']);
    expect(out.files.map((f) => f.filename)).toEqual(['a.txt', 'b.txt']);
  });

  it('returns an empty block when there are no pending files', async () => {
    const out = await consumeThreadAttachmentsAsText(input, {
      ...baseDeps,
      listPending: async () => [],
    });
    expect(out).toEqual({ contextBlock: '', files: [], consumedFileIds: [] });
  });

  it('throws ContextOverflowError when the budget is exceeded', async () => {
    // budget = floor(100 * 0.9) - 0 = 90; the two files render ~115 tokens > budget
    const small = { ...input, contextWindowTokens: 100, reservedOutputTokens: 0 };
    const err = await consumeThreadAttachmentsAsText(small, baseDeps).catch((e) => e);
    expect(err).toBeInstanceOf(ContextOverflowError);
    expect(err.requiredTokens).toBeGreaterThan(err.budgetTokens);
  });

  it('rejects a file whose sniffed type is not allowed', async () => {
    const deps = { ...baseDeps, sniff: async () => 'application/x-msdownload' };
    await expect(consumeThreadAttachmentsAsText(input, deps)).rejects.toThrow(
      /not allowed|disallowed/i,
    );
  });
});
