import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __setStaffingRunIdForTests,
  buildStaffingOrchestrationRuntime,
} from '../../../src/backend/orchestration/register.ts';
import { StaffingRunStateRepository } from '../../../src/backend/orchestration/run-state-repository.ts';
import { withAgentTestDb } from '../../helpers.ts';

const TENANT = '00000000-0000-4000-8000-0000000000ba';
const ACTOR = '00000000-0000-4000-8000-0000000000ca';
const RUN = '00000000-0000-4000-8000-0000000000da';
const TASK_REF = '00000000-0000-4000-8000-0000000000ea';

type Content = Record<string, unknown>;
interface Step {
  content: Content[];
  finishReason: 'stop' | 'tool-calls';
}
const usage = { inputTokens: 11, outputTokens: 7, totalTokens: 18 };
const STOP: Step = { content: [{ type: 'text', text: 'done' }], finishReason: 'stop' };
function toolCallStep(k: number, toolName: string, input: unknown): Step {
  return {
    content: [{ type: 'tool-call', toolCallId: `c-${k}`, toolName, input: JSON.stringify(input) }],
    finishReason: 'tool-calls',
  };
}
function scriptedModel(steps: Step[]) {
  let call = -1;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      call += 1;
      const s = steps[Math.min(call, steps.length - 1)] ?? STOP;
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: s.finishReason,
        usage,
        content: s.content,
        warnings: [],
      } as never;
    },
  });
}
function resolveModelSeq(models: ReturnType<typeof scriptedModel>[]): () => never {
  let i = -1;
  return () => {
    i += 1;
    return (models[i] ?? scriptedModel([STOP])) as never;
  };
}

const CANDIDATE = {
  userId: 'u1',
  name: 'A',
  skills: ['aws'],
  role: null,
  skillMatchCount: 1,
  rank: 1,
};
const portsWith = () => ({
  taskReader: {
    load: async () => ({
      taskId: 'task-1',
      title: 'AWS migration',
      description: 'x',
      groupId: 'g1',
      skillTags: ['aws'],
      assigneeIds: [],
    }),
  },
  taskSearch: { bySkillTags: async () => [] },
  skillSearch: {
    search: async () => [{ userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.9 }],
  },
  availability: {
    status: async () => ({ status: 'available' as const, note: null }),
    inProgressCount: async () => 0,
  },
});

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('orchestration usage capture', () => {
  it('a recommend chat turn emits billing.usage.observed events (chat + subagent)', async () => {
    await withAgentTestDb(async ({ pool }) => {
      __setStaffingRunIdForTests(() => RUN);
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        resolveModel: resolveModelSeq([
          // orchestrator: chain the four delegations (feature=chat).
          scriptedModel([
            toolCallStep(0, 'callTaskAnalyzer', {
              intent: 'resolve_task_skills',
              query: 'who should do this',
              taskRef: TASK_REF,
            }),
            toolCallStep(1, 'callSkillMatcher', { taskId: 'task-1', skills: ['aws'] }),
            toolCallStep(2, 'callAvaiChecker', { taskId: 'task-1', candidates: [CANDIDATE] }),
            toolCallStep(3, 'callRecommender', {
              taskId: 'task-1',
              skills: ['aws'],
              candidates: [CANDIDATE],
              availability: [
                {
                  userId: 'u1',
                  name: 'A',
                  status: 'available',
                  inProgressCount: 0,
                  availabilityScore: 1,
                },
              ],
            }),
            STOP,
          ]),
          // skillMatcher (feature=subagent): searchCandidates, then run() ranks.
          scriptedModel([toolCallStep(0, 'searchCandidates', { skills: ['aws'] }), STOP]),
        ]),
        ports: portsWith(),
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = [];
      for await (const e of rt.runInline(
        { userText: 'who should do this', taskId: 'task-1' },
        { tenantId: TENANT, actorUserId: ACTOR },
      )) {
        events.push(e);
      }
      expect(events.at(-1)).toMatchObject({ kind: 'final' });

      const { rows } = await pool.query(
        `SELECT payload->>'feature' AS feature, payload->>'tokens_in' AS tokens_in
           FROM core.events
          WHERE tenant_id = $1 AND event_type = 'billing.usage.observed'`,
        [TENANT],
      );
      // The orchestrator (chat) and skillMatcher (subagent) each emit one event.
      const features = rows.map((r: { feature: string }) => r.feature);
      expect(features).toContain('chat');
      expect(features).toContain('subagent');
      // Each carries the model's reported input tokens (Mastra sums across the
      // agent's internal steps, so the exact total varies — assert non-zero).
      expect(rows.every((r: { tokens_in: string }) => Number(r.tokens_in) > 0)).toBe(true);
    });
  });
});
