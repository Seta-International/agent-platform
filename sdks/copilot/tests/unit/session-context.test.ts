import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { sessionFromRequestContext } from '../../src/session-context.ts';

describe('sessionFromRequestContext', () => {
  it('returns { tenantId, userId } when actor is set', async () => {
    const ctx = new RequestContext();
    ctx.set('actor', { type: 'user', user_id: 'user-1' });
    ctx.set('tenant_id', 'tenant-A');
    const session = await sessionFromRequestContext(ctx);
    expect(session).toEqual({ tenantId: 'tenant-A', userId: 'user-1' });
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
