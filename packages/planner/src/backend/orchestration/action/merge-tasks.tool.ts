import { defineAgentTool, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildMergeApprovalCard } from './approval-card.ts';
import type { ActionPorts } from './ports.ts';
import { resolveTwoEndpoints } from './resolve-endpoints.ts';
import {
  MergeTasksResumeSchema,
  MergeTasksSuspendSchema,
  MergeTasksToolInputSchema,
  MergeTasksToolOutputSchema,
} from './schemas.ts';

export interface MergeTasksToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
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
  const { ports, ctx } = deps;
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
    execute: async ({ duplicateTaskRef, keepTaskRef }, toolCtx) => {
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
        // process, so the key can only travel via proposed_payload.
        idempotencyKey: crypto.randomUUID(),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_mergeTasks: ctx.agent.suspend unavailable');
      }
      await agent.suspend({ card });
      return { merged: false, keptTaskId: null };
    },
  });
}
