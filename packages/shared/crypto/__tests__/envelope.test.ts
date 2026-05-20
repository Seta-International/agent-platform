import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { MAX_PLAINTEXT_BYTES } from '../src/constants.ts';
import { createCrypto } from '../src/envelope.ts';
import { createEnvKeyProvider } from '../src/providers/env.ts';

function makeCrypto() {
  const provider = createEnvKeyProvider({
    keys: new Map([['demo', randomBytes(32)]]),
    primaryKid: 'demo',
  });
  return createCrypto({ keyProvider: provider, log: pino({ level: 'silent' }) });
}

describe('createCrypto envelope', () => {
  it('round-trips ASCII', async () => {
    const c = makeCrypto();
    const blob = await c.encrypt('hello world');
    expect(blob.v).toBe(1);
    expect(blob.alg).toBe('A256GCM');
    expect(blob.kid).toBe('env:demo');
    expect(await c.decrypt(blob)).toBe('hello world');
  });

  it('round-trips UTF-8 multi-byte', async () => {
    const c = makeCrypto();
    const text = 'Tâché — 日本語 — 🔐';
    expect(await c.decrypt(await c.encrypt(text))).toBe(text);
  });

  it('round-trips an empty string', async () => {
    const c = makeCrypto();
    expect(await c.decrypt(await c.encrypt(''))).toBe('');
  });

  it('round-trips at MAX_PLAINTEXT_BYTES', async () => {
    const c = makeCrypto();
    const big = 'a'.repeat(MAX_PLAINTEXT_BYTES);
    expect(await c.decrypt(await c.encrypt(big))).toBe(big);
  });

  it('rejects plaintext larger than MAX_PLAINTEXT_BYTES', async () => {
    const c = makeCrypto();
    await expect(c.encrypt('a'.repeat(MAX_PLAINTEXT_BYTES + 1))).rejects.toMatchObject({
      code: 'ENCRYPT_FAILED',
    });
  });

  it('rejects non-string plaintext', async () => {
    const c = makeCrypto();
    await expect(c.encrypt(123 as unknown as string)).rejects.toMatchObject({
      code: 'ENCRYPT_FAILED',
    });
  });

  it('rejects blob with v != 1', async () => {
    const c = makeCrypto();
    const blob = await c.encrypt('x');
    await expect(c.decrypt({ ...blob, v: 2 as 1 })).rejects.toMatchObject({
      code: 'BLOB_PARSE_FAILED',
    });
  });

  it('fails decrypt when ct is tampered', async () => {
    const c = makeCrypto();
    const blob = await c.encrypt('hello');
    const tamperedCt = Buffer.from(blob.ct, 'base64url');
    tamperedCt[0]! ^= 0xff;
    await expect(
      c.decrypt({ ...blob, ct: tamperedCt.toString('base64url') }),
    ).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('fails decrypt when tag is tampered', async () => {
    const c = makeCrypto();
    const blob = await c.encrypt('hello');
    const tamperedTag = Buffer.from(blob.tag, 'base64url');
    tamperedTag[0]! ^= 0xff;
    await expect(
      c.decrypt({ ...blob, tag: tamperedTag.toString('base64url') }),
    ).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('fails decrypt when iv is tampered', async () => {
    const c = makeCrypto();
    const blob = await c.encrypt('hello');
    const tamperedIv = Buffer.from(blob.iv, 'base64url');
    tamperedIv[0]! ^= 0xff;
    await expect(
      c.decrypt({ ...blob, iv: tamperedIv.toString('base64url') }),
    ).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('fails decrypt when wdk is tampered', async () => {
    const c = makeCrypto();
    const blob = await c.encrypt('hello');
    const tamperedWdk = Buffer.from(blob.wdk, 'base64url');
    tamperedWdk[5]! ^= 0xff;
    await expect(
      c.decrypt({ ...blob, wdk: tamperedWdk.toString('base64url') }),
    ).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });
});

describe('rotation rehearsal', () => {
  it('decrypts blobs from a previous primary kid after rotation', async () => {
    const oldKek = randomBytes(32);
    const newKek = randomBytes(32);
    const oldCrypto = createCrypto({
      keyProvider: createEnvKeyProvider({
        keys: new Map([['old', oldKek]]),
        primaryKid: 'old',
      }),
      log: pino({ level: 'silent' }),
    });
    const blob = await oldCrypto.encrypt('legacy secret');
    const rotatedCrypto = createCrypto({
      keyProvider: createEnvKeyProvider({
        keys: new Map([
          ['new', newKek],
          ['old', oldKek],
        ]),
        primaryKid: 'new',
      }),
      log: pino({ level: 'silent' }),
    });
    expect(await rotatedCrypto.decrypt(blob)).toBe('legacy secret');
    const fresh = await rotatedCrypto.encrypt('fresh secret');
    expect(fresh.kid).toBe('env:new');
  });
});
