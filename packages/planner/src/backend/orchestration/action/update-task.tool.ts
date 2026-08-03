import { defineAgentTool, resolveTaskRef, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildUpdateApprovalCard } from './approval-card.ts';
import { normalizeInstant } from './date-normalize.ts';
import type { ActionPorts } from './ports.ts';
import {
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

/** Model-facing dates may be a bare calendar day; the domain schema may not.
 *  Normalising in code — not in the prompt — is what makes the convention
 *  testable without an LLM. */
function normalizePatch(patch: ToolPatch): UpdateTaskActionPatch {
  const out: Record<string, unknown> = { ...patch };
  if (typeof patch.due_at === 'string') out.due_at = normalizeInstant(patch.due_at, 'end');
  if (typeof patch.start_at === 'string') out.start_at = normalizeInstant(patch.start_at, 'start');
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
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
      'Change fields on ONE task and ask the user to confirm the change first.',
      'Supported fields: title, description, due_at, start_at, priority_number,',
      'percent_complete. Pass ONLY the fields the user actually asked to change.',
      'Dates must already be absolute (YYYY-MM-DD or a full ISO timestamp) — resolve any',
      'relative phrase before calling, and ask the user when it is ambiguous.',
      'This tool never writes on its own: it pauses for the user to confirm.',
    ].join('\n'),
    input: UpdateTaskToolInputSchema,
    output: UpdateTaskToolOutputSchema,
    suspendSchema: UpdateTaskSuspendSchema,
    resumeSchema: UpdateTaskResumeSchema,
    // Declarative metadata only — `registerToolPermission` stores this in a
    // WeakMap that nothing reads at runtime, which is why the first pass calls
    // assertCanUpdate itself.
    rbac: 'planner.task.update',
    execute: async ({ taskId: taskRef, patch }, toolCtx) => {
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

      const normalized = normalizePatch(patch);
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
