import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { AgentResult, Citation, SpecializedAgentSpec } from '@seta/agent-sdk';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';
import { makeOrchestratorTools } from './orchestrator.tools.ts';
import type { TaskSummary } from './ports.ts';
import {
  type AvailabilityResult,
  OrchestratorInputSchema,
  type OrchestratorResult,
  OrchestratorResultSchema,
  type RankedCandidate,
  type Recommendation,
  type TaskAnalyzerOutput,
} from './schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from './trust.ts';

type In = z.infer<typeof OrchestratorInputSchema>;
type Out = OrchestratorResult;

type TaskAnalyzerSpec = SpecializedAgentSpec<
  { query: string; taskId: string | null },
  TaskAnalyzerOutput
>;
type SkillMatcherSpec = SpecializedAgentSpec<
  { taskId: string; skills: string[] },
  { taskId: string; candidates: RankedCandidate[] }
>;
type RecommenderSpec = SpecializedAgentSpec<
  // availability matches the recommender's contract; the orchestrator always
  // passes it empty (availability re-enable is out of scope here).
  {
    taskId: string;
    skills: string[];
    candidates: RankedCandidate[];
    availability: AvailabilityResult[];
  },
  { taskId: string; recommendations: Recommendation[] }
>;

export interface OrchestratorDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  recommender: RecommenderSpec;
  resolveModel: () => LanguageModel;
  /** Cap on how many found tasks the orchestrator recommends people for. */
  recommendTaskCap?: number;
  /** Test-only seam; production builds + runs a real Mastra Agent. */
  runAgent?: (args: { input: In; requestContext: RequestContext }) => Promise<MastraToolSignals>;
}

const RECOMMEND_TASK_CAP = 5;

function instructions(cap: number): string {
  return [
    'You are a staffing assistant. Decide which tools to call to answer the user.',
    "Use callTaskAnalyzer to learn a task's required skills (pass the current taskId) or to",
    'find tasks by area/skill (pass the user message as query).',
    'Use callSkillMatcher then callRecommender ONLY when the user wants people recommended',
    'for a task: pass the skills from callTaskAnalyzer to callSkillMatcher, then its candidates',
    'to callRecommender.',
    'If the user only asks what skills a task needs, or only to list tasks, answer with the',
    'callTaskAnalyzer result and STOP — do not recommend people.',
    `When asked to find tasks AND recommend people, recommend for at most the first ${cap} tasks.`,
    'Never invent tasks, skills, or people.',
  ].join(' ');
}

export function makeOrchestratorAgent(deps: OrchestratorDeps): SpecializedAgentSpec<In, Out> {
  const cap = deps.recommendTaskCap ?? RECOMMEND_TASK_CAP;
  return {
    id: 'staffing.orchestrator',
    description:
      'Routes a staffing chat message across the task-analysis and recommendation sub-agents.',
    inputSchema: OrchestratorInputSchema,
    outputSchema: OrchestratorResultSchema,
    run: async (input, ctx): Promise<AgentResult<Out>> => {
      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ctx.actorUserId });
      rc.set('tenant_id', ctx.tenantId);

      const res: MastraToolSignals = deps.runAgent
        ? await deps.runAgent({ input, requestContext: rc })
        : await (async () => {
            const tools = makeOrchestratorTools({
              taskAnalyzer: deps.taskAnalyzer,
              skillMatcher: deps.skillMatcher,
              recommender: deps.recommender,
              ctx,
            });
            const agent = new Agent({
              id: 'staffing.orchestrator',
              name: 'Staffing Orchestrator',
              instructions: instructions(cap),
              model: deps.resolveModel() as never,
              tools: tools as never,
            });
            const r = await agent.generate(
              [
                `User message: ${input.userText}`,
                `Current taskId: ${input.taskId ?? '(none)'}`,
              ].join('\n'),
              { requestContext: rc, maxSteps: 12, abortSignal: ctx.abortSignal },
            );
            return {
              toolCalls: r.toolCalls as MastraToolSignals['toolCalls'],
              toolResults: r.toolResults as MastraToolSignals['toolResults'],
            };
          })();

      const result = assemble(res);
      const trust = trustFromMastraResult(res, {
        citations: (tr) => citationsFor(tr),
        confidence: confidenceFor(result),
      });
      return { result, trust };
    },
  };
}

function results(res: MastraToolSignals, name: string): unknown[] {
  return res.toolResults.filter((t) => t.payload.toolName === name).map((t) => t.payload.result);
}

function assemble(res: MastraToolSignals): OrchestratorResult {
  const ta = results(res, 'callTaskAnalyzer') as TaskAnalyzerOutput[];
  const recs = results(res, 'callRecommender') as {
    taskId: string;
    recommendations: Recommendation[];
  }[];

  const foundTasks = ta.flatMap((o) => o.tasks ?? []);
  if (foundTasks.length > 0) {
    const byTask = new Map(recs.map((r) => [r.taskId, r.recommendations]));
    return {
      tasks: foundTasks.map((task: TaskSummary) => {
        const recommendations = byTask.get(task.taskId);
        return recommendations ? { task, recommendations } : { task };
      }),
    };
  }
  const [firstRec] = recs;
  if (firstRec) return { recommendations: firstRec.recommendations };

  const skills = ta.find((o) => o.skills)?.skills;
  if (skills) return { skills };

  return {
    message:
      "I can describe a task's required skills, find tasks by area, or recommend people for a task.",
  };
}

function citationsFor(tr: { payload: { toolName: string; result: unknown } }): Citation[] {
  if (tr.payload.toolName === 'callTaskAnalyzer') {
    const ts = (tr.payload.result as { tasks?: TaskSummary[] }).tasks ?? [];
    return ts.map<Citation>((t) => ({ kind: 'task', id: t.taskId, label: t.title }));
  }
  if (tr.payload.toolName === 'callRecommender') {
    const rs = (tr.payload.result as { recommendations?: Recommendation[] }).recommendations ?? [];
    return rs.map<Citation>((r) => ({ kind: 'user', id: r.userId, label: r.name ?? undefined }));
  }
  return [];
}

function confidenceFor(result: OrchestratorResult): number {
  if (result.recommendations?.length) return 0.8;
  if (result.tasks?.length) return 0.8;
  if (result.skills?.length) return 0.8;
  return 0.2;
}
