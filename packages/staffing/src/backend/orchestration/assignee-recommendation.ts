import type { OrchestrationSpec, RunState } from '@seta/shared-orchestration';
import type { RankedCandidate, SkillRequirement } from './schemas.ts';

type AnalyzeOut = SkillRequirement;
type MatchOut = { taskId: string; candidates: RankedCandidate[] };

const out = <T>(state: RunState, stepId: string): T => state.outputs[stepId] as T;

export const assigneeRecommendationSpec: OrchestrationSpec = {
  id: 'staffing.assigneeRecommendation',
  serializationKey: (_runInput, ctx) => `staffing:reco:${ctx.tenantId}`,
  steps: [
    { id: 'analyze', agentId: 'staffing.analyzer', input: (_s, runIn) => runIn },
    {
      id: 'match',
      agentId: 'staffing.skillMatcher',
      input: (s) => {
        const a = out<AnalyzeOut>(s, 'analyze');
        return { taskId: a.taskId, skills: a.skills };
      },
    },
    // NOTE: step 'avai' (staffing.avaiChecker) temporarily disabled — agent is erroring.
    // recommend runs with empty availability => recommender defaults every candidate to
    // 'busy', so ranking falls back to skillMatchCount only. Re-add the step + restore the
    // `availability: v.availability` wiring once avaiChecker is fixed.
    {
      id: 'recommend',
      agentId: 'staffing.recommender',
      input: (s) => {
        const a = out<AnalyzeOut>(s, 'analyze');
        const m = out<MatchOut>(s, 'match');
        return {
          taskId: m.taskId,
          skills: a.skills,
          candidates: m.candidates,
          availability: [],
        };
      },
    },
  ],
  // v1 harness: the final result is already persisted by the kernel via completeRun.
  // The chat harness reads the 'final' inline event; queued delivery (SSE/notify) is a later addition.
  onComplete: async () => {},
};
