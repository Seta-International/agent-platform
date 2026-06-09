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
    expect(out).toEqual({
      contextBlock: '',
      files: [],
      consumedFileIds: [],
      failed: [],
      failedFileIds: [],
    });
  });

  it('throws ContextOverflowError when the budget is exceeded', async () => {
    // budget = floor(100 * 0.9) - 0 = 90; the two files render ~115 tokens > budget
    const small = { ...input, contextWindowTokens: 100, reservedOutputTokens: 0 };
    const err = await consumeThreadAttachmentsAsText(small, baseDeps).catch((e) => e);
    expect(err).toBeInstanceOf(ContextOverflowError);
    expect(err.requiredTokens).toBeGreaterThan(err.budgetTokens);
  });

  it('skips (not throws) a file whose sniffed type is not allowed', async () => {
    const deps = { ...baseDeps, sniff: async () => 'application/x-msdownload' };
    const out = await consumeThreadAttachmentsAsText(input, deps);
    expect(out.files).toEqual([]);
    expect(out.failed.map((f) => f.filename)).toEqual(['a.txt', 'b.txt']);
    expect(out.contextBlock).toMatch(/Unreadable attachments skipped/i);
  });

  it('skips a file that fails to parse and keeps the good one', async () => {
    const deps = {
      ...baseDeps,
      parsers: {
        txt: {
          parse: async (b: Buffer) => {
            const t = b.toString('utf8');
            if (t.includes('beta')) throw new Error('Invalid PDF structure.');
            return { sections: [{ text: t, page_hint: null }] };
          },
        },
      } as never,
    };
    const out = await consumeThreadAttachmentsAsText(input, deps);
    expect(out.contextBlock).toContain('alpha content');
    expect(out.contextBlock).not.toContain('beta content');
    expect(out.consumedFileIds).toEqual(['1']);
    expect(out.failedFileIds).toEqual(['2']);
    expect(out.failed[0]?.reason).toMatch(/Invalid PDF/);
    expect(out.contextBlock).toMatch(/Unreadable attachments skipped: b\.txt/);
  });

  it('returns a notice-only block when every file fails, without throwing', async () => {
    const deps = {
      ...baseDeps,
      fetchObject: async () => {
        throw new Error('S3 NoSuchKey');
      },
    };
    const out = await consumeThreadAttachmentsAsText(input, deps);
    expect(out.files).toEqual([]);
    expect(out.consumedFileIds).toEqual([]);
    expect(out.failed).toHaveLength(2);
    expect(out.contextBlock).toMatch(/Unreadable attachments skipped/i);
  });
});
