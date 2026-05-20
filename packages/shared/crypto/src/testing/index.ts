import pino from 'pino';
import { createCrypto } from '../envelope.ts';
import { createEnvKeyProvider } from '../providers/env.ts';
import type { Crypto } from '../types.ts';

export const TEST_FIXED_KEY_HEX =
  '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

export interface CreateTestCryptoOptions {
  primaryKid?: string;
}

export function createTestCrypto(opts: CreateTestCryptoOptions = {}): Crypto {
  const primaryKid = opts.primaryKid ?? 'test';
  const provider = createEnvKeyProvider({
    keys: new Map([[primaryKid, Buffer.from(TEST_FIXED_KEY_HEX, 'hex')]]),
    primaryKid,
  });
  return createCrypto({ keyProvider: provider, log: pino({ level: 'silent' }) });
}
