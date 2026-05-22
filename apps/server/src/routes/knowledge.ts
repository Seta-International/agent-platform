import {
  deleteKnowledgeFile,
  listKnowledgeFiles,
  markKnowledgeFileProcessed,
  requestKnowledgeUpload,
} from '@seta/copilot';
import type { SessionEnv } from '@seta/core';
import type { WorkerHandle } from '@seta/core/workers';
import { IdentityError } from '@seta/identity';
import type { Context, Hono } from 'hono';
import { z } from 'zod';

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
  workers: WorkerHandle;
  /** Override S3 presigner for testing. When absent, uses the real AWS presigner. */
  presign?: (opts: {
    bucket: string;
    key: string;
    contentType: string;
    expiresInSeconds: number;
  }) => Promise<string>;
};

export function registerKnowledgeRoutes(app: Hono<SessionEnv>, deps: KnowledgeRouteDeps): void {
  app.post('/api/copilot/v1/knowledge/upload-url', async (c) => {
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
      { bucket: process.env.S3_BUCKET ?? 'seta-knowledge', presign: deps.presign },
    );
    return c.json(result);
  });

  app.post('/api/copilot/v1/knowledge/:id/processed', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    await markKnowledgeFileProcessed(
      { tenant_id: scope.tenant_id, file_id },
      {
        enqueueParseJob: async (payload) => {
          await deps.workers.addJob('parse_knowledge_file', {
            ...payload,
            event_id: crypto.randomUUID(),
          });
        },
      },
    );
    return c.json({ ok: true });
  });

  app.get('/api/copilot/v1/knowledge', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const files = await listKnowledgeFiles({ tenant_id: scope.tenant_id, limit: 100 });
    return c.json({ files });
  });

  app.delete('/api/copilot/v1/knowledge/:id', async (c) => {
    requireOrgAdmin(c);
    const scope = c.get('user');
    const file_id = c.req.param('id');
    if (!/^\d+$/.test(file_id)) return c.json({ error: 'invalid_id' }, 400);
    await deleteKnowledgeFile({ tenant_id: scope.tenant_id, file_id });
    return c.json({ ok: true });
  });
}
