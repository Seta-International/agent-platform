import { defineAgentTool, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildMergeApprovalCard } from './approval-card.ts';
import type { ActionPorts } from './ports.ts';
import { resolveTwoEndpoints } from './resolve-endpoints.ts';
import {
  INCOMPLETE_PREVIEW,
  refuseIfPreviewOpen,
  resolveRevision,
  stringField,
} from './revision.ts';
import type { ActionOpenPreview } from './schemas.ts';
import {
  MergeTasksResumeSchema,
  MergeTasksSuspendSchema,
  MergeTasksToolInputSchema,
  MergeTasksToolOutputSchema,
} from './schemas.ts';

export interface MergeTasksToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
  /** The preview the SERVER found open for this turn, or null (FUT-840). It
   *  arrives through the run context and never through tool arguments, which is
   *  what lets this tool verify the model's `revisionOf` against it (design D15). */
  openPreview?: ActionOpenPreview | null;
}

/**
 * A2's destructive tool: link the duplicate to the keeper AND send the duplicate
 * to trash, atomically, after one Confirm.
 *
 * Separate from `planner_linkTasks` on purpose (design D6). They share
 * `resolveTwoEndpoints`; they do not share a `mode` parameter, because one wrong
 * enum value would be a wrongly-deleted task.
 */
export function makeMergeTasksTool(deps: MergeTasksToolDeps) {
  const { ports, ctx, openPreview } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_mergeTasks',
    name: 'Merge Tasks',
    description: [
      'Chat flow only — shows the user a preview card and waits for them to confirm.',
      '',
      'Merge a DUPLICATE task into the one that should survive. The duplicate is marked',
      'as a duplicate of the keeper and then moved to the trash.',
      '',
      'Use for: "these two are the same, merge them"; "gộp task này vào task kia";',
      '"task A is a duplicate of task B, get rid of A".',
      '',
      'duplicateTaskRef is the task that will be TRASHED and keepTaskRef is the one that',
      'SURVIVES — never swap them. If the user has not made clear which one survives, ask;',
      'do not choose for them.',
      '',
      'Nothing is copied between the two tasks. If the duplicate holds information the',
      'keeper lacks, tell the user to move it across first.',
      'To record a relationship without deleting anything, use planner_linkTasks instead.',
    ].join('\n'),
    input: MergeTasksToolInputSchema,
    output: MergeTasksToolOutputSchema,
    suspendSchema: MergeTasksSuspendSchema,
    resumeSchema: MergeTasksResumeSchema,
    // Declarative metadata only. The real gate is three checks in assertCanMerge.
    rbac: 'planner.task.delete',
    execute: async ({ duplicateTaskRef, keepTaskRef, revisionOf }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = MergeTasksResumeSchema.parse(resume);
        if (decision.action === 'decline') {
          return { merged: false, keptTaskId: null, refusal: null };
        }
        if (!decision.idempotencyKey) {
          return {
            merged: false,
            keptTaskId: null,
            refusal: 'This preview is incomplete. Ask me for the merge again.',
          };
        }
        await ports.taskMerge.merge({
          ...actor,
          duplicateTaskId: decision.duplicateTaskId,
          duplicateExpectedVersion: decision.duplicateExpectedVersion,
          keepTaskId: decision.keepTaskId,
          idempotencyKey: decision.idempotencyKey,
        });
        return { merged: true, keptTaskId: decision.keepTaskId, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const revision = await resolveRevision({
        preview: ports.preview,
        actor,
        revisionOf,
        openPreview,
        toolId: 'planner_mergeTasks',
      });
      if (revision.kind === 'refused') {
        return { merged: false, keptTaskId: null, refusal: revision.refusal };
      }

      // Shared with link, so an unresolvable endpoint reads the same either way.
      // The PERMISSION gate below is merge's own, because merge also deletes.
      const resolved = await resolveTwoEndpoints({
        port: {
          readEndpoint: ports.taskLink.readEndpoint,
          // Merge gates for itself: one call, three checks. A no-op here keeps
          // resolveTwoEndpoints from applying the weaker link-only gate.
          assertCanLink: async () => {},
        },
        actor,
        toolCtx,
        sourceRef: duplicateTaskRef,
        targetRef: keepTaskRef,
      });
      if (!resolved.ok) {
        return { merged: false, keptTaskId: null, refusal: resolved.refusal };
      }
      const { source: duplicate, target: keep } = resolved;

      if (revision.kind === 'revision') {
        // THE ONE TOOL whose revision reads the model's refs, because which side
        // survives is exactly what is adjustable: "à ngược lại" is the most
        // natural adjustment merge will ever receive.
        //
        // What is NOT adjustable is WHICH TWO tasks are involved. The refs must
        // therefore be a PERMUTATION of the card's pair; anything else is a new
        // request (design D5) and would widen the change (AC5).
        const cardDuplicate = stringField(revision.previousArgsPatch, 'duplicateTaskId');
        const cardKeep = stringField(revision.previousArgsPatch, 'keepTaskId');
        if (!cardDuplicate || !cardKeep) {
          return { merged: false, keptTaskId: null, refusal: INCOMPLETE_PREVIEW };
        }
        const pair = new Set([cardDuplicate, cardKeep]);
        if (
          duplicate.taskId === keep.taskId ||
          !pair.has(duplicate.taskId) ||
          !pair.has(keep.taskId)
        ) {
          return {
            merged: false,
            keptTaskId: null,
            refusal:
              'That merge preview is about two other tasks. Confirm or cancel it first, and ' +
              'then ask me about these ones.',
          };
        }
      } else {
        const clash = await refuseIfPreviewOpen({
          preview: ports.preview,
          actor,
          taskIds: [duplicate.taskId, keep.taskId],
        });
        if (clash) return { merged: false, keptTaskId: null, refusal: clash };
      }

      // Three checks, and on a revision they run on the SWAPPED roles: the gate
      // is asymmetric (planner.task.delete on the DUPLICATE's group), so a swap
      // genuinely needs re-gating rather than inheriting the first preview's
      // verdict.
      await ports.taskMerge.assertCanMerge({
        ...actor,
        duplicateGroupId: duplicate.groupId,
        keepGroupId: keep.groupId,
      });

      const card = buildMergeApprovalCard({
        duplicate,
        keep,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload. FRESH on
        // every revision (AC4).
        idempotencyKey: crypto.randomUUID(),
        ...(revision.kind === 'revision' ? { supersedes: revision.previousApprovalId } : {}),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_mergeTasks: ctx.agent.suspend unavailable');
      }
      await agent.suspend({ card });
      return { merged: false, keptTaskId: null };
    },
  });
}
