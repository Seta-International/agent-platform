import { defineAgentTool, resolveTaskRef, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildAssignTaskApprovalCard } from './approval-card.ts';
import type { ActionPorts } from './ports.ts';
import {
  INCOMPLETE_PREVIEW,
  refuseIfPreviewOpen,
  resolveRevision,
  taskIdsFromArgsPatch,
} from './revision.ts';
import type { ActionOpenPreview } from './schemas.ts';
import {
  AssignTaskResumeSchema,
  AssignTaskSuspendSchema,
  AssignTaskToolInputSchema,
  AssignTaskToolOutputSchema,
} from './schemas.ts';

export interface AssignTaskToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
  /** The preview the SERVER found open for this turn, or null (FUT-840). It
   *  arrives through the run context and never through tool arguments, which is
   *  what lets this tool verify the model's `revisionOf` against it (design D15). */
  openPreview?: ActionOpenPreview | null;
}

/** One sentence for both "no such task" and "not yours" — a tool that
 *  distinguished them would answer the question an attacker is asking. */
const UNRESOLVABLE_TASK = (ref: string) => `I can't find a task called "${ref}".`;

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((x, i) => x === right[i]);
}

/**
 * A2's assign tool: preview → confirm → one gated `setAssignees` write.
 *
 * The seam with the assignment runtime is WHO CHOOSES THE PERSON (design D1).
 * The user named them → here. The agent must work out who → the recommend
 * pipeline, which this tool never touches and never calls.
 *
 * `assigneeRefs` is always the FINAL set. A request phrased relative to the
 * current owners ("thay B bằng A") has to be resolved into an absolute one
 * BEFORE the call, by reading the task with planner_getTask — that is a prompt
 * rule (orchestrator.ts) and a golden-corpus case (FUT-807), because it is model
 * behaviour and no code here can hold it. What this tool guarantees is that
 * whatever set arrives is shown before/after and is exactly what gets written.
 */
