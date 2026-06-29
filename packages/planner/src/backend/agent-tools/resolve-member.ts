import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { plannerDb } from '../db/index.ts';
import { assigneeProjection } from '../db/schema.ts';

export const plannerResolveMemberTool = defineAgentTool({
  id: 'planner_resolveMember',
  name: 'Resolve Member',
  description:
    'Resolve a person referenced by name or email into their userId, scoped to the current ' +
    "tenant's active members.\n\n" +
    'Use for: turning "what tasks does Tuan have?" into a userId before calling planner_queryTasks. ' +
    'Returns ALL matches — if more than one, ask the user which person they mean; never pick blindly. ' +
    'Returns an empty list when nobody matches. Do NOT use for "me"/"my" — use assigneeScope: "me".',
  input: z.object({
    query: z.string().min(1).describe('A name or email fragment to match, e.g. "Tuan" or "tuan@".'),
    limit: z.number().int().min(1).max(20).default(10).describe('Max candidates to return.'),
  }),
  output: z.object({
    candidates: z.array(
      z.object({
        userId: z.string().describe('User ID — pass to planner_queryTasks as assigneeUserId.'),
        displayName: z.string(),
        email: z.string(),
      }),
    ),
  }),
  rbac: 'planner.group.member.read',
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession(actor);
    const pattern = `%${input.query}%`;

    const rows = await plannerDb()
      .select({
        userId: assigneeProjection.user_id,
        displayName: assigneeProjection.display_name,
        email: assigneeProjection.email,
      })
      .from(assigneeProjection)
      .where(
        and(
          eq(assigneeProjection.tenant_id, session.tenant_id),
          isNull(assigneeProjection.deactivated_at),
          or(
            ilike(assigneeProjection.display_name, pattern),
            ilike(assigneeProjection.email, pattern),
          ),
        ),
      )
      .limit(input.limit ?? 10);

    return { candidates: rows };
  },
});
