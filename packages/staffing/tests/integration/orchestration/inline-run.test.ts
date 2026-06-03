import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { type OrchestrationEvent, OrchestrationRegistry } from '@seta/shared-orchestration';
import { MockLanguageModelV3 } from 'ai/test';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  orchestrationRuns,
  orchestrationStepTrace,
  staffingDb,
} from '../../../src/backend/db/index.ts';
import {
  __setStaffingRunIdForTests,
  buildStaffingOrchestrationRuntime,
} from '../../../src/backend/orchestration/register.ts';
import { StaffingRunStateRepository } from '../../../src/backend/orchestration/run-state-repository.ts';
import { withAgentTestDb } from '../../helpers.ts';

const TENANT = '00000000-0000-4000-8000-0000000000b9';
const ACTOR = '00000000-0000-4000-8000-0000000000c9';
const RUN = '00000000-0000-4000-8000-0000000000d9';

type Content = Record<string, unknown>;
interface Step {
  content: Content[];
  finishReason: 'stop' | 'tool-calls';
}
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
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

async function runInline(rt: ReturnType<typeof buildStaffingOrchestrationRuntime>) {
  const events = [];
  for await (const e of rt.runInline(
    { userText: 'go', taskId: 'task-1' },
    { tenantId: TENANT, actorUserId: ACTOR },
  )) {
    events.push(e);
  }
  return events;
}

describe('orchestrator inline run (e2e)', () => {
  it('recommend path: taskAnalyzer → skillMatcher → avaiChecker → recommender, streams sub-cards, persists', async () => {
    await withAgentTestDb(async () => {
      __setStaffingRunIdForTests(() => RUN);
      // Build-time models: [taskAnalyzer, skillMatcher, avaiChecker]; run-time: [orchestrator].
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        resolveModel: resolveModelSeq([
          // taskAnalyzer: fetchTaskData (task has skillTags=['aws'] → no extractRequirement).
          scriptedModel([toolCallStep(0, 'fetchTaskData', { taskId: 'task-1' }), STOP]),
          // skillMatcher: searchCandidates; run() ranks the hits via fallback.
          scriptedModel([toolCallStep(0, 'searchCandidates', { skills: ['aws'] }), STOP]),
          // avaiChecker: read both signals, then score (determineAvaiScore is pure — it scores the
          // scripted items, which is why we pass them explicitly here).
          scriptedModel([
            toolCallStep(0, 'checkAvailability', { userIds: ['u1'] }),
            toolCallStep(1, 'checkInprogressTasks', { userIds: ['u1'] }),
            toolCallStep(2, 'determineAvaiScore', {
              items: [
                { userId: 'u1', userName: 'A', availability: 'available', taskInProgressCount: 0 },
              ],
            }),
            STOP,
          ]),
          // orchestrator: chain the four delegations, then stop.
          scriptedModel([
            toolCallStep(0, 'callTaskAnalyzer', { query: 'who should do this', taskId: 'task-1' }),
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
        ]),
        ports: portsWith(),
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = await runInline(rt);

      const final = events.at(-1) as {
        kind: 'final';
        result: { recommendations?: { userId: string }[] };
      };
      expect(final.kind).toBe('final');
      expect(final.result.recommendations?.[0]?.userId).toBe('u1');

      // Live sub-step cards streamed (taskAnalyzer + skillMatcher + avaiChecker + recommender).
      const started = events
        .filter(
          (e): e is Extract<OrchestrationEvent, { kind: 'step-start' }> => e.kind === 'step-start',
        )
        .map((e) => e.stepId);
      expect(started).toContain('taskAnalyzer');
      expect(started).toContain('skillMatcher:task-1');
      expect(started).toContain('avaiChecker:task-1');
      expect(started).toContain('recommender:task-1');

      const [run] = await staffingDb()
        .select()
        .from(orchestrationRuns)
        .where(eq(orchestrationRuns.run_id, RUN));
      expect(run!.status).toBe('completed');
      // The DAG itself is a single persisted step.
      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces.map((t) => t.step_id)).toEqual(['orchestrate']);
    });
  });

  it('describe-skills regression: only taskAnalyzer runs — never skillMatcher/recommender', async () => {
    await withAgentTestDb(async () => {
      __setStaffingRunIdForTests(() => RUN);
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        resolveModel: resolveModelSeq([
          scriptedModel([toolCallStep(0, 'fetchTaskData', { taskId: 'task-1' }), STOP]), // taskAnalyzer
          scriptedModel([STOP]), // skillMatcher built but unused
          scriptedModel([STOP]), // avaiChecker built but unused
          scriptedModel([
            toolCallStep(0, 'callTaskAnalyzer', {
              query: 'what skills does this need',
              taskId: 'task-1',
            }),
            STOP,
          ]),
        ]),
        ports: portsWith(),
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = await runInline(rt);

      const final = events.at(-1) as {
        kind: 'final';
        result: { skills?: string[]; recommendations?: unknown };
      };
      expect(final.result.skills).toEqual(['aws']);
      expect(final.result.recommendations).toBeUndefined();

      const started = events
        .filter(
          (e): e is Extract<OrchestrationEvent, { kind: 'step-start' }> => e.kind === 'step-start',
        )
        .map((e) => e.stepId);
      expect(started).toContain('taskAnalyzer');
      expect(started.some((s: string) => s.startsWith('skillMatcher'))).toBe(false);
      expect(started.some((s: string) => s.startsWith('avaiChecker'))).toBe(false);
      expect(started.some((s: string) => s.startsWith('recommender'))).toBe(false);
    });
  });
});
