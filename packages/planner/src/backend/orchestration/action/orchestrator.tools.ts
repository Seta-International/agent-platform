import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { plannerGetTaskTool } from '../../agent-tools/get-task.ts';
import { plannerQueryTasksTool } from '../../agent-tools/query-tasks.ts';
import { plannerResolveMemberTool } from '../../agent-tools/resolve-member.ts';
import { makeAssignTaskTool } from './assign-task.tool.ts';
import { makeLinkTasksTool } from './link-tasks.tool.ts';
import { makeMergeTasksTool } from './merge-tasks.tool.ts';
import type { ActionPorts } from './ports.ts';
import { makeUpdateTaskTool } from './update-task.tool.ts';

/**
 * The A2 allowlist — seven tools, and no others. THREE read tools to LOCATE the
 * target (a person is a target too, hence resolveMember), four write tools. This
 * allowlist is what makes "A2 does not do general question answering" an enforced
 * property rather than a prompt promise, and it is why `purgeTask` is structurally
 * unreachable rather than prompt-forbidden.
 */
export function makeActionTools(deps: {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
}): Record<string, unknown> {
  return {
    planner_getTask: plannerGetTaskTool,
    planner_queryTasks: plannerQueryTasksTool,
    planner_resolveMember: plannerResolveMemberTool,
    planner_updateTask: makeUpdateTaskTool({ ports: deps.ports, ctx: deps.ctx }),
    planner_linkTasks: makeLinkTasksTool({ ports: deps.ports, ctx: deps.ctx }),
    planner_mergeTasks: makeMergeTasksTool({ ports: deps.ports, ctx: deps.ctx }),
    planner_assignTask: makeAssignTaskTool({ ports: deps.ports, ctx: deps.ctx }),
  };
}
