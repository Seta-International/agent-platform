import type { RequestContext } from '@mastra/core/request-context';
import { type AgentRequestContext, actorFromContext } from './request-context.ts';

export interface AgentSession {
  tenantId: string;
  userId: string;
  roleSummary: { roles: string[]; cross_tenant_read: boolean };
}

export async function sessionFromRequestContext(
  requestContext: RequestContext,
): Promise<AgentSession> {
  const typed = requestContext as unknown as RequestContext<AgentRequestContext>;
  const actor = actorFromContext({ requestContext: typed });
  const tenantId = typed.get('tenant_id');
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error('missing tenant_id in requestContext');
  }
  const roleSummary = typed.get('role_summary') ?? { roles: [], cross_tenant_read: false };
  return { tenantId, userId: actor.user_id, roleSummary };
}
