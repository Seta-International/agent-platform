import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type pino from 'pino';
import { b64uDecode, b64uEncode, parseEncryptedBlob } from './blob.ts';
import { IV_BYTES, MAX_PLAINTEXT_BYTES } from './constants.ts';
import {
  type Crypto,
  CryptoError,
  type CryptoMetrics,
  type EncryptedBlob,
  type KeyProvider,
  noopMetrics,
} from './types.ts';

export interface CreateCryptoDeps {
  keyProvider: KeyProvider;
  log: pino.Logger;
  metrics?: CryptoMetrics;
}

export function createCrypto(deps: CreateCryptoDeps): Crypto {
  const metrics = deps.metrics ?? noopMetrics();
  const kidNamespace = deps.keyProvider.kind;

  return {
    async encrypt(plaintext: string): Promise<EncryptedBlob> {
      metrics.encryptAttempted({ kid_namespace: kidNamespace });
      const started = Date.now();

      if (typeof plaintext !== 'string') {
        metrics.encryptFailed({ kid_namespace: kidNamespace, error_code: 'ENCRYPT_FAILED' });
        throw new CryptoError(
          'ENCRYPT_FAILED',
          `plaintext must be a string, got ${typeof plaintext}`,
        );
      }
      const byteLen = Buffer.byteLength(plaintext, 'utf8');
      if (byteLen > MAX_PLAINTEXT_BYTES) {
        metrics.encryptFailed({ kid_namespace: kidNamespace, error_code: 'ENCRYPT_FAILED' });
        throw new CryptoError(
          'ENCRYPT_FAILED',
          `plaintext too large: ${byteLen} > ${MAX_PLAINTEXT_BYTES}`,
        );
      }

      let dk: Awaited<ReturnType<KeyProvider['generateDataKey']>>;
      try {
        dk = await deps.keyProvider.generateDataKey();
      } catch (err) {
        metrics.encryptFailed({
          kid_namespace: kidNamespace,
          error_code: 'KEY_PROVIDER_UNAVAILABLE',
        });
        throw err;
      }

      try {
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv('aes-256-gcm', dk.plaintext, iv);
        const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        const blob: EncryptedBlob = {
          v: 1,
          alg: 'A256GCM',
          kid: dk.kid,
          wdk: b64uEncode(dk.wrapped),
          iv: b64uEncode(iv),
          ct: b64uEncode(ct),
          tag: b64uEncode(tag),
        };
        metrics.encryptSucceeded({ kid_namespace: kidNamespace }, Date.now() - started);
        return blob;
      } finally {
        dk.plaintext.fill(0);
      }
    },

    async decrypt(blob: EncryptedBlob): Promise<string> {
      metrics.decryptAttempted({ kid_namespace: kidNamespace });
      const started = Date.now();

      const parsed = parseEncryptedBlob(blob);
      if (parsed.v !== 1) {
        metrics.decryptFailed({ kid_namespace: kidNamespace, error_code: 'UNSUPPORTED_VERSION' });
        throw new CryptoError('UNSUPPORTED_VERSION', `unsupported blob version v=${parsed.v}`);
      }

      const wrapped = b64uDecode(parsed.wdk);
      let dkPlaintext: Buffer;
      try {
        dkPlaintext = await deps.keyProvider.unwrapDataKey(parsed.kid, wrapped);
      } catch (err) {
        const code = err instanceof CryptoError ? err.code : 'KEY_PROVIDER_UNAVAILABLE';
        metrics.decryptFailed({ kid_namespace: kidNamespace, error_code: code });
        deps.log.error({ kid: parsed.kid, error_code: code }, 'crypto.decrypt.unwrap_failed');
        throw err;
      }

      try {
        const iv = b64uDecode(parsed.iv);
        const ct = b64uDecode(parsed.ct);
        const tag = b64uDecode(parsed.tag);
        const decipher = createDecipheriv('aes-256-gcm', dkPlaintext, iv);
        decipher.setAuthTag(tag);
        const out = Buffer.concat([decipher.update(ct), decipher.final()]);
        metrics.decryptSucceeded({ kid_namespace: kidNamespace }, Date.now() - started);
        return out.toString('utf8');
      } catch (err) {
        metrics.decryptFailed({ kid_namespace: kidNamespace, error_code: 'DECRYPT_FAILED' });
        deps.log.error({ kid: parsed.kid }, 'crypto.decrypt.auth_failed');
        throw new CryptoError('DECRYPT_FAILED', 'authentication failed', err);
      } finally {
        dkPlaintext.fill(0);
      }
    },
  };
}
