import type { SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { plannerGetTaskTool } from '../../agent-tools/get-task.ts';
import { plannerQueryTasksTool } from '../../agent-tools/query-tasks.ts';
import type { ActionPorts } from './ports.ts';
import { makeUpdateTaskTool } from './update-task.tool.ts';

/**
 * The A2 allowlist — three tools, and no others. Two read tools to LOCATE the
 * target, one write tool. This allowlist is what makes "A2 does not do general
 * question answering" an enforced property rather than a prompt promise.
 */
export function makeActionTools(deps: {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
}): Record<string, unknown> {
  return {
    planner_getTask: plannerGetTaskTool,
    planner_queryTasks: plannerQueryTasksTool,
    planner_updateTask: makeUpdateTaskTool({ ports: deps.ports, ctx: deps.ctx }),
  };
}
