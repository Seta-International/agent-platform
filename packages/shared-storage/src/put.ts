import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getS3Client } from './client.ts';

export interface PutObjectInput {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType: string;
}

/** Put a single object. `deps.client` overrides the shared client (tests). */
export async function putObject(
  input: PutObjectInput,
  deps: { client?: S3Client } = {},
): Promise<void> {
  const client = deps.client ?? getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}
