import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { TaskReaderPort } from '../ports.ts';
import { AnalyzerInputSchema, AnalyzerOutputSchema, type SkillRequirement } from '../schemas.ts';

// reason nullable (not optional): OpenAI strict structured output rejects optional.
const ExtractionSchema = z.object({
  actionable: z.boolean(),
  skills: z.array(z.string()),
  reason: z.string().nullable(),
});
type Extraction = z.infer<typeof ExtractionSchema>;
type In = z.infer<typeof AnalyzerInputSchema>;

export interface AnalyzerDeps {
  taskReader: TaskReaderPort;
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
      'You gate and analyze chat messages for an assignee-recommendation pipeline. ' +
      'Decide if the user is asking who should take/own a task. If NOT, actionable=false with a short reason. ' +
      'If it IS, actionable=true and the concrete skills the task needs.',
    model: deps.resolveModel() as never,
  });

  return {
    id: 'staffing.analyzer',
    description:
      'Decides whether a chat message is an assignee-recommendation request and extracts required skills.',
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
          return (r.object as Extraction) ?? { actionable: false, skills: [], reason: null };
        });

      const extraction = await extract({
        userText: input.userText,
        title: task?.title,
        description: task?.description,
      });
      const at = new Date().toISOString();

      if (!extraction.actionable) {
        const trust: TrustEnvelope = {
          reasoningTrace: [{ step: 'gate', detail: 'not an assignee-recommendation request', at }],
          evidenceCitations: [],
          confidenceScore: 0.2,
        };
        return {
          result: {
            actionable: false,
            skills: [],
            message:
              extraction.reason ??
              'I can only help suggest assignees for a task right now. Open a task and ask who should take it.',
          },
          trust,
          terminal: true,
        };
      }
      if (!task) {
        const trust: TrustEnvelope = {
          reasoningTrace: [{ step: 'gate', detail: 'actionable but no task resolved', at }],
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
      const trust: TrustEnvelope = {
        reasoningTrace: [
          { step: 'gate', detail: 'assignee-recommendation request', at },
          { step: 'extract_skills', detail: `${extraction.skills.length} skills`, at },
        ],
        evidenceCitations: [{ kind: 'task', id: task.taskId, label: task.title }],
        confidenceScore: extraction.skills.length > 0 ? 0.8 : 0.4,
      };
      return {
        result: {
          actionable: true,
          taskId: task.taskId,
          title: task.title,
          skills: extraction.skills,
        },
        trust,
      };
    },
  };
}
