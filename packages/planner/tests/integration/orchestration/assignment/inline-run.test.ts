import { InMemoryStore } from '@mastra/core/storage';
import type { TrustEnvelope } from '@seta/agent-sdk';
import { SpecializedAgentRegistry } from '@seta/agent-sdk';
import type { RunRecord, RunStateRepository } from '@seta/shared-orchestration';
import { OrchestrationRegistry } from '@seta/shared-orchestration';
import { MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __setAssignmentRunIdForTests,
  buildAssignmentOrchestrationRuntime,
} from '../../../../src/backend/orchestration/assignment/register.ts';

const TENANT = '00000000-0000-4000-8000-0000000000b9';
const ACTOR = '00000000-0000-4000-8000-0000000000c9';
const RUN = '00000000-0000-4000-8000-0000000000d9';
// assign_analyzeTasks's taskRef must be a real UUID (or an in-conversation
// ordinal — but the inline runner has no conversation memory to resolve
// ordinals against). The taskReader port stub ignores the id it is given.
const TASK_REF = '00000000-0000-4000-8000-0000000000e9';

// Injected repository port (Task 3 swaps this for an agent-backed implementation
// over agent.workflow_runs/workflow_run_steps). Kept in-memory here so this test
// exercises the orchestration DAG without depending on any module's tables.
interface StoredRun extends RunRecord {
  result?: unknown;
  error?: string;
}

class InMemoryRunStateRepository implements RunStateRepository {
  private runs = new Map<string, StoredRun>();
  public traces: { runId: string; stepId: string; agentId: string; trust: TrustEnvelope }[] = [];

  async createRun(run: {
    runId: string;
    orchestrationId: string;
    tenantId: string;
    actorUserId: string;
    input: unknown;
  }): Promise<void> {
    this.runs.set(run.runId, {
      status: 'running',
      input: run.input,
      state: { runId: run.runId, orchestrationId: run.orchestrationId, outputs: {} },
    });
  }

