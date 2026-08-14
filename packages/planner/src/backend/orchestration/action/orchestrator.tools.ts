import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { plannerGetTaskTool } from '../../agent-tools/get-task.ts';
import { plannerQueryTasksTool } from '../../agent-tools/query-tasks.ts';
import { plannerResolveMemberTool } from '../../agent-tools/resolve-member.ts';
import { makeAssignTaskTool } from './assign-task.tool.ts';
import { makeCommentTaskTool } from './comment-task.tool.ts';
import { makeCreateTaskTool } from './create-task.tool.ts';
import { makeLinkTasksTool } from './link-tasks.tool.ts';
import { makeMergeTasksTool } from './merge-tasks.tool.ts';
import type { ActionPorts } from './ports.ts';
import type { ActionOpenPreview } from './schemas.ts';
import { makeUpdateTaskTool } from './update-task.tool.ts';

/**
 * The A2 allowlist — nine tools, and no others. THREE read tools to LOCATE the
 * target (a person is a target too, hence resolveMember), six write tools. This
 * allowlist is what makes "A2 does not do general question answering" an enforced
 * property rather than a prompt promise, and it is why `purgeTask` is structurally
 * unreachable rather than prompt-forbidden.
 */
export function makeActionTools(deps: {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
  /** The preview the server found open for this turn, or null. Reaches the tools
   *  through the run context and NEVER through tool arguments — there is no
   *  `revisionOf` to verify, because the model is never asked which proposal it is
   *  adjusting. The server decides (FUT-840 design D20). */
  openPreview?: ActionOpenPreview | null;
}): Record<string, unknown> {
  const shared = {
    ports: deps.ports,
    ctx: deps.ctx,
    openPreview: deps.openPreview ?? null,
  };
  return {
    planner_getTask: plannerGetTaskTool,
    planner_queryTasks: plannerQueryTasksTool,
    planner_resolveMember: plannerResolveMemberTool,
    planner_updateTask: makeUpdateTaskTool(shared),
    planner_linkTasks: makeLinkTasksTool(shared),
    planner_mergeTasks: makeMergeTasksTool(shared),
    planner_assignTask: makeAssignTaskTool(shared),
    planner_createTask: makeCreateTaskTool(shared),
    // NOT the legacy planner_postComment, which writes before the card and is
    // not gated. That one stays registered on the old specialist, untouched.
    planner_commentTask: makeCommentTaskTool(shared),
  };
}
