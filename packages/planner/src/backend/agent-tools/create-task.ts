import type { PgVector } from '@mastra/pg';
import { ApprovalCardSchema, actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { getPlannerVectorStore } from '../embeddings/vector-store.ts';
import {
  DedupOutputSchema,
  LinkModeSchema,
  TaskDraftSchema,
} from '../workflows/dedup-on-create/schemas.ts';
import { buildConfirmNotDuplicateCard } from '../workflows/dedup-on-create/steps/confirm-not-duplicate.ts';
import {
  applyDupDecision,
  type DupAction,
  findDupCandidates,
} from '../workflows/dedup-on-create/workflow.ts';

export interface PlannerCreateTaskDeps {
  provider: EmbeddingProvider;
  databaseUrl?: string;
  pgVector?: PgVector;
  thresholds?: { likelyDup: number; maybeDup: number };
}

const DEFAULT_THRESHOLDS = { likelyDup: 0.18, maybeDup: 0.3 };

const DupActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create-new') }),
  z.object({ kind: z.literal('link'), existingId: z.string().uuid(), mode: LinkModeSchema }),
  z.object({ kind: z.literal('cancel') }),
]);

/**
 * planner_createTask — single-call create with built-in dedup.
 *
 * 1. Validate the draft.
 * 2. Run findDupCandidates (read-only) inside execute.
 * 3. If no-match → create the task immediately and return.
 * 4. Otherwise → ctx.agent.suspend(ApprovalCard). The client renders the card
 *    with candidates + Related/Sub-task alternates. User responds with a
 *    DupAction; Mastra resumes execute with `ctx.agent.resumeData`.
 * 5. Resume path → applyDupDecision routes to createTaskStep /
 *    linkToExisting / cancelled.
 */
export function plannerCreateTaskTool(deps: PlannerCreateTaskDeps) {
  const reranker = resolveReranker();
  const thresholds = deps.thresholds ?? DEFAULT_THRESHOLDS;
  const resolvePgVector = (): PgVector => {
    if (deps.pgVector) return deps.pgVector;
    if (!deps.databaseUrl) {
      throw new Error('planner_createTask: pgVector or databaseUrl required');
    }
    return getPlannerVectorStore(deps.databaseUrl);
  };

  return defineCopilotTool({
    id: 'planner_createTask',
    name: 'Create Task',
    description:
      'Create a task. Internally runs the dedupOnCreate workflow: searches for ' +
      'similar tasks; if a likely duplicate is found, suspends with a candidate ' +
      'list so the user can pick Create-new / Related / Sub-task / Cancel.',
    input: TaskDraftSchema,
    output: DedupOutputSchema,
    suspendSchema: ApprovalCardSchema,
    resumeSchema: DupActionSchema,
    rbac: 'planner.task.create',
    execute: async (draft, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await buildActorSession(actor);
      const resumeData = ctx.agent?.resumeData;

      if (resumeData) {
        return applyDupDecision({
          draft: TaskDraftSchema.parse(draft),
          action: resumeData satisfies DupAction,
          session,
        });
      }

      const {
        classification,
        candidates,
        draft: normalized,
      } = await findDupCandidates(
        { draft, session: { tenantId: session.tenant_id, userId: actor.user_id } },
        { provider: deps.provider, pgVector: resolvePgVector(), reranker, thresholds },
      );

      if (classification === 'no-match') {
        return applyDupDecision({
          draft: normalized,
          action: { kind: 'create-new' },
          session,
        });
      }

      const card = buildConfirmNotDuplicateCard({
        classification,
        candidates,
        draft: normalized,
        session: { tenantId: session.tenant_id, userId: actor.user_id },
        toolCallId: ctx.agent?.toolCallId ?? 'unknown',
      });
      await ctx.agent?.suspend?.(card);
      // Unreachable in practice — Mastra throws/returns after suspend.
      return undefined;
    },
  });
}
