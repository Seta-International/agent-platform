import type { SessionLike } from '@seta/agent-sdk';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  assertChatAttachmentReadable,
  ChatAttachmentError,
  deleteChatAttachment,
  markChatAttachmentUploaded,
  requestChatAttachmentUpload,
} from '../domain/chat-attachment.ts';

interface JobEnqueuer {
  addJob: (
    taskName: string,
    payload: unknown,
    spec?: { runAt?: Date },
  ) => Promise<void> | Promise<unknown>;
}

type ChatAttachmentEnv = { Variables: { session: SessionLike } };

export interface ChatAttachmentRouteDeps {
  workers: JobEnqueuer;
  presign?: (opts: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }) => Promise<string>;
  /** Upload-time readability gate (parse-probe). Overridable so tests skip S3.
   *  Defaults to assertChatAttachmentReadable (fetches from S3 + parses). */
  assertReadable?: (input: {
    tenant_id: string;
    file_id: string;
    uploaded_by: string;
  }) => Promise<void>;
}

const PERM = 'knowledge.chat_attachment.write';

const uploadSchema = z.object({
  thread_id: z.string().uuid(),
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
});

function gate(c: Context<ChatAttachmentEnv>): SessionLike | Response {
  const session = c.get('session');
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  if (!session.effective_permissions.has(PERM)) return c.json({ error: 'forbidden' }, 403);
  return session;
}

function mapError(c: Context<ChatAttachmentEnv>, err: unknown): Response {
  if (err instanceof ChatAttachmentError) {
    const status = err.code === 'LIMIT' ? 409 : err.code === 'NOT_FOUND' ? 404 : 400;
    return c.json({ error: err.code, message: err.message }, status);
  }
  throw err;
}

export function registerChatAttachmentRoutes(
  app: Hono<ChatAttachmentEnv>,
  deps: ChatAttachmentRouteDeps,
): void {
  const bucket = () => process.env.S3_BUCKET ?? 'seta-knowledge';

  app.post('/api/agent/v1/knowledge/attachments/upload-url', async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const parsed = uploadSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    try {
      const result = await requestChatAttachmentUpload(
        {
          tenant_id: s.tenant_id,
          uploaded_by: s.user_id,
          thread_id: parsed.data.thread_id,
          filename: parsed.data.filename,
          mime_type: parsed.data.mime_type,
          size_bytes: parsed.data.size_bytes,
        },
        { bucket: bucket(), presign: deps.presign },
      );
      return c.json(result);
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.post('/api/agent/v1/knowledge/attachments/:id/processed', async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    try {
      // Reject a corrupt/unreadable file here so the upload fails loudly instead
      // of silently 413/400-ing at the first turn that tries to use it.
      const assertReadable = deps.assertReadable ?? assertChatAttachmentReadable;
      await assertReadable({ tenant_id: s.tenant_id, file_id, uploaded_by: s.user_id });
      const row = await markChatAttachmentUploaded({
        tenant_id: s.tenant_id,
        file_id,
        uploaded_by: s.user_id,
      });
      if (row) {
        const ttlSeconds = Number(process.env.CHAT_ATTACHMENT_S3_TTL_SECONDS ?? 3600);
        await deps.workers.addJob(
          'chat_attachment_delete',
          { s3_key: row.s3_key },
          { runAt: new Date(Date.now() + ttlSeconds * 1000) },
        );
      }
      return c.json({ ok: true });
    } catch (err) {
      return mapError(c, err);
    }
  });

  app.delete('/api/agent/v1/knowledge/attachments/:id', async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    await deleteChatAttachment({ tenant_id: s.tenant_id, file_id, uploaded_by: s.user_id }, {});
    return c.json({ ok: true });
  });
}
