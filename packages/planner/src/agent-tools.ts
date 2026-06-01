// Public surface for cross-module agent-tool composition.
// The actual tool definitions live under ./backend/agent-tools/; peers must
// never import from there directly. The package.json exports map points
// '@seta/planner/agent-tools' at this file.
export {
  identitySearchUsersBySkillsTool,
  type PlannerFindSimilarTasksToolDeps,
  plannerAgentTools,
  plannerAssignTaskTool,
  plannerFindSimilarTasksTool,
  plannerGetOpenTaskCountTool,
  plannerGetTaskTool,
  plannerListTasksBySkillTagTool,
} from './backend/agent-tools/index.ts';
export { plannerProposeAssignmentChatHitlDecider } from './backend/agent-tools/propose-assignment-chat-hitl-decider.ts';
