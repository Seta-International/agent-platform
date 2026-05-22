import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as defaultGetSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client } from './client.ts';

export interface PresignedUploadOptions {
  bucket: string;
  key: string;
  contentType: string;
  /** Allowed range per AWS: 1..604800 (7 days). v1: keep short (5–15 min). */
  expiresInSeconds: number;
}

export interface PresignedDownloadOptions {
  bucket: string;
  key: string;
  expiresInSeconds: number;
}

export interface PresignDeps {
  /** Override for tests. */
  getSignedUrl?: typeof defaultGetSignedUrl;
}

export async function presignedUploadUrl(
  opts: PresignedUploadOptions,
  deps: PresignDeps = {},
): Promise<string> {
  const client = getS3Client();
  const signer = deps.getSignedUrl ?? defaultGetSignedUrl;
  return signer(
    client,
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.key,
      ContentType: opts.contentType,
    }),
    { expiresIn: opts.expiresInSeconds },
  );
}

export async function presignedDownloadUrl(
  opts: PresignedDownloadOptions,
  deps: PresignDeps = {},
): Promise<string> {
  const client = getS3Client();
  const signer = deps.getSignedUrl ?? defaultGetSignedUrl;
  return signer(client, new GetObjectCommand({ Bucket: opts.bucket, Key: opts.key }), {
    expiresIn: opts.expiresInSeconds,
  });
}
