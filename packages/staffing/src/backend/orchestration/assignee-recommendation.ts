import type { OrchestrationSpec, RunState } from '@seta/shared-orchestration';
import type { AvailabilityResult, RankedCandidate, SkillRequirement } from './schemas.ts';

type AnalyzeOut = SkillRequirement;
type MatchOut = { taskId: string; candidates: RankedCandidate[] };
type AvaiOut = { taskId: string; availability: AvailabilityResult[] };

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
    {
      id: 'avai',
      agentId: 'staffing.avaiChecker',
      input: (s) => {
        const m = out<MatchOut>(s, 'match');
        return { taskId: m.taskId, candidates: m.candidates };
      },
    },
    {
      id: 'recommend',
      agentId: 'staffing.recommender',
      input: (s) => {
        const a = out<AnalyzeOut>(s, 'analyze');
        const m = out<MatchOut>(s, 'match');
        const v = out<AvaiOut>(s, 'avai');
        return {
          taskId: m.taskId,
          skills: a.skills,
          candidates: m.candidates,
          availability: v.availability,
        };
      },
    },
  ],
  // v1 harness: the final result is already persisted by the kernel via completeRun.
  // The chat harness reads the 'final' inline event; queued delivery (SSE/notify) is a later addition.
  onComplete: async () => {},
};
