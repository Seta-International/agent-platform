import { z } from 'zod';
import { CryptoError, type EncryptedBlob } from './types.ts';

const encryptedBlobSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  kid: z
    .string()
    .min(1)
    .max(512)
    .regex(/^(env|kms):/),
  wdk: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .min(1)
    .max(2048),
  iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  ct: z
    .string()
    .regex(/^[A-Za-z0-9_-]*$/)
    .max(131072),
  tag: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});

export function parseEncryptedBlob(json: unknown): EncryptedBlob {
  const r = encryptedBlobSchema.safeParse(json);
  if (!r.success) {
    throw new CryptoError('BLOB_PARSE_FAILED', `BLOB_PARSE_FAILED: ${r.error.message}`);
  }
  return r.data;
}

export function isEncryptedBlob(json: unknown): json is EncryptedBlob {
  return encryptedBlobSchema.safeParse(json).success;
}

export function b64uEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export function b64uDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}
