import type { CopilotTool } from '@seta/copilot-sdk';
import { plannerAssignTaskTool } from './assign-task.ts';
import { plannerGetTaskTool } from './get-task.ts';
import { identitySearchUsersBySkillsTool } from './search-users-by-skills.ts';

export { plannerAssignTaskTool } from './assign-task.ts';
export { plannerGetTaskTool } from './get-task.ts';
export {
  type SearchTasksSemanticToolDeps,
  searchTasksSemanticTool,
} from './search-tasks-semantic.ts';
export { identitySearchUsersBySkillsTool } from './search-users-by-skills.ts';

/**
 * Tools contributed to the agent registry at module-registration time.
 *
 * searchTasksSemanticTool is a factory that needs runtime deps (provider, pool,
 * reranker), so it's instantiated by the copilot agent catalog at build time
 * rather than pre-registered here.
 */
export const plannerAgentTools: CopilotTool[] = [
  plannerAssignTaskTool,
  plannerGetTaskTool,
  identitySearchUsersBySkillsTool,
];
