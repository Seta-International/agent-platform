// Side-effect-only module: importing it registers the knowledge specialist
// with CopilotRegistry. apps/server and apps/worker pull this in via
// packages/copilot/src/backend/init-registry.ts before freeze().
import { CopilotRegistry } from '@seta/copilot-sdk';
import { searchTenantKnowledgeAgentTool } from './index.ts';

CopilotRegistry.registerSpecialist({
  domain: 'knowledge',
  id: 'knowledge',
  description:
    'Searches uploaded company documents — handbooks, policies, processes, internal references — ' +
    'by semantic similarity and returns chunk excerpts with filename for citation.',
  instructions: () =>
    'You answer questions using the tenant knowledge base. ALWAYS call knowledge_search ' +
    'first when the user references "internal documents", "company handbook/policy/process", ' +
    'or asks about content that is plausibly in uploaded files. Quote the returned chunks and ' +
    'cite the filename. If knowledge_search returns no hits, say so explicitly — do NOT fall ' +
    'back to general knowledge without flagging the gap.',
  tools: {
    knowledge_search: searchTenantKnowledgeAgentTool,
  },
});
