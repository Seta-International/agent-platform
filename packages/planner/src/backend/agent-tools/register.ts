import { CopilotRegistry } from '@seta/copilot-sdk';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
import { assignBySkillWorkflowSpec } from '../workflows/assign-by-skill/spec.ts';
import { dedupOnCreateWorkflowSpec } from '../workflows/dedup-on-create/spec.ts';
import { plannerAssignTaskTool } from './assign-task.ts';
import { plannerCreateTaskTool } from './create-task.ts';
import { plannerGetOpenTaskCountSpec } from './get-open-task-count.ts';
import { plannerGetTaskTool } from './get-task.ts';
import { searchTasksSemanticTool } from './search-tasks-semantic.ts';
import { identitySearchUsersBySkillsTool } from './search-users-by-skills.ts';
import { plannerSuggestAssigneeTool } from './suggest-assignee.ts';

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

const lazyProvider = makeLazyEmbeddingProvider();
function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required for planner runtime tools');
  return url;
}

const searchTasksSemantic = searchTasksSemanticTool({
  provider: lazyProvider,
  get databaseUrl(): string {
    return readDatabaseUrl();
  },
});

const plannerCreateTask = plannerCreateTaskTool({
  provider: lazyProvider,
  get databaseUrl(): string {
    return readDatabaseUrl();
  },
});

const plannerSuggestAssignee = plannerSuggestAssigneeTool({
  provider: lazyProvider,
  get databaseUrl(): string {
    return readDatabaseUrl();
  },
});

CopilotRegistry.registerSpecialist({
  domain: 'work',
  id: 'planner',
  description:
    'Manages tasks, buckets, plans, and assignments in the planner module. ' +
    'Handles task lookup, semantic search, dedup-aware creation, and assignment.',
  instructions: () =>
    'You are the planner specialist. Use planner_getTask to read tasks, ' +
    'search_tasks_semantic to find tasks by text, planner_createTask to create ' +
    '(it runs vector dedup and prompts via HITL if similar tasks exist), ' +
    'search_users_by_skills to find people. ' +
    'For "who should take this on" or "find someone for task X" use planner_suggestAssignee ' +
    '(HITL — surfaces top-5 candidates by skill+history+load+tz). Otherwise use ' +
    'planner_assignTask (HITL) when the user already named the assignee. ' +
    'Never answer if a tool can answer for you.',
  tools: {
    planner_assignTask: plannerAssignTaskTool,
    planner_createTask: plannerCreateTask,
    planner_getTask: plannerGetTaskTool,
    planner_suggestAssignee: plannerSuggestAssignee,
    search_tasks_semantic: searchTasksSemantic,
    search_users_by_skills: identitySearchUsersBySkillsTool,
  },
});

CopilotRegistry.registerWorkflow(dedupOnCreateWorkflowSpec);
CopilotRegistry.registerWorkflow(assignBySkillWorkflowSpec);

CopilotRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
