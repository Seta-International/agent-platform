import { randomBytes } from 'node:crypto';
import { DescribeKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKeyProviderFromEnv, parseCryptoEnv } from '../src/config.ts';

const ARN = 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const HEX = randomBytes(32).toString('hex');
const HEX2 = randomBytes(32).toString('hex');

let kms: ReturnType<typeof mockClient>;
beforeEach(() => {
  kms = mockClient(KMSClient);
});
afterEach(() => {
  kms.restore();
});

describe('parseCryptoEnv', () => {
  it('accepts env mode with CRYPTO_LOCAL_KEYS long form', () => {
    const env = parseCryptoEnv({
      CRYPTO_KEY_PROVIDER: 'env',
      CRYPTO_LOCAL_KEYS: `demo:${HEX}`,
      CRYPTO_LOCAL_PRIMARY_KID: 'demo',
    });
    expect(env.CRYPTO_KEY_PROVIDER).toBe('env');
  });

  it('accepts env mode with CRYPTO_LOCAL_MASTER_KEY shorthand', () => {
    const env = parseCryptoEnv({
      CRYPTO_KEY_PROVIDER: 'env',
      CRYPTO_LOCAL_MASTER_KEY: HEX,
    });
    expect(env.CRYPTO_LOCAL_MASTER_KEY).toBe(HEX);
  });

  it('accepts kms mode', () => {
    const env = parseCryptoEnv({
      CRYPTO_KEY_PROVIDER: 'kms',
      CRYPTO_KMS_KEY_ARN: ARN,
      AWS_REGION: 'us-east-1',
    });
    expect(env.CRYPTO_KMS_KEY_ARN).toBe(ARN);
  });

  it('rejects env mode without any keys', () => {
    expect(() => parseCryptoEnv({ CRYPTO_KEY_PROVIDER: 'env' })).toThrowError(/CRYPTO_LOCAL/);
  });

  it('rejects kms mode without ARN', () => {
    expect(() => parseCryptoEnv({ CRYPTO_KEY_PROVIDER: 'kms' })).toThrowError(/CRYPTO_KMS_KEY_ARN/);
  });

  it('rejects malformed CRYPTO_LOCAL_KEYS (odd hex)', () => {
    expect(() =>
      parseCryptoEnv({
        CRYPTO_KEY_PROVIDER: 'env',
        CRYPTO_LOCAL_KEYS: 'demo:zz',
        CRYPTO_LOCAL_PRIMARY_KID: 'demo',
      }),
    ).toThrowError(/hex/);
  });

  it('rejects CRYPTO_LOCAL_KEYS with wrong length', () => {
    expect(() =>
      parseCryptoEnv({
        CRYPTO_KEY_PROVIDER: 'env',
        CRYPTO_LOCAL_KEYS: 'demo:aabbccdd',
        CRYPTO_LOCAL_PRIMARY_KID: 'demo',
      }),
    ).toThrowError(/32 bytes/);
  });

  it('rejects duplicate kid in CRYPTO_LOCAL_KEYS', () => {
    expect(() =>
      parseCryptoEnv({
        CRYPTO_KEY_PROVIDER: 'env',
        CRYPTO_LOCAL_KEYS: `demo:${HEX},demo:${HEX2}`,
        CRYPTO_LOCAL_PRIMARY_KID: 'demo',
      }),
    ).toThrowError(/duplicate kid/);
  });

  it('rejects primary kid not in keys map', () => {
    expect(() =>
      parseCryptoEnv({
        CRYPTO_KEY_PROVIDER: 'env',
        CRYPTO_LOCAL_KEYS: `demo:${HEX}`,
        CRYPTO_LOCAL_PRIMARY_KID: 'ghost',
      }),
    ).toThrowError(/CRYPTO_LOCAL_PRIMARY_KID/);
  });
});

describe('createKeyProviderFromEnv', () => {
  it('builds an env provider that selfTests', async () => {
    const env = parseCryptoEnv({
      CRYPTO_KEY_PROVIDER: 'env',
      CRYPTO_LOCAL_KEYS: `demo:${HEX}`,
      CRYPTO_LOCAL_PRIMARY_KID: 'demo',
    });
    const provider = await createKeyProviderFromEnv(env);
    expect(provider.kind).toBe('env');
  });

  it('builds a kms provider that selfTests against the mocked client', async () => {
    kms.on(DescribeKeyCommand).resolves({
      KeyMetadata: { KeyId: ARN, Arn: ARN, Enabled: true, KeyState: 'Enabled' },
    });
    const env = parseCryptoEnv({
      CRYPTO_KEY_PROVIDER: 'kms',
      CRYPTO_KMS_KEY_ARN: ARN,
      AWS_REGION: 'us-east-1',
    });
    const provider = await createKeyProviderFromEnv(env);
    expect(provider.kind).toBe('kms');
  });

  it('throws when env-provider has no keys', async () => {
    await expect(
      createKeyProviderFromEnv({ CRYPTO_KEY_PROVIDER: 'env' } as never),
    ).rejects.toThrow();
  });
});
