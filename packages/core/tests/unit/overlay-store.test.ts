import { describe, expect, it, vi } from 'vitest';
import { createOverlayStore } from '../../src/session/overlay-store.ts';

describe('overlay store', () => {
  it('lazy-loads once per tenant and refresh reloads', async () => {
    const load = vi.fn(async (_t: string) => new Map([['r', new Map([['p', 'grant' as const]])]]));
    const store = createOverlayStore({ load });
    expect((await store.get('t1')).get('r')?.get('p')).toBe('grant');
    await store.get('t1');
    expect(load).toHaveBeenCalledTimes(1);
    await store.refresh('t1');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
