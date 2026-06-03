import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import type { AvailabilityPort } from '../ports.ts';
import { AvailabilityResultSchema, AvailabilityStatus } from '../schemas.ts';
import { computeAvailabilityScore } from './avai-checker.score.ts';

export interface AvaiCheckerToolDeps {
  availability: AvailabilityPort;
}

function tenantOf(ctx: { requestContext?: { get(k: string): unknown } }): string {
  const t = ctx.requestContext?.get('tenant_id');
  if (typeof t !== 'string' || !t)
    throw new Error('avai-checker tool: missing tenant_id in requestContext');
  return t;
}

const AvailabilityRowSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  availability: AvailabilityStatus,
});
const InProgressRowSchema = z.object({
  userId: z.string(),
  taskInProgressCount: z.number().int(),
});
const ScoreItemSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  availability: AvailabilityStatus,
  taskInProgressCount: z.number().int(),
});

export function makeAvaiCheckerTools(deps: AvaiCheckerToolDeps) {
  const checkAvailability = defineAgentTool({
    id: 'checkAvailability',
    name: 'Check availability status',
    description:
      'For each user id return their availability status (available | busy | ooo) and display name. Call once with all candidate ids.',
    rbac: 'identity.user.read.any',
    input: z.object({ userIds: z.array(z.string()).min(1) }),
    output: z.object({ results: z.array(AvailabilityRowSchema) }),
    execute: async ({ userIds }, ctx) => {
      const runCtx = {
        tenantId: tenantOf(ctx),
        actorUserId: actorFromContext(ctx).user_id,
        abortSignal: ctx.abortSignal,
      };
      const results = await Promise.all(
        userIds.map(async (userId) => {
          const s = await deps.availability.status(userId, runCtx);
          return { userId, userName: s.name ?? null, availability: s.status };
        }),
      );
      return { results };
    },
  });

  const checkInprogressTasks = defineAgentTool({
    id: 'checkInprogressTasks',
    name: 'Check in-progress task load',
    description:
      'For each user id return how many in-progress (started but not done) tasks they are assigned. Call once with all candidate ids.',
    rbac: 'planner.task.read',
    input: z.object({ userIds: z.array(z.string()).min(1) }),
    output: z.object({ results: z.array(InProgressRowSchema) }),
    execute: async ({ userIds }, ctx) => {
      const runCtx = {
        tenantId: tenantOf(ctx),
        actorUserId: actorFromContext(ctx).user_id,
        abortSignal: ctx.abortSignal,
      };
      const results = await Promise.all(
        userIds.map(async (userId) => ({
          userId,
          taskInProgressCount: await deps.availability.inProgressCount(userId, runCtx),
        })),
      );
      return { results };
    },
  });

  const determineAvaiScore = defineAgentTool({
    id: 'determineAvaiScore',
    name: 'Determine availability score',
    description:
      'Combine each candidate availability status and in-progress task count into an availability score in [0,1] (higher = freer; ooo = 0). Call once after the other two tools, passing one merged item per user.',
    input: z.object({ items: z.array(ScoreItemSchema).min(1) }),
    output: z.object({ availability: z.array(AvailabilityResultSchema) }),
    execute: async ({ items }) => ({
      availability: items.map((i) => ({
        userId: i.userId,
        name: i.userName,
        status: i.availability,
        inProgressCount: i.taskInProgressCount,
        availabilityScore: computeAvailabilityScore(i.availability, i.taskInProgressCount),
      })),
    }),
  });

  return { checkAvailability, checkInprogressTasks, determineAvaiScore };
}
