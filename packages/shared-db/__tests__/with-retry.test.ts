import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/tx.ts';

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on serialization_failure (40001) up to attempts cap', async () => {
    const err = Object.assign(new Error('serialization'), { code: '40001' });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');
    expect(await withRetry(fn, { attempts: 3, baseMs: 1 })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exceeding attempts', async () => {
    const err = Object.assign(new Error('deadlock'), { code: '40P01' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { attempts: 2, baseMs: 1 })).rejects.toMatchObject({
      code: '40P01',
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable errors', async () => {
    const err = Object.assign(new Error('syntax'), { code: '42601' });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn)).rejects.toMatchObject({ code: '42601' });
    expect(fn).toHaveBeenCalledOnce();
  });
});
