import { describe, expect, it } from 'vitest';
import { argon2id } from '../src/backend/password/argon2.ts';

describe('argon2id wrapper', () => {
  it('hashes and verifies a password roundtrip', async () => {
    const hash = await argon2id.hash('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await argon2id.verify(hash, 'correct-horse-battery-staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await argon2id.hash('correct-horse-battery-staple');
    expect(await argon2id.verify(hash, 'wrong-password')).toBe(false);
  });
});