export function makeAssignTaskTool(deps: AssignTaskToolDeps) {
  const { ports, ctx, openPreview } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_assignTask',
    name: 'Assign Task',
    description: [
      'Chat flow only — shows the user a preview card and waits for them to confirm.',
      '',
      'Set WHO a task is assigned to, when the user has NAMED the people.',
      '',
      'Use for: "giao task này cho Tuấn"; "assign the deploy task to Alice and Bob";',
      '"thay Bình bằng Tuấn"; "bỏ Bình ra khỏi task".',
      'Do NOT use when the user has not named anybody ("assign someone to this",',
      '"who should do this") — that is a recommendation request and it is handled',
      'elsewhere; say so instead of guessing a person.',
      '',
      'assigneeRefs REPLACES the current assignees. When the request is relative to',
      'whoever owns the task now, call planner_getTask FIRST and send the whole',
      'resulting set — sending only the person the sentence names would silently',
      'un-assign everybody else.',
    ].join('\n'),
    input: AssignTaskToolInputSchema,
    output: AssignTaskToolOutputSchema,
    suspendSchema: AssignTaskSuspendSchema,
    resumeSchema: AssignTaskResumeSchema,
    // Declarative metadata only; the first pass gates for itself.
    rbac: 'planner.task.assign',
    execute: async ({ taskRef, assigneeRefs, revisionOf }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = AssignTaskResumeSchema.parse(resume);
        if (decision.action === 'decline') {
          return { assigned: false, assigneeUserIds: [], refusal: null };
        }
        const assigneeUserIds = decision.assigneeUserIds ?? [];
        if (assigneeUserIds.length === 0 || !decision.idempotencyKey) {
          // A card written before this tool shipped, or a truncated payload.
          // Refuse rather than write something the user never previewed.
          return {
            assigned: false,
            assigneeUserIds: [],
            refusal: 'This preview is incomplete. Ask me for the assignment again.',
          };
        }
        await ports.taskAssign.assign({
          ...actor,
          taskId: decision.taskId,
          assigneeUserIds,
          idempotencyKey: decision.idempotencyKey,
        });
        return { assigned: true, assigneeUserIds, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const revision = await resolveRevision({
        preview: ports.preview,
        actor,
        revisionOf,
        openPreview,
        toolId: 'planner_assignTask',
      });
      if (revision.kind === 'refused') {
        return { assigned: false, assigneeUserIds: [], refusal: revision.refusal };
      }

      let taskId: string;
      if (revision.kind === 'revision') {
        // The task comes FROM THE CARD (AC5.1). What IS adjustable is the whole
        // assignee set: this tool replaces the set rather than adding to it
        // (FUT-806 design D5), so "thêm Tuấn nữa" is unioned by the MODEL against
        // the PROPOSED set — which the OPEN PREVIEW block renders with names for
        // exactly that reason — and arrives here already absolute.
        const [fromCard] = taskIdsFromArgsPatch(revision.previousArgsPatch);
        if (!fromCard) {
          return { assigned: false, assigneeUserIds: [], refusal: INCOMPLETE_PREVIEW };
        }
        taskId = fromCard;
      } else {
        // A TaskRefResolveError propagates untouched — it is an AgentToolError, so
        // wrapExecute keeps its text and the model self-corrects.
        taskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;
      }
      const snapshot = await ports.taskAssign.readForAssign({ ...actor, taskId });
      if (!snapshot) {
        return { assigned: false, assigneeUserIds: [], refusal: UNRESOLVABLE_TASK(taskRef) };
      }

      // The gate, BEFORE the card. Without it a viewer would build a preview and
      // write a pending approval row before anything refused them.
      await ports.taskAssign.assertCanAssign({ ...actor, groupId: snapshot.groupId });

      if (revision.kind === 'new') {
        const clash = await refuseIfPreviewOpen({
          preview: ports.preview,
          actor,
          taskIds: [taskId],
        });
        if (clash) return { assigned: false, assigneeUserIds: [], refusal: clash };
      }

      const after: Array<{ userId: string; name: string }> = [];
      for (const ref of assigneeRefs) {
        const matches = await ports.taskAssign.resolveMembers({
          ...actor,
          groupId: snapshot.groupId,
          query: ref,
        });
        if (matches.length === 0) {
          return {
            assigned: false,
            assigneeUserIds: [],
            refusal: `I can't find anybody called "${ref}" on this task's team.`,
          };
        }
        if (matches.length > 1) {
          // Never pick for the user — the same rule link and merge follow.
          const listed = matches.map((m) => m.name).join(', ');
          return {
            assigned: false,
            assigneeUserIds: [],
            refusal: `"${ref}" matches more than one person: ${listed}. Which one did you mean?`,
          };
        }
        const hit = matches[0]!;
        if (!after.some((p) => p.userId === hit.userId)) {
          after.push({ userId: hit.userId, name: hit.name });
        }
      }

      if (
        sameSet(
          snapshot.assignees.map((p) => p.userId),
          after.map((p) => p.userId),
        )
      ) {
        // A card that changes nothing is noise, and confirming it would burn an
        // idempotency key for no write.
        return {
          assigned: false,
          assigneeUserIds: after.map((p) => p.userId),
          refusal: `"${snapshot.title}" is already assigned to exactly ${after
            .map((p) => p.name)
            .join(', ')}.`,
        };
      }

      const card = buildAssignTaskApprovalCard({
        taskId,
        title: snapshot.title,
        before: snapshot.assignees,
        after,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload. FRESH on
        // every revision (AC4).
        idempotencyKey: crypto.randomUUID(),
        ...(revision.kind === 'revision' ? { supersedes: revision.previousApprovalId } : {}),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_assignTask: ctx.agent.suspend unavailable');
      }
      await agent.suspend({ card });
      return { assigned: false, assigneeUserIds: [] };
    },
  });
}
