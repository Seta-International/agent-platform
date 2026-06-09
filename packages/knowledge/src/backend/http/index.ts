import type { SessionEnv } from '@seta/core';
import { IdentityError } from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { deleteKnowledgeFile } from '../domain/delete-file.ts';
import { listKnowledgeFiles } from '../domain/list-files.ts';
import { markKnowledgeFileProcessed } from '../domain/mark-processed.ts';
import { requestKnowledgeUpload } from '../domain/upload-url.ts';
import { registerChatAttachmentRoutes } from './chat-attachments.ts';

interface JobEnqueuer {
  addJob: (taskName: string, payload: unknown) => Promise<void> | Promise<unknown>;
}

const uploadSchema = z.object({
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().positive(),
});

function requireOrgAdmin(c: Context<SessionEnv>): void {
  const scope = c.get('user');
  if (!scope.role_summary.roles.includes('org.admin')) {
    throw new IdentityError('FORBIDDEN', 'tenant_admin required');
  }
}

export type KnowledgeRouteDeps = {
  workers: JobEnqueuer;
  /** Override S3 presigner for testing. When absent, uses the real AWS presigner. */
  presign?: (opts: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }) => Promise<string>;
  /** Override the chat-attachment readability gate for testing (skips S3). */
  assertReadable?: (input: {
    tenant_id: string;
    file_id: string;
    uploaded_by: string;
  }) => Promise<void>;
};

export function registerKnowledgeRoutes(app: Hono<SessionEnv>, deps: KnowledgeRouteDeps): void {
  app.post('/api/agent/v1/knowledge/upload-url', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const parsed = uploadSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'invalid' }, 400);
    const result = await requestKnowledgeUpload(
      {
        tenant_id: scope.tenant_id,
        uploaded_by: scope.user_id,
        filename: parsed.data.filename,
        mime_type: parsed.data.mime_type,
        size_bytes: parsed.data.size_bytes,
      },
      {
        bucket: process.env.S3_BUCKET ?? 'seta-knowledge',
        session: scope,
        presign: deps.presign,
      },
    );
    return c.json(result);
  });

  app.post('/api/agent/v1/knowledge/:id/processed', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    await markKnowledgeFileProcessed(
      { tenant_id: scope.tenant_id, file_id },
      {
        session: scope,
        enqueueScanJob: async (payload) => {
          await deps.workers.addJob('scan_upload', payload);
        },
      },
    );
    return c.json({ ok: true });
  });

  app.get('/api/agent/v1/knowledge', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const files = await listKnowledgeFiles({ tenant_id: scope.tenant_id, limit: 100 });
    return c.json({ files });
  });

  app.delete('/api/agent/v1/knowledge/:id', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    await deleteKnowledgeFile({ tenant_id: scope.tenant_id, file_id }, { session: scope });
    return c.json({ ok: true });
  });

  // Chat attachments share the worker enqueuer + presign override; they gate on
  // session.effective_permissions (set by the agent bridge on /api/agent/*),
  // not org.admin. Cast: this Hono app also carries the agent `session` var.
  registerChatAttachmentRoutes(app as never, deps);
}

export { registerKnowledgeStreamRoutes } from './stream.ts';
