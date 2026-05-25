import { CopilotRegistry } from '@seta/copilot-sdk';
import { identityGetAvailabilityTool, identityGetTimezoneTool } from '@seta/identity/agent-tools';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';
import { assignBySkillWorkflowSpec } from '../workflows/assign-by-skill/spec.ts';
import { dedupOnCreateWorkflowSpec } from '../workflows/dedup-on-create/spec.ts';
import { plannerAssignTaskTool } from './assign-task.ts';
import { plannerCreateTaskTool } from './create-task.ts';
import { plannerFindSimilarTasksTool } from './find-similar-tasks.ts';
import { plannerGetOpenTaskCountSpec, plannerGetOpenTaskCountTool } from './get-open-task-count.ts';
import { plannerGetTaskTool } from './get-task.ts';
import { plannerProposeAssignmentTool } from './propose-assignment.ts';
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

const lazyProvider = makeLazyEmbeddingProvider();
function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required for planner runtime tools');
  return url;
}

const plannerCreateTask = plannerCreateTaskTool({
  provider: lazyProvider,
  get databaseUrl(): string {
    return readDatabaseUrl();
  },
});

const plannerFindSimilarTasks = plannerFindSimilarTasksTool({
  provider: lazyProvider,
  get databaseUrl(): string {
    return readDatabaseUrl();
  },
});

CopilotRegistry.registerSpecialist({
  domain: 'work',
  id: 'planner',
  description:
    'Plans, tasks, buckets, assignments. Reads across identity for skill, ' +
    'timezone, and availability when assignment decisions need those signals.',
  instructions: () => `You are the planner specialist. You help users plan, find, create, and
assign tasks. You **reason** about what signals matter for the request in
front of you. Do not run a fixed pipeline.

## How to assign someone to a task

You have these signals available:
- skill match (search_users_by_skills) — almost always relevant
- past similar work (planner_findSimilarTasks) — relevant for follow-ups,
  re-platforming, or when the user mentions "again" / "like last time"
- current load (planner_getOpenTaskCountForUser) — relevant when the task is
  urgent or the team is at capacity
- timezone overlap (identity_getTimezoneForUser) — relevant for long-running
  collaborative work, not for short async tasks
- availability / OOO (identity_getAvailabilityForUser) — always cheap to check,
  but only material if the candidate would otherwise be your top pick

Pick the signals that move the decision for THIS task. Most assignments
need 2-4 signals, not all five. Don't fetch what you won't use.

When you have a shortlist, call planner_proposeAssignment with 2-5
candidates and a short rationale per candidate. The user will pick one.

If planner_getTask returns a non-null pendingAssignWorkflowRunId, a
deterministic Suggest run is already open in the user's inbox for this
task. Don't race. Tell the user (link the run by id), and ask whether
they want you to wait for that decision or to propose your own
shortlist anyway.

If after your reasoning one candidate is obviously the right fit and the
user named no other constraint, you may skip the shortlist and call
planner_assignTask directly — it surfaces a one-click confirm card.

If the user wants a deterministic, fully-ranked list, tell them they can
click "Suggest" on the task card (it runs the assignBySkill workflow in
the inbox). Don't try to invoke that workflow yourself — it's not in your
tool surface, by design.

## How to create a task

Before creating, call planner_findSimilarTasks on the proposed title or
intent. If you find a likely duplicate (high score, same domain,
overlapping scope), tell the user — don't auto-create. Suggest they edit
the existing task or confirm they really want a new one.

If no duplicate, call planner_createTask. It surfaces a confirm card with
the task summary; the user one-clicks to commit.

## Read tools
- planner_getTask — load a task by ID
- planner_findSimilarTasks — semantic search across past tasks (returns title + assignee + score)
- search_users_by_skills — find people by skill list
- planner_getOpenTaskCountForUser — open task count per user
- identity_getTimezoneForUser
- identity_getAvailabilityForUser

## Write tools (all HITL)
- planner_createTask
- planner_assignTask          (use when you have one strong candidate)
- planner_proposeAssignment   (use when surfacing 2-5 candidates)

Always reason about which tools to call. Never call a tool whose output
you can't articulate a use for. Surface your reasoning to the user in the
text channel as you go — they should be able to follow your thinking.`,
  tools: {
    planner_assignTask: plannerAssignTaskTool,
    planner_createTask: plannerCreateTask,
    planner_getTask: plannerGetTaskTool,
    planner_findSimilarTasks: plannerFindSimilarTasks,
    planner_proposeAssignment: plannerProposeAssignmentTool,
    search_users_by_skills: identitySearchUsersBySkillsTool,
    planner_getOpenTaskCountForUser: plannerGetOpenTaskCountTool,
    identity_getTimezoneForUser: identityGetTimezoneTool,
    identity_getAvailabilityForUser: identityGetAvailabilityTool,
  },
});

CopilotRegistry.registerWorkflow(dedupOnCreateWorkflowSpec);
CopilotRegistry.registerWorkflow(assignBySkillWorkflowSpec);

CopilotRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
