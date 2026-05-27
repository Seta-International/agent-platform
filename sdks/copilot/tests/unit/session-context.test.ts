import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { sessionFromRequestContext } from '../../src/session-context.ts';

describe('sessionFromRequestContext', () => {
  it('returns { tenantId, userId, roleSummary } when actor and role_summary are set', async () => {
    const ctx = new RequestContext();
    ctx.set('actor', { type: 'user', user_id: 'user-1' });
    ctx.set('tenant_id', 'tenant-A');
    ctx.set('role_summary', { roles: ['org.admin'], cross_tenant_read: false });
    const session = await sessionFromRequestContext(ctx);
    expect(session).toEqual({
      tenantId: 'tenant-A',
      userId: 'user-1',
      roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
    });
  });

  it('defaults roleSummary to empty when role_summary is not set', async () => {
    const ctx = new RequestContext();
    ctx.set('actor', { type: 'user', user_id: 'user-1' });
    ctx.set('tenant_id', 'tenant-A');
    const session = await sessionFromRequestContext(ctx);
    expect(session.roleSummary).toEqual({ roles: [], cross_tenant_read: false });
  });

  it('throws "unauthenticated" when actor missing', async () => {
    const ctx = new RequestContext();
    await expect(sessionFromRequestContext(ctx)).rejects.toThrow('unauthenticated');
  });

  it('throws when actor present but tenant_id missing', async () => {
    const ctx = new RequestContext();
    ctx.set('actor', { type: 'user', user_id: 'user-1' });
    await expect(sessionFromRequestContext(ctx)).rejects.toThrow('missing tenant_id');
  });
});
