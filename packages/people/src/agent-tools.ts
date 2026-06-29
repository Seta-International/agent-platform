// Public surface for cross-module agent-tool composition.
// Actual tool definitions live under ./backend/agent-tools/; peers must
// never import from there directly. The package.json exports map points
// '@seta/people/agent-tools' at this file.
export {
  buildSearchUsersBySkillVectorSpec,
  type GetAvailabilityInput,
  type GetAvailabilityOutput,
  type GetTimezoneInput,
  type GetTimezoneOutput,
  type MatchUsersToTopicToolDeps,
  matchUsersToTopicTool,
  peopleAgentTools,
  peopleGetAvailabilitySpec,
  peopleGetAvailabilityTool,
  peopleGetTimezoneSpec,
  peopleGetTimezoneTool,
  type SearchUsersBySkillVectorDeps,
  type SearchUsersBySkillVectorInput,
  type SearchUsersBySkillVectorOutput,
} from './backend/agent-tools.ts';
