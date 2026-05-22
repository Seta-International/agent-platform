import {
  DecryptCommand,
  DescribeKeyCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { CryptoError, type DataKey, type KeyProvider } from '../types.ts';

export interface KmsKeyProviderOptions {
  keyArn: string;
  client?: KMSClient;
  region?: string;
}

const TRANSIENT_KMS_ERRORS = new Set([
  'ThrottlingException',
  'KMSInternalException',
  'KMSInternalFailureException',
  'AccessDeniedException',
  'TimeoutError',
]);

const PERMANENT_KEY_ERRORS = new Set([
  'IncorrectKeyException',
  'InvalidCiphertextException',
  'NotFoundException',
]);

function mapKmsError(err: unknown, fallback: 'KEY_PROVIDER_UNAVAILABLE' | 'UNKNOWN_KID'): never {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (PERMANENT_KEY_ERRORS.has(name)) {
    throw new CryptoError('UNKNOWN_KID', `KMS rejected key: ${name}`, err);
  }
  if (TRANSIENT_KMS_ERRORS.has(name)) {
    throw new CryptoError('KEY_PROVIDER_UNAVAILABLE', `KMS unavailable: ${name}`, err);
  }
  throw new CryptoError(fallback, `KMS call failed: ${name || (err as Error).message}`, err);
}

function arnFromKid(kid: string, expectedArn: string): string {
  if (!kid.startsWith('kms:')) {
    throw new CryptoError('UNKNOWN_KID', `kid '${kid}' is not a kms kid`);
  }
  const arn = kid.slice(4);
  if (arn !== expectedArn) {
    throw new CryptoError(
      'UNKNOWN_KID',
      'kid points to a different CMK than this provider is bound to',
    );
  }
  return arn;
}

export function createKmsKeyProvider(opts: KmsKeyProviderOptions): KeyProvider {
  const client = opts.client ?? new KMSClient(opts.region ? { region: opts.region } : {});
  return {
    kind: 'kms',
    async generateDataKey(): Promise<DataKey> {
      try {
        const out = await client.send(
          new GenerateDataKeyCommand({ KeyId: opts.keyArn, KeySpec: 'AES_256' }),
        );
        if (!out.Plaintext || !out.CiphertextBlob) {
          throw new CryptoError(
            'KEY_PROVIDER_UNAVAILABLE',
            'KMS GenerateDataKey returned empty Plaintext/CiphertextBlob',
          );
        }
        return {
          plaintext: Buffer.from(out.Plaintext),
          wrapped: Buffer.from(out.CiphertextBlob),
          kid: `kms:${opts.keyArn}`,
        };
      } catch (err) {
        if (err instanceof CryptoError) throw err;
        mapKmsError(err, 'KEY_PROVIDER_UNAVAILABLE');
      }
    },
    async unwrapDataKey(kid: string, wrapped: Buffer): Promise<Buffer> {
      const arn = arnFromKid(kid, opts.keyArn);
      try {
        const out = await client.send(new DecryptCommand({ KeyId: arn, CiphertextBlob: wrapped }));
        if (!out.Plaintext) {
          throw new CryptoError('DECRYPT_FAILED', 'KMS Decrypt returned empty Plaintext');
        }
        return Buffer.from(out.Plaintext);
      } catch (err) {
        if (err instanceof CryptoError) throw err;
        mapKmsError(err, 'UNKNOWN_KID');
      }
    },
    async selfTest(): Promise<void> {
      try {
        const out = await client.send(new DescribeKeyCommand({ KeyId: opts.keyArn }));
        if (!out.KeyMetadata?.Enabled) {
          throw new CryptoError(
            'KEY_PROVIDER_UNAVAILABLE',
            `KMS key ${opts.keyArn} is not Enabled (state=${out.KeyMetadata?.KeyState ?? 'unknown'})`,
          );
        }
      } catch (err) {
        if (err instanceof CryptoError) throw err;
        mapKmsError(err, 'KEY_PROVIDER_UNAVAILABLE');
      }
    },
  };
}
