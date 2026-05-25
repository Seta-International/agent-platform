import { CopilotRegistry } from '@seta/copilot-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
import { plannerAssignTaskTool } from './assign-task.ts';
import { plannerGetTaskTool } from './get-task.ts';
import { searchTasksSemanticTool } from './search-tasks-semantic.ts';
import { identitySearchUsersBySkillsTool } from './search-users-by-skills.ts';

function makeLazyEmbeddingProvider(): EmbeddingProvider {
  let inner: EmbeddingProvider | undefined;
  const get = (): EmbeddingProvider => {
    if (inner) return inner;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY required for planner semantic search');
    const model = (process.env.EMBED_MODEL ?? 'text-embedding-3-small') as
      | 'text-embedding-3-small'
      | 'text-embedding-3-large';
    inner = new OpenAIEmbeddingProvider({ apiKey, model });
    return inner;
  };
  return {
    get modelId() {
      return get().modelId;
    },
    get dimensions() {
      return get().dimensions;
    },
    embed: (...args) => get().embed(...args),
  };
}

const searchTasksSemantic = searchTasksSemanticTool({
  provider: makeLazyEmbeddingProvider(),
  get databaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL required for planner semantic search');
    return url;
  },
});

CopilotRegistry.registerSpecialist({
  domain: 'work',
  id: 'planner',
  description:
    'Manages tasks, buckets, plans, and assignments in the planner module. ' +
    'Handles task lookup, semantic search, and user assignment with HITL approval.',
  instructions: () =>
    'You are the planner specialist. Use planner_getTask to read tasks, ' +
    'search_tasks_semantic to find tasks by text, search_users_by_skills to find people, ' +
    'and planner_assignTask (HITL) to assign. Never answer if a tool can answer for you.',
  tools: {
    planner_assignTask: plannerAssignTaskTool,
    planner_getTask: plannerGetTaskTool,
    search_tasks_semantic: searchTasksSemantic,
    search_users_by_skills: identitySearchUsersBySkillsTool,
  },
});
