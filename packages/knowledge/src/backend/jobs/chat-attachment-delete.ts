import { deleteObject as defaultDeleteObject } from '@seta/shared-storage';

export interface ChatAttachmentDeletePayload {
  s3_key: string;
}

export interface ChatAttachmentDeleteDeps {
  bucket: string;
  deleteObject?: typeof defaultDeleteObject;
}

/** TTL cleanup: delete the chat attachment's S3 object. Idempotent — a missing
 *  object (already deleted / never finished uploading) is not an error. */
export async function runChatAttachmentDelete(
  payload: ChatAttachmentDeletePayload,
  deps: ChatAttachmentDeleteDeps,
): Promise<void> {
  const del = deps.deleteObject ?? defaultDeleteObject;
  try {
    await del({ bucket: deps.bucket, key: payload.s3_key });
  } catch {
    // Missing object or transient S3 error — the goal (object gone) is met or
    // will be retried by a later run; never block the queue on cleanup.
  }
}
