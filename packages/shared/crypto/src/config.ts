import { z } from 'zod';
import { DEK_BYTES } from './constants.ts';
import { createEnvKeyProvider } from './providers/env.ts';
import { createKmsKeyProvider } from './providers/kms.ts';
import type { KeyProvider } from './types.ts';

function parseHexKey(kid: string, hex: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`key '${kid}' is not valid hex`);
  }
  if (hex.length !== DEK_BYTES * 2) {
    throw new Error(
      `key '${kid}' must be 32 bytes (${DEK_BYTES * 2} hex chars), got ${hex.length}`,
    );
  }
  return Buffer.from(hex, 'hex');
}

function parseLocalKeys(
  raw: string,
  primary: string | undefined,
): { keys: Map<string, Buffer>; primaryKid: string } {
  const keys = new Map<string, Buffer>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const ix = trimmed.indexOf(':');
    if (ix <= 0) {
      throw new Error(`CRYPTO_LOCAL_KEYS entry '${trimmed}' missing kid:hex separator`);
    }
    const kid = trimmed.slice(0, ix);
    const hex = trimmed.slice(ix + 1);
    if (keys.has(kid)) throw new Error(`duplicate kid '${kid}' in CRYPTO_LOCAL_KEYS`);
    keys.set(kid, parseHexKey(kid, hex));
  }
  if (keys.size === 0) throw new Error('CRYPTO_LOCAL_KEYS is empty');
  const primaryKid = primary ?? (keys.size === 1 ? (keys.keys().next().value ?? '') : '');
  if (!primaryKid)
    throw new Error('CRYPTO_LOCAL_PRIMARY_KID required when multiple keys are configured');
  return { keys, primaryKid };
}

const cryptoEnvSchema = z
  .object({
    CRYPTO_KEY_PROVIDER: z.enum(['kms', 'env']),
    CRYPTO_KMS_KEY_ARN: z.string().optional(),
    AWS_REGION: z.string().optional(),
    CRYPTO_LOCAL_KEYS: z.string().optional(),
    CRYPTO_LOCAL_PRIMARY_KID: z.string().optional(),
    CRYPTO_LOCAL_MASTER_KEY: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.CRYPTO_KEY_PROVIDER === 'kms') {
      if (!v.CRYPTO_KMS_KEY_ARN) {
        ctx.addIssue({
          code: 'custom',
          path: ['CRYPTO_KMS_KEY_ARN'],
          message: 'CRYPTO_KMS_KEY_ARN required when CRYPTO_KEY_PROVIDER=kms',
        });
      }
    } else {
      const hasLong = !!v.CRYPTO_LOCAL_KEYS;
      const hasShort = !!v.CRYPTO_LOCAL_MASTER_KEY;
      if (!hasLong && !hasShort) {
        ctx.addIssue({
          code: 'custom',
          path: ['CRYPTO_LOCAL_KEYS'],
          message:
            'CRYPTO_LOCAL_KEYS or CRYPTO_LOCAL_MASTER_KEY required when CRYPTO_KEY_PROVIDER=env',
        });
      }
      if (hasLong && v.CRYPTO_LOCAL_KEYS) {
        try {
          const { keys, primaryKid } = parseLocalKeys(
            v.CRYPTO_LOCAL_KEYS,
            v.CRYPTO_LOCAL_PRIMARY_KID,
          );
          if (!keys.has(primaryKid)) {
            ctx.addIssue({
              code: 'custom',
              path: ['CRYPTO_LOCAL_PRIMARY_KID'],
              message: `CRYPTO_LOCAL_PRIMARY_KID '${primaryKid}' not in CRYPTO_LOCAL_KEYS`,
            });
          }
        } catch (err) {
          ctx.addIssue({
            code: 'custom',
            path: ['CRYPTO_LOCAL_KEYS'],
            message: (err as Error).message,
          });
        }
      }
      if (hasShort && v.CRYPTO_LOCAL_MASTER_KEY) {
        try {
          parseHexKey('local', v.CRYPTO_LOCAL_MASTER_KEY);
        } catch (err) {
          ctx.addIssue({
            code: 'custom',
            path: ['CRYPTO_LOCAL_MASTER_KEY'],
            message: (err as Error).message,
          });
        }
      }
    }
  });

export type CryptoEnv = z.infer<typeof cryptoEnvSchema>;

export function parseCryptoEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): CryptoEnv {
  return cryptoEnvSchema.parse(source);
}

export async function createKeyProviderFromEnv(env: CryptoEnv): Promise<KeyProvider> {
  let provider: KeyProvider;
  if (env.CRYPTO_KEY_PROVIDER === 'kms') {
    if (!env.CRYPTO_KMS_KEY_ARN) {
      throw new Error('CRYPTO_KMS_KEY_ARN missing — parseCryptoEnv should have rejected this');
    }
    provider = createKmsKeyProvider({
      keyArn: env.CRYPTO_KMS_KEY_ARN,
      region: env.AWS_REGION,
    });
  } else {
    let keys: Map<string, Buffer>;
    let primaryKid: string;
    if (env.CRYPTO_LOCAL_KEYS) {
      ({ keys, primaryKid } = parseLocalKeys(env.CRYPTO_LOCAL_KEYS, env.CRYPTO_LOCAL_PRIMARY_KID));
    } else if (env.CRYPTO_LOCAL_MASTER_KEY) {
      keys = new Map([['local', parseHexKey('local', env.CRYPTO_LOCAL_MASTER_KEY)]]);
      primaryKid = 'local';
    } else {
      throw new Error('CRYPTO_LOCAL_KEYS or CRYPTO_LOCAL_MASTER_KEY required for env mode');
    }
    provider = createEnvKeyProvider({ keys, primaryKid });
  }
  await provider.selfTest();
  return provider;
}
