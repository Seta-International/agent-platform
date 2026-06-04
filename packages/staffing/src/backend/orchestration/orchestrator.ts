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
  type TaskAnalyzerIntent,
  type TaskAnalyzerOutput,
} from './schemas.ts';
import { type MastraToolSignals, trustFromMastraResult } from './trust.ts';

type In = z.infer<typeof OrchestratorInputSchema>;
type Out = OrchestratorResult;

type TaskAnalyzerSpec = SpecializedAgentSpec<
  { intent: TaskAnalyzerIntent; query: string; taskId: string | null },
  TaskAnalyzerOutput
>;
type SkillMatcherSpec = SpecializedAgentSpec<
  { taskId: string | null; skills: string[] },
  { taskId: string | null; candidates: RankedCandidate[] }
>;
type AvaiCheckerSpec = SpecializedAgentSpec<
  { taskId: string | null; candidates: RankedCandidate[] },
  { taskId: string | null; availability: AvailabilityResult[] }
>;
type RecommenderSpec = SpecializedAgentSpec<
  // availability is now produced by the avaiChecker step and passed through.
  {
    taskId: string | null;
    skills: string[];
    candidates: RankedCandidate[];
    availability: AvailabilityResult[];
  },
  { taskId: string | null; recommendations: Recommendation[] }
>;

export interface OrchestratorDeps {
  taskAnalyzer: TaskAnalyzerSpec;
  skillMatcher: SkillMatcherSpec;
  avaiChecker: AvaiCheckerSpec;
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
    'You are a staffing assistant. Decide which tools to call to answer the user, then stop.',
    '',
    'Get skills or tasks with callTaskAnalyzer, picking the intent that matches the request:',
    '- intent=resolve_task_skills (with the current taskId): for "what skills does this task',
    '  need", and to get a task\'s skills before recommending people FOR that task.',
    '- intent=extract_named_skills: when the user asks for PEOPLE by skill they named, e.g.',
    '  "who has aws and k8s skills" / "find someone who knows terraform". This returns those',
    '  skills — it does NOT search tasks. Do not use find_tasks for a people question.',
    '- intent=find_tasks: when the user wants to list TASKS by area/skill, e.g. "find infra tasks".',
    '',
    'PEOPLE SEARCH — the user just wants people who HAVE the skills, with no task to staff and',
    'no "who should do it" question (e.g. "find users with aws and docker", "who has k8s',
    'skills"): callTaskAnalyzer(extract_named_skills), then callSkillMatcher with those skills',
    'and taskId=null, then STOP. The matcher candidates are the answer — do NOT call',
    'callAvaiChecker or callRecommender for a people search.',
    '',
    'RECOMMEND AN ASSIGNEE — the user asks who SHOULD do a task or to pick the best person',
    '(e.g. "who should do this task", "recommend someone for the auth work"): after obtaining',
    'the skills, call in order: callSkillMatcher with those skills; then callAvaiChecker with',
    'the returned candidates; then callRecommender with the candidates AND the availability',
    "returned by callAvaiChecker. Pass the same taskId through all three: the current task's",
    "id, the found task's id, or null when the request names no task — taskId is only a",
    'correlation label.',
    '',
    'If the user only asks what skills a task needs, or only to list tasks, answer with the',
    'callTaskAnalyzer result and STOP — do not recommend people.',
    `When asked to find tasks AND recommend people, recommend for at most the first ${cap} tasks.`,
    'Never invent tasks, skills, or people.',
  ].join('\n');
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
              avaiChecker: deps.avaiChecker,
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
        citations: (tr) => citationsFor(tr, result),
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
    taskId: string | null;
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

  // Stopping at skillMatcher is the people-search terminal ("find users with
  // aws and docker"): the candidates ARE the answer. It only counts as a stall
  // when the pipeline went PAST the matcher — avaiChecker/recommender called
  // (even unsuccessfully) means an assignee recommendation was attempted.
  const downstreamAttempted = ['callAvaiChecker', 'callRecommender'].some(
    (name) =>
      res.toolCalls.some((c) => c.payload.toolName === name) ||
      res.toolResults.some((t) => t.payload.toolName === name),
  );
  if (!downstreamAttempted) {
    const [match] = results(res, 'callSkillMatcher') as {
      taskId: string | null;
      candidates: RankedCandidate[];
    }[];
    if (match) return { candidates: match.candidates };
  }

  // taskAnalyzer's skills double as pipeline INPUT for skillMatcher. They are a
  // terminal answer ONLY when the user asked just for skills — i.e. the recommend
  // pipeline never started. If recommendation WAS attempted but produced nothing,
  // returning those skills would mis-answer "find an assignee" as "what skills
  // does this need". Surface an honest failure instead.
  if (!downstreamAttempted) {
    const skills = ta.find((o) => o.skills)?.skills;
    if (skills) return { skills };
  }

  return {
    message: downstreamAttempted
      ? "I couldn't complete the recommendation for this task. Please try again."
      : "I can describe a task's required skills, find tasks by area, or recommend people for a task.",
  };
}

function citationsFor(
  tr: { payload: { toolName: string; result: unknown } },
  result: OrchestratorResult,
): Citation[] {
  if (tr.payload.toolName === 'callTaskAnalyzer') {
    const ts = (tr.payload.result as { tasks?: TaskSummary[] }).tasks ?? [];
    return ts.map<Citation>((t) => ({ kind: 'task', id: t.taskId, label: t.title }));
  }
  if (tr.payload.toolName === 'callRecommender') {
    const rs = (tr.payload.result as { recommendations?: Recommendation[] }).recommendations ?? [];
    return rs.map<Citation>((r) => ({ kind: 'user', id: r.userId, label: r.name ?? undefined }));
  }
  // Matcher candidates are evidence only when they ARE the answer (people-search
  // terminal); in the recommend flow the recommender already cites those users.
  if (tr.payload.toolName === 'callSkillMatcher' && result.candidates) {
    const cs = (tr.payload.result as { candidates?: RankedCandidate[] }).candidates ?? [];
    return cs.map<Citation>((c) => ({ kind: 'user', id: c.userId, label: c.name ?? undefined }));
  }
  return [];
}

function confidenceFor(result: OrchestratorResult): number {
  if (result.recommendations?.length) return 0.8;
  if (result.tasks?.length) return 0.8;
  if (result.candidates?.length) return 0.8;
  if (result.skills?.length) return 0.8;
  return 0.2;
}
