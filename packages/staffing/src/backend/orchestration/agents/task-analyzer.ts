import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, Citation, SpecializedAgentSpec } from '@seta/agent-sdk';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import type { TaskSummary } from '../ports.ts';
import {
  TaskAnalyzerInputSchema,
  type TaskAnalyzerOutput,
  TaskAnalyzerOutputSchema,
} from '../schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from '../trust.ts';
import { makeTaskAnalyzerTools, type TaskAnalyzerToolDeps } from './task-analyzer.tools.ts';

type In = z.infer<typeof TaskAnalyzerInputSchema>;
type Out = TaskAnalyzerOutput;

export interface TaskAnalyzerDeps extends TaskAnalyzerToolDeps {
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<MastraToolSignals>;
}

const INSTRUCTIONS = [
  'You analyse a chat message about tasks and decide which tools to call.',
  'If the user asks what skills/requirements a task needs: call fetchTaskData with the',
  'current taskId; if its skillTags is empty, then call extractRequirement with the',
  "task's title and description.",
  'If the user wants to find/list tasks by an area or skill: call extractSkillTag with',
  'the user message, then call findTaskBySkillTag with the returned tags.',
  'Never invent tasks or skills; use only tool results.',
].join(' ');

function toolResult(res: MastraToolSignals, name: string): unknown {
  return res.toolResults.find((t) => t.payload.toolName === name)?.payload.result;
}

export function makeTaskAnalyzerAgent(deps: TaskAnalyzerDeps): SpecializedAgentSpec<In, Out> {
  const tools = makeTaskAnalyzerTools(deps);
  const agent = new Agent({
    id: 'staffing.taskAnalyzer',
    name: 'Task Analyzer',
    instructions: INSTRUCTIONS,
    model: deps.resolveModel() as never,
    tools: tools as never,
  });

  return {
    id: 'staffing.taskAnalyzer',
    description: "Resolves a task's required skills, or finds tasks by skill tag (LLM-driven).",
    inputSchema: TaskAnalyzerInputSchema,
    outputSchema: TaskAnalyzerOutputSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);

      const res: MastraToolSignals = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const r = await agent.generate(
              [`User message: ${input.query}`, `Current taskId: ${input.taskId ?? '(none)'}`].join(
                '\n',
              ),
              { requestContext: rc, maxSteps: 6, abortSignal: ctx.abortSignal },
            );
            return {
              toolCalls: r.toolCalls as MastraToolSignals['toolCalls'],
              toolResults: r.toolResults as MastraToolSignals['toolResults'],
            };
          })();

      const fetched = toolResult(res, 'fetchTaskData') as
        | { skillTags: string[]; found: boolean }
        | undefined;
      const extracted = toolResult(res, 'extractRequirement') as { skills: string[] } | undefined;
      const found = toolResult(res, 'findTaskBySkillTag') as { tasks: TaskSummary[] } | undefined;

      // Find-tasks path is authoritative when present; otherwise resolve skills:
      // prefer the task's own tags, fall back to the LLM extraction.
      const tasks = found?.tasks;
      let skills: string[] | undefined;
      if (!tasks) {
        if (fetched?.found && fetched.skillTags.length > 0) skills = fetched.skillTags;
        else if (extracted) skills = extracted.skills;
        else if (fetched?.found) skills = [];
      }

      const trust = trustFromMastraResult(res, {
        citations: (tr) => {
          if (tr.payload.toolName === 'findTaskBySkillTag') {
            const ts = (tr.payload.result as { tasks?: TaskSummary[] }).tasks ?? [];
            return ts.map<Citation>((t) => ({ kind: 'task', id: t.taskId, label: t.title }));
          }
          if (tr.payload.toolName === 'fetchTaskData') {
            const r = tr.payload.result as { taskId: string; title: string; found: boolean };
            return r.found ? [{ kind: 'task', id: r.taskId, label: r.title }] : [];
          }
          return [];
        },
        confidence: tasks ? (tasks.length ? 0.8 : 0.3) : skills && skills.length ? 0.8 : 0.4,
      });

      const result: Out = {};
      if (tasks) result.tasks = tasks;
      if (skills) result.skills = skills;
      return { result, trust };
    },
  };
}
