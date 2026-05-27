import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';

export const RequestContextSchema = z.object({
  actor: z.object({
    type: z.literal('user'),
    user_id: z.string().min(1),
  }),
});

/**
 * Full state shape carried on the Mastra RequestContext for every copilot
 * request. `actor` is validated by Mastra via `requestContextSchema`; the
 * remaining fields are set imperatively by the route layer before the
 * agent/workflow step runs.
 */
export interface CopilotRequestContext {
  actor: { type: 'user'; user_id: string };
  tenant_id: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
}

export interface AuthenticatedUserActor {
  type: 'user';
  user_id: string;
}

export function actorFromContext(ctx: {
  requestContext?: RequestContext<CopilotRequestContext>;
}): AuthenticatedUserActor {
  const raw = ctx?.requestContext?.get('actor');
  if (!raw || typeof raw !== 'object') {
    throw new Error('unauthenticated');
  }
  const a = raw as Partial<AuthenticatedUserActor>;
  if (a.type !== 'user' || !a.user_id) {
    throw new Error('unauthenticated');
  }
  return { type: 'user', user_id: a.user_id };
}
