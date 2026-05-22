import { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientOptions {
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

let cached: S3Client | undefined;

export function getS3Client(opts: S3ClientOptions = {}): S3Client {
  if (cached) return cached;
  cached = new S3Client({
    region: opts.region ?? process.env.S3_REGION ?? 'us-east-1',
    endpoint: opts.endpoint ?? process.env.S3_ENDPOINT,
    forcePathStyle: opts.forcePathStyle ?? process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials:
      opts.accessKeyId && opts.secretAccessKey
        ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
        : process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
  });
  return cached;
}

export function resetS3Client(): void {
  cached = undefined;
}
