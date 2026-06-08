import { DeleteObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getS3Client } from './client.ts';

/** Delete a single object. Idempotent at the S3 level (deleting a missing key
 *  succeeds). `deps.client` overrides the shared client (tests). */
export async function deleteObject(
  opts: { bucket: string; key: string },
  deps: { client?: S3Client } = {},
): Promise<void> {
  const client = deps.client ?? getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: opts.key }));
}
