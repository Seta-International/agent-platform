import { defineAgentTool, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import {
  classifyByThreshold,
  toDistance,
} from '../../workflows/dedup-on-create/steps/classify-by-threshold.ts';
import { buildCreateTaskApprovalCard } from './approval-card.ts';
import { normalizeInstant } from './date-normalize.ts';
import type { ActionPorts } from './ports.ts';
import {
  type CreateTaskDraft,
  CreateTaskResumeSchema,
  CreateTaskSuspendSchema,
  CreateTaskToolInputSchema,
  CreateTaskToolOutputSchema,
} from './schemas.ts';

export interface CreateTaskToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
}

/** The same numbers the dedup workflow uses. Chat and the canvas must agree on
 *  what "similar" means, or one pair of tasks is a duplicate on one surface and
 *  not the other. */
const DEDUP_THRESHOLDS = { likelyDup: 0.35, maybeDup: 0.45 };
const MAX_SIMILAR = 3;

/**
 * A2's create tool: preview → confirm → one gated write.
 *
 * The duplicate check runs on the FIRST pass, inline. `searchSimilar` is
 * synchronous and LLM-free, so nothing about it needs a workflow or a second
 * card — and running it before `suspend()` is what lets one card carry both the
 * preview and the "use the existing one instead" escape.
 */
export function makeCreateTaskTool(deps: CreateTaskToolDeps) {
  const { ports, ctx } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_createTask',
    name: 'Create Task',
    description: [
      'Chat flow only — shows the user a preview card and waits for them to confirm.',
      '',
      'Create ONE new task in a plan. Nothing is written until the user confirms.',
      '',
      'Use for: "tạo task X trong plan Y"; "add \'fix login bug\' to Sprint 32".',
      'Every task belongs to a plan: if the user has not named one and the conversation',
      'does not make it obvious, ASK — never guess a plan.',
      'Resolve relative dates ("thứ sáu tuần sau") to YYYY-MM-DD before calling.',
      '',
      'The tool checks the plan for similar tasks itself and shows them on the same card,',
      'so do NOT search for duplicates first.',
      'It does not set an assignee — assigning is a separate request with its own preview.',
    ].join('\n'),
    input: CreateTaskToolInputSchema,
    output: CreateTaskToolOutputSchema,
    suspendSchema: CreateTaskSuspendSchema,
    resumeSchema: CreateTaskResumeSchema,
    // Declarative metadata only; the first pass gates for itself.
    rbac: 'planner.task.create',
    execute: async (input, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = CreateTaskResumeSchema.parse(resume);

        if (decision.action === 'decline') {
          return { created: false, taskId: null, refusal: null };
        }

        if (decision.action === 'use_existing') {
          // No write, no gateway call, no idempotency row. This is what makes
          // "on Cancel nothing is left over" true for the duplicate branch too.
          return {
            created: false,
            taskId: decision.existingTaskId ?? null,
            usedExisting: true,
            refusal: null,
          };
        }

        if (!decision.planId || !decision.draft || !decision.idempotencyKey) {
          // A card written before this tool shipped, or a truncated payload.
          return {
            created: false,
            taskId: null,
            refusal: 'This preview is incomplete. Ask me to create the task again.',
          };
        }

        const { taskId } = await ports.taskCreate.create({
          ...actor,
          planId: decision.planId,
          draft: decision.draft,
          idempotencyKey: decision.idempotencyKey,
        });
        return { created: true, taskId, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const plan = await ports.taskCreate.resolvePlan({ ...actor, planRef: input.planRef });
      if (!plan) {
        return {
          created: false,
          taskId: null,
          refusal: `I can't find a plan called "${input.planRef}".`,
        };
      }
      if ('ambiguous' in plan) {
        // Never pick — the same rule every other A2 tool follows.
        return {
          created: false,
          taskId: null,
          refusal: `There are ${plan.ambiguous.length} plans called "${input.planRef}". Which one did you mean?`,
        };
      }

      // The gate, BEFORE the card AND before the embedding call: a refused actor
      // should not spend a vector search either.
      await ports.taskCreate.assertCanCreate({ ...actor, groupId: plan.groupId });

      const draft: CreateTaskDraft = {
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.startAt ? { startAt: normalizeInstant(input.startAt, 'start') } : {}),
        ...(input.dueAt ? { dueAt: normalizeInstant(input.dueAt, 'end') } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.labels?.length ? { labels: input.labels } : {}),
      };

      // A dead vector store must not stop a user creating a task: degrade to a
      // card with no alternates rather than refusing the request.
      let similar: Array<{ taskId: string; title: string; score: number }> = [];
      try {
        const hits = await ports.similarTasks.search({
          ...actor,
          planId: plan.planId,
          queryText: [input.title, input.description ?? ''].join(' ').trim(),
          limit: 5,
        });
        const { classification, top } = classifyByThreshold(
          { candidates: hits.map((h) => ({ ...h, status: 'open' })) },
          DEDUP_THRESHOLDS,
        );
        similar =
          classification === 'no-match'
            ? []
            : // Filtered PER candidate, not just by the classification.
              // classifyByThreshold decides the classification from `top[0]` and
              // then returns the whole top-5 slice, so offering `top` wholesale
              // would put a task nobody would call a duplicate on a button right
              // next to one that is.
              top
                .filter((c) => toDistance(c.score) < DEDUP_THRESHOLDS.maybeDup)
                .slice(0, MAX_SIMILAR)
                .map((c) => ({ taskId: c.taskId, title: c.title, score: c.score }));
      } catch {
        similar = [];
      }

      const card = buildCreateTaskApprovalCard({
        planId: plan.planId,
        planName: plan.planName,
        draft,
        similar,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload.
        idempotencyKey: crypto.randomUUID(),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_createTask: ctx.agent.suspend unavailable');
      }
      await agent.suspend({ card });
      return { created: false, taskId: null };
    },
  });
}
