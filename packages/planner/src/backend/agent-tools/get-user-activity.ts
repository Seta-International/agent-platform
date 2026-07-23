import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import { getUserActivity } from '../domain/get-user-activity.ts';
import { resolveMemberScope } from './resolve-scope.ts';

export const plannerGetUserActivityTool = defineAgentTool({
  id: 'planner_getUserActivity',
  name: 'Get User Activity',
  description:
    "A person's recent activity across the boards you can see, newest first.\n" +
    'Identity is flexible: omit userId/userName for the CURRENT user ("what did I do"); ' +
    'pass userName to look up ANOTHER person by name/email; or pass an explicit userId (UUID). ' +
    'Never invent a UUID — for a named person just pass userName and this tool resolves it.',
  input: z
    .object({
      userId: z.string().uuid().optional().describe('Explicit user UUID (another person).'),
      userName: z
        .string()
        .optional()
        .describe('Name or email fragment of ANOTHER person, e.g. "Gandalf" or "gandalf@".'),
      since: z.string().optional().describe('ISO lower bound.'),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .refine((v) => !(v.userId && v.userName), {
      message: 'Provide userId OR userName, not both. Omit both for the current user.',
    }),
  output: z.object({
    events: z
      .array(
        z.object({
          id: z.string(),
          eventType: z.string(),
          aggregateType: z.string(),
          aggregateId: z.string(),
          occurredAt: z.string(),
        }),
      )
      .optional(),
    // Populated instead of `events` when a name can't be resolved (not found /
    // ambiguous). A recoverable outcome the agent relays to the user — NOT an
    // exception, so it neither throws nor trips the tool circuit breaker.
    error: z.string().optional(),
  }),
  rbac: 'planner.reporting.read',
  execute: async (input, ctx) => {
    const session = await buildActorSession(actorFromContext(ctx));

    // Resolve WHO. Default to the caller (self) when no identity is given —
    // "what did I do" never needs an id. An explicit UUID is used directly;
    // a name is resolved here so callers don't chain planner_resolveMember.
    let targetUserId = session.user_id;
    if (input.userId) {
      targetUserId = input.userId;
    } else if (input.userName) {
      const resolved = await resolveMemberScope(session, { userName: input.userName });
      if ('notFound' in resolved) {
        return { error: `No member found matching "${input.userName}".` };
      }
      if ('ambiguous' in resolved) {
        const names = resolved.options.map((o) => o.name).join(', ');
        return {
          error: `Multiple people match "${input.userName}": ${names}. Please specify which one.`,
        };
      }
      targetUserId = resolved.id;
    }

    return getUserActivity({
      user_id: targetUserId,
      session,
      since: input.since,
      limit: input.limit,
    });
  },
});
