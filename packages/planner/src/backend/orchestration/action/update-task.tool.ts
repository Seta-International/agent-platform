import { defineAgentTool, resolveTaskRef, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildUpdateApprovalCard } from './approval-card.ts';
import { normalizeInstant } from './date-normalize.ts';
import type { ActionPorts } from './ports.ts';
import {
  PERCENT_COMPLETE_BY_WORD,
  PRIORITY_NUMBER_BY_WORD,
  type ToolPatch,
  type UpdateTaskActionPatch,
  UpdateTaskActionPatchSchema,
  UpdateTaskResumeSchema,
  UpdateTaskSuspendSchema,
  UpdateTaskToolInputSchema,
  UpdateTaskToolOutputSchema,
} from './schemas.ts';

export interface UpdateTaskToolDeps {
  ports: ActionPorts;
  /** The orchestrator's run ctx: tenant/actor/abort. */
  ctx: SpecializedAgentRunCtx;
}

/** Translate the model's vocabulary into the domain's.
 *
 *  Two conversions, both deliberately in code rather than in the prompt — which
 *  is what makes them testable without an LLM:
 *   - words → stored numbers (`urgent` → 1, `in_progress` → 50);
 *   - a bare calendar day → an absolute instant, since the model may say
 *     `2026-08-15` while the domain schema requires a full offset timestamp.
 */
function toDomainPatch(patch: ToolPatch): UpdateTaskActionPatch {
  const out: Record<string, unknown> = {};
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.dueAt !== undefined) {
    out.due_at = typeof patch.dueAt === 'string' ? normalizeInstant(patch.dueAt, 'end') : null;
  }
  if (patch.startAt !== undefined) {
    out.start_at =
      typeof patch.startAt === 'string' ? normalizeInstant(patch.startAt, 'start') : null;
  }
  if (patch.priority !== undefined) out.priority_number = PRIORITY_NUMBER_BY_WORD[patch.priority];
  if (patch.status !== undefined) out.percent_complete = PERCENT_COMPLETE_BY_WORD[patch.status];
  return UpdateTaskActionPatchSchema.parse(out);
}

/**
 * The single write tool of the A2 Action agent: preview → confirm → gated write.
 *
 * Stateless across resume BY DESIGN. Resume may run in a different ECS process
 * after a page reload, so the patch, the expected version and the idempotency
 * key travel only inside the persisted card's argsPatch — never in memory, and
 * never from the confirmation request (FUT-804 AC5).
 */
export function makeUpdateTaskTool(deps: UpdateTaskToolDeps) {
  const { ports, ctx } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_updateTask',
    name: 'Update Task',
    description: [
      'Chat flow only — shows the user a preview card and waits for them to confirm.',
      '',
      'The user wants to change something about a task they have already identified.',
      '',
      'Use for: "đổi tên task này thành Deploy Hiring Screen"; "push the AWS migration to',
      'next Friday"; "mark the first one as done"; "this is urgent now"; "clear the start date".',
      'Do NOT use to find or inspect a task — use planner_queryTasks to search and',
      'planner_getTask to read one, then pass its taskId here.',
      '',
      'Pass ONLY the fields the user actually asked to change, and resolve every relative',
      'date to an absolute one before calling. This tool never writes on its own.',
    ].join('\n'),
    input: UpdateTaskToolInputSchema,
    output: UpdateTaskToolOutputSchema,
    suspendSchema: UpdateTaskSuspendSchema,
    resumeSchema: UpdateTaskResumeSchema,
    // Declarative metadata only — `registerToolPermission` stores this in a
    // WeakMap that nothing reads at runtime, which is why the first pass calls
    // assertCanUpdate itself.
    rbac: 'planner.task.update',
    execute: async ({ taskRef, patch }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = UpdateTaskResumeSchema.parse(resume);
        if (decision.action === 'decline') {
          // No gateway call, so NO core.mutation_idempotency row exists — the
          // property FUT-840's supersede later depends on.
          return { updated: false, taskId: decision.taskId, refusal: null };
        }
        if (!decision.patch || decision.expectedVersion === undefined || !decision.idempotencyKey) {
          // A card written before this tool shipped, or a truncated payload.
          // Refuse rather than write something the user never previewed.
          return {
            updated: false,
            taskId: decision.taskId,
            refusal: 'This preview is incomplete. Ask me for the change again.',
          };
        }
        const result = await ports.taskUpdate.update({
          ...actor,
          taskId: decision.taskId,
          expectedVersion: decision.expectedVersion,
          patch: decision.patch,
          idempotencyKey: decision.idempotencyKey,
        });
        return { updated: true, taskId: result.taskId, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const resolvedTaskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;
      const task = await ports.taskRead.read({ ...actor, taskId: resolvedTaskId });

      // The real gate for "a viewer never creates an approval row". The domain
      // function checks again at the write, because permissions can change
      // between preview and Confirm.
      await ports.taskUpdate.assertCanUpdate({
        ...actor,
        taskId: resolvedTaskId,
        groupId: task.groupId,
      });

      const normalized = toDomainPatch(patch);
      if (Object.keys(normalized).length === 0) {
        return {
          updated: false,
          taskId: resolvedTaskId,
          refusal: 'Tell me which value to set and I will show you a preview.',
        };
      }

      const card = buildUpdateApprovalCard({
        task,
        patch: normalized,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload.
        idempotencyKey: crypto.randomUUID(),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_updateTask: ctx.agent.suspend unavailable');
      }
      // Mastra unwinds (throws) at suspend() on the suspending pass — nothing
      // past this runs. The return only types the tool.
      await agent.suspend({ card });
      return { updated: false, taskId: resolvedTaskId };
    },
  });
}
