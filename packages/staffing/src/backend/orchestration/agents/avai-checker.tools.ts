import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import type { AvailabilityPort } from '../ports.ts';
import { AvailabilityResultSchema, OVERLOAD_THRESHOLD } from '../schemas.ts';

export interface AvaiCheckerToolDeps {
  availability: AvailabilityPort;
}

function tenantOf(ctx: { requestContext?: { get(k: string): unknown } }): string {
  const t = ctx.requestContext?.get('tenant_id');
  if (typeof t !== 'string' || !t)
    throw new Error('avai-checker tool: missing tenant_id in requestContext');
  return t;
}

export function makeAvaiCheckerTools(deps: AvaiCheckerToolDeps) {
  const getAvailability = defineAgentTool({
    id: 'getAvailability',
    name: 'Get availability',
    description:
      'For each user id return availability status + in-progress task count. Users with >=10 in-progress tasks are reported busy (overload guard). Call once with all candidate ids.',
    rbac: 'planner.task.read',
    input: z.object({ userIds: z.array(z.string()).min(1) }),
    output: z.object({ availability: z.array(AvailabilityResultSchema) }),
    execute: async ({ userIds }, ctx) => {
      const runCtx = {
        tenantId: tenantOf(ctx),
        actorUserId: actorFromContext(ctx).user_id,
        abortSignal: ctx.abortSignal,
      };
      const availability = [];
      for (const userId of userIds) {
        const [s, inProgressCount] = await Promise.all([
          deps.availability.status(userId, runCtx),
          deps.availability.inProgressCount(userId, runCtx),
        ]);
        availability.push({
          userId,
          name: null,
          status: inProgressCount >= OVERLOAD_THRESHOLD ? ('busy' as const) : s.status,
          inProgressCount,
        });
      }
      return { availability };
    },
  });
  return { getAvailability };
}
