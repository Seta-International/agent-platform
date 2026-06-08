import type { SessionLike } from '@seta/agent-sdk';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import {
  ChatAttachmentError,
  deleteChatAttachment,
  getChatAttachmentStatus,
  listThreadAttachments,
  markChatAttachmentProcessed,
  requestChatAttachmentUpload,
} from '../domain/chat-attachment.ts';

interface JobEnqueuer {
  addJob: (taskName: string, payload: unknown) => Promise<void> | Promise<unknown>;
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
    await markChatAttachmentProcessed(
      { tenant_id: s.tenant_id, file_id, uploaded_by: s.user_id },
      {
        enqueueScanJob: async (payload) => {
          await deps.workers.addJob('scan_upload', payload);
        },
      },
    );
    return c.json({ ok: true });
  });

  app.get('/api/agent/v1/knowledge/attachments/:id', async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    const status = await getChatAttachmentStatus({
      tenant_id: s.tenant_id,
      file_id,
      uploaded_by: s.user_id,
    });
    if (!status) return c.json({ error: 'not_found' }, 404);
    return c.json(status);
  });

  app.get('/api/agent/v1/knowledge/attachments', async (c) => {
    const s = gate(c);
    if (s instanceof Response) return s;
    const thread_id = c.req.query('thread_id');
    if (!thread_id) return c.json({ error: 'thread_id required' }, 400);
    const attachments = await listThreadAttachments({ tenant_id: s.tenant_id, thread_id });
    return c.json({ attachments });
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
