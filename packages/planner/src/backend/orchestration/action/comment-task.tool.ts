import { defineAgentTool, resolveTaskRef, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildCommentTaskApprovalCard } from './approval-card.ts';
import type { ActionPorts } from './ports.ts';
import {
  CommentTaskResumeSchema,
  CommentTaskSuspendSchema,
  CommentTaskToolInputSchema,
  CommentTaskToolOutputSchema,
} from './schemas.ts';

export interface CommentTaskToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
}

/**
 * A2's comment tool: preview → confirm → one gated `createComment`.
 *
 * The third verb FUT-806's Scope line names. It changes no task field, so its
 * card carries no before/after — the whole preview IS the text, shown in full so
 * the user confirms what they will actually be seen to have written.
 *
 * Separate from the legacy `planner_postComment`, which stays where it is: that
 * one writes on its first pass (the old `needsApproval` mechanism) and is not
 * gated, so it has neither an idempotency key nor agent attribution.
 */
export function makeCommentTaskTool(deps: CommentTaskToolDeps) {
  const { ports, ctx } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_commentTask',
    name: 'Comment on Task',
    description: [
      'Chat flow only — shows the user the comment and waits for them to confirm.',
      '',
      'Post ONE plain-text comment on a task, as the user.',
      '',
      'Use for: "ghi chú vào task X: đang chờ vendor"; "add a note to the deploy task".',
      'Write the body exactly as the user wants it to appear — do not summarise their',
      'words or add a preamble. If they have not said what the note should say, ASK.',
      'Do NOT use to change a task: a due date, status or assignee change is a different',
      'tool, and a comment saying so changes nothing.',
    ].join('\n'),
    input: CommentTaskToolInputSchema,
    output: CommentTaskToolOutputSchema,
    suspendSchema: CommentTaskSuspendSchema,
    resumeSchema: CommentTaskResumeSchema,
    // Declarative metadata only — nothing reads it at runtime, which is why the
    // first pass calls assertCanComment itself.
    rbac: 'planner.task.comment.create',
    execute: async ({ taskRef, body }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = CommentTaskResumeSchema.parse(resume);
        if (decision.action === 'decline') {
          // No gateway call, so no core.mutation_idempotency row exists.
          return { commented: false, commentId: null, refusal: null };
        }
        if (!decision.body || !decision.idempotencyKey) {
          // A card minted before this tool shipped, or a truncated payload.
          // Refuse rather than post something the user never previewed.
          return {
            commented: false,
            commentId: null,
            refusal: 'This preview is incomplete. Ask me to post the comment again.',
          };
        }
        const { commentId } = await ports.comment.comment({
          ...actor,
          taskId: decision.taskId,
          body: decision.body,
          idempotencyKey: decision.idempotencyKey,
        });
        // A replay returns the id off the gateway's persisted result; `|| null`
        // covers a row written before that field existed, so the model reports
        // "posted" without inventing an id.
        return { commented: true, commentId: commentId || null, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const taskId = (await resolveTaskRef(toolCtx as never, taskRef)).taskId;
      // The read port the update tool already uses: a comment needs the same two
      // facts (title, group), and a second read path would be a second place for
      // the permission story to drift. It RAISES the planner's own NOT_FOUND /
      // FORBIDDEN — deliberately not collapsed into a null the way the link tool
      // does it, because a comment names one task the user already referenced,
      // so there is no second id to probe with.
      const [task] = await ports.taskRead.readMany({ ...actor, taskIds: [taskId] });
      if (!task) {
        return {
          commented: false,
          commentId: null,
          refusal: `I can't find a task called "${taskRef}".`,
        };
      }

      // Wider than every other A2 gate by design: `planner.task.comment.create`
      // is granted to planner.viewer too, so anyone who can see the task may
      // comment on it.
      await ports.comment.assertCanComment({ ...actor, groupId: task.groupId });

      const card = buildCommentTaskApprovalCard({
        taskId,
        title: task.title,
        body,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload.
        idempotencyKey: crypto.randomUUID(),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_commentTask: ctx.agent.suspend unavailable');
      }
      // Mastra unwinds at suspend() — nothing past this runs on the first pass.
      await agent.suspend({ card });
      return { commented: false, commentId: null };
    },
  });
}
