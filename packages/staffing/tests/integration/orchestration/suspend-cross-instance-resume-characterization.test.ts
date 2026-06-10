// ─────────────────────────────────────────────────────────────────────────────
// CHARACTERIZATION SPIKE — CROSS-Mastra-INSTANCE suspend/resume
//
// De-risks the remaining load-bearing unknown for Mastra native-suspend:
// production differs from the in-process spike (suspend-characterization.test.ts)
// in that resume runs on a DIFFERENT `Mastra` instance than the one that
// streamed+suspended (page reload / different server process). The only shared
// state between the two instances is the storage + the runId. Plus: the
// orchestrator agent is built FRESH per turn (dynamic tools/instructions), so
// each Mastra instance gets a freshly-constructed Agent from buildAgent().
//
// ── @mastra/pg GAP (BLOCKS the Postgres-persistence half — see report) ────────
// The TWO-WAY production target was: PostgresStore (schemaName 'agent') on the
// testcontainers Postgres from withAgentTestDb, cross-instance. That half could
// NOT be exercised from @seta/staffing because `@mastra/pg` does not resolve
// here. EXACT ERROR (vitest, ESM):
//   Cannot find package '@mastra/pg' imported from
//   .../packages/staffing/tests/integration/orchestration/
//   suspend-postgres-resume-characterization.test.ts
// @seta/staffing declares only `@mastra/core`; `@mastra/pg` is a dependency of
// @seta/agent (present at packages/agent/node_modules/@mastra/pg and in the
// pnpm store as @mastra/pg@1.11.1) and is NOT hoisted to staffing under pnpm's
// strict node_modules. @seta/agent does not re-export `PostgresStore` nor its
// `buildMastra`/`buildMastraFull` (those are internal to
// packages/agent/src/backend/runtime.ts and not exposed on `.` or `./register`),
// so there is no injected-storage seam reachable from staffing today.
//
// Per the spike instructions, this test therefore proves the cross-INSTANCE
// resume CODE PATH on a single InMemoryStore SHARED BY REFERENCE between the two
// separate Mastra instances. This is an explicitly-sanctioned FALLBACK: it
// proves the cross-instance seam (separate Mastra objects, separate freshly-built
// agents, correlation only via the shared store + runId), but NOT the Postgres
// PERSISTENCE round-trip (snapshot serialized to / deserialized from real PG).
//
// Suspend/resume SEMANTICS are storage-agnostic: the snapshot is read/written
// through the same MastraStorage interface that PostgresStore implements; the
// accessors and chunk shapes are identical under PostgresStore (already pinned by
// suspend-characterization.test.ts). The PERSISTENCE-specific risk (PG
// serialization, lazy table creation on the `agent` schema) remains UNVERIFIED
// from staffing and must be proven from @seta/agent (which has @mastra/pg) OR
// after staffing/production wiring gains @mastra/pg (or an injected store).
//
// ── FINDINGS (verbatim from the runtime; see console.log FINDINGS block) ──────
//
// CRITICAL ANSWER (cross-instance, fallback store): YES. A second Mastra
// instance that shares ONLY the storage + the `runId` successfully resumes a
// suspend snapshot written by a first, separate Mastra instance. Instance #1 is
// fully discarded before instance #2 is built; resume re-enters the SAME tool
// `execute` with `ctx.agent.resumeData` set, `finishReason` resolves to 'stop',
// and the post-resume tool output is observable at `toolResults[0].payload.result`.
//
// Caveats that affect production wiring:
//   - @mastra/pg DEPENDENCY (BLOCKER for the PG half): production wiring that
//     builds storage outside @seta/agent must add `@mastra/pg` as a direct dep,
//     OR @seta/agent must expose its buildMastra/store as an injectable seam
//     (the cleaner idiom — staffing never constructs storage itself today).
//   - The per-turn agent does NOT need to be byte-identical across instances.
//     It must be registered under the SAME agent id ('spike') and expose the
//     SAME suspended tool (same tool id + suspendSchema/resumeSchema shape) so
//     resume can re-enter that tool's execute. buildAgent() returns a brand-new
//     Agent (new closures, fresh tool object, even a fresh scripted model) each
//     call; resume still finds the tool by id. => production's fresh-per-turn
//     agent construction is compatible with cross-instance resume, PROVIDED the
//     rebuilt agent re-binds the same tool id + the same suspend/resume schemas.
//   - The two Mastra instances must point at the SAME physical store. Here that
//     is one InMemoryStore object shared by reference; in production it is the
//     same Postgres (same pool/schema). A fresh PostgresStore OBJECT on the same
//     pool/schema is expected to suffice (same physical store; runId is the
//     correlation key) — that specific claim is UNVERIFIED here (see @mastra/pg
//     gap) and should be confirmed in the @seta/agent-side PG spike.
// ─────────────────────────────────────────────────────────────────────────────

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { InMemoryStore } from '@mastra/core/storage';
import { defineAgentTool } from '@seta/agent-sdk';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withAgentTestDb } from '../../helpers.ts';

