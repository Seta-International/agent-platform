import type { RequestContext } from '@mastra/core/request-context';
import { actorFromContext, type CopilotRequestContext } from './request-context.ts';

export interface CopilotSession {
  tenantId: string;
  userId: string;
}

export async function sessionFromRequestContext(
  requestContext: RequestContext,
): Promise<CopilotSession> {
  const typed = requestContext as unknown as RequestContext<CopilotRequestContext>;
  const actor = actorFromContext({ requestContext: typed });
  const tenantId = typed.get('tenant_id' as keyof CopilotRequestContext);
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error('missing tenant_id in requestContext');
  }
  return { tenantId, userId: actor.user_id };
}
