import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type {
  AgentResult,
  Citation,
  SpecializedAgentRunCtx,
  SpecializedAgentSpec,
  TrustEnvelope,
} from '@seta/agent-sdk';
import { z } from 'zod';
import { pickModel } from '../model.ts';
import type { TaskReaderPort, TaskSearchPort, TaskSummary } from '../ports.ts';
import {
  TaskAnalyzerInputSchema,
  type TaskAnalyzerOutput,
  TaskAnalyzerOutputSchema,
} from '../schemas.ts';

type In = z.infer<typeof TaskAnalyzerInputSchema>;
type Out = TaskAnalyzerOutput;

/** Max tasks the find_tasks intent returns. */
const FIND_TASKS_LIMIT = 20;

export interface TaskAnalyzerDeps {
  taskReader: TaskReaderPort;
  taskSearch: TaskSearchPort;
  /** Fast model used by the (LLM) extraction steps; resolved lazily, only when needed. */
  resolveModel: () => MastraModelConfig;
  /** Test seams; production runs structured-output LLM extraction. */
  extractSkillsFromTask?: (args: {
    title: string;
    description: string | null;
  }) => Promise<string[]>;
  extractTagsFromQuery?: (args: { query: string }) => Promise<string[]>;
}

/** Lowercase skill/area tags named in the user's query (LLM extraction). */
async function extractTags(
  deps: TaskAnalyzerDeps,
  query: string,
  ctx: Pick<SpecializedAgentRunCtx, 'model' | 'abortSignal' | 'tenantId' | 'actorUserId'>,
) {
  if (deps.extractTagsFromQuery) return deps.extractTagsFromQuery({ query });
  const knownTags = await deps.taskSearch.listAvailableTags(ctx);
  const vocabLine = knownTags.length
    ? `Known tag vocabulary — snap to the closest match when possible: ${knownTags.join(', ')}.`
    : '';
  // Built per call (not at factory time) so the per-turn model override in
  // ctx.model takes effect. Structured output via Mastra (not raw generateObject)
  // so the unified router model config resolves through the Mastra gateway.
  const agent = new Agent({
    id: 'staffing.taskAnalyzer.tagExtractor',
    name: 'Task Analyzer tag extraction',
    instructions: [
      'Extract the lowercase skill or area tag(s) named in the user message.',
      vocabLine,
      'Return an empty array if the message names no skills.',
    ]
      .filter(Boolean)
      .join('\n'),
    model: pickModel(ctx, deps.resolveModel),
  });
  const r = await agent.generate(`User message: ${query}`, {
    structuredOutput: { schema: z.object({ tags: z.array(z.string()) }) },
    abortSignal: ctx.abortSignal,
  });
  if (!r.object) throw new Error('tag extraction returned no structured output');
  return r.object.tags;
}

/** Skills a task implies, inferred from its title + description (LLM extraction). */
async function extractSkills(
  deps: TaskAnalyzerDeps,
  title: string,
  description: string | null,
  ctx: Pick<SpecializedAgentRunCtx, 'model' | 'abortSignal'>,
) {
  if (deps.extractSkillsFromTask) return deps.extractSkillsFromTask({ title, description });
  // Per-call Agent for the same reasons as extractTags above.
  const agent = new Agent({
    id: 'staffing.taskAnalyzer.skillExtractor',
    name: 'Task Analyzer skill extraction',
    instructions: [
      'Extract a concise list of technical skill tags (lowercase, no duplicates)',
      'required to do this task. Return only skills clearly implied by the text.',
    ].join('\n'),
    model: pickModel(ctx, deps.resolveModel),
  });
  const r = await agent.generate(
    [`Title: ${title}`, `Description: ${description ?? '(none)'}`].join('\n'),
    {
      structuredOutput: { schema: z.object({ skills: z.array(z.string()) }) },
      abortSignal: ctx.abortSignal,
    },
  );
  if (!r.object) throw new Error('skill extraction returned no structured output');
  return r.object.skills;
}

function trust(
  step: string,
  detail: string,
  citations: Citation[],
  confidence: number,
): TrustEnvelope {
  return {
    reasoningTrace: [{ step, detail, at: new Date().toISOString() }],
    evidenceCitations: citations,
    confidenceScore: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * Resolves a task's required skills, extracts the skills named in the user's
 * query, or finds tasks by skill tag — selected by `intent`.
 *
 * Deterministic routing: the orchestrator (the router) owns the people-vs-task
 * decision and passes `intent`, so this agent runs exactly ONE path instead of
 * letting an LLM guess which tools to call (which previously fired all of
 * fetch/extract/find at once for a "who has skill X" query). The extraction
 * steps still use an LLM, but only the one the chosen intent needs.
 */
export function makeTaskAnalyzerAgent(deps: TaskAnalyzerDeps): SpecializedAgentSpec<In, Out> {
  return {
    id: 'staffing.taskAnalyzer',
    description:
      "Resolves a task's required skills, extracts skills named in the query, or finds tasks by skill tag (intent-routed, deterministic).",
    inputSchema: TaskAnalyzerInputSchema,
    outputSchema: TaskAnalyzerOutputSchema,
    run: async (input, ctx: SpecializedAgentRunCtx): Promise<AgentResult<Out>> => {
      switch (input.intent) {
        case 'extract_named_skills': {
          // People-search input: just surface the skills the user named so the
          // orchestrator can hand them to the skillMatcher. NO task read/search.
          const skills = await extractTags(deps, input.query, ctx);
          return {
            result: { skills },
            trust: trust(
              'extract_named_skills',
              `extracted ${skills.length} skill(s) from the query`,
              [],
              skills.length ? 0.8 : 0.3,
            ),
          };
        }

        case 'find_tasks': {
          const tags = await extractTags(deps, input.query, ctx);
          const cs = input.completionStatus === 'any' ? undefined : input.completionStatus;
          const tasks: TaskSummary[] = tags.length
            ? await deps.taskSearch.bySkillTags(tags, FIND_TASKS_LIMIT, ctx, cs)
            : [];
          return {
            result: { tasks },
            trust: trust(
              'find_tasks',
              `searched tasks by [${tags.join(', ')}] → ${tasks.length} task(s)`,
              tasks.map((t) => ({ kind: 'task', id: t.taskId, label: t.title })),
              tasks.length ? 0.8 : 0.3,
            ),
          };
        }

        case 'resolve_task_skills': {
          if (!input.taskId) {
            return { result: {}, trust: trust('resolve_task_skills', 'no taskId given', [], 0.2) };
          }
          const task = await deps.taskReader.load(input.taskId, ctx);
          if (!task) {
            return {
              result: {},
              trust: trust('resolve_task_skills', `task ${input.taskId} not found`, [], 0.2),
            };
          }
          // Prefer the task's own tags; fall back to LLM inference only when empty.
          const skills = task.skillTags.length
            ? task.skillTags
            : await extractSkills(deps, task.title, task.description, ctx);
          return {
            result: { skills, title: task.title },
            trust: trust(
              'resolve_task_skills',
              `resolved ${skills.length} skill(s) for task ${task.taskId}`,
              [{ kind: 'task', id: task.taskId, label: task.title }],
              skills.length ? 0.8 : 0.4,
            ),
          };
        }
      }
    },
  };
}