const TENANT = '00000000-0000-4000-8000-0000000000b2';
const ACTOR = '00000000-0000-4000-8000-0000000000c2';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

// Module-level: proves resume re-enters execute across instances. Instance #1
// pushes 'first'; instance #2 (the resume) pushes 'resume:...'.
const calls: string[] = [];

type Step = { content: Record<string, unknown>[]; finishReason: 'stop' | 'tool-calls' };
const TOOL_CALL: Step = {
  content: [
    {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'awaitApproval',
      input: '{"note":"ship it"}',
    },
  ],
  finishReason: 'tool-calls',
};
const STOP: Step = { content: [{ type: 'text', text: 'done' }], finishReason: 'stop' };

function stepToStreamParts(s: Step) {
  const parts: Record<string, unknown>[] = [{ type: 'stream-start', warnings: [] }];
  for (const c of s.content) {
    if (c.type === 'tool-call') {
      parts.push({
        type: 'tool-call',
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      });
    } else if (c.type === 'text') {
      parts.push({ type: 'text-start', id: '0' });
      parts.push({ type: 'text-delta', id: '0', delta: c.text });
      parts.push({ type: 'text-end', id: '0' });
    }
  }
  parts.push({ type: 'finish', usage, finishReason: s.finishReason });
  return parts;
}

// A fresh scripted model per Mastra instance, so instance #2 is fully
// independent (on resume the model is asked to finalize after the tool result,
// which yields STOP).
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

// Mimics production's fresh-per-turn agent construction: every call returns a
// brand-new Agent (new closures, fresh tool object, fresh model) under the same
// id + same tool id + same suspend/resume schemas. The two instances thus share
// NOTHING in JS except the store passed to Mastra and the runId.
function buildAgent(steps: Step[]): Agent {
  const awaitApproval = defineAgentTool({
    id: 'awaitApproval',
    name: 'Await approval',
    description: 'Suspends once to await an approval decision, then completes.',
    input: z.object({ note: z.string() }),
    output: z.object({ decided: z.string() }),
    suspendSchema: z.object({ kind: z.literal('approval'), note: z.string() }),
    resumeSchema: z.object({ approved: z.boolean() }),
    execute: async (input, ctx) => {
      const resumeData = ctx.agent?.resumeData as { approved: boolean } | undefined;
      if (!resumeData) {
        calls.push('first');
        if (typeof ctx.agent?.suspend !== 'function') {
          throw new Error('ctx.agent.suspend is not a function on first execute');
        }
        await ctx.agent.suspend({ kind: 'approval', note: input.note });
        return { decided: 'unreachable' };
      }
      calls.push(`resume:${resumeData.approved ? 'approved' : 'rejected'}`);
      return { decided: resumeData.approved ? 'approved' : 'rejected' };
    },
  });

  return new Agent({
    id: 'spike.suspender',
    name: 'Suspend Spike Agent',
    instructions: 'Call awaitApproval, then reply.',
    model: scriptedModel(steps),
    tools: { awaitApproval } as never,
  });
}