  async loadRun(runId: string): Promise<RunRecord> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`run ${runId} not found`);
    return {
      status: r.status,
      input: r.input,
      state: { ...r.state, outputs: { ...r.state.outputs } },
    };
  }

  async saveStep(args: {
    runId: string;
    stepId: string;
    agentId: string;
    output: unknown;
    trust: TrustEnvelope;
  }): Promise<void> {
    const r = this.runs.get(args.runId);
    if (!r) throw new Error(`run ${args.runId} not found`);
    if (args.stepId in r.state.outputs) return; // idempotent
    r.state.outputs[args.stepId] = args.output;
    this.traces.push({
      runId: args.runId,
      stepId: args.stepId,
      agentId: args.agentId,
      trust: args.trust,
    });
  }

  async completeRun(runId: string, result: unknown): Promise<void> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`run ${runId} not found`);
    r.status = 'completed';
    r.result = result;
  }

  async failRun(runId: string, error: string): Promise<void> {
    const r = this.runs.get(runId);
    if (!r) throw new Error(`run ${runId} not found`);
    r.status = 'failed';
    r.error = error;
  }
}

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
// doStream mirrors doGenerate: same call counter, same Step sequence converted
// to AI SDK v6 stream parts so the streaming orchestrator path is exercised.
function stepToStreamParts(s: Step) {
  const parts: Record<string, unknown>[] = [{ type: 'stream-start', warnings: [] }];
  for (const c of s.content) {
    if (c.type === 'tool-call') {
      parts.push({
        type: 'tool-call',
        toolCallId: (c as Record<string, unknown>).toolCallId,
        toolName: (c as Record<string, unknown>).toolName,
        input: (c as Record<string, unknown>).input,
      });
    } else if (c.type === 'text') {
      parts.push({ type: 'text-start', id: '0' });
      parts.push({ type: 'text-delta', id: '0', delta: (c as Record<string, unknown>).text });
      parts.push({ type: 'text-end', id: '0' });
    }
  }
  parts.push({ type: 'finish', usage, finishReason: s.finishReason });
  return parts;
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
    doStream: async () => {
      call += 1;
      const s = steps[Math.min(call, steps.length - 1)] ?? STOP;
      const parts = stepToStreamParts(s);
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
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
  relevanceScore: 1,
  rank: 1,
};
const portsWith = () => ({
  taskReader: {
    load: async () => ({
      taskId: 'task-1',
      title: 'AWS migration',
      description: 'x',
      groupId: 'g1',
      labels: ['aws'],
    }),
  },
  taskSearch: { byLabels: async () => [], listAvailableLabels: async () => [] },
  skillSearch: {
    search: vi.fn(async () => [
      { userId: 'u1', name: 'A', skills: ['aws'], role: null, similarity: 0.9 },
    ]),
  },
  // Reads planner + people tables. Stubbed here, like every other adapter — before it
  // was a port, skillMatcher reached the real database whenever taskId was truthy.
  groupMembers: async () => [],
  availability: {
    status: async () => ({ status: 'available' as const, note: null }),
    inProgressCount: async () => 0,
  },
  userProfileLookup: { findByName: async () => [] },
  assign: { assign: async () => {} },
  taskAssignees: { currentAssigneeIds: async () => [] },
});

afterEach(() => {
  SpecializedAgentRegistry.__resetForTests();
  OrchestrationRegistry.__resetForTests();
});

async function runInline(rt: ReturnType<typeof buildAssignmentOrchestrationRuntime>) {
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
    __setAssignmentRunIdForTests(() => RUN);
    const repo = new InMemoryRunStateRepository();
    const ports = portsWith();
    // Models resolve lazily per run (pickModel): the orchestrator's Agent is
    // built first at run start; skillMatcher's Agent only when delegated to.
    // taskAnalyzer + avaiChecker are deterministic here (no model call).
    const rt = buildAssignmentOrchestrationRuntime({
      mastraStorage: new InMemoryStore(),
      repo,
      resolveModel: resolveModelSeq([
        // orchestrator: chain the four delegations. taskAnalyzer is deterministic
        // (resolve_task_skills reads the task's labels=['aws'] via the port);
        // assign_checkCandidateAvailability runs the deterministic avaiChecker against the ports.
        scriptedModel([
          toolCallStep(0, 'assign_analyzeTasks', {
            intent: 'resolve_task_skills',
            query: 'who should do this',
            taskRef: TASK_REF,
          }),
          toolCallStep(1, 'assign_matchCandidatesBySkill', {
            taskId: 'task-1',
            skills: ['aws'],
          }),
          toolCallStep(2, 'assign_checkCandidateAvailability', {
            taskId: 'task-1',
            candidates: [CANDIDATE],
          }),
          toolCallStep(3, 'assign_rankRecommendations', {
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
        // skillMatcher: searchCandidates; run() ranks the hits via fallback.
        scriptedModel([toolCallStep(0, 'staffing_searchCandidates', { skills: ['aws'] }), STOP]),
      ]),
      ports,
    });
    SpecializedAgentRegistry.freeze();
    OrchestrationRegistry.freeze();

    const events = await runInline(rt);

    // Without this, a DAG that silently skipped skillMatcher would still satisfy every
    // assertion below — the recommendation can be reconstructed from the scripted args.
    expect(ports.skillSearch.search).toHaveBeenCalled();

    const final = events.at(-1) as {
      kind: 'final';
      result: { recommendations?: { userId: string }[] };
    };
    expect(final.kind).toBe('final');
    expect(final.result.recommendations?.[0]?.userId).toBe('u1');

    const run = await repo.loadRun(RUN);
    expect(run.status).toBe('completed');
    // The DAG itself is a single persisted step.
    expect(repo.traces.map((t) => t.stepId)).toEqual(['orchestrate']);
  });

  it('describe-skills regression: only taskAnalyzer runs — never skillMatcher/recommender', async () => {
    __setAssignmentRunIdForTests(() => RUN);
    const rt = buildAssignmentOrchestrationRuntime({
      mastraStorage: new InMemoryStore(),
      repo: new InMemoryRunStateRepository(),
      resolveModel: resolveModelSeq([
        // Only the orchestrator resolves a model — skillMatcher is never
        // delegated to, so its (lazy) Agent is never built.
        scriptedModel([
          toolCallStep(0, 'assign_analyzeTasks', {
            intent: 'resolve_task_skills',
            query: 'what skills does this need',
            taskRef: TASK_REF,
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
  });

  it('runStream recommend path: returns the live Mastra output + a finalize() result, no repo persistence', async () => {
    const rt = buildAssignmentOrchestrationRuntime({
      mastraStorage: new InMemoryStore(),
      repo: new InMemoryRunStateRepository(),
      resolveModel: resolveModelSeq([
        // orchestrator: driven via Agent.stream() → doStream; same delegation
        // sequence as the inline recommend test.
        scriptedModel([
          toolCallStep(0, 'assign_analyzeTasks', {
            intent: 'resolve_task_skills',
            query: 'who should do this',
            taskRef: TASK_REF,
          }),
          toolCallStep(1, 'assign_matchCandidatesBySkill', {
            taskId: 'task-1',
            skills: ['aws'],
          }),
          toolCallStep(2, 'assign_checkCandidateAvailability', {
            taskId: 'task-1',
            candidates: [CANDIDATE],
          }),
          toolCallStep(3, 'assign_rankRecommendations', {
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
        // skillMatcher: still uses doGenerate (sub-agents call .generate()).
        scriptedModel([toolCallStep(0, 'staffing_searchCandidates', { skills: ['aws'] }), STOP]),
      ]),
      ports: portsWith(),
    });
    SpecializedAgentRegistry.freeze();
    OrchestrationRegistry.freeze();

    const run = await rt.runStream(
      { userText: 'go', taskId: 'task-1' },
      { tenantId: TENANT, actorUserId: ACTOR },
    );
    // Draining the live Mastra fullStream drives the LLM + tools to completion.
    for await (const _ of run.output.fullStream) {
      // no-op: the route maps these chunks to AI SDK parts.
    }
    const final = (await run.finalize()) as {
      result: { recommendations?: { userId: string }[] };
    };
    expect(final.result.recommendations?.[0]?.userId).toBe('u1');
  });

  it('task-less people search: recommends with a null taskId (Agent Studio, no task context)', async () => {
    __setAssignmentRunIdForTests(() => RUN);
    const rt = buildAssignmentOrchestrationRuntime({
      mastraStorage: new InMemoryStore(),
      repo: new InMemoryRunStateRepository(),
      resolveModel: resolveModelSeq([
        // orchestrator (resolved first, at run start): people-by-named-skills
        // with NO task → taskId is null through the whole recommend chain
        // (the taskId is only a correlation label).
        scriptedModel([
          toolCallStep(0, 'assign_matchCandidatesBySkill', {
            taskId: null,
            skills: ['aws', 'docker'],
          }),
          toolCallStep(1, 'assign_checkCandidateAvailability', {
            taskId: null,
            candidates: [CANDIDATE],
          }),
          toolCallStep(2, 'assign_rankRecommendations', {
            taskId: null,
            skills: ['aws', 'docker'],
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
        // skillMatcher: searchCandidates by the named skills; run() ranks via fallback.
        scriptedModel([
          toolCallStep(0, 'staffing_searchCandidates', { skills: ['aws', 'docker'] }),
          STOP,
        ]),
      ]),
      ports: portsWith(),
    });
    SpecializedAgentRegistry.freeze();
    OrchestrationRegistry.freeze();

    const events = [];
    for await (const e of rt.runInline(
      { userText: 'tìm cho tôi user có skill aws và docker', taskId: null },
      { tenantId: TENANT, actorUserId: ACTOR },
    )) {
      events.push(e);
    }

    const final = events.at(-1) as {
      kind: 'final';
      result: { recommendations?: { userId: string }[]; message?: string };
    };
    expect(final.kind).toBe('final');
    // The bug: a task-less recommend used to fail with this message.
    expect(final.result.message).toBeUndefined();
    expect(final.result.recommendations?.[0]?.userId).toBe('u1');
  });
});
