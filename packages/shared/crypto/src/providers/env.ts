import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DEK_BYTES, IV_BYTES, TAG_BYTES } from '../constants.ts';
import { CryptoError, type DataKey, type KeyProvider } from '../types.ts';

export interface EnvKeyProviderOptions {
  keys: ReadonlyMap<string, Buffer>;
  primaryKid: string;
}

export function createEnvKeyProvider(opts: EnvKeyProviderOptions): KeyProvider {
  if (!opts.keys.has(opts.primaryKid)) {
    throw new Error(`primaryKid '${opts.primaryKid}' not found in keys map`);
  }
  for (const [kid, k] of opts.keys) {
    if (k.length !== DEK_BYTES) {
      throw new Error(`key '${kid}' must be 32 bytes, got ${k.length}`);
    }
  }

  function wrap(kek: Buffer, plaintextDek: Buffer): Buffer {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', kek, iv);
    const ct = Buffer.concat([cipher.update(plaintextDek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, ct, tag]);
  }

  function unwrap(kek: Buffer, wrapped: Buffer): Buffer {
    if (wrapped.length < IV_BYTES + TAG_BYTES + 1) {
      throw new CryptoError('DECRYPT_FAILED', 'wrapped DEK too short');
    }
    const iv = wrapped.subarray(0, IV_BYTES);
    const tag = wrapped.subarray(wrapped.length - TAG_BYTES);
    const ct = wrapped.subarray(IV_BYTES, wrapped.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([decipher.update(ct), decipher.final()]);
    } catch (err) {
      throw new CryptoError('DECRYPT_FAILED', 'wrapped DEK authentication failed', err);
    }
  }

  function kidLocal(kid: string): string {
    if (!kid.startsWith('env:')) {
      throw new CryptoError('UNKNOWN_KID', `kid '${kid}' is not an env kid`);
    }
    return kid.slice(4);
  }

  const provider: KeyProvider = {
    kind: 'env',
    async generateDataKey(): Promise<DataKey> {
      const kek = opts.keys.get(opts.primaryKid);
      if (!kek)
        throw new CryptoError('UNKNOWN_KID', `primaryKid '${opts.primaryKid}' missing at runtime`);
      const plaintext = randomBytes(DEK_BYTES);
      const wrapped = wrap(kek, plaintext);
      return { plaintext, wrapped, kid: `env:${opts.primaryKid}` };
    },
    async unwrapDataKey(kid: string, wrapped: Buffer): Promise<Buffer> {
      const local = kidLocal(kid);
      const kek = opts.keys.get(local);
      if (!kek) throw new CryptoError('UNKNOWN_KID', `no key for kid '${kid}'`);
      return unwrap(kek, wrapped);
    },
    async selfTest(): Promise<void> {
      const dk = await provider.generateDataKey();
      const recovered = await provider.unwrapDataKey(dk.kid, dk.wrapped);
      if (!recovered.equals(dk.plaintext)) {
        throw new CryptoError(
          'KEY_PROVIDER_UNAVAILABLE',
          'env provider selfTest round-trip mismatch',
        );
      }
    },
  };

  return provider;
}
