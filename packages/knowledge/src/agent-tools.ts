// Public surface for cross-module agent-tool composition.
// The actual tool definitions live under ./backend/agent-tools/; peers must
// never import from there directly. The package.json exports map points
// '@seta/knowledge/agent-tools' at this file.
export {
  knowledgeAgentTools,
  searchTenantKnowledgeAgentTool,
} from './backend/agent-tools/index.ts';
