import type { AgentRequestContext, AgentToolContext } from '@seta/agent-sdk';
import { actorFromContext } from '@seta/agent-sdk';
import { type Audience, audienceFromRoles } from '../../rbac.ts';

/**
 * Resolves the session facts the performance tools need from the Mastra request
 * context: tenant, actor, and the audience tier that drives output depth and
 * field-level redaction.
 */
export function resolveSession(ctx: AgentToolContext): {
  tenantId: string;
  userId: string;
  audience: Audience;
} {
  const actor = actorFromContext(ctx);
  const rc = ctx.requestContext as
    | { get(k: 'tenant_id'): unknown; get(k: 'role_summary'): AgentRequestContext['role_summary'] }
    | undefined;
  const tenantId = rc?.get('tenant_id');
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new Error('missing tenant_id in requestContext');
  }
  const roles = rc?.get('role_summary')?.roles ?? [];
  return { tenantId, userId: actor.user_id, audience: audienceFromRoles(roles) };
}
