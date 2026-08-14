import { defineAgentTool, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import type { z } from 'zod';
import {
  classifyByThreshold,
  toDistance,
} from '../../workflows/dedup-on-create/steps/classify-by-threshold.ts';
import { buildCreateTaskApprovalCard } from './approval-card.ts';
import { normalizeInstant } from './date-normalize.ts';
import type { ActionPorts } from './ports.ts';
import { INCOMPLETE_PREVIEW, resolveRevision, stringField } from './revision.ts';
import type { ActionOpenPreview } from './schemas.ts';
import {
  CREATE_DRAFT_FIELDS,
  type CreateTaskDraft,
  CreateTaskResumeSchema,
  CreateTaskSuspendSchema,
  CreateTaskToolInputSchema,
  CreateTaskToolOutputSchema,
} from './schemas.ts';

export interface CreateTaskToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
  /** The preview the SERVER found open for this turn, or null (FUT-840). It
   *  arrives through the run context and never through tool arguments, and the
   *  server — not the model — decides whether this call adjusts it (design D20). */
  openPreview?: ActionOpenPreview | null;
}

/** The same numbers the dedup workflow uses. Chat and the canvas must agree on
 *  what "similar" means, or one pair of tasks is a duplicate on one surface and
 *  not the other. */
const DEDUP_THRESHOLDS = { likelyDup: 0.35, maybeDup: 0.45 };
const MAX_SIMILAR = 3;

/** The draft fields a revision may name, in the model's own vocabulary. */
type DraftInput = Pick<
  z.infer<typeof CreateTaskToolInputSchema>,
  'title' | 'description' | 'dueAt' | 'startAt' | 'priority' | 'labels'
>;

/**
 * Merge an adjustment onto the draft already on the card, then remove whatever
 * the user asked to be left alone (design D3, D17).
 *
 * Keys are added CONDITIONALLY, never as `undefined`: `CreateTaskDraftSchema` is
 * `.strict()`, and an explicit `description: undefined` would erase a value the
 * user already agreed to just because this sentence did not repeat it.
 *
 * `title` is not droppable — the schema requires it, so dropping it would produce
 * a card the builder cannot render.
 */
function mergeDrafts(
  previous: CreateTaskDraft,
  input: DraftInput,
  dropFields: readonly string[] | undefined,
): { draft: CreateTaskDraft } | { refusal: string } {
  const merged: Record<string, unknown> = {
    ...previous,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.startAt ? { startAt: normalizeInstant(input.startAt, 'start') } : {}),
    ...(input.dueAt ? { dueAt: normalizeInstant(input.dueAt, 'end') } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.labels?.length ? { labels: input.labels } : {}),
  };
  for (const field of dropFields ?? []) {
    if (field === 'title') {
      return {
        refusal:
          'A new task needs a title. Tell me what it should be called, or cancel the preview.',
      };
    }
    if (!(CREATE_DRAFT_FIELDS as readonly string[]).includes(field)) {
      return {
        refusal:
          `I don't set a field called "${field}" on a new task. I can set ` +
          `${CREATE_DRAFT_FIELDS.join(', ')}.`,
      };
    }
    delete merged[field];
  }
  return { draft: merged as CreateTaskDraft };
}

/**
 * A2's create tool: preview → confirm → one gated write.
 *
 * The duplicate check runs on the FIRST pass, inline. `searchSimilar` is
 * synchronous and LLM-free, so nothing about it needs a workflow or a second
 * card — and running it before `suspend()` is what lets one card carry both the
 * preview and the "use the existing one instead" escape.
 */
export function makeCreateTaskTool(deps: CreateTaskToolDeps) {
  const { ports, ctx, openPreview } = deps;
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

        if (!decision.planId || !decision.bucketId || !decision.draft || !decision.idempotencyKey) {
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
          // Off the card, never re-resolved: the plan's first column may have
          // changed since the preview, and the user confirmed THIS one.
          bucketId: decision.bucketId,
          draft: decision.draft,
          idempotencyKey: decision.idempotencyKey,
        });
        return { created: true, taskId, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const revision = await resolveRevision({
        preview: ports.preview,
        actor,
        openPreview,
        toolId: 'planner_createTask',
        // A draft has no task yet, so this turn resolved none. The card's own
        // taskIds are empty too, which is why a create preview still matches.
        resolvedTaskIds: [],
      });

      // On a revision the plan comes FROM THE CARD: `planRef` is ignored, because
      // moving the plan moves the bucket and the board the task lands on.
      const planRef =
        revision.kind === 'revision'
          ? stringField(revision.previousArgsPatch, 'planId')
          : input.planRef;
      if (!planRef) {
        return { created: false, taskId: null, refusal: INCOMPLETE_PREVIEW };
      }

      const plan = await ports.taskCreate.resolvePlan({ ...actor, planRef });
      if (!plan) {
        return {
          created: false,
          taskId: null,
          refusal: `I can't find a plan called "${planRef}".`,
        };
      }
      if ('ambiguous' in plan) {
        // Never pick — the same rule every other A2 tool follows.
        return {
          created: false,
          taskId: null,
          refusal: `There are ${plan.ambiguous.length} plans called "${planRef}". Which one did you mean?`,
        };
      }

      // The gate, BEFORE the card AND before the embedding call: a refused actor
      // should not spend a vector search either.
      await ports.taskCreate.assertCanCreate({ ...actor, groupId: plan.groupId });

      // After the gate, before the embedding call — same reason the gate sits
      // where it does: a request that cannot land should not spend a search.
      //
      // Re-resolved on a revision too, deliberately: the bucket is a value the
      // SERVER picks, never one the user chose, so the rebuilt card must show
      // whichever column it resolves to NOW. Pinning a stale bucketId would risk
      // a card promising a column that no longer exists.
      const bucket = await ports.taskCreate.resolveDefaultBucket({
        ...actor,
        planId: plan.planId,
      });
      if (!bucket) {
        // Creating the bucket too would need planner.bucket.create and would put
        // a second thing on the card the user never asked for. And a task with
        // no column is one they cannot find afterwards, so a plain no is kinder
        // than a "created" they have to go looking for.
        return {
          created: false,
          taskId: null,
          refusal: `"${plan.planName}" has no buckets yet. Add a bucket to the plan first, then ask me again.`,
        };
      }

      const previousDraft =
        revision.kind === 'revision'
          ? ((revision.previousArgsPatch.draft ?? {}) as CreateTaskDraft)
          : ({} as CreateTaskDraft);
      const mergedDraft = mergeDrafts(previousDraft, input, input.dropFields);
      if ('refusal' in mergedDraft) {
        return { created: false, taskId: null, refusal: mergedDraft.refusal };
      }
      const draft = mergedDraft.draft;

      // A dead vector store must not stop a user creating a task: degrade to a
      // card with no alternates rather than refusing the request.
      let similar: Array<{ taskId: string; title: string; score: number }> = [];
      try {
        const hits = await ports.similarTasks.search({
          ...actor,
          planId: plan.planId,
          // The MERGED title, so the "use the existing one instead" escape
          // matches what the card now proposes.
          queryText: [draft.title, draft.description ?? ''].join(' ').trim(),
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
        bucketId: bucket.bucketId,
        bucketName: bucket.bucketName,
        draft,
        similar,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload. FRESH on
        // every revision (AC4).
        idempotencyKey: crypto.randomUUID(),
        ...(revision.kind === 'revision' ? { supersedes: revision.previousApprovalId } : {}),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_createTask: ctx.agent.suspend unavailable');
      }
      await agent.suspend({ card });
      return { created: false, taskId: null };
    },
  });
}
