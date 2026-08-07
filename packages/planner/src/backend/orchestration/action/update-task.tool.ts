import { defineAgentTool, resolveTaskRef, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildBulkApprovalCard, buildUpdateApprovalCard } from './approval-card.ts';
import { normalizeInstant } from './date-normalize.ts';
import type { ActionPorts } from './ports.ts';
import {
  BULK_TARGET_CAP,
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
 * The A2 Action agent's update tool: preview → confirm → gated write, over 1..20
 * tasks sharing one patch. Bulk is folded in here rather than split into a
 * separate `planner_bulkUpdate`, because two adjacent tools differing only in
 * cardinality force the model to choose with nothing in either description to
 * settle it (docs/agent/tools.md P1, P6 — design §1.3).
 *
 * Stateless across resume BY DESIGN. Resume may run in a different ECS process
 * after a page reload, so the patch, the per-target versions and the idempotency
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
      'The user wants to change something about one or more tasks they have already',
      'identified. ONE patch is applied to EVERY task listed.',
      '',
      'Use for: "đổi tên task này thành Deploy Hiring Screen"; "push the AWS migration to',
      'next Friday"; "mark the first one as done"; "chuyển 3 task này sang done".',
      'Do NOT use to find or inspect a task — use planner_queryTasks to search and',
      'planner_getTask to read one, then pass its taskId here.',
      '',
      `At most ${BULK_TARGET_CAP} tasks per call. A larger request is REFUSED and nothing`,
      'is changed — do not work around that by calling this tool several times.',
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
    // assertCanUpdateMany itself.
    rbac: 'planner.task.update',
    execute: async ({ taskRefs, patch }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = UpdateTaskResumeSchema.parse(resume);
        const taskIds = decision.targets.map((t) => t.taskId);
        if (decision.action === 'decline') {
          // No gateway call, so NO core.mutation_idempotency row exists — the
          // property FUT-840's supersede later depends on.
          return { updated: false, taskIds, refusal: null };
        }
        if (!decision.patch || !decision.idempotencyKey) {
          // A card written before this tool shipped, or a truncated payload.
          // Refuse rather than write something the user never previewed.
          return {
            updated: false,
            taskIds,
            refusal: 'This preview is incomplete. Ask me for the change again.',
          };
        }
        const result = await ports.taskUpdate.updateMany({
          ...actor,
          targets: decision.targets,
          patch: decision.patch,
          idempotencyKey: decision.idempotencyKey,
        });
        return { updated: true, taskIds: result.taskIds, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      // 1. The cap, BEFORE resolution: 100 refs must not become 100 reads, and
      //    the refusal has to be a sentence rather than a schema error, or the
      //    model splits the request into batches — which the AC forbids.
      if (taskRefs.length > BULK_TARGET_CAP) {
        return {
          updated: false,
          taskIds: [],
          refusal:
            `I can change at most ${BULK_TARGET_CAP} tasks in one request, and this one lists ` +
            `${taskRefs.length}. Nothing was changed. Ask the user to narrow the list to ` +
            `${BULK_TARGET_CAP} or fewer — do not split it into several smaller requests.`,
        };
      }

      // 2. Cheapest check next: no DB, no resolution.
      const normalized = toDomainPatch(patch);
      if (Object.keys(normalized).length === 0) {
        return {
          updated: false,
          taskIds: [],
          refusal: 'Tell me which value to set and I will show you a preview.',
        };
      }

      // 3. One unresolvable ref refuses the WHOLE batch. TaskRefResolveError is
      //    an AgentToolError, so wrapExecute re-throws its text verbatim and the
      //    model self-corrects against the real titles (the FUT-859 property).
      const taskIds: string[] = [];
      for (const ref of taskRefs) {
        taskIds.push((await resolveTaskRef(toolCtx as never, ref)).taskId);
      }

      // 4. Two refs for one task is an unclear intent, and would double-count
      //    the task in the preview.
      if (new Set(taskIds).size !== taskIds.length) {
        return {
          updated: false,
          taskIds: [],
          refusal:
            'Two of those references point at the same task. Say each task once and tell me ' +
            'which change you want.',
        };
      }

      // 5 + 6. One session for the batch, one gate per distinct group.
      const targets = await ports.taskRead.readMany({ ...actor, taskIds });
      await ports.taskUpdate.assertCanUpdateMany({
        ...actor,
        groupIds: targets.map((t) => t.groupId),
      });

      // Minted HERE and persisted on the card: resume may run in another process,
      // so the key can only travel via proposed_payload.
      const idempotencyKey = crypto.randomUUID();
      const first = targets[0];
      const card =
        targets.length === 1 && first
          ? buildUpdateApprovalCard({
              task: first,
              patch: normalized,
              tenantId: ctx.tenantId,
              userId: ctx.actorUserId,
              idempotencyKey,
            })
          : buildBulkApprovalCard({
              tasks: targets,
              patch: normalized,
              tenantId: ctx.tenantId,
              userId: ctx.actorUserId,
              idempotencyKey,
            });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_updateTask: ctx.agent.suspend unavailable');
      }
      // Mastra unwinds (throws) at suspend() on the suspending pass — nothing
      // past this runs. The return only types the tool.
      await agent.suspend({ card });
      return { updated: false, taskIds };
    },
  });
}