describe('Mastra cross-instance suspend/resume characterization spike', () => {
  it('resumes on a SEPARATE Mastra instance sharing only the store + runId', async () => {
    // withAgentTestDb provisions the real testcontainers Postgres (repo idiom,
    // same environment later integration tests run in). The shared store is
    // InMemoryStore here — the Postgres PERSISTENCE half is blocked on @mastra/pg
    // not resolving from staffing (see header).
    await withAgentTestDb(async () => {
      calls.length = 0;

      // The ONE store object both Mastra instances point at. Shared by reference,
      // standing in for "the same physical Postgres" in production.
      const sharedStore = new InMemoryStore();

      const rc = new RequestContext();
      rc.set('actor', { type: 'user', user_id: ACTOR });
      rc.set('tenant_id', TENANT);

      // ── Mastra instance #1: stream → suspend, write snapshot to sharedStore ──
      const mastra1 = new Mastra({
        agents: { spike: buildAgent([TOOL_CALL, STOP]) },
        storage: sharedStore,
        logger: false,
      });
      const agent1 = mastra1.getAgent('spike');

      const stream = await agent1.stream('please approve', { requestContext: rc, maxSteps: 5 });

      let suspendedChunk:
        | {
            runId: string;
            payload: { toolCallId: string; toolName: string; suspendPayload: unknown };
          }
        | undefined;
      const firstChunkTypes: string[] = [];
      for await (const chunk of stream.fullStream) {
        firstChunkTypes.push((chunk as { type: string }).type);
        if ((chunk as { type: string }).type === 'tool-call-suspended') {
          suspendedChunk = chunk as never;
        }
      }

      const runId = stream.runId;
      const suspendedFinishReason = await stream.finishReason;
      const suspendedText = await stream.text;
      const suspendedToolResults = await stream.toolResults;

      // The suspend happened and persisted under runId in the shared store.
      expect(suspendedChunk).toBeDefined();
      expect(suspendedChunk!.runId).toBe(runId);
      expect(suspendedChunk!.payload.toolName).toBe('awaitApproval');
      expect(suspendedChunk!.payload.suspendPayload).toEqual({ kind: 'approval', note: 'ship it' });
      expect(UUID_V4.test(runId)).toBe(true);
      expect(suspendedFinishReason).toBe('suspended');
      expect(suspendedText).toBe('');
      expect(suspendedToolResults).toEqual([]);
      expect(calls).toEqual(['first']);

      // ── DISCARD instance #1. Build a SEPARATE Mastra instance #2 with a fresh
      //    agent on the SAME store. The only shared state with instance #1 is the
      //    store object + runId. ──
      const mastra2 = new Mastra({
        agents: { spike: buildAgent([STOP]) },
        storage: sharedStore,
        logger: false,
      });
      const agent2 = mastra2.getAgent('spike');

      expect(mastra2).not.toBe(mastra1);
      expect(agent2).not.toBe(agent1);

      const resumeStream = await agent2.resumeStream({ approved: true }, { runId });
      const resumeChunkTypes: string[] = [];
      for await (const chunk of resumeStream.fullStream) {
        resumeChunkTypes.push((chunk as { type: string }).type);
      }
      const resumedFinishReason = await resumeStream.finishReason;
      const resumedText = await resumeStream.text;
      const resumedToolResults = (await resumeStream.toolResults) as Array<{
        payload?: { result?: unknown };
      }>;

      // CRITICAL: instance #2 re-entered the SAME execute with resumeData set,
      // loaded purely from the shared store + runId.
      expect(calls).toEqual(['first', 'resume:approved']);
      expect(resumedFinishReason).toBe('stop');
      expect(resumedText).toBe('done');
      expect(resumedToolResults.length).toBe(1);
      expect(resumedToolResults[0]?.payload?.result).toEqual({ decided: 'approved' });

      console.log(
        'FINDINGS(cross-instance)',
        JSON.stringify(
          {
            crossInstanceResumeWorks: calls.join(',') === 'first,resume:approved',
            store: 'InMemoryStore (FALLBACK — @mastra/pg unresolved from staffing)',
            sharedStateOnly: ['storage object (by ref)', 'runId'],
            instancesAreSeparate: mastra1 !== mastra2,
            agentsAreSeparate: agent1 !== agent2,
            runId,
            suspended: { finishReason: suspendedFinishReason, text: suspendedText },
            resumed: {
              finishReason: resumedFinishReason,
              text: resumedText,
              'toolResult0.payload.result': resumedToolResults[0]?.payload?.result,
            },
            chunkTypes: { firstRun: firstChunkTypes, resumeRun: resumeChunkTypes },
          },
          null,
          2,
        ),
      );
    });
  });
});
