import type { RequestContext } from '@mastra/core/request-context';
import { actorFromContext } from './request-context.ts';

export interface CopilotSession {
  tenantId: string;
  userId: string;
}

export async function sessionFromRequestContext(
  requestContext: RequestContext,
): Promise<CopilotSession> {
  const actor = actorFromContext({ requestContext });
  const tenantId = requestContext.get('tenant_id');
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error('missing tenant_id in requestContext');
  }
  return { tenantId, userId: actor.user_id };
}
