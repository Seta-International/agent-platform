import { describe, expect, it } from 'vitest';
import { createTestCrypto } from '../src/testing/index.ts';

describe('createTestCrypto', () => {
  it('round-trips a string', async () => {
    const c = createTestCrypto();
    expect(await c.decrypt(await c.encrypt('hello'))).toBe('hello');
  });

  it('produces blobs with the chosen primary kid', async () => {
    const c = createTestCrypto({ primaryKid: 'fixture' });
    const blob = await c.encrypt('x');
    expect(blob.kid).toBe('env:fixture');
  });
});
