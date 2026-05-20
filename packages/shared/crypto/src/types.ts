export interface EncryptedBlob {
  readonly v: 1;
  readonly alg: 'A256GCM';
  readonly kid: string;
  readonly wdk: string;
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

export interface DataKey {
  plaintext: Buffer;
  wrapped: Buffer;
  kid: string;
}

export interface KeyProvider {
  readonly kind: 'kms' | 'env';
  generateDataKey(): Promise<DataKey>;
  unwrapDataKey(kid: string, wrapped: Buffer): Promise<Buffer>;
  selfTest(): Promise<void>;
}

export type CryptoErrorCode =
  | 'ENCRYPT_FAILED'
  | 'DECRYPT_FAILED'
  | 'BLOB_PARSE_FAILED'
  | 'UNKNOWN_KID'
  | 'UNSUPPORTED_VERSION'
  | 'KEY_PROVIDER_UNAVAILABLE';

export class CryptoError extends Error {
  constructor(
    public readonly code: CryptoErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CryptoError';
  }
}

export interface CryptoMetrics {
  encryptAttempted(labels: { kid_namespace: 'env' | 'kms' }): void;
  encryptSucceeded(labels: { kid_namespace: 'env' | 'kms' }, durationMs: number): void;
  encryptFailed(labels: { kid_namespace: 'env' | 'kms'; error_code: CryptoErrorCode }): void;
  decryptAttempted(labels: { kid_namespace: 'env' | 'kms' }): void;
  decryptSucceeded(labels: { kid_namespace: 'env' | 'kms' }, durationMs: number): void;
  decryptFailed(labels: { kid_namespace: 'env' | 'kms'; error_code: CryptoErrorCode }): void;
  selfTestDurationMs(labels: { kind: 'env' | 'kms' }, durationMs: number): void;
}

export function noopMetrics(): CryptoMetrics {
  return {
    encryptAttempted: () => {},
    encryptSucceeded: () => {},
    encryptFailed: () => {},
    decryptAttempted: () => {},
    decryptSucceeded: () => {},
    decryptFailed: () => {},
    selfTestDurationMs: () => {},
  };
}

export interface Crypto {
  encrypt(plaintext: string): Promise<EncryptedBlob>;
  decrypt(blob: EncryptedBlob): Promise<string>;
}
