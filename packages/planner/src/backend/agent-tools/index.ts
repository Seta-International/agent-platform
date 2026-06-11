import type { AgentTool } from '@seta/agent-sdk';
import { plannerAssignTaskTool } from './assign-task.ts';
import { plannerGetTaskTool } from './get-task.ts';
import { plannerListCommentsTool } from './list-comments.ts';
import { plannerPostCommentTool } from './post-comment.ts';
import { plannerQueryTasksTool } from './query-tasks.ts';
import { plannerSearchGroupMembersBySkillsTool } from './search-users-by-skills.ts';
import { plannerSetAssigneesTool } from './set-assignees.ts';

export { plannerAssignTaskTool } from './assign-task.ts';
export {
  type PlannerFindSimilarTasksToolDeps,
  plannerFindSimilarTasksTool,
} from './find-similar-tasks.ts';
export { plannerGetOpenTaskCountTool } from './get-open-task-count.ts';
export { plannerGetTaskTool } from './get-task.ts';
export { plannerListCommentsTool } from './list-comments.ts';
export { plannerPostCommentTool } from './post-comment.ts';
export { plannerQueryTasksTool } from './query-tasks.ts';
export { plannerSearchGroupMembersBySkillsTool } from './search-users-by-skills.ts';
export { plannerSetAssigneesTool } from './set-assignees.ts';

/**
 * Tools contributed to the agent registry at module-registration time.
 *
 * plannerFindSimilarTasksTool is a factory that needs runtime deps (provider,
 * pool), so it's instantiated by the agent catalog at build time
 * rather than pre-registered here.
 */
export const plannerAgentTools: AgentTool[] = [
  plannerAssignTaskTool,
  plannerSetAssigneesTool,
  plannerGetTaskTool,
  plannerListCommentsTool,
  plannerPostCommentTool,
  plannerSearchGroupMembersBySkillsTool,
  plannerQueryTasksTool,
];
