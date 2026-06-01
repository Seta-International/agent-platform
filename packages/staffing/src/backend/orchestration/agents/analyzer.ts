import type { AgentResult, SpecializedAgentSpec, TrustEnvelope } from '@seta/agent-sdk';
import type { SkillExtractorPort, TaskReaderPort } from '../ports.ts';
import { AnalyzerInputSchema, AnalyzerOutputSchema, type SkillRequirement } from '../schemas.ts';

export interface AnalyzerDeps {
  taskReader: TaskReaderPort;
  skillExtractor: SkillExtractorPort;
}

export function makeAnalyzerAgent(
  deps: AnalyzerDeps,
): SpecializedAgentSpec<{ userText: string; taskId: string | null }, SkillRequirement> {
  return {
    id: 'staffing.analyzer',
    description:
      'Decides whether a chat message is an assignee-recommendation request and extracts the required skills.',
    inputSchema: AnalyzerInputSchema,
    outputSchema: AnalyzerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<SkillRequirement>> => {
      const task = input.taskId ? await deps.taskReader.load(input.taskId, ctx) : null;
      const extraction = await deps.skillExtractor.extract(
        { userText: input.userText, title: task?.title, description: task?.description },
        ctx,
      );
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
