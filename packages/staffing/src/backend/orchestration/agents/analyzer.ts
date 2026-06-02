import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { TaskReaderPort, TaskSearchPort } from '../ports.ts';
import { AnalyzerInputSchema, AnalyzerOutputSchema, type SkillRequirement } from '../schemas.ts';

/** Max tasks the find_tasks branch returns. */
const FIND_TASKS_LIMIT = 20;

// All fields non-optional / nullable: OpenAI strict structured output rejects optional.
const ExtractionSchema = z.object({
  intent: z.enum(['recommend_assignee', 'find_tasks', 'none']),
  // recommend_assignee: skills to use when the task itself has no skill_tags.
  skills: z.array(z.string()),
  // find_tasks: the skill tags to search for (lowercase phrases).
  tags: z.array(z.string()),
  // Used when intent === 'none'.
  reason: z.string().nullable(),
});
type Extraction = z.infer<typeof ExtractionSchema>;
type In = z.infer<typeof AnalyzerInputSchema>;

export interface AnalyzerDeps {
  taskReader: TaskReaderPort;
  taskSearch: TaskSearchPort;
  resolveModel: () => LanguageModel;
  /** Test-only seam; production runs a real Mastra Agent with structuredOutput. */
  extract?: (args: {
    userText: string;
    title?: string;
    description?: string | null;
  }) => Promise<Extraction>;
}

export function makeAnalyzerAgent(deps: AnalyzerDeps): SpecializedAgentSpec<In, SkillRequirement> {
  const agent = new Agent({
    id: 'staffing.analyzer',
    name: 'Staffing Analyzer',
    instructions:
      'You classify a chat message for a staffing assistant and extract structured fields. ' +
      'Pick exactly one intent: ' +
      "'recommend_assignee' when the user asks who should take/own/do a specific task; " +
      "'find_tasks' when the user wants to list/find tasks by a skill or area " +
      '(e.g. "find infrastructure tasks", "show devops work") — extract the tag phrase(s) ' +
      "into `tags` as lowercase; 'none' for anything else (greetings, chit-chat, unrelated). " +
      'For recommend_assignee, put the concrete skills the task needs into `skills` ' +
      '(used only if the task has no skill_tags of its own). ' +
      'For none, put a short, friendly explanation into `reason`.',
    model: deps.resolveModel() as never,
  });

  return {
    id: 'staffing.analyzer',
    description:
      'Routes a chat message: recommend an assignee for a task, find tasks by skill tag, or decline.',
    inputSchema: AnalyzerInputSchema,
    outputSchema: AnalyzerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<SkillRequirement>> => {
      const task = input.taskId ? await deps.taskReader.load(input.taskId, ctx) : null;

      const extract =
        deps.extract ??
        (async (args: { userText: string; title?: string; description?: string | null }) => {
          const rc = new RequestContext();
          rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
          rc.set('tenant_id', ctx.tenantId);
          const r = await agent.generate(
            [
              `User message: ${args.userText}`,
              `Task title: ${args.title ?? '(none)'}`,
              `Task description: ${args.description ?? '(none)'}`,
            ].join('\n'),
            {
              requestContext: rc,
              structuredOutput: { schema: ExtractionSchema },
              abortSignal: ctx.abortSignal,
            },
          );
          return (r.object as Extraction) ?? { intent: 'none', skills: [], tags: [], reason: null };
        });

      const extraction = await extract({
        userText: input.userText,
        title: task?.title,
        description: task?.description,
      });
      const at = new Date().toISOString();

      // ── Branch 1: none → terminal polite gate ───────────────────────────────
      if (extraction.intent === 'none') {
        const trust: TrustEnvelope = {
          reasoningTrace: [{ step: 'gate', detail: 'not an assignee or task-search request', at }],
          evidenceCitations: [],
          confidenceScore: 0.2,
        };
        return {
          result: {
            actionable: false,
            skills: [],
            message:
              extraction.reason ??
              'I can suggest assignees for a task, or find tasks by skill tag. What would you like?',
          },
          trust,
          terminal: true,
        };
      }

      // ── Branch 2: find_tasks → deterministic search, terminal list ───────────
      if (extraction.intent === 'find_tasks') {
        const tasks = extraction.tags.length
          ? await deps.taskSearch.bySkillTags(extraction.tags, FIND_TASKS_LIMIT, ctx)
          : [];
        const trust: TrustEnvelope = {
          reasoningTrace: [
            { step: 'gate', detail: 'find_tasks request', at },
            {
              step: 'search_tasks',
              detail: `${extraction.tags.length} tag(s) -> ${tasks.length} task(s)`,
              at,
            },
          ],
          evidenceCitations: tasks.map((t) => ({
            kind: 'task' as const,
            id: t.taskId,
            label: t.title,
          })),
          confidenceScore: tasks.length > 0 ? 0.8 : 0.3,
        };
        return { result: { actionable: false, skills: [], tasks }, trust, terminal: true };
      }

      // ── Branch 3: recommend_assignee ─────────────────────────────────────────
      if (!task) {
        const trust: TrustEnvelope = {
          reasoningTrace: [{ step: 'gate', detail: 'recommend_assignee but no task resolved', at }],
          evidenceCitations: [],
          confidenceScore: 0.3,
        };
        return {
          result: {
            actionable: false,
            skills: extraction.skills,
            message: 'Which task is this for? Open the task and ask again, or name it.',
          },
          trust,
          terminal: true,
        };
      }

      // DB-first: prefer the task's own skill_tags; fall back to the LLM's guess.
      const skills = task.skillTags.length > 0 ? task.skillTags : extraction.skills;
      const skillsSource = task.skillTags.length > 0 ? 'skill_tags' : 'llm fallback';
      const trust: TrustEnvelope = {
        reasoningTrace: [
          { step: 'gate', detail: 'assignee-recommendation request', at },
          { step: 'resolve_skills', detail: `${skills.length} skills (${skillsSource})`, at },
        ],
        evidenceCitations: [{ kind: 'task', id: task.taskId, label: task.title }],
        confidenceScore: skills.length > 0 ? 0.8 : 0.4,
      };
      return {
        result: { actionable: true, taskId: task.taskId, title: task.title, skills },
        trust,
      };
    },
  };
}
