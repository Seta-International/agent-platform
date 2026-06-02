import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { TaskReaderPort, TaskSearchPort } from '../ports.ts';
import { TaskSummarySchema } from '../schemas.ts';

/** Max tasks `findTaskBySkillTag` returns. */
const FIND_TASKS_LIMIT = 20;

export interface TaskAnalyzerToolDeps {
  taskReader: TaskReaderPort;
  taskSearch: TaskSearchPort;
  /** Fast model used by the extraction tools. */
  resolveModel: () => LanguageModel;
  /** Test seams; production runs structured-output LLM extraction. */
  extractSkillsFromTask?: (args: {
    title: string;
    description: string | null;
  }) => Promise<string[]>;
  extractTagsFromQuery?: (args: { query: string }) => Promise<string[]>;
}

function tenantOf(ctx: { requestContext?: { get(k: string): unknown } }): string {
  const t = ctx.requestContext?.get('tenant_id');
  if (typeof t !== 'string' || !t)
    throw new Error('task-analyzer tool: missing tenant_id in requestContext');
  return t;
}
function runCtxOf(ctx: Parameters<typeof actorFromContext>[0] & { abortSignal?: AbortSignal }) {
  return {
    tenantId: tenantOf(ctx),
    actorUserId: actorFromContext(ctx).user_id,
    abortSignal: ctx.abortSignal,
  };
}

export function makeTaskAnalyzerTools(deps: TaskAnalyzerToolDeps) {
  // Reads go through the ports' adapters, which re-check RBAC at the planner
  // public surface (no cross-module DB access here), so no tool-level rbac gate.
  const fetchTaskData = defineAgentTool({
    id: 'fetchTaskData',
    name: 'Fetch task data',
    description: 'Load a task by id: title, description and its skill_tags.',
    input: z.object({ taskId: z.string().min(1) }),
    output: z.object({
      taskId: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      skillTags: z.array(z.string()),
      found: z.boolean(),
    }),
    execute: async ({ taskId }, ctx) => {
      const task = await deps.taskReader.load(taskId, runCtxOf(ctx));
      if (!task) return { taskId, title: '', description: null, skillTags: [], found: false };
      return {
        taskId: task.taskId,
        title: task.title,
        description: task.description,
        skillTags: task.skillTags,
        found: true,
      };
    },
  });

  const findTaskBySkillTag = defineAgentTool({
    id: 'findTaskBySkillTag',
    name: 'Find tasks by skill tag',
    description: 'Search tasks whose skill_tags match the given (lowercase) tags.',
    input: z.object({
      tags: z.array(z.string()).min(1),
      limit: z.number().int().positive().optional(),
    }),
    output: z.object({ tasks: z.array(TaskSummarySchema) }),
    execute: async ({ tags, limit }, ctx) => {
      const tasks = await deps.taskSearch.bySkillTags(
        tags,
        limit ?? FIND_TASKS_LIMIT,
        runCtxOf(ctx),
      );
      return { tasks };
    },
  });

  const extractRequirement = defineAgentTool({
    id: 'extractRequirement',
    name: 'Extract required skills from a task',
    description:
      'Infer the skill tags a task needs from its title + description. Use only when the task has no skill_tags of its own.',
    input: z.object({ title: z.string(), description: z.string().nullable() }),
    output: z.object({ skills: z.array(z.string()) }),
    execute: async ({ title, description }, ctx) => {
      if (deps.extractSkillsFromTask)
        return { skills: await deps.extractSkillsFromTask({ title, description }) };
      const { object } = await generateObject({
        model: deps.resolveModel(),
        schema: z.object({ skills: z.array(z.string()) }),
        abortSignal: ctx.abortSignal,
        prompt: [
          'Extract a concise list of technical skill tags (lowercase, no duplicates)',
          'required to do this task. Return only skills clearly implied by the text.',
          `Title: ${title}`,
          `Description: ${description ?? '(none)'}`,
        ].join('\n'),
      });
      return { skills: object.skills };
    },
  });

  const extractSkillTag = defineAgentTool({
    id: 'extractSkillTag',
    name: 'Extract skill tags from the user query',
    description:
      'Extract the lowercase skill/area tag(s) the user wants to search tasks by (e.g. "infrastructure").',
    input: z.object({ query: z.string() }),
    output: z.object({ tags: z.array(z.string()) }),
    execute: async ({ query }, ctx) => {
      if (deps.extractTagsFromQuery) return { tags: await deps.extractTagsFromQuery({ query }) };
      const { object } = await generateObject({
        model: deps.resolveModel(),
        schema: z.object({ tags: z.array(z.string()) }),
        abortSignal: ctx.abortSignal,
        prompt: [
          'Extract the lowercase skill or area tag(s) the user wants to find tasks by.',
          'Return an empty array if the message is not a task search.',
          `User message: ${query}`,
        ].join('\n'),
      });
      return { tags: object.tags };
    },
  });

  return { fetchTaskData, findTaskBySkillTag, extractRequirement, extractSkillTag };
}
