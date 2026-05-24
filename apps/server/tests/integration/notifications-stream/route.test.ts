import { hashRoleSummary, type SessionEnv, type SessionScope } from '@seta/core';
import { registerNotificationsRoutes } from '@seta/notifications/http';
import { NotificationStreamHub } from '@seta/notifications/stream';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

function buildSession(userId: string, tenantId: string): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: userId,
    tenant_id: tenantId,
    email: 'x@test',
    display_name: 'X',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function buildApp(session: SessionScope, hub: NotificationStreamHub): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session);
    await next();
  });
  registerNotificationsRoutes(app, hub);
  return app;
}

async function readChunkContaining(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
  timeoutMs = 1_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const decoder = new TextDecoder();
  let acc = '';
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    acc += decoder.decode(value);
    if (acc.includes(needle)) return acc;
  }
  throw new Error(`timeout waiting for ${needle} in stream; got: ${acc}`);
}

describe('GET /api/notifications/v1/stream', () => {
  it('writes event: invalidate when the hub fans out for the caller user_id', async () => {
    const hub = new NotificationStreamHub();
    const userId = crypto.randomUUID();
    const app = buildApp(buildSession(userId, crypto.randomUUID()), hub);

    const res = await app.request('/api/notifications/v1/stream');
    expect(res.status).toBe(200);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();

    await readChunkContaining(reader, ':connected');
    expect(hub.connectionCount()).toBe(1);

    hub.fanOut(userId);
    const chunk = await readChunkContaining(reader, 'event: invalidate');
    expect(chunk).toContain('event: invalidate');
    expect(chunk).toContain('data: {}');

    await reader.cancel();
  });

  it('does not deliver to other users', async () => {
    const hub = new NotificationStreamHub();
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const app = buildApp(buildSession(userId, crypto.randomUUID()), hub);
    const res = await app.request('/api/notifications/v1/stream');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await readChunkContaining(reader, ':connected');

    hub.fanOut(otherUserId);
    await expect(readChunkContaining(reader, 'event: invalidate', 200)).rejects.toThrow(/timeout/);
    await reader.cancel();
  });
});
