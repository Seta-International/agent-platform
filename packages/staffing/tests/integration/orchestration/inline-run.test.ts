import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
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

// ── Scripted MockLanguageModelV3 helpers ────────────────────────────────────
// Each agent builds its own Mastra Agent with the model returned by resolveModel.
// We drive the real agents + their real tools deterministically via doGenerate
// (Mastra's generate() path calls doGenerate — verified against ai/test +
// ../mastra). Each step returns AI-SDK v6 content: a structured-output agent
// returns text JSON (→ response.object); a tool-using agent returns a tool-call
// item with finishReason 'tool-calls', then a stop step once the tool result is
// fed back. resolveModel is called once per LLM agent at build time in
// registration order: analyzer, skillMatcher, avaiChecker (recommender is
// deterministic and uses no model).
type Content = Record<string, unknown>;
interface Step {
  content: Content[];
  finishReason: 'stop' | 'tool-calls';
}
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const STOP: Step = { content: [{ type: 'text', text: 'done' }], finishReason: 'stop' };

/** Structured-output step: the JSON the agent parses into `response.object`. */
function objectStep(json: string): Step {
  return { content: [{ type: 'text', text: json }], finishReason: 'stop' };
}
function toolCallStep(k: number, toolName: string, input: unknown): Step {
  return {
    content: [{ type: 'tool-call', toolCallId: `c-${k}`, toolName, input: JSON.stringify(input) }],
    finishReason: 'tool-calls',
  };
}

/** A model that returns one scripted step per doGenerate call (last repeats). */
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

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

describe('assigneeRecommendation inline run (e2e)', () => {
  it('runs analyze→match→recommend, persisting run + 3 traces (avai disabled)', async () => {
    await withAgentTestDb(async () => {
      __setStaffingRunIdForTests(() => RUN);
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        resolveModel: resolveModelSeq([
          // analyzer: structured-output classify → recommend_assignee with skills.
          scriptedModel([
            objectStep(
              '{"intent":"recommend_assignee","skills":["stripe","webhooks"],"tags":[],"reason":null}',
            ),
          ]),
          // skillMatcher: call searchCandidates; run() ranks the hits (fallback).
          scriptedModel([
            toolCallStep(0, 'searchCandidates', { skills: ['stripe', 'webhooks'] }),
            STOP,
          ]),
          // avaiChecker: call getAvailability for the candidate.
          scriptedModel([toolCallStep(0, 'getAvailability', { userIds: ['u1'] }), STOP]),
        ]),
        ports: {
          taskReader: {
            load: async () => ({
              taskId: 'task-1',
              title: 'Stripe webhook',
              description: 'x',
              groupId: 'g1',
              skillTags: [],
            }),
          },
          taskSearch: { bySkillTags: async () => [] },
          skillSearch: {
            search: async () => [
              {
                userId: 'u1',
                name: 'A',
                skills: ['stripe', 'webhooks'],
                role: null,
                similarity: 0.9,
              },
            ],
          },
          availability: {
            status: async () => ({ status: 'available' as const, note: null }),
            inProgressCount: async () => 1,
          },
        },
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = [];
      for await (const e of rt.runInline(
        { userText: 'who can take this', taskId: 'task-1' },
        { tenantId: TENANT, actorUserId: ACTOR },
      )) {
        events.push(e);
      }

      const final = events.at(-1) as {
        kind: 'final';
        result: { recommendations: { userId: string }[] };
      };
      expect(final.kind).toBe('final');
      expect(final.result.recommendations[0]!.userId).toBe('u1');

      const [run] = await staffingDb()
        .select()
        .from(orchestrationRuns)
        .where(eq(orchestrationRuns.run_id, RUN));
      expect(run!.status).toBe('completed');

      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces.map((t) => t.step_id).sort()).toEqual(['analyze', 'match', 'recommend']);
    });
  });

  it('early-exits to a single trace when the analyzer is not actionable', async () => {
    await withAgentTestDb(async () => {
      __setStaffingRunIdForTests(() => RUN);
      const rt = buildStaffingOrchestrationRuntime({
        repo: new StaffingRunStateRepository(),
        resolveModel: resolveModelSeq([
          // analyzer: not an assignee or task-search request → terminal (intent: none).
          scriptedModel([
            objectStep('{"intent":"none","skills":[],"tags":[],"reason":"chit-chat"}'),
          ]),
          scriptedModel([STOP]),
          scriptedModel([STOP]),
        ]),
        ports: {
          taskReader: { load: async () => null },
          taskSearch: { bySkillTags: async () => [] },
          skillSearch: { search: async () => [] },
          availability: {
            status: async () => ({ status: 'available' as const, note: null }),
            inProgressCount: async () => 0,
          },
        },
      });
      SpecializedAgentRegistry.freeze();
      OrchestrationRegistry.freeze();

      const events = [];
      for await (const e of rt.runInline(
        { userText: 'hello', taskId: null },
        { tenantId: TENANT, actorUserId: ACTOR },
      )) {
        events.push(e);
      }
      expect(events.map((e) => e.kind)).toEqual(['step-start', 'step-done', 'final']);
      const traces = await staffingDb()
        .select()
        .from(orchestrationStepTrace)
        .where(eq(orchestrationStepTrace.run_id, RUN));
      expect(traces).toHaveLength(1);
    });
  });
});
