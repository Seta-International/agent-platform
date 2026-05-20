import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEnvKeyProvider } from '../../src/providers/env.ts';

function fixedKeys(): { primary: Buffer; secondary: Buffer } {
  return { primary: randomBytes(32), secondary: randomBytes(32) };
}

describe('EnvKeyProvider', () => {
  it('generateDataKey returns a 32-byte plaintext and a wrapped form', async () => {
    const { primary } = fixedKeys();
    const provider = createEnvKeyProvider({
      keys: new Map([['demo', primary]]),
      primaryKid: 'demo',
    });
    const dk = await provider.generateDataKey();
    expect(dk.plaintext.length).toBe(32);
    expect(dk.kid).toBe('env:demo');
    expect(dk.wrapped.length).toBeGreaterThan(32);
  });

  it('round-trips wrap -> unwrap', async () => {
    const { primary } = fixedKeys();
    const provider = createEnvKeyProvider({
      keys: new Map([['demo', primary]]),
      primaryKid: 'demo',
    });
    const dk = await provider.generateDataKey();
    const original = Buffer.from(dk.plaintext);
    const unwrapped = await provider.unwrapDataKey(dk.kid, dk.wrapped);
    expect(unwrapped.equals(original)).toBe(true);
  });

  it('supports decrypt-only secondary keys', async () => {
    const { primary, secondary } = fixedKeys();
    const oldProvider = createEnvKeyProvider({
      keys: new Map([['old', secondary]]),
      primaryKid: 'old',
    });
    const dkOld = await oldProvider.generateDataKey();
    const expected = Buffer.from(dkOld.plaintext);
    const provider = createEnvKeyProvider({
      keys: new Map([
        ['new', primary],
        ['old', secondary],
      ]),
      primaryKid: 'new',
    });
    const recovered = await provider.unwrapDataKey(dkOld.kid, dkOld.wrapped);
    expect(recovered.equals(expected)).toBe(true);
  });

  it('throws UNKNOWN_KID for an unknown kid', async () => {
    const provider = createEnvKeyProvider({
      keys: new Map([['demo', randomBytes(32)]]),
      primaryKid: 'demo',
    });
    await expect(provider.unwrapDataKey('env:ghost', Buffer.alloc(48))).rejects.toMatchObject({
      code: 'UNKNOWN_KID',
    });
  });

  it('throws DECRYPT_FAILED on tampered wrapped DEK', async () => {
    const provider = createEnvKeyProvider({
      keys: new Map([['demo', randomBytes(32)]]),
      primaryKid: 'demo',
    });
    const dk = await provider.generateDataKey();
    dk.wrapped[20]! ^= 0xff;
    await expect(provider.unwrapDataKey(dk.kid, dk.wrapped)).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('selfTest succeeds with a valid primary key', async () => {
    const provider = createEnvKeyProvider({
      keys: new Map([['demo', randomBytes(32)]]),
      primaryKid: 'demo',
    });
    await expect(provider.selfTest()).resolves.toBeUndefined();
  });

  it('constructor throws when primaryKid is not in the keys map', () => {
    expect(() =>
      createEnvKeyProvider({ keys: new Map([['a', randomBytes(32)]]), primaryKid: 'missing' }),
    ).toThrowError(/primaryKid 'missing' not found/);
  });

  it('constructor throws when a key is not 32 bytes', () => {
    expect(() =>
      createEnvKeyProvider({ keys: new Map([['demo', Buffer.alloc(16)]]), primaryKid: 'demo' }),
    ).toThrowError(/must be 32 bytes/);
  });
});
