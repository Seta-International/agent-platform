// Public surface for cross-module agent-tool composition.
// The actual tool definitions live under ./backend/agent-tools/; peers must
// never import from there directly. The package.json exports map points
// '@seta/identity/agent-tools' at this file.
export {
  identityAgentTools,
  listMyRolesTool,
  type MatchUsersToTopicToolDeps,
  matchUsersToTopicTool,
  updateMyDisplayNameTool,
  whoAmITool,
} from './backend/agent-tools/index.ts';
