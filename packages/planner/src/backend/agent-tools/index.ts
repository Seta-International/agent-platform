import type { AgentTool } from '@seta/agent-sdk';
import { plannerAssignTaskTool } from './assign-task.ts';
import { plannerGetGroupOverviewTool } from './get-group-overview.ts';
import { plannerGetTaskTool } from './get-task.ts';
import { plannerListBucketsTool } from './list-buckets.ts';
import { plannerListCommentsTool } from './list-comments.ts';
import { plannerListPlansTool } from './list-plans.ts';
import { plannerPostCommentTool } from './post-comment.ts';
import { plannerQueryTasksTool } from './query-tasks.ts';
import { plannerSearchGroupMembersBySkillsTool } from './search-users-by-skills.ts';
import { plannerSetAssigneesTool } from './set-assignees.ts';

export { plannerAssignTaskTool } from './assign-task.ts';
export {
  type PlannerFindSimilarTasksToolDeps,
  plannerFindSimilarTasksTool,
} from './find-similar-tasks.ts';
export { plannerGetGroupOverviewTool } from './get-group-overview.ts';
export { plannerGetOpenTaskCountTool } from './get-open-task-count.ts';
export { plannerGetTaskTool } from './get-task.ts';
export { plannerListBucketsTool } from './list-buckets.ts';
export { plannerListCommentsTool } from './list-comments.ts';
export { plannerListPlansTool } from './list-plans.ts';
export { plannerPostCommentTool } from './post-comment.ts';
export { plannerQueryTasksTool } from './query-tasks.ts';
export { plannerResolveMemberTool } from './resolve-member.ts';
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
  plannerGetGroupOverviewTool,
  plannerListPlansTool,
  plannerListBucketsTool,
];
