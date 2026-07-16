import { describe, expect, it, vi } from 'vitest';
import { loadSessionHistory } from '../../src/backend/memory.ts';

describe('loadSessionHistory', () => {
  it('returns empty array when memory handle is undefined', async () => {
    const result = await loadSessionHistory(undefined, 'thread-1');
    expect(result).toEqual([]);
  });

  it('returns empty array when threadId is undefined', async () => {
    const handle = { memory: { recall: vi.fn() }, memoryConfig: {} } as any;
    const result = await loadSessionHistory(handle, undefined);
    expect(result).toEqual([]);
  });

  it('calls recall with correct params and returns messages', async () => {
    const messages = [
      { id: 'm1', role: 'user', content: 'hello', createdAt: new Date() },
      { id: 'm2', role: 'assistant', content: 'hi', createdAt: new Date() },
    ];
    const recall = vi.fn().mockResolvedValue({ messages });
    const handle = { memory: { recall }, memoryConfig: { lastMessages: 20 } } as any;

    const result = await loadSessionHistory(handle, 'thread-abc');

    expect(recall).toHaveBeenCalledWith({
      threadId: 'thread-abc',
      perPage: 20,
    });
    expect(result).toEqual(messages);
  });

  it('defaults perPage to 20 when lastMessages not set', async () => {
    const recall = vi.fn().mockResolvedValue({ messages: [] });
    const handle = { memory: { recall }, memoryConfig: {} } as any;

    await loadSessionHistory(handle, 'thread-1');

    expect(recall).toHaveBeenCalledWith({
      threadId: 'thread-1',
      perPage: 20,
    });
  });

  it('returns empty array on recall error', async () => {
    const recall = vi.fn().mockRejectedValue(new Error('db down'));
    const handle = { memory: { recall }, memoryConfig: { lastMessages: 20 } } as any;

    const result = await loadSessionHistory(handle, 'thread-abc');
    expect(result).toEqual([]);
  });
});
